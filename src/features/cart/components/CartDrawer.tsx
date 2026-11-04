"use client";

import { useQuery } from "@tanstack/react-query";
import { LocalizedLink } from "@/components/ui/LocalizedLink";
import { m, AnimatePresence } from "motion/react";
import { Button, Drawer, Divider, CurrencyAmount } from "@/components/ui";
import { ArrowRight, BagIcon } from "@/components/icons";
import { CartLineItem } from "./CartLineItem";
import { cartLineKey } from "@/features/cart/variantKey";
import { OrderDeliveryNote, maxCartLeadDays } from "./OrderDeliveryNote";
import { usePublicVat } from "@/features/vat/hooks/usePublicVat";
import { vatHint } from "@/features/vat/vatDisplay";
import { useCartCashTotals } from "@/features/cash-arrangement/hooks/useCartCashTotals";
import { deliveryConfigApi } from "@/features/delivery-config/api/delivery-config.api";
import { queryKeys } from "@/services/queryKeys";
import { microTransition } from "@/lib/motion";
import { ROUTES } from "@/constants/routes";
import { useCurrency } from "@/features/location/hooks/useCurrency";
import { useAppDispatch, useAppSelector } from "@/store";
import { toggleCartDrawer } from "@/store/slices/ui.slice";
import { useT } from "@/i18n/useT";

export function CartDrawer() {
  const dispatch = useAppDispatch();
  const { t, tc } = useT();
  const open = useAppSelector((s) => s.ui.isCartDrawerOpen);
  const items = useAppSelector((s) => s.cart.items);
  const close = () => dispatch(toggleCartDrawer(false));
  const itemCount = items.reduce((s, i) => s + i.quantity, 0);
  const productSubtotal = items.reduce(
    (s, i) => s + i.unitPrice * i.quantity,
    0
  );
  // The drawer's "Subtotal" is the only figure shown before Checkout, so it must
  // include each line's cash arrangement (raw amount + service fee) too — not just
  // product prices — or it understates what the shopper is actually about to pay.
  const { cashRawTotal, cashFeeTotal } = useCartCashTotals(items);
  const subtotal = productSubtotal + cashRawTotal + cashFeeTotal;
  const orderLeadDays = maxCartLeadDays(items);
  const { currency, locale, countryCode: regionCode } = useCurrency();
  const deliveryConfigQuery = useQuery({
    queryKey: queryKeys.deliveryConfig.resolve(regionCode, undefined, undefined),
    queryFn: () => deliveryConfigApi.get({ region: regionCode }),
    enabled: Boolean(regionCode) && open && orderLeadDays != null,
    staleTime: 60_000,
  });
  const deliveryLeadDaysMax = deliveryConfigQuery.data?.standardLeadDaysMax ?? null;
  // Only the plain "VAT Inclusive" label previews here — the exclusive
  // "+ VAT" addition is reserved for the shop grid and the real amount
  // on checkout, not repeated in the drawer.
  const showVatInclusiveHint = vatHint(usePublicVat())?.kind === "inclusive";

  return (
    <Drawer
      open={open}
      onClose={close}
      title={t("cart.title")}
      description={
        items.length > 0
          ? tc(itemCount, "units.itemOne", "units.itemOther")
          : t("cart.momentTagline")
      }
      width="max-w-md"
    >
      {items.length === 0 ? (
        <EmptyCart onContinue={close} />
      ) : (
        <div className="flex h-full flex-col">
          <div className="flex flex-1 flex-col gap-5 px-6 py-5">
            <AnimatePresence initial={false}>
              {items.map((item) => (
                <CartLineItem
                  key={cartLineKey(item.productId, item.variantKey)}
                  item={item}
                  onNavigate={close}
                />
              ))}
            </AnimatePresence>
          </div>

          <footer className="border-t border-ink-100 bg-cream-50 px-6 py-5">
            {orderLeadDays != null && (
              <OrderDeliveryNote
                days={orderLeadDays}
                daysMax={deliveryLeadDaysMax}
                className="mb-4"
              />
            )}
            <div className="flex items-baseline justify-between">
              <span className="text-sm text-ink-600">{t("common.subtotal")}</span>
              <m.span
                key={subtotal}
                initial={{ opacity: 0, y: -4 }}
                animate={{ opacity: 1, y: 0 }}
                transition={microTransition}
                className="font-display text-xl font-medium tabular-nums text-ink-900"
              >
                <CurrencyAmount amount={subtotal} currency={currency} locale={locale} />
              </m.span>
            </div>
            {showVatInclusiveHint ? (
              <p className="mt-1 text-xs text-ink-500">
                {t("product.vatInclusive")}
              </p>
            ) : null}
            <div className="mt-4 flex flex-col gap-2">
              <LocalizedLink
                href={ROUTES.checkout}
                onClick={close}
                className="contents"
              >
                <Button
                  fullWidth
                  size="lg"
                  trailingIcon={<ArrowRight size={16} className="rtl:-scale-x-100" />}
                >
                  {t("checkout.title")}
                </Button>
              </LocalizedLink>
              <LocalizedLink href={ROUTES.cart} onClick={close} className="contents">
                <Button fullWidth size="lg" variant="outline">
                  {t("common.viewFullCart")}
                </Button>
              </LocalizedLink>
            </div>
          </footer>
        </div>
      )}
    </Drawer>
  );
}

function EmptyCart({ onContinue }: { onContinue: () => void }) {
  const { t } = useT();
  return (
    <div className="flex flex-1 flex-col items-center justify-center gap-5 px-6 py-12 text-center">
      <span className="inline-flex h-16 w-16 items-center justify-center rounded-full bg-blush-100 text-bloom-700">
        <BagIcon size={28} />
      </span>
      <div>
        <h3 className="font-display text-xl text-ink-900">{t("cart.empty")}</h3>
        <p className="mt-2 max-w-xs text-sm text-ink-500">
          {t("cart.emptyBody")}
        </p>
      </div>
      <Divider />
      <LocalizedLink href={ROUTES.shop} onClick={onContinue} className="contents">
        <Button size="lg" trailingIcon={<ArrowRight size={16} className="rtl:-scale-x-100" />}>
          {t("common.browseBoutique")}
        </Button>
      </LocalizedLink>
    </div>
  );
}
