"use client";

import { TruckIcon } from "@/components/icons";
import { useT } from "@/i18n/useT";
import { formatDayCount } from "@/lib/format";
import { cn } from "@/lib/cn";
import { hasDeliveryLeadRange } from "@/features/delivery-config/deliveryLeadCopy";
import type { CartItem } from "@/store/slices/cart.slice";

/**
 * The whole order's delivery lead time = the LONGEST per-product lead time across the
 * cart (a 2-day item makes the whole order 2 days, even alongside 1-day items). Returns
 * null when no item carries a lead time (legacy carts) so callers can hide the badge.
 */
export function maxCartLeadDays(items: Pick<CartItem, "deliveryLeadDays">[]): number | null {
  const known = items
    .map((i) => i.deliveryLeadDays)
    .filter((d): d is number => typeof d === "number");
  if (known.length === 0) return null;
  return Math.max(...known);
}

/**
 * Order-level "your order will be delivered within N day(s)" badge — shown once per cart
 * (drawer, full cart, checkout review) instead of a note under every line item. The
 * per-PRODUCT note still appears on the product detail page (see ShippingLeadNote).
 * Pass `daysMax` from the resolved delivery config to show a range when configured.
 */
export function OrderDeliveryNote({
  days,
  daysMax,
  className,
}: {
  days: number;
  daysMax?: number | null;
  className?: string;
}) {
  const { t, locale } = useT();
  const showRange = hasDeliveryLeadRange(days, daysMax);
  return (
    <div
      className={cn(
        "flex items-center gap-2.5 rounded-2xl bg-ink-900 px-4 py-3 text-sm font-medium text-white",
        className
      )}
    >
      <TruckIcon size={18} className="shrink-0 text-white" />
      <span>
        {days === 0
          ? t("cart.orderDeliveryZero")
          : showRange
            ? t("cart.orderDeliveryRange", {
                minDays: formatDayCount(days, locale),
                maxDays: formatDayCount(daysMax, locale),
              })
            : t("cart.orderDelivery", { days: formatDayCount(days, locale) })}
      </span>
    </div>
  );
}
