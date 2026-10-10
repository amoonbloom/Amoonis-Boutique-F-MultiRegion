"use client";

import { useEffect, useMemo, useState, type ReactNode } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { m, AnimatePresence } from "motion/react";
import { useInfiniteQuery, useQuery } from "@tanstack/react-query";
import { ProductGrid } from "@/features/products/components/ProductGrid";
import { ProductFilters } from "@/features/products/components/ProductFilters";
import {
  deriveColorFacets,
  derivePriceBounds,
  productHasColor,
} from "@/features/products/facets";
import { productsApi } from "@/features/products/api/products.api";
import { toUiProducts } from "@/features/products/adapters";
import {
  BEST_SELLING_FILTER_VALUE,
  NEW_ARRIVALS_FILTER_VALUE,
  parseSectionFilter,
} from "@/features/products/facets";
import {
  Drawer,
  Button,
  Menu,
  MenuTrigger,
  MenuContent,
  MenuItem,
  CurrencyAmount,
} from "@/components/ui";
import { FilterIcon, CloseIcon, ChevronDown, CheckIcon, ArrowRight } from "@/components/icons";
import { baseTransition } from "@/lib/motion";
import { cn } from "@/lib/cn";
import { useCurrency } from "@/features/location/hooks/useCurrency";
import { useLocalizedHref } from "@/features/location/useLocalizedHref";
import type { ProductFilter } from "@/features/products/types";
import type { ApiProduct } from "@/features/products/api-types";
import type { PaginatedResponse, ResponseMeta } from "@/types/api";
import type { Category } from "@/features/categories/types";
import { useT } from "@/i18n/useT";
import { localized, type MessageKey } from "@/i18n";

/** An admin Section surfaced as a shop filter. `products` is the curated,
 *  ordered set (same order the home rail shows); it seeds the "curated first"
 *  feed and the sidebar count. */
export interface ShopSection {
  id: string;
  title: string;
  title_ar: string | null;
  products: ApiProduct[];
}

const SORTS: {
  value: NonNullable<ProductFilter["sort"]>;
  labelKey: MessageKey;
}[] = [
  { value: "featured", labelKey: "shop.sortFeatured" },
  { value: "price-asc", labelKey: "shop.sortPriceAsc" },
  { value: "price-desc", labelKey: "shop.sortPriceDesc" },
];

interface ShopPLPProps {
  /** Raw first page from SSR — seeds the query so first paint uses SSR HTML. */
  initialProducts: ApiProduct[];
  initialMeta?: ResponseMeta;
  categories: Category[];
  /** Admin Sections (with products), shown as filters in the category sidebar. */
  sections?: ShopSection[];
  /** Full catalogue size, for the "Everything" sidebar count. */
  catalogTotal?: number;
  /** Page size used by the server's first page + each "Load more" fetch. */
  pageSize?: number;
  /** When set, the category sidebar is hidden and the category is locked. */
  lockedCategorySlug?: string;
}

/** A dismissible active-filter pill shown in the toolbar. */
function FilterChip({
  label,
  onRemove,
}: {
  label: ReactNode;
  onRemove: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onRemove}
      className="inline-flex items-center gap-1.5 rounded-full border border-ink-200 bg-white px-3 py-1.5 text-xs font-medium text-ink-700 transition-colors hover:border-bloom-300 hover:bg-bloom-50 hover:text-bloom-700"
    >
      <span className="capitalize">{label}</span>
      <CloseIcon size={12} />
    </button>
  );
}

/** Placeholder grid shown while a new source (category/search) is loading. */
function SkeletonGrid({ count = 6 }: { count?: number }) {
  return (
    <div className="grid grid-cols-2 gap-x-3 gap-y-8 sm:grid-cols-2 sm:gap-x-6 sm:gap-y-12 md:grid-cols-3">
      {Array.from({ length: count }).map((_, i) => (
        <div key={i} className="flex flex-col gap-4" aria-hidden>
          <div className="skeleton aspect-4/5 w-full rounded-2xl" />
          <div className="skeleton h-4 w-3/4 rounded" />
          <div className="skeleton h-4 w-1/3 rounded" />
        </div>
      ))}
    </div>
  );
}

