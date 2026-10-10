import { LocalizedLink } from "@/components/ui/LocalizedLink";
import { Section, SectionHeader, Button } from "@/components/ui";
import { Reveal } from "@/components/motion/primitives";
import { ArrowRight } from "@/components/icons";
import { ProductGrid } from "@/features/products/components/ProductGrid";
import { getCachedProductList } from "@/services/catalogCache";
import { toUiProducts } from "@/features/products/adapters";
import { ROUTES } from "@/constants/routes";
import { getServerRegion, getServerZoneName } from "@/services/serverRegion";
import { getServerLocale } from "@/i18n/server";
import { t } from "@/i18n";

/**
 * Server component — fetches the most recent products from the API and
 * surfaces 4 of them. Falls back silently to an empty grid if the backend
 * is unreachable, so a single failure on this section won't break the
 * homepage.
 */
export async function FeaturedProducts() {
  const [region, locale] = await Promise.all([
    getServerRegion(),
    getServerLocale(),
  ]);
  const zone = await getServerZoneName();
  const page = await getCachedProductList(region, 1, 4, zone).catch(() => ({
    data: [],
    meta: {},
  }));
  // Products of a coming-soon category are not listed at all.
  const featured = toUiProducts(page.data, { locale }).filter(
    (p) => !p.categoryComingSoon
  );

  if (featured.length === 0) return null;

  return (
    <Section spacing="md">
      <Reveal>
        <SectionHeader
          eyebrow={t(locale, "home.featuredEyebrow")}
          title={t(locale, "home.featuredTitle")}
          description={t(locale, "home.featuredDesc")}
          action={
            <LocalizedLink href={ROUTES.shop} className="contents">
              <Button
                variant="ghost"
                trailingIcon={<ArrowRight size={16} className="rtl:-scale-x-100" />}
              >
                {t(locale, "home.viewEdit")}
              </Button>
            </LocalizedLink>
          }
        />
      </Reveal>
      <div className="mt-12">
        <ProductGrid products={featured} columns={4} />
      </div>
    </Section>
  );
}
