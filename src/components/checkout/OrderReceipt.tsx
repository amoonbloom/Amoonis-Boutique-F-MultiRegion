"use client";

import { LocalizedLink } from "@/components/ui/LocalizedLink";
import { useEffect } from "react";
import { useQuery } from "@tanstack/react-query";
import { Container, Button } from "@/components/ui";
import { Skeleton } from "@/components/ui/Loader";
import { ArrowRight } from "@/components/icons";
import { ordersApi } from "@/features/orders/api/orders.api";
import { queryKeys } from "@/services/queryKeys";
import { ROUTES } from "@/constants/routes";
import { useT } from "@/i18n/useT";
import { trackPurchase } from "@/lib/gtm";
import { trackPixelPurchase } from "@/lib/metaPixel";
import type { MessageKey } from "@/i18n";
import { ReceiptStage, ConfirmationHero, ReceiptCard, ReceiptActions } from "./receiptParts";

/**
 * Post-order confirmation + receipt for an authenticated customer. A boutique
 * receipt card on a warm cream stage; the card's footer carries the
 * Track / Continue actions.
 */
export function OrderReceipt({ orderId }: { orderId?: string }) {
  const { t } = useT();

  const query = useQuery({
    queryKey: queryKeys.orders.detail(orderId ?? "none"),
    queryFn: () => ordersApi.getById(orderId as string),
    enabled: Boolean(orderId),
    staleTime: 60_000,
    // The backend confirms an online payment before it redirects here, so the
    // first fetch is normally already PAID/PROCESSING. Poll briefly to cover the
    // rare still-in-flight confirm, then stop once the payment settles — so the
    // receipt never sticks on a stale "Unpaid / Pending payment".
    refetchInterval: (q) => {
      const o = q.state.data;
      if (!o) return 2500;
      const settled =
        o.paymentStatus === "PAID" ||
        o.paymentStatus === "FAILED" ||
        o.status !== "PENDING_PAYMENT";
      return settled ? false : 2500;
    },
  });

  useEffect(() => {
    if (!query.data) return;
    trackPurchase(query.data);
    trackPixelPurchase(query.data);
  }, [query.data]);

  return (
    <ReceiptStage>
      <Container className="relative max-w-2xl py-14 sm:py-20">
        <ConfirmationHero
          eyebrow={t("order.confirmed")}
          title={t("order.thankYou")}
          body={t("order.thankYouBody")}
        />

        {query.isPending && orderId ? (
          <ReceiptSkeleton />
        ) : query.isError || !query.data ? (
          <FallbackCard orderId={orderId} t={t} />
        ) : (
          <>
            <ReceiptCard order={query.data} />
            <ReceiptActions order={query.data}>
              <LocalizedLink href={ROUTES.shop} className="contents">
                <Button size="lg" variant="outline" fullWidth className="sm:w-auto">
                  {t("common.continueShopping")}
                </Button>
              </LocalizedLink>
              <LocalizedLink href={`/account/orders/${query.data.id}`} className="contents">
                <Button
                  size="lg"
                  variant="subtle"
                  fullWidth
                  className="sm:w-auto"
                  trailingIcon={<ArrowRight size={16} className="rtl:-scale-x-100" />}
                >
                  {t("order.trackOrder")}
                </Button>
              </LocalizedLink>
            </ReceiptActions>
          </>
        )}
      </Container>
    </ReceiptStage>
  );
}

/** Order details couldn't be loaded — still a successful order, shown gracefully. */
function FallbackCard({
  orderId,
  t,
}: {
  orderId?: string;
  t: (k: MessageKey, v?: Record<string, string | number>) => string;
}) {
  return (
    <div className="mt-10 overflow-hidden rounded-3xl border border-ink-100 bg-cream-50 shadow-(--shadow-lift)">
      <div className="flex flex-col items-center gap-4 px-6 py-10 text-center sm:px-8">
        {orderId && (
          <div className="rounded-2xl bg-bloom-50 px-5 py-3">
            <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-bloom-700">
              {t("order.reference")}
            </p>
            <p className="mt-0.5 font-display text-xl font-medium text-ink-900">
              #{orderId.slice(0, 8)}
            </p>
          </div>
        )}
        <p className="max-w-sm text-sm text-ink-500">{t("order.thankYouBody")}</p>
        <div className="flex flex-col-reverse gap-3 sm:flex-row sm:justify-center">
          <LocalizedLink href={ROUTES.shop} className="contents">
            <Button size="lg" variant="outline" fullWidth className="sm:w-auto">
              {t("common.continueShopping")}
            </Button>
          </LocalizedLink>
          {orderId && (
            <LocalizedLink href={`/account/orders/${orderId}`} className="contents">
              <Button
                size="lg"
                fullWidth
                className="sm:w-auto"
                trailingIcon={<ArrowRight size={16} className="rtl:-scale-x-100" />}
              >
                {t("order.trackOrder")}
              </Button>
            </LocalizedLink>
          )}
        </div>
      </div>
    </div>
  );
}

function ReceiptSkeleton() {
  return (
    <div className="mt-10 overflow-hidden rounded-3xl border border-ink-100 bg-cream-50 shadow-(--shadow-lift)">
      <div className="bg-linear-to-br from-bloom-50 to-blush-50 px-6 py-5 sm:px-8">
        <Skeleton className="h-3 w-24" />
        <Skeleton className="mt-2 h-6 w-32" />
      </div>
      <div className="flex flex-col gap-5 px-6 py-6 sm:px-8">
        <Skeleton className="h-16 w-full rounded-2xl" />
        <Skeleton className="h-8 w-full rounded-xl" />
        <Skeleton className="h-40 w-full rounded-xl" />
      </div>
    </div>
  );
}