export function ShopPLP({
  initialProducts,
  initialMeta,
  categories,
  sections = [],
  catalogTotal,
  pageSize = 12,
  lockedCategorySlug,
}: ShopPLPProps) {
  const searchParams = useSearchParams();
  const rawQ = (searchParams.get("q") ?? "").trim();
  const q = rawQ.toLowerCase();
  // Seed the ENTIRE filter set from the URL on mount (Amazon/Shopify pattern):
  // category/sort/price/colour/stock all live in `?…` so a shared or refreshed
  // shop URL restores the exact view. The homepage "View all" links land here
  // pre-filtered the same way. `lockedCategorySlug` (the /shop/category/[slug]
  // route) always wins for the category.
  const [filter, setFilter] = useState<ProductFilter>(() => {
    const num = (k: string) => {
      const n = Number(searchParams.get(k));
      return Number.isFinite(n) && searchParams.get(k) != null ? n : undefined;
    };
    const rawSort = searchParams.get("sort");
    const sort = (
      ["featured", "price-asc", "price-desc", "newest"] as const
    ).includes(rawSort as never)
      ? (rawSort as NonNullable<ProductFilter["sort"]>)
      : "featured";
    const colors = searchParams.getAll("color");
    return {
      sort,
      category: lockedCategorySlug ?? searchParams.get("category") ?? undefined,
      inStock: searchParams.get("inStock") === "1" || undefined,
      minPrice: num("minPrice"),
      maxPrice: num("maxPrice"),
      colors: colors.length ? colors : undefined,
    };
  });
  const [filtersOpen, setFiltersOpen] = useState(false);
  const { t, tc, locale: uiLocale } = useT();
  const { currency, locale } = useCurrency();
  const router = useRouter();
  const localize = useLocalizedHref();

  // The data SOURCE is the (locked-or-selected) category, or the search query.
  // Category & search are resolved SERVER-SIDE + paginated here — so browsing a
  // category returns that category's full set, not just whatever happened to be
  // on the first page. Price/colour/stock/sort are client refinements layered
  // on top of the loaded source. staleTime mirrors the catalogue cache.
  const activeCategory = lockedCategorySlug ?? filter.category;
  // A Section filter (`__section__:<id>`) is a curated feed, not a real category:
  // fetch the whole catalogue, then reorder so the section's products lead.
  const activeSectionId = parseSectionFilter(activeCategory ?? undefined);
  const activeSection = activeSectionId
    ? sections.find((s) => s.id === activeSectionId) ?? null
    : null;
  // When the selected category is coming-soon, the storefront shows a "coming soon" message
  // instead of products (its items are hidden storefront-wide, so the grid would otherwise
  // read "No matches found"). Mirrors the dedicated /shop/category/[slug] page. A section
  // filter is never a category, so it's excluded. `activeCategory` may be a slug (locked
  // route) or an id (?category=<id>).
  const activeCategoryComingSoon = useMemo(() => {
    if (!activeCategory || activeSectionId) return false;
    const c = categories.find((x) => x.id === activeCategory || x.slug === activeCategory);
    return Boolean(c?.comingSoon);
  }, [activeCategory, activeSectionId, categories]);
  // The SSR seed corresponds to "no user-selected category" (+ current ?q=).
  const seedable = (activeCategory ?? null) === (lockedCategorySlug ?? null);

  const {
    data,
    fetchNextPage,
    hasNextPage,
    isFetchingNextPage,
    isPending,
  } = useInfiniteQuery({
    queryKey: ["shop-plp", activeCategory ?? null, rawQ || null],
    queryFn: ({ pageParam }): Promise<PaginatedResponse<ApiProduct>> => {
      const params = { page: pageParam, limit: pageSize };
      if (rawQ) return productsApi.search(rawQ, params);
      // A section shows its curated products first, then the rest of the whole
      // catalogue — so the "others" source is the plain catalogue list.
      if (activeSectionId) return productsApi.list(params);
      if (activeCategory === BEST_SELLING_FILTER_VALUE)
        return productsApi.bestSellers(params);
      if (activeCategory === NEW_ARRIVALS_FILTER_VALUE)
        return productsApi.newArrivals(params);
      if (activeCategory)
        return productsApi.listByCategory(activeCategory, params);
      return productsApi.list(params);
    },
    initialPageParam: 1,
    getNextPageParam: (lastPage) => {
      const p = lastPage.meta?.pagination;
      return p && p.page < p.totalPages ? p.page + 1 : undefined;
    },
    initialData: seedable
      ? {
          pages: [{ data: initialProducts, meta: initialMeta ?? {} }],
          pageParams: [1],
        }
      : undefined,
    staleTime: 60_000,
  });

  // The colour + price facets must reflect the WHOLE active source (this category /
  // section / the full catalogue), not just the page(s) the grid has loaded — otherwise
  // a colour on an unloaded product never appears and the counts are a partial tally.
  // So we fetch the full visible set once (region-scoped + PUBLISHED-only, same as the
  // grid's source) and derive facets from it, independent of the grid's pagination.
  // `limit: 100` is the server's max page; a catalogue larger than that would facet on
  // the first 100 — still the whole set for this store, and far better than one page.
  const facetQuery = useQuery({
    queryKey: ["shop-facets", activeCategory ?? null, rawQ || null],
    queryFn: (): Promise<PaginatedResponse<ApiProduct>> => {
      const params = { page: 1, limit: 100 };
      if (rawQ) return productsApi.search(rawQ, params);
      // A section's facets span the whole catalogue (its curated picks are part of it),
      // matching the section feed which shows curated-first then the rest of the store.
      if (activeSectionId) return productsApi.list(params);
      if (activeCategory === BEST_SELLING_FILTER_VALUE)
        return productsApi.bestSellers(params);
      if (activeCategory === NEW_ARRIVALS_FILTER_VALUE)
        return productsApi.newArrivals(params);
      if (activeCategory) return productsApi.listByCategory(activeCategory, params);
      return productsApi.list(params);
    },
    staleTime: 60_000,
  });

  const loaded = useMemo(
    () =>
      toUiProducts(
        (data?.pages ?? []).flatMap((pg) => pg.data),
        { locale: uiLocale, currency }
      // Coming-soon products are hidden from every storefront listing (shop grid,
      // search, section feeds). Only released products — which the backend returns
      // with comingSoon=false — reach the grid. Applied here so facets + counts derive
      // from the visible set too.
      ).filter((p) => !p.categoryComingSoon),
    [data, uiLocale, currency]
  );
  const sourceTotal =
    data?.pages[0]?.meta?.pagination?.total ?? loaded.length;

  // Curated products for the active section, converted once. They lead the feed
  // in the admin's curated order — identical to the home rail — before the rest
  // of the catalogue streams in below.
  const curated = useMemo(
    () =>
      activeSection
        ? toUiProducts(activeSection.products, { locale: uiLocale, currency }).filter(
            (p) => !p.categoryComingSoon
          )
        : [],
    [activeSection, uiLocale, currency]
  );

  // Section-aware source: curated first, then every other loaded catalogue
  // product, deduped by id. Plain catalogue/category feeds pass through
  // unchanged; a search (rawQ) always wins, so we never prepend curated products
  // onto search results even if a section filter lingers in the URL.
  const baseList = useMemo(() => {
    if (!activeSection || rawQ) return loaded;
    const seen = new Set<string>();
    const out: typeof loaded = [];
    for (const p of [...curated, ...loaded]) {
      if (seen.has(p.id)) continue;
      seen.add(p.id);
      out.push(p);
    }
    return out;
  }, [activeSection, curated, loaded, rawQ]);

  // Full visible source for facet derivation (all colours + accurate counts + true
  // price range across the whole active set). Falls back to the loaded grid set only
  // until the facet query resolves, so the sidebar is never empty on first paint.
  const facetProducts = useMemo(() => {
    const raw = facetQuery.data?.data;
    if (!raw) return baseList;
    return toUiProducts(raw, { locale: uiLocale, currency }).filter(
      (p) => !p.categoryComingSoon
    );
  }, [facetQuery.data, uiLocale, currency, baseList]);

  // Facets derive from the full source, so price bounds / colour swatches + counts
  // reflect the entire current category (or section), not just the loaded page.
  const priceBounds = useMemo(() => derivePriceBounds(facetProducts), [facetProducts]);
  const colorFacets = useMemo(() => deriveColorFacets(facetProducts), [facetProducts]);

  // The "Everything" sidebar count must reflect the BROWSABLE catalogue — published,
  // in-region, and NOT coming-soon — so it matches the grid. The backend listing total
  // (catalogTotal) also counts coming-soon products (they're published, just hidden from
  // every shop listing), which makes "Everything" overstate (e.g. shows 27 while the grid
  // has 17). On the plain Everything view we reuse `facetProducts` (already the full
  // browsable catalogue, no extra fetch); when a category/section/search narrows the facet
  // source, a dedicated full-catalogue query supplies the count instead.
  const isEverythingView = !activeCategory && !rawQ;
  const everythingCountQuery = useQuery({
    queryKey: ["shop-everything-count"],
    queryFn: () => productsApi.list({ page: 1, limit: 100 }),
    enabled: !isEverythingView,
    staleTime: 60_000,
  });
  const everythingCount = useMemo(() => {
    if (isEverythingView) {
      return facetQuery.data ? facetProducts.length : catalogTotal ?? sourceTotal;
    }
    const raw = everythingCountQuery.data?.data;
    if (!raw) return catalogTotal ?? sourceTotal;
    return toUiProducts(raw, { locale: uiLocale, currency }).filter(
      (p) => !p.categoryComingSoon
    ).length;
  }, [
    isEverythingView,
    facetQuery.data,
    facetProducts,
    everythingCountQuery.data,
    catalogTotal,
    sourceTotal,
    uiLocale,
    currency,
  ]);

  const selectedColors = filter.colors ?? [];
  const priceTouched =
    priceBounds != null &&
    ((filter.minPrice != null && filter.minPrice > priceBounds.min) ||
      (filter.maxPrice != null && filter.maxPrice < priceBounds.max));
  // A colour / price / stock refinement must be applied across the FULL source (the same
  // set the facets use), not just the loaded grid pages — otherwise a matching product on
  // an unloaded page is wrongly hidden, and the grid wouldn't match the facet counts.
  const hasClientRefinement =
    selectedColors.length > 0 ||
    filter.minPrice != null ||
    filter.maxPrice != null ||
    Boolean(filter.inStock);

  const hasActiveFilters =
    (!lockedCategorySlug && Boolean(filter.category)) ||
    Boolean(filter.inStock) ||
    Boolean(q) ||
    selectedColors.length > 0 ||
    priceTouched ||
    (filter.sort ? filter.sort !== "featured" : false);

  const clearAll = () => {
    setFilter({ sort: "featured", category: lockedCategorySlug });
    router.push(lockedCategorySlug ? window.location.pathname : localize("/shop"));
  };

  const setFilterSafe = (next: ProductFilter) =>
    setFilter((prev) => {
      const category = lockedCategorySlug ?? next.category;
      // Switching the category/section resets the sort back to Featured, so the
      // new set shows "fresh" — exactly as if it were just selected — instead of
      // carrying over a Price sort from the previous view. Sort/price/colour
      // changes (same category) keep whatever the user picked.
      const categoryChanged = category !== prev.category;
      return {
        ...next,
        category,
        sort: categoryChanged ? "featured" : next.sort,
      };
    });

  // Mirror the active filters + sort into the URL (Amazon/Shopify pattern): the
  // address bar is shareable, a refresh restores the exact view, and Back works.
  // `history.replaceState` keeps this purely client-side — no navigation, no
  // server refetch — so `filter` above stays the single source of truth. The
  // /shop/category/[slug] route owns its own URL, so we skip it there.
  useEffect(() => {
    if (lockedCategorySlug || typeof window === "undefined") return;
    const params = new URLSearchParams();
    if (rawQ) params.set("q", rawQ);
    if (filter.category) params.set("category", filter.category);
    if (filter.sort && filter.sort !== "featured") params.set("sort", filter.sort);
    if (filter.inStock) params.set("inStock", "1");
    if (filter.minPrice != null) params.set("minPrice", String(filter.minPrice));
    if (filter.maxPrice != null) params.set("maxPrice", String(filter.maxPrice));
    for (const c of filter.colors ?? []) params.append("color", c);
    const qs = params.toString();
    window.history.replaceState(
      window.history.state,
      "",
      qs ? `${window.location.pathname}?${qs}` : window.location.pathname
    );
  }, [filter, rawQ, lockedCategorySlug]);

  const filtered = useMemo(() => {
    // Category & text search are applied server-side (they define the query
    // source), so we do NOT re-filter them here. Everything below is a client
    // refinement. When a refinement is active we run it over the FULL source
    // (facetProducts) so results are complete; otherwise we browse the paginated
    // loaded set (with "Load more").
    let list = [...(hasClientRefinement ? facetProducts : baseList)];
    if (filter.inStock) {
      list = list.filter((p) => p.inStock);
    }
    // A priced-variant product (Small/Medium/Large-style) spans a price RANGE —
    // filtering/sorting on its single `price` (which only mirrors the default
    // variant) could wrongly hide/misorder it relative to a min/max the shopper
    // set, when a DIFFERENT variant would actually qualify. Use the full range
    // when present, falling back to the plain price for every other product.
    if (filter.minPrice != null) {
      list = list.filter((p) => (p.priceRange?.max ?? p.price.amount) >= filter.minPrice!);
    }
    if (filter.maxPrice != null) {
      list = list.filter((p) => (p.priceRange?.min ?? p.price.amount) <= filter.maxPrice!);
    }
    const colors = filter.colors ?? [];
    if (colors.length > 0) {
      list = list.filter((p) => productHasColor(p, colors));
    }
    switch (filter.sort) {
      case "price-asc":
        list.sort((a, b) => (a.priceRange?.min ?? a.price.amount) - (b.priceRange?.min ?? b.price.amount));
        break;
      case "price-desc":
        list.sort((a, b) => (b.priceRange?.max ?? b.price.amount) - (a.priceRange?.max ?? a.price.amount));
        break;
      case "newest":
        // "New arrivals" sort — newest-created first, applied on top of whatever
        // source is active (Everything, a section, or a category). So e.g.
        // Best Sellers + this sort = the best-seller set re-sorted by newest.
        list.sort(
          (a, b) =>
            new Date(b.createdAt ?? 0).getTime() -
            new Date(a.createdAt ?? 0).getTime()
        );
        break;
      default:
        // "featured" — keep the source order (for a section that's the curated,
        // home-rail order).
        break;
    }
    return list;
  }, [baseList, facetProducts, hasClientRefinement, filter]);

  // Category slug → title, for the active-filter chip label. A section shows its
  // (localized) admin title; otherwise a real category or a legacy sentinel.
  const categoryTitle = activeSectionId
    ? activeSection
      ? localized(activeSection.title, activeSection.title_ar, uiLocale)
      : undefined
    : filter.category === BEST_SELLING_FILTER_VALUE
      ? t("shop.bestSelling")
      : filter.category === NEW_ARRIVALS_FILTER_VALUE
        ? t("shop.newArrivals")
        : filter.category
          ? categories.find((c) => c.slug === filter.category)?.title ?? filter.category
          : undefined;

  const filterKey = `${activeCategory ?? "all"}|${filter.sort ?? "featured"}|${filter.inStock ? 1 : 0}|${filter.minPrice ?? ""}|${filter.maxPrice ?? ""}|${selectedColors.join(",")}|${q}`;

  const sidebar = (
    <ProductFilters
      filter={filter}
      onChange={setFilterSafe}
      resultCount={everythingCount}
      categories={categories}
      sections={sections}
      colorFacets={colorFacets}
      priceBounds={priceBounds}
    />
  );

  return (
    <>
      {/* Toolbar: result count · sort · mobile filter trigger. Stacks on phones
          so the (sometimes long) sort label never collides with the count. */}
      <div className="mb-6 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <p className="text-sm text-ink-500">
          {tc(filtered.length, "units.resultOne", "units.resultOther")}
        </p>

        <div className="flex items-center gap-2.5">
          {/* Sort — custom Menu dropdown (click to open) */}
          <Menu className="flex-1 sm:flex-none">
            <MenuTrigger
              label={t("shop.sortBy")}
              className="group inline-flex min-h-10 w-full items-center justify-between gap-2 rounded-full border border-ink-200 bg-white ps-4 pe-3 text-sm font-medium text-ink-900 transition-colors hover:bg-cream-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-bloom-400 sm:w-auto sm:justify-start"
            >
              <span>{t(SORTS.find((s) => s.value === (filter.sort ?? "featured"))?.labelKey ?? "shop.sortFeatured")}</span>
              <ChevronDown size={15} className="shrink-0 text-ink-400 transition-transform duration-200 group-aria-expanded:rotate-180" />
            </MenuTrigger>
            <MenuContent align="start" className="min-w-48">
              {SORTS.map((opt) => {
                const active = (filter.sort ?? "featured") === opt.value;
                return (
                  <MenuItem
                    key={opt.value}
                    onSelect={() => setFilterSafe({ ...filter, sort: opt.value })}
                    trailing={active ? <CheckIcon size={14} className="text-bloom-600" /> : undefined}
                    className={active ? "font-semibold text-ink-900" : undefined}
                  >
                    {t(opt.labelKey)}
                  </MenuItem>
                );
              })}
            </MenuContent>
          </Menu>

          {/* Mobile filter trigger (sidebar is desktop-only) */}
          {!lockedCategorySlug && (
            <button
              type="button"
              onClick={() => setFiltersOpen(true)}
              className="inline-flex min-h-10 items-center gap-2 rounded-full border border-ink-200 bg-white px-4 py-2 text-sm font-medium text-ink-900 transition-colors hover:bg-cream-50 active:bg-cream-100 lg:hidden"
            >
              <FilterIcon size={16} />
              {t("shop.filters")}
              {hasActiveFilters && (
                <span className="h-1.5 w-1.5 rounded-full bg-bloom-600" />
              )}
            </button>
          )}
        </div>
      </div>

      {/* Active-filter chips */}
      {hasActiveFilters && (
        <div className="mb-8 flex flex-wrap items-center gap-2">
          {!lockedCategorySlug && categoryTitle && (
            <FilterChip
              label={categoryTitle}
              onRemove={() => setFilterSafe({ ...filter, category: undefined })}
            />
          )}
          {priceTouched && priceBounds && (
            <FilterChip
              label={
                <>
                  <CurrencyAmount
                    amount={filter.minPrice ?? priceBounds.min}
                    currency={currency}
                    locale={locale}
                  />
                  {" – "}
                  <CurrencyAmount
                    amount={filter.maxPrice ?? priceBounds.max}
                    currency={currency}
                    locale={locale}
                  />
                </>
              }
              onRemove={() =>
                setFilterSafe({
                  ...filter,
                  minPrice: undefined,
                  maxPrice: undefined,
                })
              }
            />
          )}
          {selectedColors.map((c) => (
            <FilterChip
              key={c}
              label={c}
              onRemove={() =>
                setFilterSafe({
                  ...filter,
                  colors:
                    selectedColors.filter((x) => x !== c).length > 0
                      ? selectedColors.filter((x) => x !== c)
                      : undefined,
                })
              }
            />
          ))}
          {filter.inStock && (
            <FilterChip
              label={t("shop.inStockOnly")}
              onRemove={() => setFilterSafe({ ...filter, inStock: undefined })}
            />
          )}
          <button
            type="button"
            onClick={clearAll}
            className="ms-1 text-xs font-semibold text-bloom-700 underline-offset-4 hover:underline"
          >
            {t("shop.clearAll")}
          </button>
        </div>
      )}

      <div
        className={cn(
          "grid gap-10 lg:gap-12",
          lockedCategorySlug ? "" : "lg:grid-cols-[16rem_1fr]"
        )}
      >
        {!lockedCategorySlug && (
          <div className="hidden lg:block">{sidebar}</div>
        )}

        <div>
          {/* Crossfade the result set on any source/filter/sort change. */}
          <AnimatePresence mode="wait" initial={false}>
            <m.div
              key={filterKey}
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              transition={baseTransition}
            >
              {isPending ? (
                <SkeletonGrid count={pageSize >= 6 ? 6 : pageSize} />
              ) : activeCategoryComingSoon ? (
                // Coming-soon category: a clear "coming soon" message, not the generic
                // "No matches found" (its products are intentionally hidden).
                <div className="flex flex-col items-center justify-center gap-3 rounded-3xl border border-dashed border-ink-200 bg-cream-50 py-16 text-center sm:py-20">
                  <span className="inline-flex items-center rounded-full bg-ink-900 px-4 py-1.5 text-xs font-semibold uppercase tracking-[0.14em] text-white">
                    {t("common.comingSoon")}
                  </span>
                  <p className="mt-1 font-display text-2xl text-ink-900">
                    {t("shop.categoryComingSoonTitle")}
                  </p>
                  <p className="max-w-sm text-sm text-ink-500">
                    {t("shop.categoryComingSoonBody")}
                  </p>
                  <Button
                    variant="outline"
                    size="md"
                    onClick={clearAll}
                    className="mt-2"
                  >
                    {t("shop.clearFilters")}
                  </Button>
                </div>
              ) : filtered.length === 0 ? (
                <div className="flex flex-col items-center justify-center gap-3 rounded-3xl border border-dashed border-ink-200 bg-cream-50 py-16 text-center sm:py-20">
                  <p className="font-display text-2xl text-ink-900">
                    {t("shop.noMatches")}
                  </p>
                  <p className="max-w-sm text-sm text-ink-500">
                    {q
                      ? `${t("shop.noMatchesSearch")} "${searchParams.get("q")}".`
                      : t("shop.noMatchesBody")}
                  </p>
                  {hasActiveFilters && (
                    <Button
                      variant="outline"
                      size="md"
                      onClick={clearAll}
                      className="mt-2"
                    >
                      {t("shop.clearFilters")}
                    </Button>
                  )}
                </div>
              ) : (
                // trigger="mount": this grid grows via "Load more"; a whileInView-once
                // stagger would leave appended items invisible until refresh.
                <ProductGrid products={filtered} columns={3} priorityCount={3} trigger="mount" />
              )}
            </m.div>
          </AnimatePresence>

          {/* See more — progress bar + arrow link. Hidden while a client refinement is
              active: we've already filtered the full source, so there's nothing more to
              page in (and the progress/total would be misleading). */}
          {!isPending && hasNextPage && !hasClientRefinement && (
            <div className="mt-14 flex flex-col items-center gap-4">
              {/* Progress bar */}
              <div className="relative h-0.5 w-32 overflow-hidden rounded-full bg-ink-100">
                <div
                  className="absolute inset-y-0 inset-s-0 rounded-full bg-bloom-400 transition-all duration-500"
                  style={{ width: `${Math.round((loaded.length / Math.max(sourceTotal, 1)) * 100)}%` }}
                />
              </div>
              <p className="text-xs text-ink-400">
                {t("shop.showing", {
                  shown: String(loaded.length),
                  total: String(sourceTotal),
                })}
              </p>
              <button
                type="button"
                onClick={() => fetchNextPage()}
                disabled={isFetchingNextPage}
                className="inline-flex items-center gap-2 text-sm font-medium text-ink-700 transition-colors hover:text-bloom-600 disabled:opacity-40"
              >
                {isFetchingNextPage ? (
                  <span className="text-ink-400">{t("shop.loadMore")}…</span>
                ) : (
                  <>
                    {t("shop.loadMore")}
                    <ArrowRight size={15} className="rtl:-scale-x-100" />
                  </>
                )}
              </button>
            </div>
          )}
        </div>
      </div>

      {/* Mobile filter drawer */}
      {!lockedCategorySlug && (
        <Drawer
          open={filtersOpen}
          onClose={() => setFiltersOpen(false)}
          side="left"
          title={t("shop.filters")}
          footer={
            <Button fullWidth size="lg" onClick={() => setFiltersOpen(false)}>
              {`${t("shop.showResults")} ${tc(filtered.length, "units.resultOne", "units.resultOther")}`}
            </Button>
          }
        >
          <div className="px-6 py-5">
            {sidebar}
          </div>
        </Drawer>
      )}
    </>
  );
}
