/**
 * Region types — match `REGION_SELECT` in
 * Amoonis-Boutique-B/src/services/region.service.js and the `Region` Prisma
 * model. The `code` (uppercase) is the value sent as the `X-Region` header by
 * the storefront/mobile clients.
 */

/** A region-wide delivery blackout date (holiday/closure). `date` is a "YYYY-MM-DD" key. */
export interface ApiBlackoutDate {
  id?: string;
  date: string;
  label?: string | null;
  label_ar?: string | null;
}

export interface ApiRegion {
  id: string;
  code: string;
  name: string;
  name_ar: string | null;
  /** ISO 4217 currency code shown/charged for this region (e.g. "AED", "SAR"). */
  currency: string;
  /** Legal entity name shown in the storefront footer's copyright line for this
   * region. Null/blank falls back to the frontend's default siteConfig.legalEntity. */
  legalEntity: string | null;
  /** Flat shipping fee charged on every order placed in this region. Null = free
   * (no fee configured). Serialized as a string (Prisma Decimal), like Product.price. */
  shippingFlatRate: string | null;
  /** Typical Standard Delivery lead time for this region, in whole days (e.g. 1, 3).
   * Null = not configured, so the storefront shows no ETA. Plain number — unlike
   * shippingFlatRate, this is a Prisma Int, not a Decimal, so no string quirk. */
  standardDeliveryDays: number | null;
  /** IANA timezone the region operates in (e.g. "Asia/Dubai"). Drives same-day cutoff,
   * "today", allowed weekdays and blackout-date math. Never null (defaults to Asia/Dubai). */
  timezone: string;
  /** Net order value at/above which delivery is free in this region. Null = no threshold.
   * Serialized as a string (Prisma Decimal), like shippingFlatRate. */
  freeDeliveryThreshold: string | null;
  /** Allowed delivery weekdays, 0=Sun..6=Sat. Empty [] = every day allowed. */
  deliveryDays: number[];
  /** Whether same-day delivery is offered in this region. */
  sameDayEnabled: boolean;
  /** Daily same-day cutoff "HH:mm" in the region timezone (e.g. "18:00"). Null = no cutoff. */
  sameDayCutoff: string | null;
  /** Whether Cash on Delivery is offered in this region (default true). */
  codEnabled: boolean;
  /** Whether online (card / Apple Pay via MyFatoorah) payment is offered in this
   *  region (default false — opt-in, since the gateway is currency-scoped). */
  onlinePaymentEnabled: boolean;
  /** Which online methods are offered when onlinePaymentEnabled is on (default true).
   *  Drive which options the storefront shows; Apple Pay is also enforced server-side. */
  applePayEnabled: boolean;
  cardPaymentEnabled: boolean;
  /** When true, checkout shows and requires the Saudi National Address short
   *  code (4 letters + 4 digits). Opt-in per region — enable for SA only. */
  shortAddressEnabled: boolean;
  /** Tabby Pay-in-4 — independent of MyFatoorah onlinePaymentEnabled (default false). */
  tabbyEnabled: boolean;
  /** Region-wide delivery blackout dates (holidays/closures). */
  blackoutDates: ApiBlackoutDate[];
  /** ISO 3166-1 alpha-2 code (e.g. "AE") — renders this region's flag in the
   * storefront's country/region pickers. Null shows a neutral placeholder. */
  iso2: string | null;
  /** Lowercase URL segment for this region's permanent public routes
   * (e.g. "ae" -> /ae/en/…). Web-only — NOT used for API scoping (clients still
   * send `code` via X-Region). Null = region has no dedicated public route. */
  urlSlug: string | null;
  /** Per-region contact/legal info shown across the storefront (footer, support
   * section, WhatsApp button, contact page, legal pages, checkout receipt, order
   * emails). Same fallback convention as legalEntity: null falls back to the
   * frontend's siteConfig.contact.*. address_ar/hours_ar fall back to the
   * English value when unset. */
  contactEmail: string | null;
  contactPhone: string | null;
  whatsappNumber: string | null;
  address: string | null;
  address_ar: string | null;
  hours: string | null;
  hours_ar: string | null;
  /** Per-region social links shown as footer icons. Null/blank = icon hidden
   * (falls back to the site default). Full absolute URLs. */
  instagramUrl: string | null;
  facebookUrl: string | null;
  tiktokUrl: string | null;
  threadsUrl: string | null;
  snapchatUrl: string | null;
  xUrl: string | null;
  youtubeUrl: string | null;
  /** URL segments of this region's published legal pages (e.g. ["terms","privacy"]).
   * The footer only links pages that exist here ("hidden until set"). Attached by
   * GET /regions; absent on payloads that don't include it. */
  publishedPageSlugs?: string[];
  /** Legal citations shown across the 5 storefront legal pages (Privacy, Terms,
   * Refund Policy, Shipping Policy, Product Disclaimer) — e.g. the IP law
   * citation, the consumer-protection regulator name. REQUIRED when creating a
   * region (see ApiRegionCreateInput) so a region can never go live with the
   * wrong country's law citations. Nullable here only because regions created
   * before this feature existed (or via a stale client) may not have them —
   * the frontend falls back to generic, non-country-specific wording for
   * those, never to another region's specific citation. See
   * src/features/location/regionContact.ts. */
  registrationCity: string | null;
  registrationCity_ar: string | null;
  currencyDisplayName: string | null;
  currencyDisplayName_ar: string | null;
  vatLawName: string | null;
  vatLawName_ar: string | null;
  dataProtectionLawName: string | null;
  dataProtectionLawName_ar: string | null;
  dataProtectionAuthority: string | null;
  dataProtectionAuthority_ar: string | null;
  ipLawName: string | null;
  ipLawName_ar: string | null;
  consumerProtectionLawName: string | null;
  consumerProtectionLawName_ar: string | null;
  consumerProtectionAuthority: string | null;
  consumerProtectionAuthority_ar: string | null;
  standardsAuthority: string | null;
  standardsAuthority_ar: string | null;
  isDefault: boolean;
  isActive: boolean;
  sortOrder: number;
  createdAt: string;
  updatedAt: string;
}

