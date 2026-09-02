"use client";

import Image from "next/image";
import { useState, type ReactNode } from "react";
import { m } from "motion/react";
import { Button, CurrencyAmount } from "@/components/ui";
import {
  CheckIcon,
  TruckIcon,
  SparkleIcon,
  PinIcon,
  PhoneIcon,
  MailIcon,
  DocumentIcon,
  DownloadIcon,
  ShareIcon,
} from "@/components/icons";
import { staggerContainer, staggerItem, EASE_OUT } from "@/lib/motion";
import { useQuery } from "@tanstack/react-query";
import { formatCurrency, formatDate, intlLocale } from "@/lib/format";
import { getOrderDeliveryView } from "@/features/orders/delivery";
import { useCurrency } from "@/features/location/hooks/useCurrency";
import { useT } from "@/i18n/useT";
import { localized } from "@/i18n";
import { siteConfig } from "@/config/site";
import { regionsApi } from "@/features/regions/api/regions.api";
import { queryKeys } from "@/services/queryKeys";
import { resolveRegionContact } from "@/features/location/regionContact";
import { SelectedOptions } from "@/features/products/components/SelectedOptions";
import { OrderItemExtras } from "@/features/orders/components/OrderItemExtras";
import { downloadReceiptPdf, generateReceiptPdfBlob } from "@/features/orders/receiptPdf";
import { useLocalizedHref } from "@/features/location/useLocalizedHref";
import { ROUTES } from "@/constants/routes";
import { useToast } from "@/hooks/useToast";
import type { MessageKey } from "@/i18n";
import type { ApiOrder, OrderStatus, PaymentStatus } from "@/features/orders/types";
import {
  ORDER_PROGRESS_STEPS,
  ORDER_STATUS_LABEL_KEY,
  ORDER_TERMINAL_NOTE_KEY,
  ORDER_PAUSED_NOTE_KEY,
  isTerminalOrderStatus,
} from "@/features/orders/constants";

/**
 * Shared post-order pieces. `ReceiptCard` renders a professional, print-ready
 * invoice/receipt (branded header, order/customer/payment meta, an aligned
 * items table, and an emphasised totals column) reused by both the
 * authenticated receipt (OrderReceipt) and the guest confirmation
 * (GuestOrderSuccess). `ConfirmationHero`/`ReceiptStage` frame it with the
 * on-screen success moment (excluded from print).
 */

// Shared column template so the items table header and every row stay aligned.
// Mobile collapses to "details | amount"; sm+ expands to the full four columns.
const ITEM_COLS =
  "grid grid-cols-[minmax(0,1fr)_auto] sm:grid-cols-[minmax(0,1fr)_3rem_6.5rem_7rem] items-start gap-x-4";

/**
 * Torn/perforated receipt edge — a single zigzag `clip-path` polygon applied
 * to both the top and bottom of the card, corners left flush so the paper
 * still reads as a rectangle at a glance. X uses percentages (teeth stay
 * proportional across the card's bounded max-w-2xl width); Y uses a fixed px
 * depth so the notches themselves stay a consistent size. Built once at
 * module scope — it's a static shape, not something to recompute per render.
 */
function buildTornEdgeClipPath(teeth: number, depth: number): string {
  const step = 100 / teeth;
  const top: string[] = [];
  const bottom: string[] = [];
  for (let i = 0; i <= teeth; i++) {
    const x = `${(i * step).toFixed(3)}%`;
    const notch = i % 2 === 1;
    top.push(`${x} ${notch ? `${depth}px` : "0px"}`);
  }
  for (let i = teeth; i >= 0; i--) {
    const x = `${(i * step).toFixed(3)}%`;
    const notch = i % 2 === 1;
    bottom.push(`${x} ${notch ? `calc(100% - ${depth}px)` : "100%"}`);
  }
  return `polygon(${[...top, ...bottom].join(", ")})`;
}

const TORN_EDGE_CLIP_PATH = buildTornEdgeClipPath(22, 7);

/** Confetti burst — eight small on-brand dots springing out from the success
 * seal. Fixed (not random) offsets: deterministic across server/client
 * render, and a tidy circular burst reads more "premium" than a scatter. */
