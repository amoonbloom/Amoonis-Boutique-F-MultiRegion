import { TruckIcon } from "@/components/icons";
import { useT } from "@/i18n/useT";
import { formatDayCount, formatCutoffTime } from "@/lib/format";
import { cn } from "@/lib/cn";
import { hasDeliveryLeadRange } from "@/features/delivery-config/deliveryLeadCopy";

/**
 * Delivery note on the product detail page (AddToCartPanel).
 *
 * - `days` is the resolved standard prep/booking lead time (product → category →
 *   zone/region standard → site default; see ApiProduct.resolvedDeliveryLeadDays).
 * - `daysMax` is the optional upper bound from the resolved region/zone delivery
 *   config. When set and greater than `days`, the note shows a range
 *   ("around X to Y days") instead of "within X days".
 * - `sameDayCutoff` ("HH:mm") is set only when same-day delivery is enabled for the
 *   current region/zone. When present, the note leads with the same-day offer and
 *   keeps the standard lead as secondary context. Gated on the feature being enabled
 *   (not the live before-cutoff flag), so it stays accurate under caching; the
 *   checkout date picker enforces the actual cutoff.
 */
export function ShippingLeadNote({
  days,
  daysMax,
  sameDayCutoff,
  className,
}: {
  days: number;
  daysMax?: number | null;
  sameDayCutoff?: string | null;
  className?: string;
}) {
  const { t, locale } = useT();
  const showRange = hasDeliveryLeadRange(days, daysMax);

  const standardLine =
    days === 0
      ? t("product.shippingNoteZero")
      : showRange
        ? t("product.shippingNoteRange", {
            minDays: formatDayCount(days, locale),
            maxDays: formatDayCount(daysMax, locale),
          })
        : t("product.shippingNote", { days: formatDayCount(days, locale) });

  return (
    <div
      className={cn(
        "flex items-start gap-2.5 rounded-2xl bg-ink-900 px-4 py-3 text-sm font-medium text-white",
        className
      )}
    >
      <TruckIcon size={18} className="mt-0.5 shrink-0 text-white" />
      {sameDayCutoff ? (
        <span className="flex flex-col gap-0.5">
          <span>
            {t("product.sameDayNote", {
              cutoff: formatCutoffTime(sameDayCutoff, locale),
            })}
          </span>
          {days > 0 && (
            <span className="text-xs font-normal text-white/70">
              {showRange
                ? t("product.sameDayOtherwiseRange", {
                    minDays: formatDayCount(days, locale),
                    maxDays: formatDayCount(daysMax, locale),
                  })
                : t("product.sameDayOtherwise", { days: formatDayCount(days, locale) })}
            </span>
          )}
        </span>
      ) : (
        <span>{standardLine}</span>
      )}
    </div>
  );
}
