import { DirhamSign, RiyalSign } from "@/components/icons";
import { formatAmount } from "@/lib/format";

const CURRENCY_ICONS: Record<string, typeof DirhamSign> = {
  AED: DirhamSign,
  SAR: RiyalSign,
};

interface CurrencyAmountProps {
  amount: number;
  currency?: string;
  locale?: string;
  className?: string;
}

/**
 * Visual price display: the official AED/SAR currency sign (see
 * src/components/icons/index.tsx) followed by the formatted number — for any
 * currency without a traced sign, falls back to the plain ISO code as text.
 * Use this for JSX/visual price displays; use formatCurrency() from
 * @/lib/format for text-only contexts (toasts, i18n vars, title attributes).
 */
export function CurrencyAmount({
  amount,
  currency = "AED",
  locale = "en-AE",
  className,
}: CurrencyAmountProps) {
  const Icon = CURRENCY_ICONS[currency];
  return (
    <span className={className}>
      {Icon ? (
        // Size the glyph to the font's exact cap height (`1cap`) with auto width, so its
        // visual height matches the digits regardless of the sign's viewBox aspect ratio
        // — AED's Dirham mark is wider than tall, so a square box (the old size="0.68em")
        // shrank its height ~13% and it read as smaller than the price. `verticalAlign:
        // baseline` sits it on the text baseline like the digits. The `size` attribute is
        // a fallback height for the rare browser without `cap`-unit support.
        <Icon
          size="0.82em"
          // Stamped so the PDF capture can swap the glyph for its ISO code — see
          // useTextCurrencySigns() in features/orders/receiptPdf.ts.
          data-currency-sign={currency}
          style={{
            height: "1cap",
            width: "auto",
            marginInlineEnd: "0.12em",
            verticalAlign: "baseline",
          }}
        />
      ) : (
        `${currency} `
      )}
      {formatAmount(amount, locale)}
    </span>
  );
}
