import type { OrderStatus, PaymentStatus, PaymentMethod } from "./types";
import type { MessageKey } from "@/i18n";

type StatusTone =
  | "neutral"
  | "bloom"
  | "blush"
  | "gold"
  | "success"
  | "warning"
  | "danger"
  | "ink";

/**
 * A single, sales-friendly "payment context" tag combining the payment METHOD
 * (COD vs online card) with its STATUS — so staff can tell, at a glance in the
 * orders list, a normal COD order ("COD") from an online payment that FAILED
 * ("Payment failed"). Both otherwise sit under the same PENDING_PAYMENT status.
 */
export function orderPaymentContext(
  paymentMethod: PaymentMethod | undefined,
  paymentStatus: PaymentStatus | undefined
): { labelKey: MessageKey; tone: StatusTone } {
  // Only online payments can fail — surface it prominently for follow-up.
  if (paymentStatus === "FAILED") {
    return { labelKey: "admin.ordersPage.payFailed", tone: "danger" };
  }
  if (paymentMethod === "COD") {
    return {
      labelKey: "admin.ordersPage.payCod",
      tone: paymentStatus === "PAID" ? "success" : "neutral",
    };
  }
  // Online (card / Apple Pay).
  if (paymentStatus === "PAID") {
    return { labelKey: "admin.ordersPage.payPaidOnline", tone: "success" };
  }
  return { labelKey: "admin.ordersPage.payAwaiting", tone: "warning" };
}

/**
 * Order-status constants shared by the admin panel and the storefront (account
 * pages + public order-status lookup). Kept in the orders feature — not under
 * components/admin — so customer-facing pages don't import from the admin tree.
 */

export const ORDER_STATUSES: OrderStatus[] = [
  "PENDING_PAYMENT",
  "PROCESSING",
  "ON_HOLD",
  "COMPLETED",
  "CANCELLED",
  "REFUNDED",
  "FAILED",
  "DRAFT",
];

export const ORDER_STATUS_TONE: Record<
  OrderStatus,
  "neutral" | "bloom" | "blush" | "gold" | "success" | "warning" | "danger" | "ink"
> = {
  PENDING_PAYMENT: "warning",
  PROCESSING: "gold",
  ON_HOLD: "neutral",
  COMPLETED: "success",
  CANCELLED: "danger",
  REFUNDED: "blush",
  FAILED: "ink",
  DRAFT: "bloom",
};

export const ORDER_STATUS_LABEL: Record<OrderStatus, string> = {
  PENDING_PAYMENT: "Pending payment",
  PROCESSING: "Processing",
  ON_HOLD: "On hold",
  COMPLETED: "Completed",
  CANCELLED: "Cancelled",
  REFUNDED: "Refunded",
  FAILED: "Failed",
  DRAFT: "Draft",
};

/**
 * i18n key per status for the storefront (account + order-status pages). Admin
 * keeps the plain-English `ORDER_STATUS_LABEL` above; storefront resolves these
 * through `t()` so statuses render in Arabic.
 */
export const ORDER_STATUS_LABEL_KEY: Record<OrderStatus, MessageKey> = {
  PENDING_PAYMENT: "orderStatus.PENDING_PAYMENT",
  PROCESSING: "orderStatus.PROCESSING",
  ON_HOLD: "orderStatus.ON_HOLD",
  COMPLETED: "orderStatus.COMPLETED",
  CANCELLED: "orderStatus.CANCELLED",
  REFUNDED: "orderStatus.REFUNDED",
  FAILED: "orderStatus.FAILED",
  DRAFT: "orderStatus.DRAFT",
};

/**
 * Payment status — the money side, distinct from the fulfilment `status` above. Shown as a
 * small badge alongside the order status so staff can see at a glance whether payment was
 * actually collected (Paid), is still due (Unpaid — COD, or an online order not yet paid),
 * or a charge attempt failed.
 */
export const PAYMENT_STATUS_TONE: Record<PaymentStatus, "neutral" | "success" | "danger"> = {
  PAID: "success",
  UNPAID: "neutral",
  FAILED: "danger",
};

export const PAYMENT_STATUS_LABEL_KEY: Record<PaymentStatus, MessageKey> = {
  PAID: "paymentStatus.PAID",
  UNPAID: "paymentStatus.UNPAID",
  FAILED: "paymentStatus.FAILED",
};

/**
 * Statuses that end the normal flow — no further progress is expected once an
 * order reaches one of these (mirrors the backend's `isTerminal` in
 * getOrderStatusOnly). Used to decide whether to render a progress stepper at
 * all vs. a plain "this order was cancelled/refunded/failed" note.
 */
export const TERMINAL_ORDER_STATUSES: OrderStatus[] = ["CANCELLED", "REFUNDED", "FAILED"];

export function isTerminalOrderStatus(status: OrderStatus): boolean {
  return TERMINAL_ORDER_STATUSES.includes(status);
}

/**
 * The typical fulfilment sequence shown in progress steppers (account order
 * detail, public order-status page, checkout receipt). Single source of truth —
 * previously three separate files each hardcoded their own copy of this array.
 */
export const ORDER_PROGRESS_STEPS: { key: OrderStatus; labelKey: MessageKey }[] = [
  { key: "PENDING_PAYMENT", labelKey: "order.stepPlaced" },
  { key: "PROCESSING", labelKey: "order.stepPreparing" },
  { key: "COMPLETED", labelKey: "order.stepCompleted" },
];

/** Explanatory note shown in place of the progress stepper for a terminal order. */
export const ORDER_TERMINAL_NOTE_KEY: Partial<Record<OrderStatus, MessageKey>> = {
  CANCELLED: "order.cancelledNote",
  REFUNDED: "order.refundedNote",
  FAILED: "order.failedNote",
};

/**
 * ON_HOLD and DRAFT are neither terminal nor part of ORDER_PROGRESS_STEPS — without this,
 * a consumer that only branches on isTerminalOrderStatus() would try to render the 3-step
 * stepper for them, resolve stepIndex to -1 (not found), and render a stepper with every
 * step unlit (or, if also gated on stepIndex >= 0, render nothing at all). This is the
 * neutral (non-error) counterpart to ORDER_TERMINAL_NOTE_KEY for exactly that gap — always
 * check `stepIndex === -1` (i.e. "not in ORDER_PROGRESS_STEPS"), not isTerminalOrderStatus(),
 * to decide whether to show a note instead of the stepper.
 */
export const ORDER_PAUSED_NOTE_KEY: Partial<Record<OrderStatus, MessageKey>> = {
  ON_HOLD: "order.onHoldNote",
  DRAFT: "order.draftNote",
};
