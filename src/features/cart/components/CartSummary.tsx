"use client";

import { LocalizedLink } from "@/components/ui/LocalizedLink";
import { m } from "motion/react";
import { useQuery } from "@tanstack/react-query";
import { Button, Divider, CurrencyAmount } from "@/components/ui";
import { ArrowRight, ShieldIcon, TruckIcon } from "@/components/icons";
import { useAppSelector } from "@/store";
import { microTransition } from "@/lib/motion";
import { ROUTES } from "@/constants/routes";
import { useCurrency } from "@/features/location/hooks/useCurrency";
import { useRegionCopy } from "@/features/location/hooks/useRegionCopy";
import { regionsApi } from "@/features/regions/api/regions.api";
import { deliveryConfigApi } from "@/features/delivery-config/api/delivery-config.api";
import { queryKeys } from "@/services/queryKeys";
import { formatCutoffTime } from "@/lib/format";
import { OrderDeliveryNote, maxCartLeadDays } from "./OrderDeliveryNote";
import { usePublicVat } from "@/features/vat/hooks/usePublicVat";
import { vatHint } from "@/features/vat/vatDisplay";
import { useCartCashTotals } from "@/features/cash-arrangement/hooks/useCartCashTotals";
import { useT } from "@/i18n/useT";
import { TabbyPromoSnippet } from "@/components/checkout/TabbyPromoSnippet";
import { getTabbySnippetConfig } from "@/config/tabbyPublic";

interface CartSummaryProps {
  variant?: "page" | "checkout";
}

