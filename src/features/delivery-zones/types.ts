/**
 * Delivery zone types — match `ZONE_SELECT` in
 * Amoonis-Boutique-B/src/services/deliveryZone.service.js and the `DeliveryZone`
 * Prisma model. A zone (e.g. an emirate) belongs to exactly one region.
 */

export interface ApiDeliveryZone {
  id: string;
  regionId: string;
  name: string;
  name_ar: string | null;
  isActive: boolean;
  sortOrder: number;
  // Per-zone overrides — null / [] = inherit the parent region's value.
  /** Flat shipping fee for this zone (Prisma Decimal string). Null = inherit region. */
  shippingFlatRate: string | null;
  /** Free-delivery threshold for this zone (Decimal string). Null = inherit region. */
  freeDeliveryThreshold: string | null;
  /** Same-day offered? Null = inherit region. */
  sameDayEnabled: boolean | null;
  /** Same-day cutoff "HH:mm". Null = inherit region. */
  sameDayCutoff: string | null;
  /** Standard courier lead days for this zone. Null = inherit region.standardDeliveryDays. */
  standardLeadDays: number | null;
  /** Optional upper bound for this zone. Null = inherit region.standardDeliveryDaysMax. */
  standardLeadDaysMax: number | null;
  /** Allowed delivery weekdays (0=Sun..6=Sat). [] = inherit region. */
  deliveryDays: number[];
  /** COD offered? Null = inherit region. */
  codEnabled: boolean | null;
  /** Min/max net order value to deliver here (Decimal string). Null = no bound. */
  minOrderAmount: string | null;
  maxOrderAmount: string | null;
  /** Cash-arrangement quick-pick amounts for this zone. [] = inherit the region's CashArrangementConfig list. */
  cashArrangementQuickPickAmounts: number[];
  /** Cash-arrangement banknote denominations for this zone. [] = inherit the region's CashArrangementConfig list. */
  cashArrangementDenominations: number[];
  /** Zone-wide FLAT cash-arrangement fee (Decimal string; both-or-neither). Null = inherit
   *  the region's flat fee. Beats the region flat fee, below all product/category overrides. */
  cashArrangementFeeStepAmount: string | null;
  cashArrangementFeeMarginPercent: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface ApiDeliveryZoneCreateInput {
  regionId: string;
  name: string;
  name_ar?: string | null;
  isActive?: boolean;
  sortOrder?: number;
  shippingFlatRate?: number | null;
  freeDeliveryThreshold?: number | null;
  sameDayEnabled?: boolean | null;
  sameDayCutoff?: string | null;
  standardLeadDays?: number | null;
  standardLeadDaysMax?: number | null;
  deliveryDays?: number[];
  codEnabled?: boolean | null;
  minOrderAmount?: number | null;
  maxOrderAmount?: number | null;
  cashArrangementQuickPickAmounts?: number[];
  cashArrangementDenominations?: number[];
  /** Zone-wide flat fee (both-or-neither). Send both null to clear (inherit region flat). */
  cashArrangementFeeStepAmount?: number | null;
  cashArrangementFeeMarginPercent?: number | null;
}

export type ApiDeliveryZoneUpdateInput = Partial<ApiDeliveryZoneCreateInput>;

/** Payload for `POST /delivery-zones/bulk` — several zones for ONE region at once. */
export interface ApiDeliveryZoneBulkInput {
  regionId: string;
  zones: { name: string; name_ar?: string | null; isActive?: boolean }[];
}

/** Result of a bulk create: the rows created + any names skipped as duplicates. */
export interface ApiDeliveryZoneBulkResult {
  created: ApiDeliveryZone[];
  skipped: string[];
  count: number;
}
