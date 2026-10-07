import { ProductRail } from "./ProductRail";
import { getCachedProductList } from "@/services/catalogCache";
import { toUiProducts } from "@/features/products/adapters";
import { getServerRegion, getServerZoneName } from "@/services/serverRegion";
import { getServerLocale } from "@/i18n/server";
import { NEW_ARRIVALS_FILTER_VALUE } from "@/features/products/facets";
import { ROUTES } from "@/constants/routes";

/**
 * New Arrivals — the newest products (backend default order is newest-first).
 * Mirrors the client homepage's "New Arrivals Products" row.
 */
export async function NewArrivals() {
  const [region, locale] = await Promise.all([
    getServerRegion(),
    getServerLocale(),
  ]);
  const zone = await getServerZoneName();
  const page = await getCachedProductList(region, 1, 8, zone).catch(() => ({
    data: [],
    meta: {},
  }));
  const products = toUiProducts(page.data, { locale });

  return (
    <ProductRail
      locale={locale}
      eyebrowKey="home.newArrivalsEyebrow"
      titleKey="home.newArrivalsTitle"
      descKey="home.newArrivalsDesc"
      products={products}
      viewAllHref={`${ROUTES.shop}?category=${encodeURIComponent(NEW_ARRIVALS_FILTER_VALUE)}`}
    />
  );
}
