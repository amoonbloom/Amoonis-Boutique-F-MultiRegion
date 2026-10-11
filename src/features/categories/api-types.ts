/**
 * Backend-aligned category types. Storefront-shaped `Category` lives in
 * `./types.ts` and is kept stable; admin and the API layer use these.
 */

import type { ApiProduct, ApiProductRegionRef } from "@/features/products/api-types";

export interface ApiCategory {
  id: string;
  title: string;
  title_ar: string | null;
  description: string | null;
  description_ar: string | null;
  image: string | null;
  totalProducts: number;
  /** Admin-defined display order (drag-reorder). Lower = earlier on the storefront
   *  home grid + menus. The list endpoint already returns categories in this order. */
  sortOrder?: number;
  /** Publish state. Storefront only ever sees PUBLISHED; staff reads include DRAFT. */
  status?: "DRAFT" | "PUBLISHED";
  /** "Coming soon": category (and all its products) visible but not orderable. On
   *  storefront reads this is the requesting region's value; on staff reads it's the
   *  global mirror (coming-soon in any region). */
  comingSoon?: boolean;
  /** Which regions this category is a coming-soon teaser in (staff/edit reads only). */
  comingSoonRegionIds?: string[];
  /** "On sale": storefront reads = requesting region's value; staff = global mirror.
   *  Cascades a Sale badge to the category's products. `saleLabel`/`saleLabel_ar` is the
   *  custom badge text (blank = default "Sale"). */
  onSale?: boolean;
  saleLabel?: string | null;
  saleLabel_ar?: string | null;
  /** Which regions this category is on sale in (staff/edit reads only). */
  onSaleRegionIds?: string[];
  /** Default gift-card input mode for this category's products (null = no default). */
  giftCardMode?: "MESSAGE" | "NAME" | null;
  /** How far a DRAFT status reaches (ignored while PUBLISHED). HOME_ONLY hides the
   *  category from the home page only (products still list in the Shop); ENTIRE_STORE
   *  also removes its products from every storefront surface. */
  draftScope?: "HOME_ONLY" | "ENTIRE_STORE";
  /** Regions this category is visible in. Present on staff reads only. */
  regions?: ApiProductRegionRef[];
  regionIds?: string[];
  /** Overrides Settings.defaultDeliveryLeadDays for every product in this category
   *  that doesn't set its own Product.deliveryLeadDays. Null = no override. */
  deliveryLeadDays?: number | null;
  /** Default cash-arrangement fee schedule for every product in this category that
   *  doesn't set its own (both-or-neither). Overridden per-region/per-zone below. */
  cashArrangementFeeStepAmount?: number | null;
  cashArrangementFeeMarginPercent?: number | null;
  /** Per-region overrides of the category lead time (staff reads). One entry per
   *  region the category is in; deliveryLeadDays null = no override for that region. */
  regionLeadDays?: ApiCategoryRegionLead[];
  /** Per-zone overrides of the category lead time (staff reads). One entry per zone
   *  that has an override; may be empty/absent when no zone overrides exist. */
  zoneLeadDays?: ApiCategoryZoneLead[];
  createdAt: string;
  updatedAt: string;
}

export interface ApiCategoryRegionLead {
  regionId: string;
  deliveryLeadDays: number | null;
  /** Per-region cash-arrangement fee schedule override — both-or-neither. */
  cashArrangementFeeStepAmount?: number | null;
  cashArrangementFeeMarginPercent?: number | null;
}

export interface ApiCategoryZoneLead {
  zoneId: string;
  deliveryLeadDays: number | null;
  cashArrangementFeeStepAmount?: number | null;
  cashArrangementFeeMarginPercent?: number | null;
  /** ZONE VISIBILITY: true hides this category from the storefront in this zone
   *  (listing, search, category pages and its own page), and checkout refuses an
   *  order delivering there. Absent/false on every pre-existing row — these zone
   *  entries originally only carried lead-time / fee overrides. */
  hidden?: boolean;
}

export interface ApiCategoryDetail extends ApiCategory {
  products: ApiProduct[];
}

export interface ApiCategoryCreateInput {
  title: string;
  title_ar?: string | null;
  description?: string | null;
  description_ar?: string | null;
  image?: string | null;
  status?: "DRAFT" | "PUBLISHED";
  /** "Coming soon": visible but not orderable. Server forces it off unless PUBLISHED.
   *  Legacy global boolean; prefer comingSoonRegionIds for per-region control. */
  comingSoon?: boolean;
  /** Per-region coming-soon: which of the category's regions it's a teaser in. */
  comingSoonRegionIds?: string[];
  /** Per-region "on sale": which of the category's regions cascade a Sale badge to its
   *  products (visual only). Optional bilingual label; blank = default "Sale". */
  onSaleRegionIds?: string[];
  saleLabel?: string | null;
  saleLabel_ar?: string | null;
  /** Default gift-card mode for the category's products. null/"MESSAGE"/"NAME". */
  giftCardMode?: "MESSAGE" | "NAME" | null;
  /** How far a DRAFT status reaches: HOME_ONLY (default) or ENTIRE_STORE. */
  draftScope?: "HOME_ONLY" | "ENTIRE_STORE";
  /** Regions this category should be visible in. Defaults to the default region (UAE) if omitted. */
  regionIds?: string[];
  deliveryLeadDays?: number | null;
  cashArrangementFeeStepAmount?: number | null;
  cashArrangementFeeMarginPercent?: number | null;
  /** Per-region lead-time overrides: [{ regionId, deliveryLeadDays }]. */
  regionLeadDays?: ApiCategoryRegionLead[];
  /** Per-zone lead-time overrides: [{ zoneId, deliveryLeadDays }]. Full replace on update;
   *  entries with a null/blank lead are dropped server-side. */
  zoneLeadDays?: ApiCategoryZoneLead[];
}

export type ApiCategoryUpdateInput = Partial<ApiCategoryCreateInput>;
