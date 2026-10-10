import { notFound } from "next/navigation";
import { LocalizedLink } from "@/components/ui/LocalizedLink";
import { Container, Section } from "@/components/ui";
import { ChevronRight } from "@/components/icons";
import { ProductGrid } from "@/features/products/components/ProductGrid";
import {
  getCachedCategoryById,
  getCachedProductsByCategory,
} from "@/services/catalogCache";
import { toUiCategory } from "@/features/categories/adapters";
import { toUiProducts } from "@/features/products/adapters";
import { ROUTES } from "@/constants/routes";
import { getServerRegion, getServerZoneName } from "@/services/serverRegion";
import { getServerLocale } from "@/i18n/server";
import { t, tCount } from "@/i18n";
import { siteConfig } from "@/config/site";
import { localeAlternates } from "@/features/location/routing";

interface CategoryPageProps {
  params: Promise<{ region: string; locale: string; slug: string }>;
}

// Region-scoped catalog → render per-request from the region cookie.
export const dynamic = "force-dynamic";

export async function generateMetadata({ params }: CategoryPageProps) {
  const { region: regionSlug, locale, slug } = await params;
  const alternates = localeAlternates(
    siteConfig.url,
    regionSlug,
    locale,
    `/shop/category/${slug}`
  );
  try {
    const region = await getServerRegion();
    const api = await getCachedCategoryById(region, slug, await getServerZoneName());
    if (!api) return { alternates };
    return {
      title: api.title,
      description: api.description ?? `${api.title} at Amoonis Boutique`,
      alternates,
    };
  } catch {
    return { alternates };
  }
}

export default async function CategoryPage({ params }: CategoryPageProps) {
  const { slug } = await params;
  const [region, locale] = await Promise.all([
    getServerRegion(),
    getServerLocale(),
  ]);

  // 404 → null from the cache layer (see catalogCache); other errors still
  // throw to the error boundary. Non-existent category → real 404.
  const zone = await getServerZoneName();
  const categoryApi = await getCachedCategoryById(region, slug, zone);
  if (!categoryApi) notFound();

  const productPage = await getCachedProductsByCategory(region, slug, 24, zone).catch(
    () => ({ data: [], meta: {} })
  );

  const category = toUiCategory(categoryApi, locale);
  // Coming-soon products are never listed on the storefront (only released ones, which
  // the backend returns with comingSoon=false). A coming-soon CATEGORY shows a message
  // instead of a grid (below); a normal category just drops any coming-soon items.
  const items = toUiProducts(productPage.data, { locale }).filter((p) => !p.comingSoon);

  return (
    <>
      <section className="border-b border-ink-100 bg-cream-50 pt-12 pb-10 lg:pt-16 lg:pb-14">
        <Container>
          <nav
            aria-label="Breadcrumb"
            className="flex items-center gap-1 text-xs text-ink-500"
          >
            <LocalizedLink href={ROUTES.home} className="hover:text-ink-900">
              {t(locale, "common.home")}
            </LocalizedLink>
            <ChevronRight size={12} className="rtl:-scale-x-100" />
            <LocalizedLink href={ROUTES.shop} className="hover:text-ink-900">
              {t(locale, "common.shop")}
            </LocalizedLink>
            <ChevronRight size={12} className="rtl:-scale-x-100" />
            <span className="text-ink-900">{category.title}</span>
          </nav>
          <h1 className="mt-6 font-display text-3xl font-medium leading-tight text-ink-900 sm:text-4xl md:text-5xl lg:text-6xl">
            {category.title}
          </h1>
          {category.comingSoon && (
            <span className="mt-4 inline-flex items-center rounded-full bg-ink-900 px-4 py-1.5 text-xs font-semibold uppercase tracking-[0.14em] text-white">
              {t(locale, "common.comingSoon")}
            </span>
          )}
          {category.description && (
            <p className="mt-3 max-w-2xl text-ink-500">{category.description}</p>
          )}
          {!category.comingSoon && (
            <p className="mt-4 text-xs text-ink-400">
              {tCount(locale, items.length, "units.pieceOne", "units.pieceOther")}
            </p>
          )}
        </Container>
      </section>

      <Section spacing="md" tone="default">
        {category.comingSoon ? (
          // Coming-soon category: no product grid — a clear "coming soon" message, so a
          // visitor who reaches the page (direct link, product's category label) sees why
          // it's empty instead of a blank/emptied grid.
          <div className="flex flex-col items-center justify-center gap-3 rounded-3xl border border-dashed border-ink-200 bg-cream-50 px-6 py-16 text-center sm:py-20">
            <span className="inline-flex items-center rounded-full bg-ink-900 px-4 py-1.5 text-xs font-semibold uppercase tracking-[0.14em] text-white">
              {t(locale, "common.comingSoon")}
            </span>
            <p className="mt-1 font-display text-2xl text-ink-900">
              {t(locale, "shop.categoryComingSoonTitle")}
            </p>
            <p className="max-w-md text-sm text-ink-500">
              {t(locale, "shop.categoryComingSoonBody")}
            </p>
            <LocalizedLink
              href={ROUTES.shop}
              className="mt-1 rounded-full bg-ink-900 px-5 py-2.5 text-sm font-medium text-white"
            >
              {t(locale, "common.browseBoutique")}
            </LocalizedLink>
          </div>
        ) : items.length === 0 ? (
          <div className="flex flex-col items-center justify-center gap-3 rounded-3xl border border-dashed border-ink-200 bg-cream-50 px-6 py-16 text-center sm:py-20">
            <p className="font-display text-2xl text-ink-900">
              {t(locale, "shop.emptyCategoryTitle")}
            </p>
            <LocalizedLink
              href={ROUTES.shop}
              className="rounded-full bg-ink-900 px-5 py-2.5 text-sm font-medium text-white"
            >
              {t(locale, "common.browseBoutique")}
            </LocalizedLink>
          </div>
        ) : (
          <ProductGrid products={items} columns={4} priorityCount={4} />
        )}
      </Section>
    </>
  );
}