const CONFETTI_BURST = [
  { dx: 0, dy: -46, size: 5, color: "var(--color-bloom-500)", delay: 0.0 },
  { dx: 33, dy: -33, size: 4, color: "var(--color-gold-500)", delay: 0.02 },
  { dx: 46, dy: 0, size: 6, color: "var(--color-blush-400)", delay: 0.04 },
  { dx: 33, dy: 33, size: 4, color: "var(--color-bloom-400)", delay: 0.06 },
  { dx: 0, dy: 46, size: 5, color: "var(--color-gold-400)", delay: 0.03 },
  { dx: -33, dy: 33, size: 4, color: "var(--color-blush-300)", delay: 0.05 },
  { dx: -46, dy: 0, size: 5, color: "var(--color-bloom-500)", delay: 0.01 },
  { dx: -33, dy: -33, size: 4, color: "var(--color-gold-500)", delay: 0.07 },
] as const;

/** Warm-white stage, one shade off the paper itself so the torn edge and drop
 * shadow have something to read against (a pure white-on-white card would
 * hide the perforation entirely). */
export function ReceiptStage({ children }: { children: ReactNode }) {
  return (
    <section className="receipt-stage relative overflow-hidden bg-cream-100">
      <div
        aria-hidden
        className="no-print pointer-events-none absolute inset-x-0 top-0 h-56 bg-[radial-gradient(55%_100%_at_50%_0,var(--color-bloom-50)_0%,transparent_72%)]"
      />
      {children}
    </section>
  );
}

/** Animated success seal + gold-flanked eyebrow + title + body. Screen-only. */
export function ConfirmationHero({
  eyebrow,
  title,
  body,
}: {
  eyebrow: string;
  title: string;
  body: string;
}) {
  return (
    <m.div
      className="no-print flex flex-col items-center text-center"
      variants={staggerContainer(0.1, 0.05)}
      initial="hidden"
      animate="show"
    >
      <m.span
        variants={{
          hidden: { scale: 0, opacity: 0 },
          show: {
            scale: 1,
            opacity: 1,
            transition: { type: "spring", stiffness: 240, damping: 16 },
          },
        }}
        className="relative inline-flex h-20 w-20 items-center justify-center rounded-full bg-cream-50 shadow-(--shadow-bloom) ring-1 ring-bloom-100"
      >
        <span className="inline-flex h-14 w-14 items-center justify-center rounded-full bg-linear-to-br from-bloom-500 to-bloom-700 text-white">
          <CheckIcon size={26} />
        </span>
        <SparkleIcon size={16} className="absolute -right-1 -top-1 text-gold-500" />
        {CONFETTI_BURST.map((p, i) => (
          <m.span
            key={i}
            aria-hidden
            className="pointer-events-none absolute rounded-full"
            style={{
              left: "50%",
              top: "50%",
              width: p.size,
              height: p.size,
              marginLeft: -p.size / 2,
              marginTop: -p.size / 2,
              backgroundColor: p.color,
            }}
            initial={{ x: 0, y: 0, opacity: 0, scale: 0 }}
            animate={{
              x: p.dx,
              y: [0, p.dy * 0.6, p.dy],
              opacity: [0, 1, 1, 0],
              scale: [0, 1, 1, 0.6],
            }}
            transition={{
              duration: 0.7,
              delay: 0.1 + p.delay,
              ease: EASE_OUT,
              times: [0, 0.3, 0.7, 1],
            }}
          />
        ))}
      </m.span>

      <m.div variants={staggerItem} className="mt-6 flex items-center gap-3 text-bloom-700">
        <span className="h-px w-8 bg-gold-400/70" />
        <span className="text-xs font-semibold uppercase tracking-[0.22em]">{eyebrow}</span>
        <span className="h-px w-8 bg-gold-400/70" />
      </m.div>

      <m.h1
        variants={staggerItem}
        className="mt-3 font-display text-4xl font-medium leading-tight text-ink-900 sm:text-5xl"
      >
        {title}
      </m.h1>
      <m.p variants={staggerItem} className="mt-3 max-w-md text-sm text-ink-500 sm:text-base">
        {body}
      </m.p>
    </m.div>
  );
}

/**
 * The professional receipt/invoice — branded header, order/customer/payment
 * meta, an aligned items table, and an emphasised totals column. Shared by the
 * authed receipt and the guest confirmation; screen actions live alongside it
 * in `ReceiptActions`.
 */
