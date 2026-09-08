import { STORAGE_KEYS } from "@/constants/storage-keys";
import type { ApiOrder } from "@/features/orders/types";

type Fbq = (...args: unknown[]) => void;

declare global {
  interface Window {
    fbq?: Fbq;
    _fbq?: Fbq;
  }
}

/**
 * Meta (Facebook) Pixel id supplied by the media team. Hardcoded as the default
 * so the pixel is live on every deploy without extra hosting config; set
 * NEXT_PUBLIC_META_PIXEL_ID to override it, or to an empty string to turn the
 * pixel off for an environment.
 */
const ENV_PIXEL_ID = process.env.NEXT_PUBLIC_META_PIXEL_ID;

export const META_PIXEL_ID =
  ENV_PIXEL_ID === undefined ? "895349112111811" : ENV_PIXEL_ID.trim();

/**
 * Path pattern for the order confirmation page, which reports Purchase only —
 * the media team doesn't want a PageView competing with it there. Kept as a
 * source string so the same rule can be inlined into the base snippet (which
 * checks `location.pathname` before its own PageView) and reused for
 * client-side navigations.
 */
export const PAGEVIEW_EXCLUDED_PATH_PATTERN = "\\/order\\/success\\/?$";

export function isPageViewSuppressed(pathname: string): boolean {
  return new RegExp(PAGEVIEW_EXCLUDED_PATH_PATTERN).test(pathname);
}

/**
 * The base snippet is injected by next/script after hydration, so an effect on
 * the confirmation page can run before `fbq` exists. Wait for it (rather than
 * dropping the event) up to this budget — a slow connection still gets the
 * Purchase through.
 */
const READY_TIMEOUT_MS = 20_000;
const POLL_INTERVAL_MS = 200;

function withFbq(run: (fbq: Fbq) => void): void {
  if (typeof window === "undefined" || !META_PIXEL_ID) return;

  if (window.fbq) {
    run(window.fbq);
    return;
  }

  const startedAt = Date.now();
  const timer = window.setInterval(() => {
    if (window.fbq) {
      window.clearInterval(timer);
      run(window.fbq);
      return;
    }
    if (Date.now() - startedAt > READY_TIMEOUT_MS) window.clearInterval(timer);
  }, POLL_INTERVAL_MS);
}

/** Standard "PageView" — used for client-side route changes, since the base
 *  snippet only covers the first document load. */
export function trackPixelPageView(): void {
  withFbq((fbq) => fbq("track", "PageView"));
}

/**
 * Standard "Purchase" event on the order confirmation page, carrying value,
 * currency, the per-line contents array and the order id, which is what Meta's
 * catalogue/ROAS reporting expects.
 *
 * Deduped per order id via sessionStorage: the confirmation page can be
 * refreshed or remounted (the guest flow re-renders once the live payment
 * status merges in), and without this guard that would double-count revenue.
 */
export function trackPixelPurchase(order: ApiOrder): void {
  if (typeof window === "undefined" || !META_PIXEL_ID) return;

  const dedupeKey = `${STORAGE_KEYS.metaPixelPurchaseTrackedPrefix}${order.id}`;
  try {
    if (sessionStorage.getItem(dedupeKey)) return;
    sessionStorage.setItem(dedupeKey, "1");
  } catch {
    // sessionStorage unavailable (private mode, etc.) — fire once anyway
    // rather than silently dropping the event.
  }

  const items = order.items ?? [];
  const contents = items.map((item) => ({
    id: item.productId ?? item.product?.id ?? "unknown",
    quantity: item.quantity,
    item_price: item.price,
  }));

  withFbq((fbq) =>
    fbq(
      "track",
      "Purchase",
      {
        value: order.totalAmount,
        currency: order.currency ?? "SAR",
        content_type: "product",
        content_ids: contents.map((c) => c.id),
        contents,
        num_items: items.reduce((sum, item) => sum + item.quantity, 0),
        order_id: String(order.orderNumber ?? order.id),
      },
      // Stable id so a future Conversions API send can be deduplicated against
      // this browser event.
      { eventID: `order-${order.id}` }
    )
  );
}
