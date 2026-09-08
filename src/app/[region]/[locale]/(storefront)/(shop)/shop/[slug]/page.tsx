import { notFound } from "next/navigation";
import { LocalizedLink } from "@/components/ui/LocalizedLink";
import { Container, Section, Divider } from "@/components/ui";
import { ChevronRight } from "@/components/icons";
import { Reveal, StaggerGroup, StaggerItem } from "@/components/motion/primitives";
import { ProductGallery } from "@/features/products/components/ProductGallery";
import { AddToCartPanel } from "@/features/products/components/AddToCartPanel";
import { StickyAddToCart } from "@/features/products/components/StickyAddToCart";
import { ProductGrid } from "@/features/products/components/ProductGrid";
import { ProductPrice } from "@/features/products/components/ProductPrice";
import { ProductSubtitle } from "@/features/products/components/ProductSubtitle";
import { ProductTabs } from "@/features/products/components/ProductTabs";
import { PdpImageProvider } from "@/features/products/components/PdpImageContext";
import {
  getCachedProductById,
  getCachedProductsByCategory,
  getCachedDeliveryZones,
  getCachedDeliveryConfigForZone,
} from "@/services/catalogCache";
import { toUiProduct, toUiProducts } from "@/features/products/adapters";
import { ROUTES } from "@/constants/routes";
import { getServerRegion, getServerZoneName } from "@/services/serverRegion";
import { getServerLocale } from "@/i18n/server";
import { t } from "@/i18n";
import { siteConfig } from "@/config/site";
import { richTextToPlain } from "@/lib/richText";
import { localeAlternates } from "@/features/location/routing";

// Product visibility is region-scoped (a draft / out-of-region product 404s),
// so render per-request based on the region cookie.
export const dynamic = "force-dynamic";

interface ProductPageProps {
  params: Promise<{ region: string; locale: string; slug: string }>;
}

export async function generateMetadata({ params }: ProductPageProps) {
  const { region: regionSlug, locale, slug } = await params;
  const alternates = localeAlternates(siteConfig.url, regionSlug, locale, `/shop/${slug}`);
  try {
    const region = await getServerRegion();
    const api = await getCachedProductById(region, slug);
    if (!api) return { title: "Product", alternates };
    return {
      title: api.title,
      description:
        api.subtitle ||
        richTextToPlain(api.descriptions?.[0]?.description) ||
        api.title,
      alternates,
    };
  } catch {
    return { title: "Product", alternates };
  }
}