export function ReceiptCard({ order }: { order: ApiOrder }) {
  const { t, locale } = useT();
  const { currency: browsingCurrency } = useCurrency();
  // Currency is the order's OWN stamped currency (order.currency, set once at
  // checkout from the order's region) — NEVER the viewer's live browsing region.
  // A receipt is an immutable record: a Saudi (SAR) order must always render in
  // SAR, even when the page is (re)loaded in a browsing context that resolves to
  // the default UAE/AED region — which is exactly what happens on the post-payment
  // return, producing the "paid in SAR but receipt shows AED" bug. Fall back to the
  // browsing currency only for legacy orders placed before order.currency existed.
  const currency = order.currency ?? browsingCurrency;
  // The receipt reflects the order's OWN region (not the viewer's current
  // browsing region) — a Saudi order should always show Saudi contact info,
  // even if whoever's looking at it later has since switched to UAE. Reuses
  // the same cache-shared regions list every other region-aware hook queries.
  const regionsQuery = useQuery({
    queryKey: queryKeys.regions.list(),
    queryFn: () => regionsApi.list(),
    staleTime: 5 * 60_000,
  });
  const orderRegion = regionsQuery.data?.find((r) => r.id === order.regionId);
  const contact = resolveRegionContact(orderRegion, locale);

  const subtotal =
    order.subtotalAmount ?? order.items.reduce((s, i) => s + i.price * i.quantity, 0);
  const discount = order.discountAmount ?? 0;
  const vatAmount = order.vatAmount ?? order.taxAmount ?? 0;
  const showVat = order.vatRatePercent != null && vatAmount > 0;
  const shipping = order.shippingAmount ?? 0;
  const stepIndex = ORDER_PROGRESS_STEPS.findIndex((s) => s.key === order.status);
  const inFlow = stepIndex >= 0;
  // True terminal outcomes only (CANCELLED/REFUNDED/FAILED) — gates the COD cash-ready
  // reminder below. ON_HOLD/DRAFT are not terminal: the order may still resume and the
  // COD reminder still applies, unlike inFlow which is purely "has a stepper position."
  const terminal = isTerminalOrderStatus(order.status);
  const offFlowNoteKey = ORDER_TERMINAL_NOTE_KEY[order.status] ?? ORDER_PAUSED_NOTE_KEY[order.status];
  const orderRef = order.orderNumber ? `#${order.orderNumber}` : `#${order.id.slice(0, 8)}`;
  const dateStr = new Date(order.createdAt).toLocaleDateString(intlLocale(locale), {
    day: "numeric",
    month: "long",
    year: "numeric",
  });

  const delivery = getOrderDeliveryView(order);
  const il = intlLocale(locale);

  const price = (n: number) => (
    <CurrencyAmount amount={n} currency={currency} locale={locale} />
  );

  const email = order.guestEmail ?? null;
  const addr = order.shippingAddress;
  const addressLine = addr
    ? [
        // Area/zone is the current checkout's primary location field; fall back
        // to legacy street/city/country for orders placed before it existed.
        addr.area,
        addr.deliveryZoneName,
        addr.apartment,
        addr.streetAddress,
        addr.city,
        addr.country,
      ]
        .filter(Boolean)
        .join(", ")
    : "";

  return (
    // Entrance ("printing/sliding into view"): scale + rise from the top edge,
    // as if the paper is being fed out — transform/opacity only (compositor-
    // friendly), matching this codebase's motion conventions. The torn-edge
    // shape below is static, so it never has to animate the clip-path itself.
    <m.div
      initial={{ opacity: 0, y: -14, scaleY: 0.92 }}
      animate={{ opacity: 1, y: 0, scaleY: 1 }}
      transition={{ delay: 0.2, duration: 0.45, ease: EASE_OUT }}
      style={{ transformOrigin: "top center" }}
      className="mt-10"
    >
      <div
        className="receipt-print-area bg-cream-50 shadow-(--shadow-soft)"
        style={{ clipPath: TORN_EDGE_CLIP_PATH }}
      >
      {/* Branded header: company identity + document title/meta */}
      <header className="flex flex-col gap-6 border-b border-ink-100 px-6 py-6 sm:flex-row sm:items-start sm:justify-between sm:px-9 sm:py-7">
        <div className="flex flex-col gap-2">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src="/logo.svg" alt={siteConfig.name} className="h-8 w-auto self-start" />
          <div>
            <p className="font-display text-base font-medium text-ink-900">{siteConfig.name}</p>
            <p className="text-xs text-ink-400">{contact.legalEntity}</p>
          </div>
          <p className="text-xs text-ink-500">{contact.email}</p>
        </div>

        <div className="sm:text-end">
          <p className="text-[11px] font-semibold uppercase tracking-[0.2em] text-bloom-700">
            {t("order.receipt")}
          </p>
          <p className="mt-1 font-display text-2xl font-medium tabular-nums text-ink-900">
            {orderRef}
          </p>
          <p className="mt-1 text-xs text-ink-500">{dateStr}</p>
        </div>
      </header>

      {/* Meta grid: customer · order details · payment */}
      <div className="grid gap-6 border-b border-ink-100 px-6 py-6 sm:grid-cols-3 sm:px-9">
        <div>
          <SectionLabel>
            <PinIcon size={13} className="text-bloom-600" />
            {t("order.deliverTo")}
          </SectionLabel>
          <div className="mt-2.5 space-y-1 text-sm not-italic leading-relaxed text-ink-600">
            {addr?.fullName && (
              <p className="font-medium text-ink-900">{addr.fullName}</p>
            )}
            {addressLine && <p>{addressLine}</p>}
            {addr?.phone && (
              <p className="flex items-center gap-1.5 sm:justify-start">
                <PhoneIcon size={12} className="shrink-0 text-ink-400" />
                <a
                  href={`tel:${addr.phone.replace(/[^\d+]/g, "")}`}
                  dir="ltr"
                  className="tabular-nums [unicode-bidi:isolate] transition-colors hover:text-bloom-700"
                >
                  {addr.phone}
                </a>
              </p>
            )}
            {email && (
              <p className="flex items-center gap-1.5">
                <MailIcon size={12} className="shrink-0 text-ink-400" />
                <a
                  href={`mailto:${email}`}
                  dir="ltr"
                  className="min-w-0 truncate [unicode-bidi:isolate] transition-colors hover:text-bloom-700"
                >
                  {email}
                </a>
              </p>
            )}
          </div>
        </div>

        <div>
          <SectionLabel>{t("order.orderDetails")}</SectionLabel>
          <dl className="mt-2.5 space-y-3 text-sm">
            <MetaRow label={t("order.orderNumber")} value={<span className="tabular-nums">{orderRef}</span>} />
            <MetaRow label={t("account.placedOn")} value={dateStr} />
            <MetaRow
              label={t("order.status")}
              value={<StatusBadge tone={orderStatusTone(order.status)} label={t(ORDER_STATUS_LABEL_KEY[order.status])} />}
            />
            <MetaRow
              label={t("checkout.deliveryTypeLabel")}
              value={
                delivery.isScheduled
                  ? t("checkout.reservedDelivery")
                  : t("checkout.standardDelivery")
              }
            />
            {delivery.expectedDate ? (
              <MetaRow
                label={t("checkout.expectedDeliveryDate")}
                value={formatDate(delivery.expectedDate, il)}
              />
            ) : null}
            {delivery.reservedDate ? (
              <MetaRow
                label={t("checkout.customerReservedDate")}
                value={formatDate(delivery.reservedDate, il)}
              />
            ) : null}
            {delivery.finalDate ? (
              <MetaRow
                label={t("checkout.finalDeliveryDate")}
                value={formatDate(delivery.finalDate, il)}
              />
            ) : null}
          </dl>
        </div>

        <div>
          <SectionLabel>{t("order.paymentDetails")}</SectionLabel>
          <dl className="mt-2.5 space-y-3 text-sm">
            <MetaRow
              label={t("order.method")}
              value={order.paymentMethod === "COD" ? t("checkout.cod") : order.paymentMethod}
            />
            <MetaRow
              label={t("order.paymentStatus")}
              value={
                <StatusBadge
                  tone={paymentTone(order.paymentStatus)}
                  label={t(paymentLabelKey(order.paymentStatus))}
                />
              }
            />
          </dl>
        </div>
      </div>

      {/* COD callout */}
      {order.paymentMethod === "COD" && order.paymentStatus !== "PAID" && !terminal && (
        <div className="mx-6 mt-6 flex items-start gap-3 rounded-xl border border-bloom-100 bg-bloom-50/60 p-4 sm:mx-9">
          <span className="mt-0.5 inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-cream-50 text-bloom-700 shadow-(--shadow-soft)">
            <TruckIcon size={18} />
          </span>
          <p className="text-sm text-ink-700">
            {t("order.codReady", { amount: formatCurrency(order.totalAmount, currency, locale) })}
          </p>
        </div>
      )}

      {/* Items table */}
      <div className="px-6 pt-7 sm:px-9">
        <SectionLabel>{t("order.itemsPurchased")}</SectionLabel>
        <div className={`${ITEM_COLS} mt-3 border-b border-ink-200 pb-2`}>
          <span className="text-[11px] font-semibold uppercase tracking-wider text-ink-400">
            {t("order.colItem")}
          </span>
          <span className="hidden text-center text-[11px] font-semibold uppercase tracking-wider text-ink-400 sm:block">
            {t("common.qty")}
          </span>
          <span className="hidden text-end text-[11px] font-semibold uppercase tracking-wider text-ink-400 sm:block">
            {t("order.colUnit")}
          </span>
          <span className="text-end text-[11px] font-semibold uppercase tracking-wider text-ink-400">
            {t("order.colAmount")}
          </span>
        </div>

        <ul className="divide-y divide-ink-100">
          {order.items.map((item) => {
            const productTitle = item.product
              ? localized(item.product.title, item.product.title_ar, locale)
              : t("order.itemFallback");

            return (
            <li key={item.id} className={`${ITEM_COLS} py-3.5`}>
              <div className="flex min-w-0 flex-col gap-2">
                <div className="relative h-16 w-16 shrink-0 overflow-hidden rounded-lg bg-blush-50 ring-1 ring-ink-100">
                  {item.selectedImage ?? item.product?.image ? (
                    <Image
                      src={(item.selectedImage ?? item.product?.image) as string}
                      alt={productTitle}
                      fill
                      sizes="64px"
                      className="object-cover"
                    />
                  ) : null}
                </div>
                <div className="min-w-0">
                  <p className="wrap-break-word text-sm font-medium leading-snug text-ink-900">
                    {productTitle}
                  </p>
                  <SelectedOptions options={item.selectedOptions} className="mt-1" />
                  <OrderItemExtras
                    giftCardSelected={item.giftCardSelected}
                    giftCardMode={item.giftCardMode}
                    customName={item.customName}
                    message={item.perProductMessage}
                    cashArrangement={
                      item.cashArrangementAmount
                        ? {
                            cashAmount: item.cashArrangementAmount,
                            denomination: item.cashArrangementDenomination,
                          }
                        : null
                    }
                    currency={currency}
                    locale={locale}
                    className="mt-1.5"
                  />
                  {/* Mobile-only per-unit breakdown (columns are hidden on mobile) */}
                  <p className="mt-0.5 text-xs text-ink-500 tabular-nums sm:hidden">
                    {t("common.qty")} {item.quantity} · {price(item.price)}
                  </p>
                </div>
              </div>
              <span className="hidden text-center text-sm text-ink-600 tabular-nums sm:block">
                {item.quantity}
              </span>
              <span className="hidden text-end text-sm text-ink-600 tabular-nums sm:block">
                {price(item.price)}
              </span>
              <span className="text-end text-sm font-medium text-ink-900 tabular-nums">
                {price(item.price * item.quantity)}
              </span>
            </li>
            );
          })}
        </ul>
      </div>

      {/* Totals — right-aligned summary column */}
      <div className="px-6 pb-7 pt-5 sm:px-9">
        <div className="ms-auto flex flex-col gap-2 text-sm sm:w-80">
          <TotalRow label={t("common.subtotal")} value={price(subtotal)} />
          {discount > 0 && (
            <TotalRow
              label={
                order.appliedPromoCode
                  ? `${t("common.discount")} (${order.appliedPromoCode})`
                  : t("common.discount")
              }
              value={<>− {price(discount)}</>}
              accent
            />
          )}
          <TotalRow
            label={
              shipping > 0 && order.vatRatePercent != null ? (
                <>
                  {t("common.delivery")}{" "}
                  <span className="text-ink-400">({t("checkout.flatRateVatInclusive")})</span>
                </>
              ) : (
                t("common.delivery")
              )
            }
            value={shipping > 0 ? price(shipping) : t("common.free")}
          />
          {/* VAT (product + cash-fee only; delivery is flat + VAT-inclusive) sits under Delivery,
              matching the checkout order summary. */}
          {showVat && (
            <TotalRow
              label={
                order.vatInclusive
                  ? t("order.vatIncludedLabel", { rate: order.vatRatePercent! })
                  : t("order.vatLabel", { rate: order.vatRatePercent! })
              }
              // Inclusive VAT is already baked into the item prices above — its
              // extracted amount is a different number than the same rate would
              // add on an exclusive order, which reads as a calculation error.
              // Only the label is shown for inclusive; the figure still shows
              // when VAT is added on top.
              value={order.vatInclusive ? null : <>+ {price(vatAmount)}</>}
            />
          )}
          {/* Cash arrangement (roll-up of every line's cash + service fee) — added to the
              total but never VAT'd on the raw cash; the fee's VAT is inside the VAT row above. */}
          {order.cashArrangementRequested && Number(order.cashArrangementAmount) > 0 ? (
            <>
              <TotalRow
                label={t("checkout.cashAmountLineLabel")}
                value={price(Number(order.cashArrangementAmount))}
              />
              {Number(order.cashArrangementFeeAmount) > 0 ? (
                <TotalRow
                  label={t("checkout.cashArrangementFeeLabel")}
                  value={price(Number(order.cashArrangementFeeAmount))}
                />
              ) : null}
            </>
          ) : null}
          <div className="mt-2 flex items-baseline justify-between border-t-2 border-ink-900/85 pt-3">
            <span className="font-display text-lg text-ink-900">{t("common.total")}</span>
            <span className="font-display text-2xl font-medium tabular-nums text-ink-900">
              {price(order.totalAmount)}
            </span>
          </div>
        </div>
      </div>

      {/* Order tracker — helpful on screen, omitted from the printed invoice */}
      {inFlow && (
        <div className="no-print border-t border-ink-100 px-6 py-6 sm:px-9">
          <SectionLabel>{t("order.whatsNext")}</SectionLabel>
          <div className="mt-4">
            <Tracker stepIndex={stepIndex} t={t} />
          </div>
        </div>
      )}

      {!inFlow && offFlowNoteKey && (
        <div className="border-t border-ink-100 px-6 py-4 sm:px-9">
          <p
            className={
              "text-sm font-medium " + (terminal ? "text-(--color-danger)" : "text-ink-600")
            }
          >
            {t(offFlowNoteKey)}
          </p>
        </div>
      )}

      {/* Thank-you strip — reads like an invoice footer */}
      <div className="border-t border-ink-100 bg-cream-100/50 px-6 py-4 text-center sm:px-9">
        <p className="text-xs text-ink-500">
          {t("order.receiptFooter", { brand: siteConfig.name })}
        </p>
      </div>
      </div>
    </m.div>
  );
}

