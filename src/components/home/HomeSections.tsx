import { LocalizedLink } from "@/components/ui/LocalizedLink";
import { Section, SectionHeader, Button } from "@/components/ui";
import { Reveal } from "@/components/motion/primitives";
import { ArrowRight } from "@/components/icons";
import { SectionProducts } from "@/features/products/components/SectionProducts";
import { resolveSectionDisplay, sectionRenderCount } from "@/features/sections/display";
import { ProductRail } from "./ProductRail";
import { getCachedSections, getCachedProductList } from "@/services/catalogCache";
import { toUiProducts } from "@/features/products/adapters";
import { ROUTES } from "@/constants/routes";
import { getServerRegion, getServerZoneName } from "@/services/serverRegion";
import { getServerLocale } from "@/i18n/server";
import { localized, t } from "@/i18n";
import { sectionFilterValue } from "@/features/products/facets";

/** "View all" destination for a section — lands on the shop pre-filtered to this
 *  exact section, which lists the section's curated products first (in the same
 *  order shown here) then the rest of the catalogue. Works for every kind,
 *  including CUSTOM rails. */
function viewAllHref(sectionId: string): string {
  return `${ROUTES.shop}?category=${encodeURIComponent(sectionFilterValue(sectionId))}`;
}

// Generous cap so admins can add several rails; guards against a runaway home.
const MAX_SECTIONS = 8;
// Higher than the old grid's 6 so the horizontal rail has enough to scroll
// through (the pagination dots make the extra products discoverable).
const PRODUCTS_PER_SECTION = 12;

/**
 * Home product rails, driven entirely by admin-managed Sections (e.g. "Best
 * sellers", "New arrivals"). Sections render in the admin-chosen `sortOrder`,
 * each as a titled rail of its curated, ordered products. Category-only
 * sections (no products) are skipped here.
 *
 * Fallback: if no published sections carry products yet (fresh DB), show a
 * newest-products rail so the home never renders an empty gap.
 */
export async function HomeSections() {
  const [region, locale] = await Promise.all([
    getServerRegion(),
    getServerLocale(),
  ]);
  const zone = await getServerZoneName();
  const apiSections = await getCachedSections(region, zone).catch(() => []);
  const eligible = [...apiSections]
    .filter((s) => s.products && s.products.length > 0)
    .sort((a, b) => a.sortOrder - b.sortOrder)
    .slice(0, MAX_SECTIONS);

  if (eligible.length === 0) {
    const page = await getCachedProductList(region, 1, 12, zone).catch(() => ({
      data: [],
      meta: {},
    }));
    // Coming-soon products never appear in rails — only released (orderable) ones. A
    // released product comes back with comingSoon=false from the backend, so this drops
    // exactly the un-released coming-soon items.
    const products = toUiProducts(page.data, { locale })
      .filter((p) => !p.comingSoon)
      .slice(0, PRODUCTS_PER_SECTION);
    return (
      <ProductRail
        locale={locale}
        eyebrowKey="home.newArrivalsEyebrow"
        titleKey="home.newArrivalsTitle"
        descKey="home.newArrivalsDesc"
        products={products}
        tone="cream"
      />
    );
  }

  return (
    <>
      {eligible.map((section, idx) => {
        const display = resolveSectionDisplay(section);
        // Render enough cards to satisfy the larger breakpoint limit; SectionProducts
        // trims each breakpoint down to its own limit via CSS.
        // A coming-soon product shows in a section ONLY when that section released it
        // ("Sell these products even if their category is coming soon") — the backend
        // then returns it with comingSoon=false. Un-released coming-soon items are hidden.
        const products = toUiProducts(section.products, { locale })
          .filter((p) => !p.comingSoon)
          .slice(0, sectionRenderCount(display));
        if (products.length === 0) return null;
        return (
          <Section
            key={section.id}
            spacing="md"
            tone={idx % 2 === 0 ? "cream" : "default"}
          >
            <Reveal>
              <SectionHeader
                title={localized(section.title, section.title_ar, locale)}
                action={
                  <LocalizedLink href={viewAllHref(section.id)} className="contents">
                    <Button
                      variant="ghost"
                      trailingIcon={
                        <ArrowRight size={16} className="rtl:-scale-x-100" />
                      }
                    >
                      {t(locale, "home.viewAll")}
                    </Button>
                  </LocalizedLink>
                }
              />
            </Reveal>
            <div className="mt-8">
              <SectionProducts
                products={products}
                display={display}
                scopeId={section.id}
              />
            </div>
          </Section>
        );
      })}
    </>
  );
}