export default async function ProductPage({ params }: ProductPageProps) {
  const { slug } = await params;
  const [region, locale, zoneName] = await Promise.all([
    getServerRegion(),
    getServerLocale(),
    getServerZoneName(),
  ]);

  // Resolve the selected city/zone NAME (cookie) → zone id within this region, so the
  // "shipped within N days" note reflects the zone's delivery time. Best-effort: a stale
  // name (region switched) just yields no id → the estimate falls back to region-level.
  let zoneId: string | undefined;
  if (zoneName && region) {
    const zones = await getCachedDeliveryZones(region).catch(() => []);
    zoneId = zones.find((z) => z.name === zoneName)?.id;
  }

  // A genuine 404 comes back as null from the cache layer (see catalogCache);
  // any other failure still throws → error boundary. Non-existent product → 404.
  const api = await getCachedProductById(region, slug, zoneId);
  if (!api) notFound();
  const product = toUiProduct(api, { locale });

  // Same-day availability for the current region/zone (zone override wins). Gated on
  // sameDayEnabled + a configured cutoff (evergreen, cache-stable) — not the time-sensitive
  // `sameDayAvailableNow`, which would freeze under the cache TTL. Best-effort: a config
  // failure just falls back to the standard "ships within N days" note.
  const deliveryCfg = await getCachedDeliveryConfigForZone(region, zoneId).catch(() => null);
  const sameDayCutoff =
    deliveryCfg?.sameDayEnabled && deliveryCfg.sameDayCutoff ? deliveryCfg.sameDayCutoff : null;

  let related: ReturnType<typeof toUiProducts> = [];
  if (api.categoryId) {
    try {
      const page = await getCachedProductsByCategory(region, api.categoryId, 8);
      related = toUiProducts(
        page.data.filter((p) => p.id !== api.id).slice(0, 4),
        { locale }
      );
    } catch {
      related = [];
    }
  }

  return (
    // Wraps the WHOLE page (not just the gallery/panel) so the mobile
    // StickyAddToCart at the bottom shares the same variant selection — it reads
    // the active variant photo and triggers the panel's add-to-cart.
    <PdpImageProvider product={product}>
      <section className="bg-cream-50 pt-8 pb-4">
        <Container>
          <nav
            aria-label="Breadcrumb"
            className="flex items-center gap-1 text-xs text-ink-500"
          >
            <LocalizedLink href={ROUTES.home} className="hover:text-ink-900">
              {t(locale, "common.home")}
            </LocalizedLink>
            <ChevronRight size={12} className="rtl:-scale-x-100" />
            {product.categorySlug ? (
              <>
                <LocalizedLink
                  href={ROUTES.category(product.categorySlug)}
                  className="hover:text-ink-900"
                >
                  {product.category || t(locale, "common.shop")}
                </LocalizedLink>
                <ChevronRight size={12} className="rtl:-scale-x-100" />
              </>
            ) : null}
            <span className="text-ink-900">{product.title}</span>
          </nav>
        </Container>
      </section>

      <Section spacing="sm" tone="cream">
        <div className="grid gap-10 lg:grid-cols-2 lg:gap-16">
          <div className="flex flex-col gap-6">
            <ProductGallery title={product.title} />
          </div>

          <StaggerGroup className="flex flex-col gap-6" trigger="mount" stagger={0.08}>
            <StaggerItem>
              {product.onSale ? (
                <span className="mb-3 inline-flex w-fit items-center gap-1 rounded-full bg-linear-to-br from-[#0c7f40] via-[#006c35] to-[#055c2d] px-3 py-1 text-xs font-bold uppercase tracking-[0.08em] text-white shadow-[0_12px_28px_-10px_rgba(0,108,53,0.55)] ring-1 ring-white/25">
                  {product.saleLabel || t(locale, "product.badgeSale")}
                </span>
              ) : null}
              {product.category ? (
                <p className="text-xs font-semibold uppercase tracking-[0.18em] text-bloom-700">
                  {product.category}
                </p>
              ) : null}
              <h1 className="mt-2 font-display text-3xl font-medium leading-tight text-ink-900 sm:text-4xl md:text-5xl">
                {product.title}
              </h1>
              <ProductSubtitle subtitle={product.subtitle} />
            </StaggerItem>

            <StaggerItem>
              <ProductPrice product={product} size="lg" />
            </StaggerItem>

            <StaggerItem>
              <Divider />
            </StaggerItem>

            <StaggerItem>
              {/* Per-unit "add cash arrangement" lives inside AddToCartPanel (above the
                  add-to-cart button), captured per unit like the gift-card option. */}
              <AddToCartPanel
                product={product}
                sameDayCutoff={sameDayCutoff}
                regionCode={region ?? ""}
              />
            </StaggerItem>
          </StaggerGroup>
        </div>

        <div className="mt-10 grid grid-cols-1 gap-3 sm:grid-cols-3">
          <ValueCard
            title={t(locale, "product.valueCuratedTitle")}
            body={t(locale, "product.valueCuratedBody")}
          />
          <ValueCard
            title={t(locale, "product.valueReadyTitle")}
            body={t(locale, "product.valueReadyBody")}
          />
          <ValueCard
            title={t(locale, "product.valuePersonalTitle")}
            body={t(locale, "product.valuePersonalBody")}
          />
        </div>
      </Section>

      {/* Description · Additional information · Reviews (tabbed, like client) */}
      <Section spacing="md" tone="default" containerSize="md">
        <ProductTabs
          productId={product.id}
          description={product.description}
          descriptions={product.descriptions}
          options={product.options}
          category={product.category}
        />
      </Section>

      {related.length > 0 && (
        <Section spacing="md" tone="cream">
          <Reveal>
            <h2 className="font-display text-3xl font-medium text-ink-900">
              {t(locale, "product.relatedTitle")}
            </h2>
          </Reveal>
          <div className="mt-10">
            <ProductGrid products={related} columns={4} />
          </div>
        </Section>
      )}

      <StickyAddToCart product={product} />
    </PdpImageProvider>
  );
}

function ValueCard({ title, body }: { title: string; body: string }) {
  return (
    <div className="rounded-2xl border border-ink-100 bg-white p-4">
      <p className="font-display text-base font-medium text-ink-900">{title}</p>
      <p className="mt-1.5 text-xs leading-relaxed text-ink-500">{body}</p>
    </div>
  );
}