/**
 * Print / Download-PDF toolbar. "Download PDF" generates a real PDF file
 * client-side from the rendered receipt (see `downloadReceiptPdf`) so it
 * downloads directly on every device — mobile browsers can't produce a file
 * from `window.print()`. "Print" stays a desktop-only affordance (the native
 * print dialog is awkward on touch devices), so it's hidden on phones/tablets.
 * Optional `children` render before the controls for context actions
 * (Back, Track, …).
 */
export function ReceiptActions({
  order,
  children,
}: {
  order?: ApiOrder;
  children?: ReactNode;
}) {
  const { t } = useT();
  const localize = useLocalizedHref();
  const toast = useToast();
  const [generating, setGenerating] = useState(false);
  const [sharing, setSharing] = useState(false);

  const handlePrint = () => {
    if (typeof window !== "undefined") window.print();
  };

  // A REAL, shareable link to this order (the public status page, looked up by
  // id) — unlike the local "Download PDF" blob URL, which only works on the
  // device that generated it and 404s for anyone the customer forwards it to.
  // Region/locale-aware via useLocalizedHref so a Saudi order opens in /sa/.
  const trackingUrl = (): string | null => {
    if (typeof window === "undefined" || !order?.id) return null;
    return `${window.location.origin}${localize(ROUTES.orderStatus)}?id=${encodeURIComponent(order.id)}`;
  };

  const copyTrackingLink = async (url: string) => {
    try {
      await navigator.clipboard?.writeText(url);
      toast.success({ title: t("order.linkCopied") });
    } catch {
      // Clipboard blocked (insecure context / permission) — still no error: the
      // native share below is the primary path; only reached when both are gone.
      toast.error({ title: t("order.shareError") });
    }
  };

  // Share the receipt. Best path: the actual PDF *file* via the native share
  // sheet (recipient gets a real file). Falls back to sharing/copying the real
  // tracking link — never a blob: URL, which can't be opened by anyone else.
  const handleShare = async () => {
    const url = trackingUrl();
    if (!url) return;
    setSharing(true);
    try {
      const canShare = typeof navigator !== "undefined" && typeof navigator.share === "function";

      // 1) Try to share the PDF file itself where the browser supports files.
      if (canShare && order) {
        const node = typeof document !== "undefined"
          ? document.querySelector<HTMLElement>(".receipt-print-area")
          : null;
        if (node) {
          try {
            const blob = await generateReceiptPdfBlob(node);
            const ref = order.orderNumber || order.id.slice(0, 8);
            const file = new File([blob], `receipt-${ref}.pdf`, { type: "application/pdf" });
            if (navigator.canShare?.({ files: [file] })) {
              await navigator.share({ files: [file], title: `Receipt ${ref}`, text: url });
              return;
            }
          } catch (err) {
            // PDF capture unsupported/failed on this device — fall through to
            // sharing the plain tracking link (still a good outcome).
            if ((err as Error)?.name === "AbortError") return; // user cancelled
            console.error("[receipt] file share failed; sharing link instead", err);
          }
        }
      }

      // 2) Share the tracking LINK via the native sheet where available.
      if (canShare) {
        await navigator.share({ title: t("order.shareReceipt"), url });
        return;
      }

      // 3) Desktop / no Web Share API — copy the link to the clipboard.
      await copyTrackingLink(url);
    } catch (err) {
      if ((err as Error)?.name === "AbortError") return; // user dismissed the sheet
      await copyTrackingLink(url);
    } finally {
      setSharing(false);
    }
  };

  const handleDownloadPdf = async () => {
    if (typeof document === "undefined") return;
    const node = document.querySelector<HTMLElement>(".receipt-print-area");
    // No receipt on the page (shouldn't happen) — fall back to the print dialog.
    if (!node) {
      handlePrint();
      return;
    }
    setGenerating(true);
    try {
      const ref = order?.orderNumber || order?.id?.slice(0, 8) || "receipt";
      await downloadReceiptPdf(node, `receipt-${ref}.pdf`);
    } catch (err) {
      // If capture/encoding fails on some device, degrade to the native print
      // dialog (whose "Save as PDF" still works) rather than doing nothing.
      console.error("[receipt] PDF generation failed; falling back to print", err);
      handlePrint();
    } finally {
      setGenerating(false);
    }
  };

  return (
    <m.div
      className="no-print mt-8 flex flex-col gap-3 sm:flex-row sm:flex-wrap sm:justify-center"
      variants={staggerContainer(0.07, 0.6)}
      initial="hidden"
      animate="show"
    >
      {children ? (
        <m.div variants={staggerItem} className="flex flex-col gap-3 sm:flex-row sm:flex-wrap">
          {children}
        </m.div>
      ) : null}
      {/* Desktop-only: printing is clumsy on touch devices, where the PDF
          download below is the primary action. */}
      <m.div variants={staggerItem} className="hidden lg:block">
        <Button
          size="lg"
          variant="outline"
          fullWidth
          className="sm:w-auto"
          leadingIcon={<DocumentIcon size={16} />}
          onClick={handlePrint}
        >
          {t("order.print")}
        </Button>
      </m.div>
      <m.div variants={staggerItem}>
        <Button
          size="lg"
          fullWidth
          className="sm:w-auto"
          isLoading={generating}
          leadingIcon={<DownloadIcon size={16} />}
          onClick={handleDownloadPdf}
        >
          {t("order.downloadPdf")}
        </Button>
      </m.div>
      {/* Share a REAL link (or the PDF file) — the shareable alternative to the
          device-only "Download PDF" blob. Only when we have an order to link to. */}
      {order?.id ? (
        <m.div variants={staggerItem}>
          <Button
            size="lg"
            variant="outline"
            fullWidth
            className="sm:w-auto"
            isLoading={sharing}
            leadingIcon={<ShareIcon size={16} />}
            onClick={handleShare}
          >
            {t("order.shareReceipt")}
          </Button>
        </m.div>
      ) : null}
    </m.div>
  );
}

