/**
 * Cached catalog data layer for Server Components.
 *
 * The storefront reads the region cookie per request, which opts routes into
 * dynamic rendering — so a page-level `revalidate` is ignored. Instead we cache
 * the *data* here: each function wraps its API call in `unstable_cache` (cross-
 * request Data Cache, region-keyed) and `react.cache` (in-request dedup so the
 * same record fetched by both `generateMetadata` and the page hits the network
 * once).
 *
 * IMPORTANT: cookies must NOT be read inside a cached scope. Callers read the
 * region cookie via `getServerRegion()` and pass it in as an argument, so it
 * becomes part of the cache key. Errors are intentionally NOT caught here — a
 * throw skips caching (so a transient backend blip isn't cached as empty);
 * callers keep their existing `.catch()` fallbacks.
 */

import { cache } from "react";
import { unstable_cache } from "next/cache";
import { ApiError } from "@/services/http";
import { productsApi } from "@/features/products/api/products.api";
import { categoriesApi } from "@/features/categories/api/categories.api";
import { sectionsApi } from "@/features/sections/api/sections.api";
import { bannersApi } from "@/features/banners/api/banners.api";
import { regionsApi } from "@/features/regions/api/regions.api";
import { deliveryZonesApi } from "@/features/delivery-zones/api/delivery-zones.api";
import { deliveryConfigApi } from "@/features/delivery-config/api/delivery-config.api";
import { vatApi } from "@/features/vat/api/vat.api";
import { legalPagesApi } from "@/features/regions/api/legalPages.api";
import { branchesApi } from "@/features/regions/api/branches.api";
import { settingsApi } from "@/features/settings/api/settings.api";

// Reference/catalog data changes rarely (admin edits) → cache longer.
const CATALOG_TTL = 300; // 5 min: categories, sections, banners
// Product availability/stock is more volatile → shorter.
const PRODUCTS_TTL = 60; // 1 min: product lists & detail

const r = (region?: string) => region ?? "default";

/**
 * Cache-key form of the selected delivery-zone NAME.
 *
 * The zone is passed IN by the caller (server components read it with
 * `getServerZoneName()`), never read here: this module is reachable from graphs that
 * are not Server Components, so it cannot import `next/headers`. It must be part of
 * the CACHE KEY — otherwise one zone's filtered catalog would be served to visitors
 * in every other zone.
 */
const z = (zone?: string) => zone ?? "none";


// --- Categories -----------------------------------------------------------

const _categories = unstable_cache(
  (region: string | undefined, zoneKey: string) =>
    categoriesApi.list(region, zoneKey === "none" ? undefined : zoneKey),
  ["catalog:categories"],
  { revalidate: CATALOG_TTL, tags: ["categories"] }
);
export const getCachedCategories = cache((region?: string, zone?: string) =>
  _categories(region, z(zone))
);

const _categoryById = unstable_cache(
  async (region: string | undefined, id: string, zoneKey: string) => {
    try {
      return await categoriesApi.getById(id, region, zoneKey === "none" ? undefined : zoneKey);
    } catch (e) {
      // A genuine 404 (category doesn't exist / not in this region) is a
      // cacheable "not found" → return null so the page renders a real 404
      // instead of the error boundary. `instanceof ApiError` is reliable HERE
      // (inside the cached fn); it does NOT survive being re-thrown across the
      // unstable_cache boundary, which is why detection must happen here.
      if (e instanceof ApiError && e.status === 404) return null;
      throw e;
    }
  },
  ["catalog:category-by-id"],
  { revalidate: CATALOG_TTL, tags: ["categories"] }
);
export const getCachedCategoryById = cache(
  (region: string | undefined, id: string, zone?: string) =>
    _categoryById(r(region), id, z(zone))
);

// --- Products -------------------------------------------------------------

const _productList = unstable_cache(
  (region: string | undefined, page: number, limit: number, zoneKey: string) =>
    productsApi.list({
      page,
      limit,
      region,
      ...(zoneKey === "none" ? {} : { zone: zoneKey }),
    }),
  ["catalog:product-list"],
  { revalidate: PRODUCTS_TTL, tags: ["products"] }
);
export const getCachedProductList = cache(
  (region: string | undefined, page = 1, limit = 24, zone?: string) =>
    _productList(r(region), page, limit, z(zone))
);

