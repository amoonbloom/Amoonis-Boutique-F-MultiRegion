/**
 * Resolved delivery configuration returned by `GET /delivery-config` — matches the
 * object built by resolveDeliveryConfig() in
 * Amoonis-Boutique-B/src/services/deliveryConfig.service.js. Every value here already has
 * the zone→region→default inheritance applied server-side, so the storefront consumes it
 * directly (no client-side resolution).
 */
export interface ResolvedDeliveryConfig {
  timezone: string;
  currency: string | null;
  /** Resolved flat delivery fee (number, 0 when none). */
  deliveryFee: number;
  /** Free-delivery threshold (net), or null. */
  freeDeliveryThreshold: number | null;
  /** Fee actually charged for the queried subtotal (0 when free-delivery applies). */
  effectiveFee: number;
  /** True when the subtotal met the free-delivery threshold. */
  freeDeliveryApplied: boolean;
  /** Allowed delivery weekdays (0=Sun..6=Sat). Empty = all days. */
  deliveryDays: number[];
  sameDayEnabled: boolean;
  sameDayCutoff: string | null;
  /** Resolved standard courier lead days — lower bound (zone override or region). */
  standardLeadDays: number | null;
  /** Optional upper bound for the ETA range. Null = single-number "within N days" copy. */
  standardLeadDaysMax: number | null;
  codEnabled: boolean;
  minOrderAmount: number | null;
  maxOrderAmount: number | null;
  /** Blackout dates as "YYYY-MM-DD" keys. */
  blackoutDates: string[];
  /** Today's date key in the region timezone. */
  todayKey: string;
  /** Whether same-day delivery is available right now (enabled, allowed day, before cutoff). */
  sameDayAvailableNow: boolean;
  /** Earliest schedulable date key (today when same-day, else the lead day), or null. */
  earliestDeliveryKey: string | null;
}