function Tracker({ stepIndex, t }: { stepIndex: number; t: (k: MessageKey) => string }) {
  return (
    <ol className="flex items-center">
      {ORDER_PROGRESS_STEPS.map((s, i) => {
        const done = i <= stepIndex;
        const current = i === stepIndex;
        return (
          <li key={s.key} className="flex min-w-0 flex-1 flex-col items-center gap-2">
            <div className="flex w-full items-center">
              <span
                className={
                  "h-0.5 flex-1 " +
                  (i === 0 ? "bg-transparent" : done ? "bg-bloom-500" : "bg-ink-100")
                }
              />
              <span
                className={
                  "flex shrink-0 items-center justify-center rounded-full transition-all " +
                  (current
                    ? "h-4 w-4 bg-bloom-600 ring-4 ring-bloom-100"
                    : done
                    ? "h-3 w-3 bg-bloom-600"
                    : "h-3 w-3 bg-ink-200")
                }
              />
              <span
                className={
                  "h-0.5 flex-1 " +
                  (i === ORDER_PROGRESS_STEPS.length - 1
                    ? "bg-transparent"
                    : i < stepIndex
                    ? "bg-bloom-500"
                    : "bg-ink-100")
                }
              />
            </div>
            <span
              className={
                "hyphens-auto wrap-break-word text-center text-[10px] font-medium uppercase tracking-tight sm:text-[11px] sm:tracking-wider " +
                (done ? "text-ink-800" : "text-ink-400")
              }
            >
              {t(s.labelKey)}
            </span>
          </li>
        );
      })}
    </ol>
  );
}

