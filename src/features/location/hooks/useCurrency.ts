"use client";

import { useQuery } from "@tanstack/react-query";
import { useAppSelector } from "@/store";
import { regionsApi } from "@/features/regions/api/regions.api";
import { queryKeys } from "@/services/queryKeys";
import { intlLocale } from "@/lib/format";
import { getCallingCode, getNationalPhoneLength, getPhoneDigitLimit } from "@/features/regions/countries";
import { useIsHydrated } from "@/hooks/useIsHydrated";

/**
 * Currency + region name for the storefront. The backend supports a per-region
 * manual price override per product (ProductRegion.price/discountedPrice) and
 * resolves `price`/`discountedPrice` to the requesting region server-side — so
 * the NUMBER already reflects the region. This hook supplies the matching
 * currency LABEL for formatting, resolved from the live `GET /regions` list
 * (same query key `CheckoutClient`/`CartSummary`/admin already use — cache-
 * shared, not a new network call in most flows) instead of a static map.
 *
 * `locale` follows the active UI language (via intlLocale) so price grouping/
 * formatting matches the rest of the localized UI. Arabic maps to
 * `ar-AE-u-nu-latn` (Latin digits, Arabic label conventions) — independent of
 * the region, which only drives the currency symbol.
 *
 * `dialCode` is the phone field's country-calling-code prefix (e.g. "+212"
 * for Morocco), derived automatically from the region's `iso2` — never a
 * manually-maintained per-region map, so a brand-new region (Pakistan,
 * Morocco, ...) gets the right prefix the moment its `iso2` is set, with no
 * extra admin step. Empty string when the region has no `iso2` set, matching
 * how the phone field showed no prefix before this existed.
 */
export function useCurrency() {
  const country = useAppSelector((s) => s.location.country);
  const uiLocale = useAppSelector((s) => s.ui.locale);
  // Server-seeded, hydration-stable currency (cookie + regions list, resolved
  // in RootLayout → StoreProvider). See location.slice.ts `currency`.
  const seededCurrency = useAppSelector((s) => s.location.currency);
  const hydrated = useIsHydrated();
  const query = useQuery({
    queryKey: queryKeys.regions.list(),
    queryFn: () => regionsApi.list(),
    staleTime: 5 * 60_000,
  });
  const region = query.data?.find((r) => r.code === country);
  // Until hydrated, use the SSR-seeded currency so the first client render is
  // byte-identical to the server HTML (the react-query cache's first-render
  // availability can differ from SSR, which was flipping the AED/SAR glyph and
  // throwing a hydration mismatch). After hydration, prefer the live lookup so
  // a client-side region switch updates the currency without a full reload;
  // both resolve the same value on a normal load, so there's no visible flash.
  const liveCurrency = region?.currency ?? seededCurrency;
  return {
    currency: hydrated ? liveCurrency : seededCurrency,
    locale: intlLocale(uiLocale),
    countryCode: country,
    countryName: region?.name ?? country,
    iso2: region?.iso2 ?? null,
    dialCode: getCallingCode(region?.iso2) ?? "",
    nationalPhoneLength: getNationalPhoneLength(region?.iso2),
    phoneDigitLimit: getPhoneDigitLimit(region?.iso2),
    // Per-region online-payment availability (drives the checkout payment selector).
    // Defaults are conservative: no online payment until the region is confirmed, but
    // both methods on once it is (matches the backend column defaults).
    onlinePaymentEnabled: region?.onlinePaymentEnabled ?? false,
    applePayEnabled: region?.applePayEnabled ?? true,
    cardPaymentEnabled: region?.cardPaymentEnabled ?? true,
  };
}