const _productsByCategory = unstable_cache(
  (region: string | undefined, categoryId: string, limit: number, zoneKey: string) =>
    productsApi.listByCategory(categoryId, {
      limit,
      region,
      ...(zoneKey === "none" ? {} : { zone: zoneKey }),
    }),
  ["catalog:products-by-category"],
  { revalidate: PRODUCTS_TTL, tags: ["products"] }
);
export const getCachedProductsByCategory = cache(
  (region: string | undefined, categoryId: string, limit = 24, zone?: string) =>
    _productsByCategory(r(region), categoryId, limit, z(zone))
);

const _productById = unstable_cache(
  async (region: string | undefined, id: string, zoneKey: string) => {
    try {
      return await productsApi.getById(id, region, zoneKey === "none" ? undefined : zoneKey);
    } catch (e) {
      // See _categoryById: 404 → null so the page can 404 cleanly (instanceof
      // ApiError only works inside the cached fn, not across the cache boundary).
      if (e instanceof ApiError && e.status === 404) return null;
      throw e;
    }
  },
  ["catalog:product-by-id"],
  { revalidate: PRODUCTS_TTL, tags: ["products"] }
);
// zoneId is part of the cache key so a zone-specific delivery estimate doesn't bleed across
// zones. "none" sentinel keeps the key stable when no zone is selected.
export const getCachedProductById = cache(
  (region: string | undefined, id: string, zoneId?: string) =>
    _productById(r(region), id, zoneId || "none")
);

// --- Home content ---------------------------------------------------------

const _sections = unstable_cache(
  (region: string | undefined, zoneKey: string) =>
    sectionsApi.list(region, zoneKey === "none" ? undefined : zoneKey),
  ["catalog:sections"],
  { revalidate: CATALOG_TTL, tags: ["sections"] }
);
export const getCachedSections = cache((region?: string, zone?: string) =>
  _sections(region, z(zone))
);

const _banners = unstable_cache(
  (region: string, platform: "MOBILE" | "WEB") =>
    bannersApi.list(region === "default" ? undefined : region, platform),
  ["catalog:banners"],
  { revalidate: CATALOG_TTL, tags: ["banners"] }
);
// The website renders WEB banners (hero videos/images). Region + platform are both
// part of the cache key so mobile-vs-web and per-region lists never collide.
export const getCachedBanners = cache(
  (region?: string, platform: "MOBILE" | "WEB" = "WEB") =>
    _banners(r(region), platform)
);

// --- Regions ----------------------------------------------------------------
// Not region-keyed (the endpoint itself isn't scoped by a region cookie) — this
// is the small, rarely-changing list of ACTIVE regions used to resolve the
// visitor's current region (e.g. for the footer's per-region legal entity name).

const _regions = unstable_cache(
  () => regionsApi.list(),
  ["catalog:regions"],
  { revalidate: CATALOG_TTL, tags: ["regions"] }
);
export const getCachedRegions = cache(() => _regions());

// --- Public settings --------------------------------------------------------
// Global, not region-keyed. Used by the storefront layout to resolve the
// admin's default storefront language (Settings.defaultLocale) server-side, so
// a first-time visitor is redirected to it BEFORE the page paints (no flicker).
//
// Admin saves expire this immediately via `revalidateCatalog(["settings"])`
// (see the Settings page + /api/revalidate). The short TTL is only a backstop
// for the rare case a revalidation call is missed (e.g. a multi-instance
// deploy where the on-demand bust lands on another instance) — this gates a
// visible redirect, so it must self-heal in seconds, not minutes.
const SETTINGS_TTL = 60; // 1 min

const _publicSettings = unstable_cache(
  () => settingsApi.getPublic(),
  ["catalog:public-settings"],
  { revalidate: SETTINGS_TTL, tags: ["settings"] }
);
export const getCachedPublicSettings = cache(() => _publicSettings());

