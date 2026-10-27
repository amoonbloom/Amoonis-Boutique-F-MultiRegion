"use client";

import { TabbyPromoSnippet } from "@/components/checkout/TabbyPromoSnippet";
import { getTabbySnippetConfig } from "@/config/tabbyPublic";
import { useCurrency } from "@/features/location/hooks/useCurrency";
import { useT } from "@/i18n/useT";
import type { Product } from "../types";
import { usePdpImage } from "./PdpImageContext";

/** Tabby product snippet — must sit directly under the price (Tabby QA). */
export function ProductTabbyPromo({ product }: { product: Product }) {
  const { locale: appLocale } = useT();
  const { currency, tabbyEnabled } = useCurrency();
  const tabbySnippet = getTabbySnippetConfig();
  const { activeVariant } = usePdpImage();

  const unitPrice = activeVariant
    ? activeVariant.discountedPrice != null &&
      activeVariant.discountedPrice < activeVariant.price
      ? activeVariant.discountedPrice
      : activeVariant.price
    : product.price.amount;

  if (!tabbyEnabled || !tabbySnippet.configured || unitPrice <= 0) return null;

  return (
    <TabbyPromoSnippet
      price={unitPrice}
      currency={currency}
      lang={appLocale === "ar" ? "ar" : "en"}
      source="product"
      publicKey={tabbySnippet.publicKey}
      merchantCode={tabbySnippet.merchantCode}
      className="mt-3 w-full min-w-[280px]"
    />
  );
}
