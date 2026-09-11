"use client";

import type { Locale } from "@/store/slices/ui.slice";
import type { ApiOrder } from "@/features/orders/types";
import type { RegionContact } from "@/features/location/regionContact";
import type { ApiRegion } from "@/features/regions/types";
import { t, localized, dirFor } from "@/i18n";
import { formatAmount, formatCurrency, formatDate, intlLocale } from "@/lib/format";
import { siteConfig } from "@/config/site";
import {
  ORDER_STATUS_LABEL_KEY,
  PAYMENT_STATUS_LABEL_KEY,
} from "@/features/orders/constants";

/**
 * A WooCommerce-style single-order INVOICE, laid out to match the client's
 * reference (Argan Box) invoice: logo + meta header, billing/shipping cards,
 * an ITEM · COST · QTY · TOTAL table, subtotal/shipping/total block, customer
 * note, and a store footer.
 *
 * Rendered OFF-SCREEN and rasterised to a PDF by `receiptPdf.ts` — so the
 * browser shapes Arabic/RTL and the PDF captures the pixels (no PDF fonts or
 * bidi work needed). It is deliberately PURE and takes an EXPLICIT `locale`
 * (not the global UI locale) so an admin browsing in English can still download
 * an Arabic invoice, and vice-versa. Amounts are plain text (no CurrencyAmount
 * SVG) to keep the capture crisp — matching the reference's "AED 543.00".
 *
 * Caveats vs. a WooCommerce invoice, by data-model design:
 *  - No SKU line (the catalog has no SKU) — we show the variant instead.
 *  - One stored address, so Billing and Shipping show the same address.
 */