export function SectionLabel({ children }: { children: ReactNode }) {
  return (
    <h2 className="flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-[0.16em] text-ink-400">
      {children}
    </h2>
  );
}

function MetaRow({ label, value }: { label: string; value: ReactNode }) {
  return (
    <div className="flex flex-col gap-0.5">
      <dt className="text-ink-500">{label}</dt>
      <dd className="font-medium text-ink-900">{value}</dd>
    </div>
  );
}

function TotalRow({
  label,
  value,
  accent,
}: {
  label: ReactNode;
  value: ReactNode;
  accent?: boolean;
}) {
  return (
    <div className="flex items-center justify-between">
      <span className="text-ink-500">{label}</span>
      <span className={"tabular-nums " + (accent ? "font-medium text-bloom-700" : "text-ink-800")}>
        {value}
      </span>
    </div>
  );
}

type BadgeTone = "success" | "pending" | "danger" | "neutral";

function StatusBadge({ tone, label }: { tone: BadgeTone; label: string }) {
  const tones: Record<BadgeTone, string> = {
    success: "bg-emerald-50 text-emerald-700 ring-emerald-200",
    pending: "bg-amber-50 text-amber-700 ring-amber-200",
    danger: "bg-rose-50 text-rose-700 ring-rose-200",
    neutral: "bg-cream-100 text-bloom-700 ring-bloom-200",
  };
  return (
    <span
      className={
        "inline-flex items-center gap-1.5 rounded-full px-2.5 py-0.5 text-[11px] font-semibold uppercase tracking-wider ring-1 ring-inset " +
        tones[tone]
      }
    >
      <span className="h-1.5 w-1.5 rounded-full bg-current opacity-70" />
      {label}
    </span>
  );
}

function orderStatusTone(status: OrderStatus): BadgeTone {
  if (status === "COMPLETED") return "success";
  if (status === "CANCELLED" || status === "REFUNDED" || status === "FAILED") return "danger";
  // PENDING_PAYMENT, PROCESSING, ON_HOLD, DRAFT
  return "neutral";
}

function paymentTone(status: PaymentStatus): BadgeTone {
  if (status === "PAID") return "success";
  if (status === "FAILED") return "danger";
  return "pending";
}

function paymentLabelKey(status: PaymentStatus): MessageKey {
  if (status === "PAID") return "order.paid";
  if (status === "FAILED") return "order.failed";
  return "order.unpaid";
}
