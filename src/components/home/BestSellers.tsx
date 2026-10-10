import { ProductRail } from "./ProductRail";
import {
  getCachedCategories,
  getCachedProductsByCategory,
  getCachedProductList,
} from "@/services/catalogCache";
import { toUiProducts } from "@/features/products/adapters";
import { getServerRegion, getServerZoneName } from "@/services/serverRegion";
import { getServerLocale } from "@/i18n/server";
import { BEST_SELLING_FILTER_VALUE } from "@/features/products/facets";
import { ROUTES } from "@/constants/routes";

/**
 * Best Sellers — mirrors the client homepage's "Best Selling Products" row,
 * which showcases the Gift Boxes range. Falls back to the general catalogue if
 * that category can't be resolved.
 */
export async function BestSellers() {
  const [region, locale] = await Promise.all([
    getServerRegion(),
    getServerLocale(),
  ]);

  const zone = await getServerZoneName();
  const cats = await getCachedCategories(region, zone).catch(() => []);
  const giftBoxes = cats.find((c) =>
    /gift\s*box/i.test(c.title ?? "")
  );

  const page = await (giftBoxes
    ? getCachedProductsByCategory(region, giftBoxes.id, 8, zone)
    : getCachedProductList(region, 1, 8, zone)
  ).catch(() => ({ data: [], meta: {} }));

  const products = toUiProducts(page.data, { locale }).slice(0, 8);

  return (
    <ProductRail
      id="best-sellers"
      locale={locale}
      eyebrowKey="home.bestSellersEyebrow"
      titleKey="home.bestSellersTitle"
      descKey="home.bestSellersDesc"
      products={products}
      tone="cream"
      viewAllHref={`${ROUTES.shop}?category=${encodeURIComponent(BEST_SELLING_FILTER_VALUE)}`}
    />
  );
}
