"use client";

import { useEffect, useMemo, useRef } from "react";
import { useQuery } from "@tanstack/react-query";
import { LocalizedLink } from "@/components/ui/LocalizedLink";
import { Container, Button } from "@/components/ui";
import { useIsHydrated } from "@/hooks/useIsHydrated";
import { CheckIcon, ArrowRight, SparkleIcon } from "@/components/icons";
import { ROUTES } from "@/constants/routes";
import { STORAGE_KEYS } from "@/constants/storage-keys";
import { useT } from "@/i18n/useT";
import { trackPurchase } from "@/lib/gtm";
import { trackPixelPurchase } from "@/lib/metaPixel";
import { ordersApi } from "@/features/orders/api/orders.api";
import { queryKeys } from "@/services/queryKeys";
import type { MessageKey } from "@/i18n";
import type { ApiOrder } from "@/features/orders/types";
import { ReceiptStage, ConfirmationHero, ReceiptCard, ReceiptActions } from "./receiptParts";

const BENEFITS: MessageKey[] = [
  "order.benefitTrack",
  "order.benefitHistory",
  "order.benefitAddresses",
  "order.benefitUpdates",
  "order.benefitFaster",
];

/**
 * Post-purchase experience for a GUEST order. Renders the boutique receipt from
 * the order stashed in sessionStorage at checkout (guests can't refetch
 * GET /orders/:id), then a create-account nudge — Shopify-style. Degrades to a
 * plain confirmation if the stash is missing (e.g. a refresh).
 *
 * The stash is captured at checkout, BEFORE payment — so its paymentStatus is
 * "UNPAID" and status "PENDING_PAYMENT". For an online-paid guest order we must
 * NOT show that stale snapshot (the "receipt still says Unpaid after paying" bug):
 * we reconcile the live paymentStatus/status/currency from the PUBLIC status
 * endpoint (no auth needed) using the order id the backend appended to the return
 * URL, and merge it over the stash (which still supplies the item + totals detail
 * the lite status endpoint doesn't carry).
 */
export function GuestOrderSuccess({ orderId }: { orderId?: string }) {
  const { t } = useT();
  const hydrated = useIsHydrated();

  const stashed = useMemo<ApiOrder | null>(() => {
    if (!hydrated) return null;
    try {
      const raw = sessionStorage.getItem(STORAGE_KEYS.guestOrder);
      return raw ? (JSON.parse(raw) as ApiOrder) : null;
    } catch {
      return null;
    }
  }, [hydrated]);

  const statusQuery = useQuery({
    queryKey: queryKeys.orders.status(orderId ?? "none"),
    queryFn: () => ordersApi.getStatus(orderId as string),
    enabled: hydrated && Boolean(orderId),
    // The browser callback confirms the payment synchronously before this page
    // loads, so the first fetch is normally already PAID. Poll briefly to cover
    // the rare still-in-flight confirm (e.g. reconcile/webhook path), then stop
    // once the payment settles so we never poll a genuinely-unpaid order forever.
    refetchInterval: (query) => {
      const s = query.state.data;
      if (!s) return 2500;
      const settled =
        s.paymentStatus === "PAID" ||
        s.paymentStatus === "FAILED" ||
        s.status !== "PENDING_PAYMENT";
      return settled ? false : 2500;
    },
  });

  // Merge the authoritative live status over the (pre-payment) stash.
  const order = useMemo<ApiOrder | null>(() => {
    if (!stashed) return null;
    const live = statusQuery.data;
    if (!live) return stashed;
    return {
      ...stashed,
      status: live.status,
      paymentStatus: live.paymentStatus ?? stashed.paymentStatus,
      currency: live.currency ?? stashed.currency,
    };
  }, [stashed, statusQuery.data]);

  // Fire the purchase analytics event exactly once, even though `order` updates
  // again when the live status merges in.
  const tracked = useRef(false);
  useEffect(() => {
    if (order && !tracked.current) {
      tracked.current = true;
      trackPurchase(order);
      trackPixelPurchase(order);
    }
  }, [order]);

  return (
    <ReceiptStage>
      <Container className="relative max-w-2xl py-14 sm:py-20">
        <ConfirmationHero
          eyebrow={t("order.confirmed")}
          title={t("order.placedTitle")}
          body={t("order.guestThankYouBody")}
        />

        {order ? (
          <>
            <ReceiptCard order={order} />
            <ReceiptActions order={order} />
          </>
        ) : null}

        {/* Create-account nudge — the heart of the guest post-purchase flow. */}
        <div className="no-print mt-6 overflow-hidden rounded-3xl border border-bloom-200 bg-linear-to-br from-bloom-50 to-blush-50 p-6 shadow-(--shadow-lift) sm:p-8">
          <h2 className="flex items-center gap-2 font-display text-xl font-medium text-ink-900 sm:text-2xl">
            <SparkleIcon size={18} className="text-gold-500" />
            {t("order.createAccountTitle")}
          </h2>
          <ul className="mt-5 grid gap-2.5 sm:grid-cols-2">
            {BENEFITS.map((key) => (
              <li key={key} className="flex items-center gap-3 text-sm text-ink-700">
                <span className="inline-flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-bloom-600 text-white">
                  <CheckIcon size={12} />
                </span>
                {t(key)}
              </li>
            ))}
          </ul>
          <p className="mt-5 text-xs text-ink-500">{t("order.guestLinkHint")}</p>

          <div className="mt-6 flex flex-col gap-3 sm:flex-row">
            <LocalizedLink href={ROUTES.register} className="contents">
              <Button
                size="lg"
                fullWidth
                className="sm:w-auto"
                trailingIcon={<ArrowRight size={16} className="rtl:-scale-x-100" />}
              >
                {t("order.createAccountCta")}
              </Button>
            </LocalizedLink>
            <LocalizedLink href={ROUTES.login} className="contents">
              <Button size="lg" variant="outline" fullWidth className="sm:w-auto">
                {t("order.loginCta")}
              </Button>
            </LocalizedLink>
          </div>
        </div>

        <div className="no-print mt-6 flex justify-center">
          <LocalizedLink href={ROUTES.shop} className="contents">
            <Button size="lg" variant="ghost">
              {t("common.continueShopping")}
            </Button>
          </LocalizedLink>
        </div>
      </Container>
    </ReceiptStage>
  );
}
