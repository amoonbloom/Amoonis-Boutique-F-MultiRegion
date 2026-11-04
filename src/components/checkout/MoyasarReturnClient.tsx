"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { Container } from "@/components/ui";
import { ROUTES } from "@/constants/routes";
import { STORAGE_KEYS } from "@/constants/storage-keys";
import { ordersApi } from "@/features/orders/api/orders.api";
import { useLocalizedHref } from "@/features/location/useLocalizedHref";
import { useT } from "@/i18n/useT";
import { useCart } from "@/features/cart/hooks/useCart";
import { clearPendingOnlineOrder } from "@/lib/pendingOnlineOrder";

/**
 * Moyasar Form callback_url lands here (still on our domain).
 * Query: id (payment id), status, message, oid (order id), guest=1.
 * Always re-confirms via API — never trusts status=paid from the query string.
 */
export function MoyasarReturnClient() {
  const { t } = useT();
  const router = useRouter();
  const localize = useLocalizedHref();
  const search = useSearchParams();
  const cart = useCart();
  const ran = useRef(false);
  const [message, setMessage] = useState(t("checkout.moyasarConfirming"));

  useEffect(() => {
    if (ran.current) return;
    ran.current = true;

    const paymentId = search.get("id") || search.get("payment_id") || "";
    const orderId = search.get("oid") || search.get("orderId") || "";
    const isGuest = search.get("guest") === "1";
    const qsStatus = (search.get("status") || "").toLowerCase();

    (async () => {
      try {
        if (!paymentId && !orderId) {
          setMessage(t("checkout.moyasarMissingOrder"));
          router.replace(localize(ROUTES.orderError));
          return;
        }

        const result = await ordersApi.confirmMoyasarPayment({
          paymentId: paymentId || undefined,
          orderId: orderId || undefined,
        });

        if (result.isPaid) {
          const oid = result.orderId || orderId;
          try {
            clearPendingOnlineOrder();
            cart.clear();
          } catch {
            /* ignore */
          }
          // Guests keep sessionStorage order stash from checkout for the receipt page.
          if (!isGuest && oid) {
            try {
              sessionStorage.removeItem(STORAGE_KEYS.guestOrder);
            } catch {
              /* ignore */
            }
          }
          const successQs = new URLSearchParams();
          if (oid) successQs.set("id", oid);
          if (isGuest) successQs.set("guest", "1");
          router.replace(
            localize(`${ROUTES.orderSuccess}?${successQs.toString()}`)
          );
          return;
        }

        // Failed / unpaid — send to error with a readable hint.
        const errQs = new URLSearchParams();
        if (orderId) errQs.set("id", orderId);
        const hint =
          qsStatus === "failed" || qsStatus === "canceled" || qsStatus === "expired"
            ? t("checkout.moyasarPayFailed")
            : t("checkout.moyasarPayNotCompleted");
        errQs.set("message", hint);
        setMessage(hint);
        router.replace(localize(`${ROUTES.orderError}?${errQs.toString()}`));
      } catch (e) {
        const hint =
          e instanceof Error ? e.message : t("checkout.moyasarPayFailed");
        setMessage(hint);
        const errQs = new URLSearchParams();
        if (orderId) errQs.set("id", orderId);
        errQs.set("message", hint);
        router.replace(localize(`${ROUTES.orderError}?${errQs.toString()}`));
      }
    })();
    // Run once on mount for this return URL.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <Container className="flex min-h-[50vh] flex-col items-center justify-center py-24 text-center">
      <p className="text-sm text-ink-600">{message}</p>
    </Container>
  );
}