// --- Delivery zones -----------------------------------------------------
// Region-scoped sub-areas (e.g. UAE's emirates) — same admin-managed list
// checkout's zone dropdown reads, reused server-side for marketing copy
// (e.g. "same-day delivery in {city}") so there's one source of truth.

const _deliveryZones = unstable_cache(
  (regionCode: string) => deliveryZonesApi.list(regionCode),
  ["catalog:delivery-zones"],
  { revalidate: CATALOG_TTL, tags: ["delivery-zones"] }
);
export const getCachedDeliveryZones = cache((regionCode: string) => _deliveryZones(regionCode));

// --- Delivery config (resolved, region-level) --------------------------------
// The same-day toggle/cutoff, free-delivery threshold, delivery fee etc. resolved for a
// region (no zone). Server-side source of truth for marketing copy that quotes the
// same-day cutoff (announcement bar, trust strip, shop hero) so those strings track the
// real admin config instead of a hardcoded "6 PM".

const _deliveryConfig = unstable_cache(
  (regionCode: string) =>
    deliveryConfigApi.get({ region: regionCode === "default" ? undefined : regionCode }),
  ["catalog:delivery-config"],
  { revalidate: CATALOG_TTL, tags: ["regions", "delivery-zones"] }
);
export const getCachedDeliveryConfig = cache((regionCode?: string) => _deliveryConfig(r(regionCode)));

// Zone-aware variant: resolves same-day/cutoff/fee etc. for a region + specific zone
// (zone overrides win over region). `zoneId` is part of the cache key so per-zone
// config doesn't bleed across zones ("none" sentinel keeps the key stable when no zone
// is selected, matching getCachedProductById). Used by the product page's same-day note.
const _deliveryConfigForZone = unstable_cache(
  (regionCode: string, zoneKey: string) =>
    deliveryConfigApi.get({
      region: regionCode === "default" ? undefined : regionCode,
      zoneId: zoneKey === "none" ? undefined : zoneKey,
    }),
  ["catalog:delivery-config-zone"],
  { revalidate: CATALOG_TTL, tags: ["regions", "delivery-zones"] }
);
export const getCachedDeliveryConfigForZone = cache(
  (regionCode?: string, zoneId?: string) => _deliveryConfigForZone(r(regionCode), zoneId || "none")
);

// --- VAT --------------------------------------------------------------------
// The Terms & Conditions page's only SSR read of VatConfig, so its "inclusive of
// VAT" / "exclusive of VAT" sentence tracks the region's real, admin-set config
// instead of hardcoding one or the other. Everywhere else (PDP, cart, checkout)
// reads the same data client-side via usePublicVat() (React Query) instead.

const _vatPublic = unstable_cache(
  (regionCode: string) => vatApi.getPublic(regionCode === "default" ? undefined : regionCode),
  ["catalog:vat-public"],
  { revalidate: CATALOG_TTL, tags: ["vat"] }
);
export const getCachedVatPublic = cache((regionCode?: string) => _vatPublic(r(regionCode)));

// --- Legal pages (per-region, admin-authored) -------------------------------
// A single published legal page for a region+slug. Returns null on a 404 (page
// not published / not set) so the storefront route can render notFound() —
// "hidden until set". 404 detection must happen inside the cached fn (see
// _categoryById), as ApiError doesn't survive the cache boundary.

const _legalPage = unstable_cache(
  async (regionCode: string, slug: string) => {
    try {
      return await legalPagesApi.getPublic(regionCode, slug);
    } catch (e) {
      if (e instanceof ApiError && e.status === 404) return null;
      throw e;
    }
  },
  ["catalog:legal-page"],
  { revalidate: CATALOG_TTL, tags: ["regions", "legal-pages"] }
);
export const getCachedLegalPage = cache((regionCode: string | undefined, slug: string) =>
  _legalPage(r(regionCode), slug)
);

// --- Branches (per-region physical stores) ----------------------------------

const _branches = unstable_cache(
  (regionCode: string) => branchesApi.list(regionCode === "default" ? undefined : regionCode),
  ["catalog:branches"],
  { revalidate: CATALOG_TTL, tags: ["regions", "branches"] }
);
export const getCachedBranches = cache((regionCode?: string) => _branches(r(regionCode)));
