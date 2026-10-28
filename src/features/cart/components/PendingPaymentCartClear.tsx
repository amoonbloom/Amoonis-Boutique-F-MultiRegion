"use client";

import { useEffect, useRef } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useIsHydrated } from "@/hooks/useIsHydrated";
import { useCart } from "@/features/cart/hooks/useCart";
import { ordersApi } from "@/features/orders/api/orders.api";
import { queryKeys } from "@/services/queryKeys";
import {
  clearPendingOnlineOrder,
  readPendingOnlineOrder,
} from "@/lib/pendingOnlineOrder";

/**
 * Tabby corner case: guest pays on the hosted page then closes the tab without
 * returning to our success URL. The webhook marks the order PAID, but the guest
 * cart lives in localStorage — only the browser can clear it. We stash the order
 * id before redirect and, on any later visit, poll the public status endpoint;
 * once PAID we empty the cart (same outcome as landing on the success page).
 */
export function PendingPaymentCartClear() {
  const hydrated = useIsHydrated();
  const cart = useCart();
  const queryClient = useQueryClient();
  const clearedRef = useRef(false);
  const pending = hydrated ? readPendingOnlineOrder() : null;
  const orderId = pending?.orderId ?? null;

  const statusQuery = useQuery({
    queryKey: queryKeys.orders.status(orderId ?? "none"),
    queryFn: () => ordersApi.getStatus(orderId as string),
    enabled: Boolean(orderId),
    refetchInterval: (query) => {
      const s = query.state.data;
      if (!s) return 3000;
      const settled =
        s.paymentStatus === "PAID" ||
        s.paymentStatus === "FAILED" ||
        s.status !== "PENDING_PAYMENT";
      return settled ? false : 3000;
    },
    retry: 1,
  });

  useEffect(() => {
    if (!orderId || clearedRef.current) return;
    const s = statusQuery.data;
    if (!s) return;

    if (s.paymentStatus === "PAID") {
      clearedRef.current = true;
      cart.clear();
      queryClient.invalidateQueries({ queryKey: queryKeys.cart.all });
      clearPendingOnlineOrder();
      return;
    }

    // Failed / cancelled / no longer awaiting payment — drop the marker so we
    // don't keep polling; leave the cart alone so they can try again.
    if (s.paymentStatus === "FAILED" || s.status !== "PENDING_PAYMENT") {
      clearPendingOnlineOrder();
    }
  }, [orderId, statusQuery.data, cart, queryClient]);

  return null;
}