export function OrderInvoiceDocument({
  order,
  locale,
  contact,
  region,
  regionCode,
}: {
  order: ApiOrder;
  locale: Locale;
  contact: RegionContact;
  /** The order's own region, so the footer shows the order's location (Saudi
   *  Arabia for an SA order, not the store default). Undefined until regions load. */
  region?: ApiRegion | null;
  regionCode?: string | null;
}) {
  const il = intlLocale(locale);
  const currency = order.currency ?? "AED";
  const dir = dirFor(locale);

  // Footer location for THIS order's region: its configured address if set,
  // otherwise its country name ("Saudi Arabia"). Never the store's hardcoded
  // Dubai fallback (contact.address falls back to siteConfig for a region with
  // no address, which would wrongly stamp a UAE address on a Saudi invoice).
  const footerLocation =
    (locale === "ar" ? region?.address_ar?.trim() : "") ||
    region?.address?.trim() ||
    (region ? localized(region.name, region.name_ar, locale) : "") ||
    null;

  // `uppercase` + positive letter-spacing are Latin eyebrow patterns that break
  // Arabic cursive joining — drop them under RTL (mirrors globals.css's RTL rules,
  // which don't reach this node since `dir` is set here on a div, not on <html>).
  const eyebrow =
    dir === "rtl"
      ? "text-xs font-bold text-ink-400"
      : "text-xs font-bold uppercase tracking-wide text-ink-400";

  const money = (n: number) => formatAmount(n, il);
  const amount = (n: number) => formatCurrency(n, currency, il);

  const subtotal =
    order.subtotalAmount ??
    order.items.reduce((s, i) => s + i.price * i.quantity, 0);
  const shipping = order.shippingAmount ?? 0;
  const discount = order.discountAmount ?? 0;
  const vatAmount = order.vatAmount ?? order.taxAmount ?? 0;
  const showVatLine = order.vatRatePercent != null && vatAmount > 0;

  const orderRef = order.orderNumber ?? order.id.slice(0, 8);
  const orderDate = formatDate(order.createdAt, il);
  const deliveryDate = order.scheduledDeliveryAt
    ? formatDate(order.scheduledDeliveryAt, il)
    : order.estimatedDeliveryDate
      ? formatDate(order.estimatedDeliveryDate, il)
      : null;

  const paymentLabel =
    order.paymentMethod === "COD"
      ? t(locale, "admin.orderDetailPage.codLabel")
      : t(locale, "checkout.payOnline");
  const statusLabel = t(locale, ORDER_STATUS_LABEL_KEY[order.status]);
  const paymentStatusLabel = t(locale, PAYMENT_STATUS_LABEL_KEY[order.paymentStatus]);

  const addr = order.shippingAddress;
  const customerName = addr?.fullName || order.guestName || "—";
  const customerEmail = order.guestEmail || null;
  const customerPhone = addr?.phone || order.guestPhone || null;
  const streetLine = [addr?.streetAddress, addr?.apartment].filter(Boolean).join(", ");
  const cityLine = [addr?.area || addr?.deliveryZoneName, addr?.city, addr?.state]
    .filter(Boolean)
    .join(", ");

  const metaRow = (label: string, value: string) => (
    <div className="flex items-baseline justify-between gap-6">
      <span className="font-semibold text-ink-900">{label}</span>
      <span className="text-ink-800">{value}</span>
    </div>
  );

  return (
    <div
      dir={dir}
      lang={locale}
      className="invoice-print-area mx-auto w-[794px] bg-white px-12 py-10 text-sm text-ink-800"
      // Under RTL this node isn't a descendant of <html dir="rtl">, so the global
      // Arabic resets never reach it — and the inherited Latin base styles
      // (letter-spacing: -0.005em, Latin font-feature-settings, optimizeLegibility)
      // make html2canvas render Arabic PER CHARACTER, breaking cursive joining.
      // Replicate the html[dir="rtl"] reset here so the capture shapes Arabic.
      style={
        dir === "rtl"
          ? {
              fontFamily:
                "var(--font-arabic-body), 'Segoe UI', Tahoma, Arial, sans-serif",
              letterSpacing: "normal",
              fontFeatureSettings: "normal",
              fontVariantLigatures: "normal",
              textRendering: "auto",
            }
          : undefined
      }
    >
      {/* ── Header: logo (start) + meta (end) ───────────────────────────── */}
      <div className="flex items-start justify-between gap-8">
        <div className="flex flex-col gap-2">
          {/* Plain <img> with explicit intrinsic width/height: the PDF exporter
              rasterises images from their width/height attributes, and next/image
              strips them (drawing the wordmark stretched/clipped). Mirrors the
              checkout receipt's logo. */}
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src="/logo.svg"
            alt={siteConfig.name}
            width={758}
            height={146}
            className="h-12 w-auto self-start"
          />
          {regionCode ? (
            <span className={eyebrow}>{regionCode}</span>
          ) : null}
        </div>
        <div className="flex w-[320px] flex-col gap-1 text-end text-[13px]">
          {metaRow(t(locale, "invoice.invoiceNumber"), String(orderRef))}
          {metaRow(t(locale, "invoice.orderNumber"), String(orderRef))}
          {metaRow(t(locale, "invoice.orderDate"), orderDate)}
          {metaRow(t(locale, "invoice.paymentMethod"), paymentLabel)}
          {metaRow(t(locale, "invoice.status"), statusLabel)}
          {deliveryDate ? metaRow(t(locale, "invoice.deliveryDate"), deliveryDate) : null}
        </div>
      </div>

      {/* Green divider */}
      <div className="mt-4 h-[3px] w-full rounded bg-[#006c35]" />

      {/* ── Billing + Shipping cards ────────────────────────────────────── */}
      <div className="mt-8 grid grid-cols-2 gap-6">
        {[
          { heading: t(locale, "invoice.billingAddress"), withContact: true },
          { heading: t(locale, "invoice.shippingAddress"), withContact: false },
        ].map((box) => (
          <div
            key={box.heading}
            className="rounded-xl border border-ink-100 px-5 py-4"
          >
            <p className={`mb-2 ${eyebrow}`}>{box.heading}</p>
            <p className="font-medium text-ink-900">{customerName}</p>
            {streetLine ? <p className="text-ink-700">{streetLine}</p> : null}
            {cityLine ? <p className="text-ink-700">{cityLine}</p> : null}
            {box.withContact && customerPhone ? (
              <p className="mt-2 text-ink-700">{customerPhone}</p>
            ) : null}
            {box.withContact && customerEmail ? (
              <p className="text-ink-700">{customerEmail}</p>
            ) : null}
          </div>
        ))}
      </div>

      {/* ── Items table ─────────────────────────────────────────────────── */}
      <table className="mt-8 w-full border-collapse text-[13px]">
        <thead>
          <tr
            className={`border-b border-ink-200 text-ink-900 ${
              dir === "rtl" ? "text-xs font-bold" : "text-xs font-bold uppercase tracking-wide"
            }`}
          >
            <th className="py-2 text-start">{t(locale, "invoice.colItem")}</th>
            <th className="py-2 text-end">{t(locale, "invoice.colCost")}</th>
            <th className="py-2 text-center">{t(locale, "invoice.colQty")}</th>
            <th className="py-2 text-end">{t(locale, "invoice.colTotal")}</th>
          </tr>
        </thead>
        <tbody>
          {order.items.map((item) => {
            const title = localized(
              item.product?.title ?? "",
              item.product?.title_ar,
              locale
            );
            const variant = item.selectedOptions
              ? Object.values(item.selectedOptions).filter(Boolean).join(" · ")
              : "";
            return (
              <tr key={item.id} className="border-b border-ink-100 align-top">
                <td className="py-3 pe-4 text-start">
                  <span className="text-ink-900">{title}</span>
                  {variant ? (
                    <span className="mt-0.5 block text-xs text-ink-400">{variant}</span>
                  ) : null}
                </td>
                <td className="py-3 text-end text-ink-800">{money(item.price)}</td>
                <td className="py-3 text-center text-ink-800">{item.quantity}</td>
                <td className="py-3 text-end text-ink-800">
                  {money(item.price * item.quantity)}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>

      {/* ── Totals (end-aligned) ────────────────────────────────────────── */}
      <div className="mt-6 flex justify-end">
        <div className="w-[320px]">
          <div className="flex items-baseline justify-between py-1 text-ink-700">
            <span>{t(locale, "invoice.itemsSubtotal")}</span>
            <span>{money(subtotal)}</span>
          </div>
          {discount > 0 ? (
            <div className="flex items-baseline justify-between py-1 text-ink-700">
              <span>
                {t(locale, "common.discount")}
                {order.appliedPromoCode ? ` (${order.appliedPromoCode})` : ""}
              </span>
              <span>−{money(discount)}</span>
            </div>
          ) : null}
          <div className="flex items-baseline justify-between py-1 text-ink-700">
            <span>{t(locale, "invoice.shipping")}</span>
            <span>{shipping > 0 ? money(shipping) : t(locale, "common.free")}</span>
          </div>
          {showVatLine && !order.vatInclusive ? (
            <div className="flex items-baseline justify-between py-1 text-ink-700">
              <span>{t(locale, "order.vatLabel", { rate: order.vatRatePercent! })}</span>
              <span>+{money(vatAmount)}</span>
            </div>
          ) : null}
          <div className="mt-1 h-[2px] w-full bg-[#006c35]" />
          <div className="flex items-baseline justify-between py-2 text-base font-bold text-ink-900">
            <span>{t(locale, "invoice.orderTotal")}</span>
            <span>{amount(order.totalAmount)}</span>
          </div>
          {order.vatInclusive ? (
            <p className="text-end text-xs text-ink-400">{t(locale, "product.vatInclusive")}</p>
          ) : null}
          {paymentStatusLabel ? (
            <p className="text-end text-xs text-ink-400">
              {t(locale, "invoice.paymentStatus")}: {paymentStatusLabel}
            </p>
          ) : null}
        </div>
      </div>

      {/* ── Customer note ───────────────────────────────────────────────── */}
      {order.orderMessage ? (
        <div className="mt-8 rounded-xl border border-ink-100 px-5 py-4">
          <p className={`mb-2 ${eyebrow}`}>{t(locale, "invoice.customerNote")}</p>
          <p className="whitespace-pre-line text-ink-700">{order.orderMessage}</p>
        </div>
      ) : null}

      {/* ── Footer: store identity + filename ───────────────────────────── */}
      <div className="mt-10 flex items-start justify-between gap-6 border-t border-ink-100 pt-4 text-xs text-ink-500">
        <div>
          <p className="font-semibold text-ink-700">{siteConfig.name}</p>
          {footerLocation ? <p>{footerLocation}</p> : null}
          {contact.email ? <p>{contact.email}</p> : null}
        </div>
        <p className="text-ink-400">
          {t(locale, "invoice.file")}: invoice-{orderRef}.pdf
        </p>
      </div>
    </div>
  );
}
