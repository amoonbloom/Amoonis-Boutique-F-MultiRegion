/**
 * Whether to show a delivery ETA as a range ("around X to Y days") vs a single
 * number ("within X days"). Max must be set and strictly greater than min so
 * "3 to 3" never becomes a fake range.
 */
export function hasDeliveryLeadRange(
  days: number | null | undefined,
  daysMax: number | null | undefined
): daysMax is number {
  return (
    days != null &&
    daysMax != null &&
    Number.isFinite(days) &&
    Number.isFinite(daysMax) &&
    daysMax > days
  );
}