export function CartSummary({ variant = "page" }: CartSummaryProps) {
  const items = useAppSelector((s) => s.cart.items);
  const { currency, locale, countryCode } = useCurrency();
  const regionCopy = useRegionCopy();
  const { t, locale: appLocale } = useT();
  const tabbySnippet = getTabbySnippetConfig();
  const subtotal = items.reduce(
    (sum, i) => sum + i.unitPrice * i.quantity,
    0
  );
  // Each line's own "Cash amount"/"Arrangement service fee" breakdown is already
  // shown on the line itself (OrderItemExtras) — this is just the running roll-up
  // so Total isn't missing real money the shopper is about to pay.
  const { cashRawTotal, cashFeeTotal } = useCartCashTotals(items);
  const cashTotal = cashRawTotal + cashFeeTotal;
  const orderLeadDays = maxCartLeadDays(items);

  // Flat shipping fee for the current region — same query key as
  // CheckoutClient so this is served from cache, not a second request.
  // Promo discounts and VAT are only resolved at checkout (they depend on a
  // code/config the cart page doesn't fetch), so this total is delivery-
  // inclusive but tax/discount-exclusive — the final checkout total is the
  // source of truth.
  const regionsQuery = useQuery({
    queryKey: queryKeys.regions.list(),
    queryFn: () => regionsApi.list(),
  });
  const regionCode = countryCode;
  const currentRegion = regionsQuery.data?.find((r) => r.code === regionCode);

  // Region-level resolved delivery config (no zone yet — the zone is picked at checkout).
  // Drives the delivery fee (with free-delivery threshold), the same-day cutoff line, and
  // whether the COD line is shown — all from real admin config, not hardcoded copy.
  const deliveryConfigQuery = useQuery({
    queryKey: queryKeys.deliveryConfig.resolve(regionCode, undefined, subtotal),
    queryFn: () => deliveryConfigApi.get({ region: regionCode, subtotal }),
    enabled: Boolean(regionCode),
    staleTime: 60_000,
  });
  const deliveryConfig = deliveryConfigQuery.data;

  // Prefer the resolved effective fee (folds in the free-delivery threshold) once loaded;
  // fall back to the region flat rate while it loads so the line is never blank.
  const shipping =
    deliveryConfig != null
      ? deliveryConfig.effectiveFee
      : currentRegion?.shippingFlatRate != null
        ? Number(currentRegion.shippingFlatRate)
        : 0;
  const total = subtotal + shipping + cashTotal;

  // VAT is only resolved for real at checkout. The cart page previews the plain
  // "VAT Inclusive" label when prices already include it, but never the exclusive
  // "+ VAT" addition — that preview is reserved for the shop grid, with the real
  // amount shown on checkout, so we don't show a second note here.
  const vatConfig = usePublicVat();
  const hint = variant === "page" ? vatHint(vatConfig) : null;
  const showVatInclusiveHint = hint?.kind === "inclusive";
  // Shipping is a flat, VAT-inclusive charge — annotate the delivery line whenever the region
  // has active VAT and a fee is charged (mirrors checkout + receipt).
  const vatEnabled = Boolean(vatConfig?.enabled && vatConfig.ratePercent > 0);

  return (
    <aside
      className="flex flex-col gap-5 rounded-3xl border border-ink-100 bg-white p-6 lg:sticky lg:top-24"
      aria-label={t("cart.orderSummary")}
    >
      <h2 className="font-display text-2xl font-medium text-ink-900">
        {t("cart.orderSummary")}
      </h2>

      <dl className="flex flex-col gap-2 text-sm">
        <div className="flex justify-between">
          <dt className="text-ink-600">{t("common.subtotal")}</dt>
          <m.dd
            key={subtotal}
            initial={{ opacity: 0, y: -4 }}
            animate={{ opacity: 1, y: 0 }}
            transition={microTransition}
            className="font-medium tabular-nums text-ink-900"
          >
            <CurrencyAmount amount={subtotal} currency={currency} locale={locale} />
          </m.dd>
        </div>
        {cashTotal > 0 && (
          <div className="flex justify-between">
            <dt className="text-ink-600">{t("product.cashDetailsLabel")}</dt>
            <dd className="font-medium tabular-nums text-ink-900">
              <CurrencyAmount amount={cashTotal} currency={currency} locale={locale} />
            </dd>
          </div>
        )}
        <div className="flex justify-between">
          <dt className="text-ink-600">
            {t("common.delivery")}
            {shipping > 0 && vatEnabled ? (
              <span className="text-ink-400"> ({t("checkout.flatRateVatInclusive")})</span>
            ) : null}
          </dt>
          <dd className="font-medium tabular-nums text-ink-900">
            {shipping > 0 ? (
              <CurrencyAmount amount={shipping} currency={currency} locale={locale} />
            ) : (
              t("common.free")
            )}
          </dd>
        </div>
      </dl>

      {orderLeadDays != null && <OrderDeliveryNote days={orderLeadDays} />}

      <Divider />

      <div className="flex items-baseline justify-between">
        <span className="font-display text-lg text-ink-900">{t("common.total")}</span>
        <m.span
          key={total}
          initial={{ opacity: 0, y: -4 }}
          animate={{ opacity: 1, y: 0 }}
          transition={microTransition}
          className="font-display text-2xl font-medium tabular-nums text-ink-900"
        >
          <CurrencyAmount amount={total} currency={currency} locale={locale} />
        </m.span>
      </div>

      {showVatInclusiveHint ? (
        <p className="-mt-2 text-xs text-ink-500">
          {t("product.vatInclusive")}
        </p>
      ) : null}

      {variant === "page" &&
      currentRegion?.tabbyEnabled &&
      tabbySnippet.configured &&
      total > 0 ? (
        <TabbyPromoSnippet
          price={total}
          currency={currency}
          lang={appLocale === "ar" ? "ar" : "en"}
          source="cart"
          publicKey={tabbySnippet.publicKey}
          merchantCode={tabbySnippet.merchantCode}
        />
      ) : null}

      {variant === "page" && (
        <LocalizedLink href={ROUTES.checkout} className="contents">
          <Button
            fullWidth
            size="xl"
            disabled={items.length === 0}
            trailingIcon={<ArrowRight size={16} className="rtl:-scale-x-100" />}
          >
            {t("cart.checkout")}
          </Button>
        </LocalizedLink>
      )}

      <ul className="flex flex-col gap-2 pt-1 text-xs text-ink-500">
        {/* Same-day line only when the region offers it, showing its real cutoff. */}
        {deliveryConfig?.sameDayEnabled && deliveryConfig.sameDayCutoff ? (
          <li className="inline-flex items-center gap-2">
            <TruckIcon size={14} className="text-bloom-600" />
            {t("cart.cutoff", {
              country: regionCopy.country,
              cutoff: formatCutoffTime(deliveryConfig.sameDayCutoff, locale),
            })}
          </li>
        ) : null}
        {/* COD line only when COD is available for the region. */}
        {deliveryConfig?.codEnabled !== false ? (
          <li className="inline-flex items-center gap-2">
            <ShieldIcon size={14} className="text-bloom-600" />
            {t("cart.secureCod", { country: regionCopy.country })}
          </li>
        ) : null}
      </ul>
    </aside>
  );
}
