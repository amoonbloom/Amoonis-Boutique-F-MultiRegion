"use client";

import { LocalizedLink } from "@/components/ui/LocalizedLink";
import { useQuery } from "@tanstack/react-query";
import { ordersApi } from "@/features/orders/api/orders.api";
import { queryKeys } from "@/services/queryKeys";
import { Badge, CurrencyAmount } from "@/components/ui";
import { Spinner } from "@/components/ui/Loader";
import { ChevronRight } from "@/components/icons";
import { formatCurrency, formatDate, intlLocale } from "@/lib/format";
import { useT } from "@/i18n/useT";
import { useCurrency } from "@/features/location/hooks/useCurrency";
import {
  ORDER_STATUS_LABEL_KEY,
  ORDER_STATUS_TONE,
  ORDER_PROGRESS_STEPS,
  ORDER_TERMINAL_NOTE_KEY,
  ORDER_PAUSED_NOTE_KEY,
} from "@/features/orders/constants";
import { OrderDeliveryInfo } from "@/features/orders/components/OrderDeliveryInfo";
import { SelectedOptions } from "@/features/products/components/SelectedOptions";
import { OrderItemExtras } from "@/features/orders/components/OrderItemExtras";

export function AccountOrderDetail({ id }: { id: string }) {
  const { t, locale } = useT();
  const { currency: browsingCurrency, locale: curLocale } = useCurrency();
  const query = useQuery({
    queryKey: queryKeys.orders.detail(id),
    queryFn: () => ordersApi.getById(id),
  });

  if (query.isPending) {
    return (
      <div className="flex justify-center py-16">
        <Spinner size="lg" />
      </div>
    );
  }

  if (query.isError || !query.data) {
    return (
      <div className="rounded-xl border border-bloom-200 bg-bloom-50 p-6 text-bloom-700">
        {t("account.orderLoadError")}{" "}
        <LocalizedLink href="/account/orders" className="underline">
          {t("account.backToOrders")}
        </LocalizedLink>
      </div>
    );
  }

  const order = query.data;
  // Always render this order's OWN stamped currency (order.currency), not the
  // viewer's live browsing region — otherwise a SAR order viewed from a UAE
  // browsing context shows AED. Legacy orders (no currency) fall back.
  const currency = order.currency ?? browsingCurrency;
  const currentIdx = ORDER_PROGRESS_STEPS.findIndex((s) => s.key === order.status);
  const inFlow = currentIdx >= 0;
  const offFlowNoteKey = ORDER_TERMINAL_NOTE_KEY[order.status] ?? ORDER_PAUSED_NOTE_KEY[order.status];
  const itemsTotal = order.items.reduce((s, i) => s + i.price * i.quantity, 0);

  return (
    <div className="flex flex-col gap-6">
      <div>
        <LocalizedLink
          href="/account/orders"
          className="inline-flex items-center gap-1 text-sm text-ink-500 hover:text-ink-900"
        >
          <ChevronRight size={14} className="rotate-180 rtl:-scale-x-100" />
          {t("account.allOrders")}
        </LocalizedLink>
      </div>

      <header className="flex flex-wrap items-end justify-between gap-3">
        <div className="min-w-0">
          <p className="font-mono text-xs text-ink-500 break-all">
            {t("order.orderLabel")} #{order.orderNumber ?? order.id.slice(0, 8)}
          </p>
          <h2 className="font-display text-xl text-ink-900 sm:text-2xl">
            {t("account.placedOn")} {formatDate(order.createdAt, intlLocale(locale))}
          </h2>
        </div>
        <Badge tone={ORDER_STATUS_TONE[order.status]}>
          {t(ORDER_STATUS_LABEL_KEY[order.status])}
        </Badge>
      </header>

      {inFlow ? (
        <section className="rounded-2xl border border-ink-100 bg-white p-4 sm:p-5">
          <div className="grid grid-cols-3 gap-1.5 sm:gap-2">
            {ORDER_PROGRESS_STEPS.map((s, i) => {
              const reached = i <= currentIdx;
              return (
                <div key={s.key} className="flex min-w-0 flex-col items-center gap-1.5">
                  <div
                    className={
                      "h-1.5 w-full rounded-full " +
                      (reached ? "bg-bloom-500" : "bg-ink-100")
                    }
                  />
                  <span
                    className={
                      "text-center text-[10px] uppercase tracking-tight sm:tracking-wider " +
                      (reached ? "text-bloom-700" : "text-ink-400")
                    }
                  >
                    {t(s.labelKey)}
                  </span>
                </div>
              );
            })}
          </div>
        </section>
      ) : offFlowNoteKey ? (
        <section className="rounded-2xl border border-ink-100 bg-white p-4 sm:p-5">
          <p className="text-sm text-ink-600">{t(offFlowNoteKey)}</p>
        </section>
      ) : null}

      <section className="rounded-2xl border border-ink-100 bg-white p-5 sm:p-6">
        <h3 className="mb-4 font-display text-lg text-ink-900">{t("account.items")}</h3>
        <ul className="divide-y divide-ink-100">
          {order.items.map((item) => (
            <li key={item.id} className="flex gap-4 py-3 first:pt-0 last:pb-0">
              {item.selectedImage ?? item.product?.image ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  src={(item.selectedImage ?? item.product?.image) as string}
                  alt=""
                  className="h-16 w-16 rounded-lg object-cover"
                />
              ) : (
                <div className="h-16 w-16 rounded-lg bg-ink-100" />
              )}
              <div className="flex flex-1 items-start justify-between gap-3">
                <div className="min-w-0">
                  <p className="font-medium text-ink-900">
                    {item.product?.title ?? t("account.removedProduct")}
                  </p>
                  <p className="text-xs text-ink-500">
                    <CurrencyAmount amount={item.price} currency={currency} locale={curLocale} />{" "}
                    × {item.quantity}
                  </p>
                  <SelectedOptions options={item.selectedOptions} className="mt-1.5" />
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
                    locale={curLocale}
                    className="mt-2"
                  />
                </div>
                <p className="shrink-0 font-medium text-ink-900">
                  <CurrencyAmount
                    amount={item.price * item.quantity}
                    currency={currency}
                    locale={curLocale}
                  />
                </p>
              </div>
            </li>
          ))}
        </ul>
        <dl className="mt-4 space-y-1 border-t border-ink-100 pt-4 text-sm">
          <div className="flex justify-between text-ink-500">
            <dt>{t("common.subtotal")}</dt>
            <dd><CurrencyAmount amount={itemsTotal} currency={currency} locale={curLocale} /></dd>
          </div>
          {order.discountAmount && order.discountAmount > 0 ? (
            <div className="flex justify-between text-ink-500">
              <dt>
                {t("common.discount")}{" "}
                {order.appliedPromoCode ? (
                  <span className="text-xs text-ink-400">
                    ({order.appliedPromoCode})
                  </span>
                ) : null}
              </dt>
              <dd>
                −
                <CurrencyAmount
                  amount={order.discountAmount}
                  currency={currency}
                  locale={curLocale}
                />
              </dd>
            </div>
          ) : null}
          {order.vatRatePercent != null &&
          (order.vatAmount ?? order.taxAmount ?? 0) > 0 ? (
            <div className="flex justify-between text-ink-500">
              <dt>
                {order.vatInclusive
                  ? t("order.vatIncludedLabel", { rate: order.vatRatePercent })
                  : t("order.vatLabel", { rate: order.vatRatePercent })}
              </dt>
              <dd>
                {/* Inclusive VAT is already inside the item prices — label only,
                    no figure; exclusive VAT is added on top, so it shows. */}
                {order.vatInclusive ? null : (
                  <>
                    +{" "}
                    <CurrencyAmount
                      amount={order.vatAmount ?? order.taxAmount ?? 0}
                      currency={currency}
                      locale={curLocale}
                    />
                  </>
                )}
              </dd>
            </div>
          ) : null}
          <div className="flex justify-between border-t border-ink-100 pt-2 font-medium text-ink-900">
            <dt>{t("common.total")}</dt>
            <dd><CurrencyAmount amount={order.totalAmount} currency={currency} locale={curLocale} /></dd>
          </div>
        </dl>
      </section>

      <section className="rounded-2xl border border-ink-100 bg-white p-5 sm:p-6">
        <h3 className="mb-2 font-display text-lg text-ink-900">{t("checkout.payment")}</h3>
        <p className="text-sm text-ink-700">
          {order.paymentMethod === "COD"
            ? t("checkout.cod")
            : order.paymentMethod === "TABBY"
              ? t("checkout.payTabby")
              : order.paymentMethod === "MYFATOORAH"
                ? t("checkout.payCard")
                : order.paymentMethod}
          {" · "}
          <span
            className={
              order.paymentStatus === "PAID"
                ? "font-medium text-emerald-700"
                : "font-medium text-bloom-700"
            }
          >
            {order.paymentStatus === "PAID" ? t("order.paid") : t("order.unpaid")}
          </span>
        </p>
        {order.paymentMethod === "COD" && order.paymentStatus !== "PAID" ? (
          <p className="mt-1 text-sm text-ink-500">
            {t("order.codReady", {
              amount: formatCurrency(order.totalAmount, currency, curLocale),
            })}
          </p>
        ) : null}
      </section>

      <OrderDeliveryInfo order={order} />

      {order.shippingAddress ? (
        <section className="rounded-2xl border border-ink-100 bg-white p-5 sm:p-6">
          <h3 className="mb-3 font-display text-lg text-ink-900">{t("account.deliveryAddress")}</h3>
          <div className="text-sm text-ink-700">
            <p className="font-medium text-ink-900">
              {order.shippingAddress.fullName}
            </p>
            <p>{order.shippingAddress.phone}</p>
            {/* Area/zone is the current checkout's primary location field —
                fall back to the legacy street/city/country lines for orders
                placed before this feature existed. */}
            {order.shippingAddress.area ? (
              <p className="mt-2">
                {order.shippingAddress.area}
                {order.shippingAddress.deliveryZoneName
                  ? `, ${order.shippingAddress.deliveryZoneName}`
                  : ""}
              </p>
            ) : (
              <>
                <p className="mt-2">
                  {order.shippingAddress.streetAddress}
                  {order.shippingAddress.apartment
                    ? `, ${order.shippingAddress.apartment}`
                    : ""}
                </p>
                <p>
                  {order.shippingAddress.city}
                  {order.shippingAddress.state ? `, ${order.shippingAddress.state}` : ""}
                  {order.shippingAddress.postalCode
                    ? ` ${order.shippingAddress.postalCode}`
                    : ""}
                </p>
                <p>{order.shippingAddress.country}</p>
              </>
            )}
          </div>
        </section>
      ) : null}
    </div>
  );
}