export interface ApiRegionCreateInput {
  code: string;
  name: string;
  name_ar?: string | null;
  currency?: string;
  legalEntity?: string | null;
  shippingFlatRate?: number | null;
  standardDeliveryDays?: number | null;
  timezone?: string;
  freeDeliveryThreshold?: number | null;
  deliveryDays?: number[];
  sameDayEnabled?: boolean;
  sameDayCutoff?: string | null;
  codEnabled?: boolean;
  onlinePaymentEnabled?: boolean;
  applePayEnabled?: boolean;
  cardPaymentEnabled?: boolean;
  shortAddressEnabled?: boolean;
  tabbyEnabled?: boolean;
  blackoutDates?: ApiBlackoutDate[];
  iso2?: string | null;
  urlSlug?: string | null;
  contactEmail?: string | null;
  contactPhone?: string | null;
  whatsappNumber?: string | null;
  address?: string | null;
  address_ar?: string | null;
  hours?: string | null;
  hours_ar?: string | null;
  instagramUrl?: string | null;
  facebookUrl?: string | null;
  tiktokUrl?: string | null;
  threadsUrl?: string | null;
  snapchatUrl?: string | null;
  xUrl?: string | null;
  youtubeUrl?: string | null;
  /** Legal citations — now OPTIONAL at creation. Legal pages are authored per
   * region in the rich-text Pages editor (RegionLegalPage), so these are only
   * seed values for the editor's "Load default template" action. */
  registrationCity?: string | null;
  registrationCity_ar?: string | null;
  currencyDisplayName?: string | null;
  currencyDisplayName_ar?: string | null;
  vatLawName?: string | null;
  vatLawName_ar?: string | null;
  dataProtectionLawName?: string | null;
  dataProtectionLawName_ar?: string | null;
  dataProtectionAuthority?: string | null;
  dataProtectionAuthority_ar?: string | null;
  ipLawName?: string | null;
  ipLawName_ar?: string | null;
  consumerProtectionLawName?: string | null;
  consumerProtectionLawName_ar?: string | null;
  consumerProtectionAuthority?: string | null;
  consumerProtectionAuthority_ar?: string | null;
  standardsAuthority?: string | null;
  standardsAuthority_ar?: string | null;
  isDefault?: boolean;
  isActive?: boolean;
  sortOrder?: number;
}

export type ApiRegionUpdateInput = Partial<ApiRegionCreateInput>;

// --- Legal pages (per-region, admin-authored) -------------------------------

/** Storefront URL segments of the 5 footer legal pages (fixed set). */
export const LEGAL_PAGE_SLUGS = [
  "terms",
  "privacy",
  "refund-policy",
  "shipping-policy",
  "product-disclaimer",
] as const;
export type LegalPageSlug = (typeof LEGAL_PAGE_SLUGS)[number];

/** Admin view of an authored legal page. `slug` comes back in enum form
 *  (TERMS, REFUND_POLICY, …); use `legalSlugToUrl` to map to a URL segment. */
export interface ApiLegalPage {
  id: string;
  regionId: string;
  slug: string;
  title: string | null;
  title_ar: string | null;
  content: string | null;
  content_ar: string | null;
  isPublished: boolean;
  createdAt: string;
  updatedAt: string;
}

/** Public storefront payload for a single legal page (both languages). */
export interface ApiPublicLegalPage {
  slug: string;
  title: string | null;
  title_ar: string | null;
  content: string | null;
  content_ar: string | null;
  updatedAt: string;
}

export interface LegalPageUpsertInput {
  title?: string | null;
  title_ar?: string | null;
  content?: string | null;
  content_ar?: string | null;
  isPublished?: boolean;
}

/** enum form (TERMS) <-> url form (terms). */
const LEGAL_ENUM_TO_URL: Record<string, LegalPageSlug> = {
  TERMS: "terms",
  PRIVACY: "privacy",
  REFUND_POLICY: "refund-policy",
  SHIPPING_POLICY: "shipping-policy",
  PRODUCT_DISCLAIMER: "product-disclaimer",
};
export function legalSlugToUrl(slug: string): LegalPageSlug {
  return LEGAL_ENUM_TO_URL[slug] ?? (slug as LegalPageSlug);
}

// --- Branches (per-region physical stores) ----------------------------------

export interface ApiBranch {
  id: string;
  regionId: string;
  name: string;
  name_ar: string | null;
  address: string | null;
  address_ar: string | null;
  phone: string | null;
  hours: string | null;
  hours_ar: string | null;
  note: string | null;
  note_ar: string | null;
  mapUrl: string | null;
  isActive: boolean;
  sortOrder: number;
  createdAt: string;
  updatedAt: string;
}

export interface BranchCreateInput {
  regionId: string;
  name: string;
  name_ar?: string | null;
  address?: string | null;
  address_ar?: string | null;
  phone?: string | null;
  hours?: string | null;
  hours_ar?: string | null;
  note?: string | null;
  note_ar?: string | null;
  mapUrl?: string | null;
  isActive?: boolean;
  sortOrder?: number;
}

export type BranchUpdateInput = Partial<BranchCreateInput>;
