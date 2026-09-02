"use client";

import { LocalizedLink } from "@/components/ui/LocalizedLink";
import { useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import {
  Badge,
  Container,
  Section,
  Input,
  Textarea,
  Button,
  Divider,
  Card,
  CurrencyAmount,
  Menu,
  MenuTrigger,
  MenuContent,
  MenuItem,
} from "@/components/ui";
import { PhoneDialCode } from "@/components/ui/PhoneDialCode";
import { Spinner } from "@/components/ui/Loader";
import { SelectedOptions } from "@/features/products/components/SelectedOptions";
import { cartLineKey } from "@/features/cart/variantKey";
import {
  ChevronRight,
  ChevronDown,
  CheckIcon,
} from "@/components/icons";
import { cartApi } from "@/features/cart/api/cart.api";
import { addressesApi } from "@/features/addresses/api/addresses.api";
import { ordersApi } from "@/features/orders/api/orders.api";
import { promoCodesApi } from "@/features/promo-codes/api/promo-codes.api";
import { vatApi } from "@/features/vat/api/vat.api";
import { cashArrangementApi } from "@/features/cash-arrangement/api/cash-arrangement.api";
import { computeCashArrangementFee } from "@/features/cash-arrangement/cashArrangementFee";
import {
  CashArrangementSummary,
  type CashArrangementSummaryProps,
} from "./CashArrangementSummary";
import { regionsApi } from "@/features/regions/api/regions.api";
import { deliveryZonesApi } from "@/features/delivery-zones/api/delivery-zones.api";
import { deliveryConfigApi } from "@/features/delivery-config/api/delivery-config.api";
import { queryKeys } from "@/services/queryKeys";
import { useCart } from "@/features/cart/hooks/useCart";
import { DeliveryDatePicker } from "./DeliveryDatePicker";
import { useCurrency } from "@/features/location/hooks/useCurrency";
import { stripKnownCallingCode } from "@/features/regions/countries";
import { ROUTES } from "@/constants/routes";
import { useLocalizedHref } from "@/features/location/useLocalizedHref";
import { STORAGE_KEYS } from "@/constants/storage-keys";
import { storage } from "@/lib/storage";
import { cn } from "@/lib/cn";
import {
  PHONE_LTR_CLASS,
  formatPhoneDigitsForDisplay,
  handlePhoneInputChange,
  handlePhoneKeyDown,
  normalizePhoneDigits,
  phoneNumberSchema,
} from "@/lib/phoneInput";
import { useIsHydrated } from "@/hooks/useIsHydrated";
import { useToast } from "@/hooks/useToast";
import { ApiError } from "@/services/http";
import { formatCurrency, formatDayCount } from "@/lib/format";
import {
  addDaysToKey,
  daysBetweenKeys,
  nextDeliverableKey,
} from "@/lib/deliveryDate";
import { useAppSelector } from "@/store";
import { useT } from "@/i18n/useT";
import type { MessageKey } from "@/i18n";
import type { ApiAddress } from "@/features/addresses/types";
import type { ApiPromoValidationResult } from "@/features/promo-codes/types";
import type { ResolvedDeliveryConfig } from "@/features/delivery-config/types";
import { localizedName } from "@/features/location/localizedName";

type TranslateFn = (
  key: MessageKey,
  vars?: Record<string, string | number>
) => string;

function round2(n: number) {
  return Math.round((n + Number.EPSILON) * 100) / 100;
}

// The backend validates Scheduled Delivery's day boundary against the business's
// operating timezone (Asia/Dubai — see order.service.js's BUSINESS_TIMEZONE), not the
// customer's own device timezone. If this picker's min/max were computed from the
// browser's local midnight instead, a customer in a different timezone (e.g. Riyadh,
// one hour behind Dubai) could see a "valid" time near midnight that the backend then
// rejects as still today. Mirroring the same Dubai-anchored boundary here keeps both
// sides in agreement.
const BUSINESS_TIMEZONE = "Asia/Dubai";

// Mirrors order.service.js SCHEDULED_DELIVERY_MAX_WINDOW_DAYS — the furthest out a
// scheduled delivery may be booked. The scheduled window's minimum is clamped to this,
// so a region with a very long standardDeliveryDays (validated up to 90) can never push
// the calendar's earliest selectable day past its latest — which would otherwise leave
// zero selectable days and a date the backend would reject anyway.
const SCHEDULED_MAX_WINDOW_DAYS = 60;

/** The UTC offset (in minutes) of `timeZone` at instant `date`, via Intl. */
function tzOffsetMinutes(date: Date, timeZone: string): number {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone,
    hourCycle: "h23",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  })
    .formatToParts(date)
    .reduce<Record<string, number>>((acc, p) => {
      if (p.type !== "literal") acc[p.type] = Number(p.value);
      return acc;
    }, {});
  const asUTC = Date.UTC(
    parts.year,
    parts.month - 1,
    parts.day,
    parts.hour,
    parts.minute,
    parts.second
  );
  return (asUTC - date.getTime()) / 60000;
}

/** The BUSINESS_TIMEZONE (Dubai) wall-calendar day, `daysFromNow` days out, as a
 *  "YYYY-MM-DD" string. Used to bound DeliveryDatePicker so its selectable window is
 *  Dubai-anchored end-to-end — the picker compares plain date keys, so this stays
 *  correct no matter what timezone the customer's own device is in (the earlier native
 *  <input type="datetime-local"> min/max were read through local getters and drifted a
 *  day for any browser west of Dubai, e.g. the live Riyadh region). */
function businessDateKey(daysFromNow: number): string {
  const now = new Date();
  const offsetMin = tzOffsetMinutes(now, BUSINESS_TIMEZONE);
  const zonedNow = new Date(now.getTime() + offsetMin * 60000);
  // Normalize via UTC arithmetic so month/year roll over correctly.
  const d = new Date(
    Date.UTC(zonedNow.getUTCFullYear(), zonedNow.getUTCMonth(), zonedNow.getUTCDate() + daysFromNow)
  );
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getUTCFullYear()}-${pad(d.getUTCMonth() + 1)}-${pad(d.getUTCDate())}`;
}

// The delivery region's dial code (e.g. "+212" for Morocco) is derived
// automatically from its `iso2` by useCurrency() — never a hand-maintained
// per-region map, so a brand-new region gets the right prefix immediately.
// Combined with the typed digits into one E.164-ish string sent to the
// existing `phone` field (no backend schema change).
//
// The profile's saved phone (used to prefill this field) is already a full
// E.164 string (e.g. "+212612345678") — strip any RECOGNIZED dial code
// before prefilling so submit doesn't double-prefix it into
// "+212+212612345678". Uses the full known-code table (not just the
// customer's current region) since the number may have been saved under a
// different region than the one being viewed now.
const stripDialCode = stripKnownCallingCode;

const makeNewAddressSchema = (
  t: TranslateFn,
  zoneRequired: boolean,
  nationalPhoneLength: number | null
) =>
  z.object({
    fullName: z.string().min(1, t("validation.required")),
    area: z.string().min(1, t("validation.required")),
    deliveryZoneId: zoneRequired
      ? z.string().min(1, t("validation.required"))
      : z.string().optional(),
    phone: phoneNumberSchema(t, nationalPhoneLength),
    // Guests only (optional): enables the receipt email + links the order on
    // sign-up. Empty string is allowed; a non-empty value must be a valid email.
    email: z
      .string()
      .email(t("validation.email"))
      .optional()
      .or(z.literal("")),
  });

type NewAddressValues = z.infer<ReturnType<typeof makeNewAddressSchema>>;

export function CheckoutClient() {
  const router = useRouter();
  const localize = useLocalizedHref();
  const toast = useToast();
  const queryClient = useQueryClient();
  const cart = useCart();
  const user = useAppSelector((s) => s.auth.user);
  const isAuthed = useAppSelector((s) => s.auth.status === "authenticated");
  const hydrated = useIsHydrated();
  // A returning customer has a token in storage but auth may still be hydrating
  // (AuthHydrator re-fetches the profile on load). Hold the checkout until that
  // resolves so we don't flash the guest form at a logged-in user. Guests (no
  // token) fall straight through to the guest flow.
  const authHydrating =
    hydrated && !isAuthed && Boolean(storage.get<string>(STORAGE_KEYS.authToken));
  const { currency, locale, countryName, countryCode, dialCode, phoneDigitLimit, nationalPhoneLength } = useCurrency();
  const regionCode = countryCode;
  // The city/emirate the customer already picked in the header's "Deliver to"
  // selector (a delivery zone's `name` — see location.slice.ts) — prefilled
  // into the checkout zone dropdown below instead of forcing a re-pick.
  const selectedCity = useAppSelector((s) => s.location.city);
  const { t, tc } = useT();

  const [explicitSelection, setExplicitSelection] = useState<
    string | "new" | null
  >(null);
  const [orderMessage, setOrderMessage] = useState("");
  const [couponOpen, setCouponOpen] = useState(false);
  const [promoCode, setPromoCode] = useState("");
  const [promoResult, setPromoResult] =
    useState<ApiPromoValidationResult | null>(null);
  const [promoError, setPromoError] = useState<string | null>(null);
  const [submitError, setSubmitError] = useState<string | null>(null);
  // Set the instant an order succeeds, before cart.clear() fires — cart.clear()
  // re-renders this page with an empty cart on the same tick that router.push()
  // starts its (async) client-side transition to /order/success, so without this
  // flag the empty-cart guard below flashes for a frame while the transition
  // finishes.
  const [orderPlaced, setOrderPlaced] = useState(false);
  // "Add cash arrangement" is now chosen PER ITEM on the product page and rides on each cart
  // line; checkout only READS it (read-only summary) and submits it (guests inline; signed-in
  // users' cash is already on the server cart).
  const [deliveryType, setDeliveryType] = useState<"STANDARD" | "SCHEDULED">("STANDARD");
  // Date-only "YYYY-MM-DD" from DeliveryDatePicker (or "" for no selection) — the
  // business only ever needs a day, not a time-of-day; converted to a UTC ISO
  // datetime (fixed local noon) only at submit time, see placeOrderMutation below.
  const [scheduledDeliveryAt, setScheduledDeliveryAt] = useState("");

  // Saved addresses are an authenticated-only feature (GET /user/addresses).
  // Guests always use the inline form.
  const addressesQuery = useQuery({
    queryKey: queryKeys.addresses.list(),
    queryFn: () => addressesApi.list(),
    enabled: isAuthed,
  });

  const defaultAddressId: string | "new" | null = (() => {
    if (!isAuthed) return "new";
    if (!addressesQuery.data) return null;
    // Only offer addresses that belong to the region being shopped — a saved UAE
    // address isn't a valid default while checking out in KSA. None in-region →
    // start on the "new address" form.
    const inRegion = addressesQuery.data.filter((a) => isAddressInRegion(a, regionCode));
    if (inRegion.length === 0) return "new";
    const def = inRegion.find((a) => a.isDefault) ?? inRegion[0];
    return def.id;
  })();

  // Guests can only ever use the inline "new address" form. For authed users, an
  // explicit pick is honoured only while it's still in-region — switching region
  // after selecting an address drops back to the in-region default so a
  // wrong-region address can never stay selected.
  const selectedAddressId = isAuthed
    ? (() => {
        if (explicitSelection == null) return defaultAddressId;
        if (explicitSelection === "new") return "new";
        const picked = addressesQuery.data?.find((a) => a.id === explicitSelection);
        return picked && isAddressInRegion(picked, regionCode)
          ? explicitSelection
          : defaultAddressId;
      })()
    : "new";

  // The Emirate-style dropdown, scoped to the current delivery region. A
  // region may legitimately have zero zones configured — the field is then
  // skipped entirely rather than blocking checkout on an empty required select.
  const zonesQuery = useQuery({
    queryKey: queryKeys.deliveryZones.list(regionCode),
    queryFn: () => deliveryZonesApi.list(regionCode),
    enabled: Boolean(regionCode),
  });
  const zones = zonesQuery.data ?? [];
  const zoneRequired = !zonesQuery.isPending && zones.length > 0;

  const newAddressSchema = useMemo(
    () => makeNewAddressSchema(t, zoneRequired, nationalPhoneLength),
    [t, zoneRequired, nationalPhoneLength]
  );

  const {
    register: regNewAddr,
    formState: { errors: newAddrErrors },
    getValues: getNewAddrValues,
    trigger: triggerNewAddr,
    setValue: setNewAddrValue,
    watch: watchNewAddr,
  } = useForm<NewAddressValues>({
    resolver: zodResolver(newAddressSchema),
    defaultValues: {
      fullName: user
        ? `${user.firstName ?? ""} ${user.lastName ?? ""}`.trim()
        : "",
      area: "",
      deliveryZoneId: "",
      phone: stripDialCode(user?.phone),
      email: user?.email ?? "",
    },
  });

  // Prefill the zone dropdown from the city the customer already chose in the header's
  // "Deliver to" selector, and clear a stale zone when the delivery region changes.
  // Guarded by a per-region ref so it runs EXACTLY ONCE per region and only fills an
  // EMPTY field — a React Query background refetch (which hands `zonesQuery.data` a new
  // reference) must never silently wipe a zone the customer manually picked.
  const prefilledZoneForRegion = useRef<string | null>(null);
  useEffect(() => {
    // Region switched since we last prefilled: the old zone id belongs to the previous
    // region and would be rejected at checkout — drop it and allow a fresh prefill.
    if (
      prefilledZoneForRegion.current !== null &&
      prefilledZoneForRegion.current !== regionCode
    ) {
      setNewAddrValue("deliveryZoneId", "");
      prefilledZoneForRegion.current = null;
    }
    const currentZones = zonesQuery.data ?? [];
    if (currentZones.length > 0 && prefilledZoneForRegion.current !== regionCode) {
      // Only prefill if the user hasn't already chosen a zone this session.
      if (!getNewAddrValues().deliveryZoneId) {
        const matched = currentZones.find((z) => z.name === selectedCity)?.id;
        if (matched) setNewAddrValue("deliveryZoneId", matched);
      }
      prefilledZoneForRegion.current = regionCode;
    }
  }, [regionCode, zonesQuery.data, selectedCity, setNewAddrValue, getNewAddrValues]);

  const zoneValue = watchNewAddr("deliveryZoneId") ?? "";
  const onZoneChange = (id: string) =>
    setNewAddrValue("deliveryZoneId", id, { shouldValidate: true });

  const validatePromo = useMutation({
    mutationFn: (code: string) =>
      promoCodesApi.validate({
        code: code.trim(),
        items: cart.items.map((i) => ({
          productId: i.productId,
          quantity: i.quantity,
          selectedOptions: i.selectedOptions ?? undefined,
        })),
      }),
    onSuccess: (result) => {
      // A resolved validate call means the code is valid and applied — the
      // backend 400/404s (→ onError) with the reason when it isn't.
      setPromoResult(result);
      setPromoError(null);
      toast.success({
        title: t("checkout.promoApplied"),
        description: t("checkout.promoAppliedAmount", {
          amount: formatCurrency(result.discountAmount, currency, locale),
        }),
      });
    },
    onError: (err) => {
      setPromoResult(null);
      // Surface the backend's specific reason (min order not met, expired,
      // new-users-only, per-user limit, …) rather than a generic message.
      setPromoError(
        err instanceof ApiError ? err.message : t("checkout.promoError")
      );
    },
  });

  const subtotal = cart.subtotal;
  const discount = promoResult?.discountAmount ?? 0;

  // Flat shipping fee for the current delivery region — mirrors the same
  // subtotal→discount→VAT→shipping pipeline order.service.js computes
  // server-side, so this preview matches the real order total exactly.
  const regionsQuery = useQuery({
    queryKey: queryKeys.regions.list(),
    queryFn: () => regionsApi.list(),
  });
  const currentRegion = regionsQuery.data?.find((r) => r.code === regionCode);

  // The delivery zone that actually governs this order: the inline "new address"
  // form's picked zone, or the saved address's own zone when one is selected.
  const activeZoneId: string | undefined = (() => {
    if (selectedAddressId === "new") return zoneValue || undefined;
    const picked = addressesQuery.data?.find((a) => a.id === selectedAddressId);
    return picked?.deliveryZoneId ?? undefined;
  })();

  // Fully-resolved (zone→region→default) delivery config for the active area,
  // priced for the current subtotal. The backend is authoritative; this drives
  // the fee, gates, date/slot picker and copy. Refetches when zone/subtotal change.
  const deliveryConfigQuery = useQuery({
    queryKey: queryKeys.deliveryConfig.resolve(regionCode, activeZoneId, subtotal),
    queryFn: () =>
      deliveryConfigApi.get({ region: regionCode, zoneId: activeZoneId, subtotal }),
    enabled: Boolean(regionCode),
  });
  const deliveryConfig = deliveryConfigQuery.data;

  // Prefer the resolved effective fee once loaded (0 → shown as FREE). Fall back to
  // the region flat rate only while the config is still loading.
  const shipping =
    deliveryConfig != null
      ? deliveryConfig.effectiveFee
      : currentRegion?.shippingFlatRate != null
        ? Number(currentRegion.shippingFlatRate)
        : 0;

  // --- Delivery gates (all authoritative on the backend; mirrored here for UX) ---
  // Never block purely because the config hasn't loaded — every gate reads a loaded
  // value and stays false while `deliveryConfig` is undefined.
  const codUnavailable = deliveryConfig?.codEnabled === false;
  const minOrderAmount = deliveryConfig?.minOrderAmount ?? null;
  const maxOrderAmount = deliveryConfig?.maxOrderAmount ?? null;
  const belowMinOrder = minOrderAmount != null && subtotal < minOrderAmount;
  const aboveMaxOrder = maxOrderAmount != null && subtotal > maxOrderAmount;

  // Online payment (MyFatoorah). Offered — to signed-in customers AND guests — in a region
  // that has it enabled with at least one method. The redirect flow shows Apple Pay (on
  // iPhone/Safari) + cards on MyFatoorah's page. Guests pay via the public guest-pay endpoint.
  const onlinePayAvailable =
    Boolean(currentRegion?.onlinePaymentEnabled) &&
    (Boolean(currentRegion?.applePayEnabled) || Boolean(currentRegion?.cardPaymentEnabled));
  const [paymentMethod, setPaymentMethod] = useState<"COD" | "MYFATOORAH">("COD");
  // Effective method: fall back to COD whenever online isn't available, so a stale
  // "MYFATOORAH" selection (e.g. after switching to a region without it) can't leak through.
  const payingOnline = onlinePayAvailable && paymentMethod === "MYFATOORAH";

  // COD unavailability only blocks a COD order — an online payment is unaffected by it.
  const placeOrderBlocked =
    (!payingOnline && codUnavailable) || belowMinOrder || aboveMaxOrder;

  // Keep the selected method valid as region / COD availability changes: force COD when
  // online isn't available, and auto-pick online when COD is the only thing turned off
  // (so the customer is never stuck with an unselectable, blocked order).
  useEffect(() => {
    if (!onlinePayAvailable && paymentMethod !== "COD") setPaymentMethod("COD");
    else if (onlinePayAvailable && codUnavailable && paymentMethod === "COD")
      setPaymentMethod("MYFATOORAH");
  }, [onlinePayAvailable, codUnavailable, paymentMethod]);

  // VAT preview for the current region. The public endpoint intentionally omits the
  // SPECIFIC_PRODUCTS/SPECIFIC_CATEGORIES scope lists (that's catalog-scoping data, not
  // something the storefront needs), so an exact preview is only possible for ALL_PRODUCTS —
  // the common case. For a scoped config we show a disclaimer instead of guessing a number;
  // the order response after placing it always has the server-trusted, exact breakdown.
  const vatQuery = useQuery({
    queryKey: queryKeys.vat.public(),
    queryFn: () => vatApi.getPublic(),
    staleTime: 5 * 60_000,
  });
  const vatConfig = vatQuery.data;
  const vatKnownScope = vatConfig?.appliesTo === "ALL_PRODUCTS";
  const vatActive = Boolean(vatConfig?.enabled && vatConfig.ratePercent > 0);
  const taxableNet = Math.max(0, subtotal - discount);
  const vatAmount =
    vatActive && vatKnownScope
      ? vatConfig!.inclusive
        ? round2(taxableNet - taxableNet / (1 + vatConfig!.ratePercent / 100))
        : round2(taxableNet * (vatConfig!.ratePercent / 100))
      : 0;
  const vatAdds = vatActive && vatKnownScope && !vatConfig!.inclusive && vatAmount > 0;
  const vatUncertain = vatActive && !vatKnownScope;
  // Shipping is a FLAT, VAT-INCLUSIVE charge (mirrors the live client site + backend
  // order.service.js): the delivery fee is the final amount — VAT is never added on top and
  // never broken out. The Shipment line is labelled "(flat rate and VAT inclusive)" instead.

  // "Add cash arrangement" — resolve eligibility + fee schedule for the current cart/zone,
  // same tier as deliveryConfigQuery/vatQuery above. POST because cartLines is an array
  // body (mirrors POST /promo-codes/validate), but this is a plain useQuery (idempotent,
  // cart/zone-derived read), not a useMutation — unlike promo's explicit "Apply" click,
  // this is automatically derived from cart state, so it should refetch whenever that
  // cart/zone/region key changes, exactly like deliveryConfigQuery does.
  const cartProductIds = useMemo(
    () => Array.from(new Set(cart.items.map((i) => i.productId))).sort(),
    [cart.items]
  );
  const cashArrangementQuery = useQuery({
    queryKey: queryKeys.cashArrangement.resolve(regionCode, activeZoneId, cartProductIds),
    queryFn: () =>
      cashArrangementApi.resolve({
        zoneId: activeZoneId,
        cartLines: cartProductIds.map((productId) => ({ productId })),
      }),
    enabled: Boolean(regionCode) && cartProductIds.length > 0,
  });
  const cashArrangementConfig = cashArrangementQuery.data;

  // Cash arrangement is PER LINE (chosen on the product page, riding on each cart line).
  // Resolve gives each product's own fee schedule (`lines`); price every cart line that
  // carries cash. VAT on the fee uses the SAME vatConfig/vatKnownScope gate as the rest of
  // the order. Whether the fee's VAT is ADDED (exclusive) vs already-inside (inclusive) is
  // order-level, so compute it once.
  const cashScheduleByProduct = new Map(
    (cashArrangementConfig?.lines ?? []).map((l) => [l.productId, l])
  );
  const cashFeeVatAdds = Boolean(vatActive && vatKnownScope && !vatConfig?.inclusive);
  const cashLines = cart.items
    .filter((it) => it.cashArrangement && it.cashArrangement.cashAmount > 0)
    .map((it) => {
      const cash = it.cashArrangement!;
      const sched = cashScheduleByProduct.get(it.productId);
      const eligible = Boolean(
        sched && sched.eligible && sched.feeStepAmount != null && sched.feeMarginPercent != null
      );
      const feePerUnit = eligible
        ? computeCashArrangementFee(cash.cashAmount, {
            feeStepAmount: sched!.feeStepAmount!,
            feeMarginPercent: sched!.feeMarginPercent!,
          })
        : 0;
      const feeVatPerUnit =
        vatActive && vatKnownScope && feePerUnit > 0
          ? vatConfig!.inclusive
            ? round2(feePerUnit - feePerUnit / (1 + vatConfig!.ratePercent / 100))
            : round2(feePerUnit * (vatConfig!.ratePercent / 100))
          : 0;
      return {
        key: `${it.productId}::${it.variantKey}`,
        title: it.title,
        quantity: it.quantity,
        cashAmount: cash.cashAmount,
        denomination: cash.denomination,
        note: cash.note,
        eligible,
        feePerUnit,
        feeVatPerUnit,
      };
    });
  const hasCashLines = cashLines.length > 0;
  // Order-level roll-ups for the total (per-unit × qty across eligible cash lines).
  const cashRawTotal = round2(
    cashLines.reduce((s, l) => s + (l.eligible ? l.cashAmount * l.quantity : 0), 0)
  );
  const cashFeeTotal = round2(cashLines.reduce((s, l) => s + l.feePerUnit * l.quantity, 0));
  const cashFeeVatTotal = round2(cashLines.reduce((s, l) => s + l.feeVatPerUnit * l.quantity, 0));

  const total =
    taxableNet +
    (vatAdds ? vatAmount : 0) +
    // Shipping is flat + VAT-inclusive: added as-is, never taxed on top.
    shipping +
    cashFeeTotal +
    (cashFeeVatAdds ? cashFeeVatTotal : 0) +
    // Raw cash amount is added to the total but NEVER passed through VAT.
    cashRawTotal;

  const syncCart = async () => {
    if (cart.items.length === 0) throw new Error(t("checkout.cartEmptyError"));
    await cartApi.clear();
    // Safe to run concurrently: clear() above guarantees the server cart
    // exists and is empty, so each add() below targets a distinct product —
    // no shared row for the requests to race on.
    await Promise.all(
      cart.items.map((item) =>
        cartApi.add({
          productId: item.productId,
          quantity: item.quantity,
          message: item.message ?? undefined,
          selectedOptions: item.selectedOptions ?? undefined,
          giftCardSelected: item.giftCardSelected,
          customName: item.customName ?? undefined,
          cashArrangement: item.cashArrangement
            ? {
                cashAmount: item.cashArrangement.cashAmount,
                denomination: item.cashArrangement.denomination ?? undefined,
                note: item.cashArrangement.note || undefined,
              }
            : undefined,
        })
      )
    );
    if (orderMessage.trim()) {
      await cartApi.setOrderMessage(orderMessage.trim());
    }
  };

  const placeOrderMutation = useMutation({
    mutationFn: async () => {
      if (deliveryType === "SCHEDULED" && !scheduledDeliveryAt) {
        throw new Error(t("checkout.chooseDeliveryDateError"));
      }
      // Delivery-config gates (backend re-validates all of these authoritatively).
      // COD unavailability only blocks a COD order — an online payment is unaffected.
      if (!payingOnline && codUnavailable) throw new Error(t("checkout.codUnavailable"));
      if (belowMinOrder) {
        throw new Error(
          t("checkout.minOrderError", {
            amount: formatCurrency(minOrderAmount!, currency, locale),
          })
        );
      }
      if (aboveMaxOrder) {
        throw new Error(
          t("checkout.maxOrderError", {
            amount: formatCurrency(maxOrderAmount!, currency, locale),
          })
        );
      }
      // Only a date is collected (no time-of-day input) — pin it to noon UTC so the
      // resulting instant safely sits within the same calendar day in any timezone
      // the backend's BUSINESS_TIMEZONE day-boundary check might use, rather than
      // relying on implicit UTC-midnight parsing of a bare "YYYY-MM-DD" string.
      const scheduledDeliveryAtIso =
        deliveryType === "SCHEDULED"
          ? new Date(`${scheduledDeliveryAt}T12:00:00Z`).toISOString()
          : undefined;

      let resolvedAddressId: string | undefined;
      let inlineAddress: NewAddressValues | undefined;

      if (selectedAddressId === "new") {
        const ok = await triggerNewAddr();
        if (!ok) throw new Error(t("checkout.completeAddress"));
        inlineAddress = getNewAddrValues();
      } else if (selectedAddressId) {
        resolvedAddressId = selectedAddressId;
      } else {
        throw new Error(t("checkout.chooseAddress"));
      }

      const shippingAddress = inlineAddress
        ? {
            fullName: inlineAddress.fullName,
            // Strip the spaces/dashes the input allows for readability — the
            // stored value should be one clean digit string, not "+97150 123-4567".
            phone: `${dialCode}${normalizePhoneDigits(inlineAddress.phone).replace(/[\s-]/g, "")}`,
            area: inlineAddress.area,
            deliveryZoneId: inlineAddress.deliveryZoneId || undefined,
          }
        : undefined;

      // Cash arrangement is PER LINE now — it rides on each cart line (chosen on the product
      // page). The backend re-resolves eligibility + fee authoritatively at order time, so no
      // pre-submit re-check is needed here.
      if (!isAuthed) {
        // Guest: no server cart — send the local cart items inline (each with its own cash). COD only.
        if (cart.items.length === 0) throw new Error(t("checkout.cartEmptyError"));
        const guestOrder = await ordersApi.guestCheckout({
          items: cart.items.map((i) => ({
            productId: i.productId,
            quantity: i.quantity,
            message: i.message ?? null,
            selectedOptions: i.selectedOptions ?? undefined,
            giftCardSelected: i.giftCardSelected,
            customName: i.customName ?? undefined,
            cashArrangement: i.cashArrangement
              ? {
                  cashAmount: i.cashArrangement.cashAmount,
                  denomination: i.cashArrangement.denomination ?? undefined,
                  note: i.cashArrangement.note || undefined,
                }
              : undefined,
          })),
          // Guests always fill the inline form, so shippingAddress is defined.
          shippingAddress: shippingAddress!,
          email: inlineAddress?.email?.trim() || undefined,
          orderMessage: orderMessage.trim() || undefined,
          promoCode: promoResult ? promoCode.trim() : undefined,
          deliveryType,
          scheduledDeliveryAt: scheduledDeliveryAtIso,
          paymentMethod: payingOnline ? "MYFATOORAH" : "COD",
        });
        // Online guest order: get the MyFatoorah hosted-page URL via the public guest-pay
        // endpoint; onSuccess hands the browser off to it. The return URL carries ?guest=1 so
        // the browser comes back to the guest success page after paying.
        if (payingOnline) {
          const returnUrl = `${window.location.origin}${localize(ROUTES.orderSuccess)}?guest=1`;
          const { paymentUrl } = await ordersApi.guestPay(guestOrder.id, { returnUrl });
          return { order: guestOrder, paymentUrl };
        }
        return { order: guestOrder };
      }

      // Authenticated: mirror the local cart (incl. each line's cash) to the server cart, then
      // check out — the order reads the per-line cash from the server cart.
      await syncCart();
      const order = await ordersApi.checkout({
        addressId: resolvedAddressId,
        shippingAddress,
        paymentMethod: payingOnline ? "MYFATOORAH" : "COD",
        promoCode: promoResult ? promoCode.trim() : undefined,
        deliveryType,
        scheduledDeliveryAt: scheduledDeliveryAtIso,
      });

      // Online: the order is PENDING_PAYMENT and the cart is kept until payment lands.
      // Fetch the MyFatoorah hosted-page URL so onSuccess can hand the browser off to it.
      if (payingOnline) {
        // Tell the backend where to send the browser back after paying: this region+locale's
        // order-success page (absolute URL). On failure MyFatoorah/our callback swaps it to
        // the matching order-error page. Without this the return lands on a bare backend page.
        const returnUrl = `${window.location.origin}${localize(ROUTES.orderSuccess)}`;
        const { paymentUrl } = await ordersApi.pay(order.id, { returnUrl });
        return { order, paymentUrl };
      }
      return { order };
    },
    onSuccess: ({ order, paymentUrl }) => {
      // Online payment: DON'T clear the cart or show the thank-you yet — the backend keeps
      // both until MyFatoorah confirms. Hand the browser off to the hosted payment page;
      // MyFatoorah returns to the success/error page, which the backend re-verifies.
      if (paymentUrl) {
        // Guest online payment: stash the order so the success page can render it after the
        // MyFatoorah round-trip (guests can't refetch an order). sessionStorage survives the
        // same-tab redirect out to MyFatoorah and back.
        if (!isAuthed) {
          try {
            sessionStorage.setItem(STORAGE_KEYS.guestOrder, JSON.stringify(order));
          } catch {
            /* sessionStorage unavailable — success page falls back gracefully */
          }
        }
        window.location.href = paymentUrl;
        return;
      }

      setOrderPlaced(true);
      cart.clear();
      queryClient.invalidateQueries({ queryKey: queryKeys.cart.all });

      if (!isAuthed) {
        // Stash the returned order so the public success page can render it
        // without an authenticated GET /orders/:id, then show the guest
        // thank-you + account-creation experience.
        try {
          sessionStorage.setItem(STORAGE_KEYS.guestOrder, JSON.stringify(order));
        } catch {
          /* sessionStorage unavailable — the success page falls back gracefully */
        }
        router.push(localize(`${ROUTES.orderSuccess}?guest=1`));
        return;
      }

      // Seed the cache so the confirmation/receipt page paints instantly from
      // the order we just received instead of refetching (or showing nothing).
      queryClient.setQueryData(queryKeys.orders.detail(order.id), order);
      queryClient.invalidateQueries({ queryKey: queryKeys.orders.all });
      router.push(localize(`${ROUTES.orderSuccess}?id=${order.id}`));
    },
    onError: (err) => {
      const message =
        err instanceof ApiError
          ? err.message
          : err instanceof Error
          ? err.message
          : t("checkout.orderFailed");
      setSubmitError(message);
      toast.error({ title: t("checkout.checkoutFailed"), description: message });
    },
  });

  const placeOrder = () => {
    setSubmitError(null);
    placeOrderMutation.mutate();
  };

  // Hold while a returning customer's session is still hydrating.
  if (authHydrating) {
    return (
      <div className="flex min-h-[40vh] items-center justify-center">
        <Spinner size="lg" />
      </div>
    );
  }

  // Empty cart guard — suppressed once an order has just succeeded (see
  // `orderPlaced`) so this doesn't flash between cart.clear() and the
  // redirect to /order/success actually landing.
  if (cart.items.length === 0 && !orderPlaced) {
    return (
      <Container className="flex min-h-[60vh] flex-col items-center justify-center py-24 text-center">
        <h1 className="font-display text-4xl text-ink-900">
          {t("checkout.emptyTitle")}
        </h1>
        <p className="mt-2 text-ink-500">
          {t("checkout.emptyBody")}
        </p>
        <LocalizedLink
          href={ROUTES.shop}
          className="mt-6 inline-flex h-12 items-center rounded-full bg-bloom-600 px-6 text-base font-medium text-white shadow-(--shadow-bloom) hover:bg-bloom-700"
        >
          {t("common.browseBoutique")}
        </LocalizedLink>
      </Container>
    );
  }

  return (
    <>
      <section className="border-b border-ink-100 bg-cream-50 pt-12 pb-8 lg:pt-16">
        <Container>
          <nav
            className="flex items-center gap-1 text-xs text-ink-500"
            aria-label={t("a11y.breadcrumb")}
          >
            <LocalizedLink href={ROUTES.cart} className="hover:text-ink-900">
              {t("nav.cart")}
            </LocalizedLink>
            <ChevronRight size={12} className="rtl:-scale-x-100" />
            <span className="text-ink-900">{t("checkout.title")}</span>
          </nav>
          <p className="mt-4 text-xs font-semibold uppercase tracking-[0.18em] text-bloom-700">
            {t("checkout.finalStepLabel")}
          </p>
          <h1 className="mt-1 font-display text-4xl font-medium leading-tight text-ink-900 md:text-5xl">
            {t("checkout.title")}
          </h1>
          <p className="mt-2 text-ink-500">
            {`${t("checkout.composed1")} ${tc(cart.itemCount, "units.itemOne", "units.itemOther")} ${t("checkout.composed2", { country: countryName })}`}
          </p>
        </Container>
      </section>

      <Section spacing="md">
        <div className="grid gap-10 lg:grid-cols-[1fr_22rem]">
          <BillingShippingCard
            isAuthed={isAuthed}
            addresses={addressesQuery.data}
            isLoading={isAuthed && addressesQuery.isPending}
            selectedAddressId={selectedAddressId}
            onSelect={setExplicitSelection}
            regNewAddr={regNewAddr}
            newAddrErrors={newAddrErrors}
            dialCode={dialCode}
            phoneDigitLimit={phoneDigitLimit}
            regionCode={regionCode}
            zones={zones}
            zonesLoading={zonesQuery.isPending}
            zoneValue={zoneValue}
            onZoneChange={onZoneChange}
            orderMessage={orderMessage}
            onOrderMessageChange={setOrderMessage}
            submitError={submitError}
          />

          <OrderReviewCard
            cartItems={cart.items}
            subtotal={subtotal}
            shipping={shipping}
            discount={discount}
            total={total}
            vatAmount={vatAmount}
            vatEnabled={vatActive}
            vatRatePercent={vatConfig?.ratePercent ?? null}
            vatInclusive={Boolean(vatConfig?.inclusive)}
            vatUncertain={vatUncertain}
            couponOpen={couponOpen}
            onToggleCoupon={() => setCouponOpen((v) => !v)}
            promoCode={promoCode}
            setPromoCode={setPromoCode}
            promoResult={promoResult}
            promoError={promoError}
            onApply={() =>
              promoCode.trim() && validatePromo.mutate(promoCode)
            }
            applying={validatePromo.isPending}
            onClear={() => {
              setPromoCode("");
              setPromoResult(null);
              setPromoError(null);
            }}
            onPlaceOrder={placeOrder}
            isPlacing={placeOrderMutation.isPending}
            placeOrderDisabled={placeOrderBlocked}
            deliveryType={deliveryType}
            onDeliveryTypeChange={setDeliveryType}
            scheduledDeliveryAt={scheduledDeliveryAt}
            onScheduledDeliveryAtChange={setScheduledDeliveryAt}
            standardDeliveryDays={currentRegion?.standardDeliveryDays ?? null}
            deliveryConfig={deliveryConfig}
            codUnavailable={codUnavailable}
            onlinePayAvailable={onlinePayAvailable}
            paymentMethod={paymentMethod}
            onPaymentMethodChange={setPaymentMethod}
            belowMinOrder={belowMinOrder}
            aboveMaxOrder={aboveMaxOrder}
            minOrderAmount={minOrderAmount}
            maxOrderAmount={maxOrderAmount}
            cashArrangement={
              hasCashLines
                ? { lines: cashLines, feeVatAdds: cashFeeVatAdds }
                : null
            }
          />
        </div>
      </Section>
    </>
  );
}

// ---- Billing & shipping (left column) --------------------------------------

interface DeliveryZoneOption {
  id: string;
  name: string;
  name_ar: string | null;
}

/** Emirate/province picker — the site's standard `Menu` dropdown (same
 * primitive as the shop's sort-by control) instead of a native `<select>`,
 * so it matches how every other dropdown in the storefront looks/behaves. */
function ZoneMenu({
  zones,
  value,
  onChange,
  locale,
  placeholder,
  hasError,
}: {
  zones: DeliveryZoneOption[];
  value: string;
  onChange: (id: string) => void;
  locale: string;
  placeholder: string;
  hasError: boolean;
}) {
  const selected = zones.find((z) => z.id === value);
  const label = selected
    ? locale === "ar" && selected.name_ar
      ? selected.name_ar
      : selected.name
    : placeholder;

  return (
    <Menu className="w-full">
      <MenuTrigger
        label={placeholder}
        className={cn(
          "group flex h-12 w-full items-center justify-between gap-2 rounded-2xl border bg-white px-4 text-start text-sm transition-colors focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-bloom-100",
          hasError
            ? "border-(--color-danger)"
            : "border-ink-200 hover:border-ink-300 focus-visible:border-bloom-400",
          selected ? "text-ink-900" : "text-ink-400"
        )}
      >
        <span className="truncate">{label}</span>
        <ChevronDown
          size={14}
          className="shrink-0 text-ink-400 transition-transform duration-200 group-aria-expanded:rotate-180"
        />
      </MenuTrigger>
      <MenuContent align="start" className="w-[calc(100%-0.5rem)] sm:w-64">
        <div className="max-h-72 overflow-y-auto">
          {zones.map((z) => {
            const active = z.id === value;
            const zoneLabel = locale === "ar" && z.name_ar ? z.name_ar : z.name;
            return (
              <MenuItem
                key={z.id}
                onSelect={() => onChange(z.id)}
                trailing={active ? <CheckIcon size={14} className="text-bloom-600" /> : undefined}
                className={active ? "font-semibold text-ink-900" : undefined}
              >
                {zoneLabel}
              </MenuItem>
            );
          })}
        </div>
      </MenuContent>
    </Menu>
  );
}

interface BillingShippingCardProps {
  isAuthed: boolean;
  addresses: ApiAddress[] | undefined;
  isLoading: boolean;
  selectedAddressId: string | "new" | null;
  onSelect: (v: string | "new") => void;
  regNewAddr: ReturnType<typeof useForm<NewAddressValues>>["register"];
  newAddrErrors: ReturnType<typeof useForm<NewAddressValues>>["formState"]["errors"];
  dialCode: string;
  phoneDigitLimit: number;
  regionCode: string;
  zones: DeliveryZoneOption[];
  zonesLoading: boolean;
  zoneValue: string;
  onZoneChange: (id: string) => void;
  orderMessage: string;
  onOrderMessageChange: (v: string) => void;
  submitError: string | null;
}

function BillingShippingCard({
  isAuthed,
  addresses,
  isLoading,
  selectedAddressId,
  onSelect,
  regNewAddr,
  newAddrErrors,
  dialCode,
  phoneDigitLimit,
  regionCode,
  zones,
  zonesLoading,
  zoneValue,
  onZoneChange,
  orderMessage,
  onOrderMessageChange,
  submitError,
}: BillingShippingCardProps) {
  const { t, locale: uiLocale } = useT();
  const phoneField = regNewAddr("phone");
  return (
    <Card variant="flat" padding="lg" className="flex flex-col gap-5">
      <header>
        <p className="text-xs font-semibold uppercase tracking-[0.14em] text-bloom-700">
          {t("checkout.yourDetails")}
        </p>
        <h2 className="mt-1 font-display text-2xl text-ink-900">
          {t("checkout.billingShipping")}
        </h2>
      </header>

      {/* Saved addresses + "new address" chooser — authenticated customers only. */}
      {isAuthed ? (
        isLoading ? (
          <div className="flex justify-center py-6">
            <Spinner />
          </div>
        ) : (
          <div className="flex flex-col gap-2">
            {addresses?.map((a) => (
              <AddressOption
                key={a.id}
                address={a}
                selected={selectedAddressId === a.id}
                onSelect={() => onSelect(a.id)}
                // Saved in a different region → shown but not selectable here.
                disabled={!isAddressInRegion(a, regionCode)}
              />
            ))}
            <button
              type="button"
              onClick={() => onSelect("new")}
              className={
                "flex items-start gap-3 rounded-2xl border p-4 text-start transition-colors " +
                (selectedAddressId === "new"
                  ? "border-bloom-500 bg-bloom-50"
                  : "border-ink-200 hover:border-ink-300")
              }
            >
              <span
                className={
                  "mt-1 inline-flex h-4 w-4 items-center justify-center rounded-full border " +
                  (selectedAddressId === "new"
                    ? "border-bloom-600 bg-bloom-600 text-white"
                    : "border-ink-300")
                }
              >
                {selectedAddressId === "new" ? <CheckIcon size={10} /> : null}
              </span>
              <span>
                <span className="block font-medium text-ink-900">
                  {t("address.newAddress")}
                </span>
                <span className="block text-xs text-ink-500">
                  {t("address.newAddressHint")}
                </span>
              </span>
            </button>
          </div>
        )
      ) : null}

      {selectedAddressId === "new" ? (
        <div className="grid gap-4 sm:grid-cols-2">
          <Input
            label={t("checkout.fullName")}
            autoComplete="name"
            error={newAddrErrors.fullName?.message}
            containerClassName="sm:col-span-2"
            {...regNewAddr("fullName")}
          />
          <Input
            label={t("checkout.area")}
            placeholder={t("checkout.areaPlaceholder")}
            hint={t("checkout.areaHint")}
            error={newAddrErrors.area?.message}
            {...regNewAddr("area")}
          />
          <div className="flex flex-col gap-1.5">
            <label
              id="checkout-zone-label"
              className="text-xs font-semibold uppercase tracking-[0.12em] text-ink-500"
            >
              {regionCode === "UAE" ? t("checkout.emirate") : t("checkout.province")}
            </label>
            {zonesLoading ? (
              <div className="flex h-12 w-full items-center rounded-2xl border border-ink-200 px-4">
                <Spinner size="sm" />
              </div>
            ) : zones.length === 0 ? (
              // The current region has no zones configured — skip the field
              // entirely rather than force a required-but-empty select.
              <p className="flex h-12 items-center text-xs text-ink-400">
                {t("checkout.emirateUnavailable")}
              </p>
            ) : (
              <ZoneMenu
                zones={zones}
                value={zoneValue}
                onChange={onZoneChange}
                locale={uiLocale}
                placeholder={
                  regionCode === "UAE" ? t("checkout.selectEmirate") : t("checkout.selectProvince")
                }
                hasError={Boolean(newAddrErrors.deliveryZoneId?.message)}
              />
            )}
            {newAddrErrors.deliveryZoneId?.message ? (
              <p className="text-xs text-bloom-700">
                {newAddrErrors.deliveryZoneId.message}
              </p>
            ) : null}
          </div>
          <div className="flex flex-col gap-1.5">
            <label
              htmlFor="checkout-phone"
              className="text-xs font-semibold uppercase tracking-[0.12em] text-ink-500"
            >
              {t("checkout.phone")}
            </label>
            <div
              dir="ltr"
              className={
                "flex h-12 items-center rounded-2xl border bg-white transition-all " +
                (newAddrErrors.phone
                  ? "border-(--color-danger)"
                  : "border-ink-200 focus-within:border-bloom-400 focus-within:ring-4 focus-within:ring-bloom-100")
              }
            >
              <PhoneDialCode dialCode={dialCode} />
              <input
                id="checkout-phone"
                type="tel"
                inputMode="numeric"
                autoComplete="tel-national"
                dir="ltr"
                maxLength={phoneDigitLimit}
                className={`h-full min-w-0 flex-1 rounded-e-2xl bg-transparent px-3 text-start text-sm text-ink-900 placeholder:text-ink-400 focus:outline-none ${PHONE_LTR_CLASS}`}
                onKeyDown={(event) => handlePhoneKeyDown(event, phoneDigitLimit)}
                {...phoneField}
                onChange={(event) =>
                  handlePhoneInputChange(event, uiLocale, phoneField.onChange, phoneDigitLimit)
                }
              />
            </div>
            {newAddrErrors.phone?.message ? (
              <p className="text-xs text-bloom-700">{newAddrErrors.phone.message}</p>
            ) : null}
          </div>
          {/* Email — guests only; optional but enables receipt + order linking. */}
          {!isAuthed ? (
            <Input
              label={t("checkout.emailOptional")}
              type="email"
              autoComplete="email"
              hint={t("checkout.emailHint")}
              error={newAddrErrors.email?.message}
              containerClassName="sm:col-span-2"
              {...regNewAddr("email")}
            />
          ) : null}
        </div>
      ) : null}

      {/* Offer sign-in to guests — optional, never blocks checkout. */}
      {!isAuthed ? (
        <p className="text-sm text-ink-500">
          {t("checkout.haveAccount")}{" "}
          <LocalizedLink
            href={`${ROUTES.login}?next=${encodeURIComponent(ROUTES.checkout)}`}
            className="font-medium text-bloom-700 underline underline-offset-2 hover:text-bloom-800"
          >
            {t("checkout.signInToCheckout")}
          </LocalizedLink>
        </p>
      ) : null}

      <Divider />

      <div>
        <h3 className="font-display text-lg text-ink-900">{t("checkout.additionalInfo")}</h3>
        <p className="mt-1 text-sm text-ink-500">{t("checkout.orderNoteHint")}</p>
        <Textarea
          rows={3}
          placeholder={t("checkout.orderNotePlaceholder")}
          value={orderMessage}
          onChange={(e) => onOrderMessageChange(e.target.value)}
          className="mt-3"
        />
      </div>

      {submitError ? (
        <div
          role="alert"
          className="rounded-lg border border-bloom-200 bg-bloom-50 px-3 py-2 text-sm text-bloom-700"
        >
          {submitError}
        </div>
      ) : null}
    </Card>
  );
}

/**
 * A saved address is offered at checkout only while shopping in its own region.
 * A null region (legacy rows saved before region capture) stays available
 * everywhere so we never hide an address we can't classify.
 */
function isAddressInRegion(address: ApiAddress, regionCode: string): boolean {
  return !address.region || address.region.code === regionCode;
}

function AddressOption({
  address,
  selected,
  onSelect,
  disabled = false,
}: {
  address: ApiAddress;
  selected: boolean;
  onSelect: () => void;
  disabled?: boolean;
}) {
  const { t, locale } = useT();
  const locationLine = address.area
    ? `${address.area}${address.deliveryZone ? `, ${localizedName(address.deliveryZone, locale)}` : ""}`
    : `${address.streetAddress}${address.apartment ? `, ${address.apartment}` : ""}, ${address.city}`;

  // Out-of-region: greyed, not clickable, with a clear reason so the shopper
  // understands why their saved address isn't selectable here.
  if (disabled) {
    const regionName = address.region
      ? locale === "ar" && address.region.name_ar
        ? address.region.name_ar
        : address.region.name
      : null;
    return (
      <div
        aria-disabled="true"
        className="flex items-start gap-3 rounded-2xl border border-ink-100 bg-ink-50/60 p-4 text-start opacity-70"
      >
        <span className="mt-1 inline-flex h-4 w-4 shrink-0 rounded-full border border-ink-200" />
        <span className="flex-1">
          <span className="block font-medium text-ink-500">
            {address.label || address.fullName}
          </span>
          <span className="block text-sm text-ink-400">{address.fullName}</span>
          <span className="block text-xs text-ink-400">{locationLine}</span>
          <span className="mt-1 block text-xs font-medium text-amber-600">
            {regionName
              ? t("checkout.addressOtherRegion", { region: regionName })
              : t("checkout.addressOtherRegionNoName")}
          </span>
        </span>
      </div>
    );
  }

  return (
    <button
      type="button"
      onClick={onSelect}
      className={
        "flex items-start gap-3 rounded-2xl border p-4 text-start transition-colors " +
        (selected
          ? "border-bloom-500 bg-bloom-50"
          : "border-ink-200 hover:border-ink-300")
      }
    >
      <span
        className={
          "mt-1 inline-flex h-4 w-4 items-center justify-center rounded-full border " +
          (selected
            ? "border-bloom-600 bg-bloom-600 text-white"
            : "border-ink-300")
        }
      >
        {selected ? <CheckIcon size={10} /> : null}
      </span>
      <span className="flex-1">
        <span className="flex items-center gap-2">
          <span className="font-medium text-ink-900">
            {address.label || address.fullName}
          </span>
          {address.isDefault ? (
            <span className="rounded-full bg-bloom-100 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wider text-bloom-700">
              {t("common.default")}
            </span>
          ) : null}
        </span>
        <span className="block text-sm text-ink-700">{address.fullName}</span>
        <span className="block text-xs text-ink-500">{locationLine}</span>
      </span>
    </button>
  );
}

// ---- Order review (right column): items, totals, payment, place order -----

interface OrderReviewCardProps {
  cartItems: ReturnType<typeof useCart>["items"];
  subtotal: number;
  shipping: number;
  discount: number;
  total: number;
  vatAmount: number;
  /** True when the region has active VAT — drives the "flat rate and VAT inclusive" shipment note. */
  vatEnabled: boolean;
  vatRatePercent: number | null;
  vatInclusive: boolean;
  vatUncertain: boolean;
  couponOpen: boolean;
  onToggleCoupon: () => void;
  promoCode: string;
  setPromoCode: (v: string) => void;
  promoResult: ApiPromoValidationResult | null;
  promoError: string | null;
  onApply: () => void;
  applying: boolean;
  onClear: () => void;
  onPlaceOrder: () => void;
  isPlacing: boolean;
  /** True when a delivery gate (COD/min/max/slot) forbids submitting. */
  placeOrderDisabled: boolean;
  deliveryType: "STANDARD" | "SCHEDULED";
  onDeliveryTypeChange: (v: "STANDARD" | "SCHEDULED") => void;
  /** Date-only "YYYY-MM-DD" from DeliveryDatePicker, or "" for no selection. */
  scheduledDeliveryAt: string;
  onScheduledDeliveryAtChange: (v: string) => void;
  /** Region's Standard Delivery lead time, if configured. */
  standardDeliveryDays: number | null;
  /** Resolved delivery config for the active area (undefined while loading). */
  deliveryConfig: ResolvedDeliveryConfig | undefined;
  codUnavailable: boolean;
  /** Online payment (MyFatoorah) offered for this region + signed-in customer. */
  onlinePayAvailable: boolean;
  paymentMethod: "COD" | "MYFATOORAH";
  onPaymentMethodChange: (v: "COD" | "MYFATOORAH") => void;
  belowMinOrder: boolean;
  aboveMaxOrder: boolean;
  minOrderAmount: number | null;
  maxOrderAmount: number | null;
  /** Read-only summary of the cash arrangement chosen on the product page. Null when none is
   *  active for this cart/region — nothing renders. Editing happens on the product page. */
  cashArrangement: Omit<CashArrangementSummaryProps, "currency" | "locale"> | null;
}

function OrderReviewCard({
  cartItems,
  subtotal,
  shipping,
  discount,
  total,
  vatAmount,
  vatEnabled,
  vatRatePercent,
  vatInclusive,
  vatUncertain,
  couponOpen,
  onToggleCoupon,
  promoCode,
  setPromoCode,
  promoResult,
  promoError,
  onApply,
  applying,
  onClear,
  onPlaceOrder,
  isPlacing,
  placeOrderDisabled,
  deliveryType,
  onDeliveryTypeChange,
  scheduledDeliveryAt,
  onScheduledDeliveryAtChange,
  standardDeliveryDays,
  deliveryConfig,
  codUnavailable,
  onlinePayAvailable,
  paymentMethod,
  onPaymentMethodChange,
  belowMinOrder,
  aboveMaxOrder,
  minOrderAmount,
  maxOrderAmount,
  cashArrangement,
}: OrderReviewCardProps) {
  const { currency, locale } = useCurrency();
  const { t, locale: appLocale } = useT();

  // ONE combined VAT figure = product VAT + cash-arrangement fee VAT (both at the same rate),
  // shown on a single "VAT" line — the fee's VAT is not split out next to the fee.
  const cashFeeVatTotal = cashArrangement
    ? cashArrangement.lines.reduce((s, l) => s + l.feeVatPerUnit * l.quantity, 0)
    : 0;
  // Product VAT + cash-arrangement fee VAT only — shipping is flat + VAT-inclusive and
  // contributes NO VAT to this line.
  const combinedVatAmount =
    Math.round((vatAmount + cashFeeVatTotal) * 100) / 100;

  // Mirrors order.service.js's estimatedDeliveryDays formula exactly (the LATER of the
  // resolved ZONE-or-region courier transit time and the slowest cart line's own
  // prep/booking lead time) so this pre-purchase hint matches what the order will
  // actually snapshot. A client-side preview only — the backend remains authoritative.
  const maxCartItemLeadDays = Math.max(
    0,
    ...cartItems.map((i) => i.deliveryLeadDays ?? 0)
  );
  // Prefer the resolved lead (zone override → region) once the config loads; fall back to
  // the region's standardDeliveryDays while it's still loading.
  const resolvedStandardLead = deliveryConfig?.standardLeadDays ?? standardDeliveryDays;
  const rawStandardDeliveryDays =
    resolvedStandardLead != null || maxCartItemLeadDays > 0
      ? Math.max(resolvedStandardLead ?? 0, maxCartItemLeadDays)
      : null;
  // Mirror the backend snapshot: count the standard lead from TODAY, then roll the arrival
  // forward past any non-delivery weekday / blackout date so it lands on a day this area
  // actually delivers (e.g. a 5-day lead whose 5th day is off shows as 6). Uses the
  // region-tz "today". The same-day cutoff is DELIBERATELY not applied — it governs only
  // same-day eligibility, so pushing the standard lead to "tomorrow" past the cutoff would
  // make the checkout ETA read one day longer than the configured lead and disagree with
  // the product page (see order.service.js's matching note).
  const effectiveStandardDeliveryDays = (() => {
    if (rawStandardDeliveryDays == null) return null;
    if (!deliveryConfig?.todayKey) return rawStandardDeliveryDays;
    const arrival = nextDeliverableKey(
      addDaysToKey(deliveryConfig.todayKey, rawStandardDeliveryDays),
      deliveryConfig.deliveryDays ?? [],
      new Set(deliveryConfig.blackoutDates ?? [])
    );
    return arrival
      ? daysBetweenKeys(deliveryConfig.todayKey, arrival)
      : rawStandardDeliveryDays;
  })();

  // Earliest a scheduled delivery can be booked. Standard delivery already covers the
  // whole lead window (arrival = today+lead), so scheduling only makes sense for dates
  // strictly AFTER it: the floor is effective-lead-days + 1. A 1-day lead (arrives tomorrow)
  // hides tomorrow (earliest = day 2); a 2-day lead hides through day 2 (earliest = day 3).
  // Unknown lead falls back to tomorrow (day 1). Clamped to the max window so an unusually
  // long lead time can never invert the calendar (min > max).
  const minScheduledLeadDays = Math.min(
    (effectiveStandardDeliveryDays ?? 0) + 1,
    SCHEDULED_MAX_WINDOW_DAYS
  );

  // Mirrors the backend's window (order.service.js SCHEDULED_DELIVERY_MIN_LEAD_DAYS /
  // MAX_WINDOW_DAYS) — a UX hint; the backend re-validates regardless. Computed as
  // Dubai-anchored date-key strings (memoized: businessDateKey() builds an Intl
  // formatter each call) so the picker's window matches the backend day boundary for
  // customers in any timezone.
  const { minScheduledKey, maxScheduledKey, todayScheduledKey } = useMemo(
    () => ({
      minScheduledKey: businessDateKey(minScheduledLeadDays),
      maxScheduledKey: businessDateKey(SCHEDULED_MAX_WINDOW_DAYS),
      todayScheduledKey: businessDateKey(0),
    }),
    [minScheduledLeadDays]
  );

  // Delivery-config-driven picker constraints (all empty/fallback while loading).
  const allowedWeekdays = deliveryConfig?.deliveryDays ?? [];
  const blackoutKeys = deliveryConfig?.blackoutDates ?? [];
  // Floor for the scheduled-date picker = the LATER of the server-resolved earliest day
  // (same-day/cutoff/blackout aware, but cart-blind) and the locally computed
  // minScheduledKey (which folds in THIS cart's prep lead). Taking the max ensures the
  // picker never offers a day the backend would reject for prep reasons — YYYY-MM-DD keys
  // compare correctly as strings.
  const serverEarliest = deliveryConfig?.earliestDeliveryKey;
  const effectiveMinKey =
    serverEarliest && serverEarliest > minScheduledKey ? serverEarliest : minScheduledKey;

  // If the cart or resolved config shifts so the current pick is now earlier than the
  // minimum (e.g. a longer-lead item was added, or a later earliestDeliveryKey resolved),
  // clear it so the customer must re-select a valid day.
  useEffect(() => {
    if (scheduledDeliveryAt && scheduledDeliveryAt < effectiveMinKey) {
      onScheduledDeliveryAtChange("");
    }
  }, [scheduledDeliveryAt, effectiveMinKey, onScheduledDeliveryAtChange]);

  // Free-delivery nudge: how much more (net) unlocks free delivery, when a threshold
  // is set and not yet met.
  const freeDeliveryRemaining =
    deliveryConfig?.freeDeliveryThreshold != null &&
    !deliveryConfig.freeDeliveryApplied &&
    subtotal < deliveryConfig.freeDeliveryThreshold
      ? deliveryConfig.freeDeliveryThreshold - subtotal
      : null;

  return (
    <aside className="flex flex-col gap-4">
      <Card variant="elevated" padding="lg" className="flex flex-col gap-4">
        <p className="text-xs font-semibold uppercase tracking-[0.14em] text-bloom-700">
          {t("checkout.orderReview")}
        </p>
        <h3 className="font-display text-xl text-ink-900">{t("checkout.yourOrder")}</h3>

        <ul className="divide-y divide-ink-100">
          {cartItems.map((item) => (
            <li
              key={cartLineKey(item.productId, item.variantKey)}
              className="flex gap-3 py-3 first:pt-0 last:pb-0"
            >
              {item.imageUrl ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  src={item.imageUrl}
                  alt=""
                  className="h-14 w-14 rounded-lg object-cover"
                />
              ) : (
                <div className="h-14 w-14 rounded-lg bg-ink-100" />
              )}
              <div className="flex min-w-0 flex-1 items-center justify-between gap-2 text-sm">
                <div className="min-w-0">
                  <p className="truncate font-medium text-ink-900">{item.title}</p>
                  <p className="text-xs text-ink-500">{t("common.qty")} {item.quantity}</p>
                  <SelectedOptions options={item.selectedOptions} className="mt-1" />
                  {(item.giftCardSelected || item.customName) && (
                    <div className="mt-1 flex flex-wrap items-center gap-1.5">
                      {item.giftCardSelected && (
                        <Badge tone="ink" uppercase={false}>
                          {t("admin.orderDetailPage.giftCardLabel")}
                        </Badge>
                      )}
                      {item.customName && (
                        <Badge tone="ink" uppercase={false} className="max-w-full truncate">
                          {t("admin.orderDetailPage.customNameLabel")}: {item.customName}
                        </Badge>
                      )}
                    </div>
                  )}
                  {item.message && (
                    <p className="mt-1 line-clamp-2 wrap-break-word text-xs italic text-ink-500">
                      &ldquo;{item.message}&rdquo;
                    </p>
                  )}
                </div>
                <p className="shrink-0 font-medium tabular-nums">
                  <CurrencyAmount
                    amount={item.unitPrice * item.quantity}
                    currency={currency}
                    locale={locale}
                  />
                </p>
              </div>
            </li>
          ))}
        </ul>

        {/* Compact per-line cash arrangement — shown here in "Your order" (its amounts are
            already folded into the total below). */}
        {cashArrangement ? (
          <>
            <Divider />
            <CashArrangementSummary {...cashArrangement} currency={currency} locale={locale} />
          </>
        ) : null}

        <Divider />

        <div className="flex flex-col gap-2 text-sm">
          <div className="flex items-baseline justify-between gap-4 text-ink-500">
            <span>{t("common.subtotal")}</span>
            <span className="tabular-nums text-right"><CurrencyAmount amount={subtotal} currency={currency} locale={locale} /></span>
          </div>
          {discount > 0 ? (
            <div className="flex items-baseline justify-between gap-4 text-ink-500">
              <span>{t("common.discount")}</span>
              <span className="tabular-nums text-right">
                −<CurrencyAmount amount={discount} currency={currency} locale={locale} />
              </span>
            </div>
          ) : null}
          <div className="flex items-baseline justify-between gap-4 text-ink-500">
            <span>
              {t("checkout.shipment")}
              {shipping > 0 && vatEnabled ? (
                <span className="text-ink-400"> ({t("checkout.flatRateVatInclusive")})</span>
              ) : null}
            </span>
            <span className="tabular-nums text-right">
              {shipping === 0 ? (
                t("common.free")
              ) : (
                <CurrencyAmount amount={shipping} currency={currency} locale={locale} />
              )}
            </span>
          </div>
          {freeDeliveryRemaining != null ? (
            <p className="text-xs text-bloom-700">
              {t("checkout.freeDeliveryHint", {
                amount: formatCurrency(freeDeliveryRemaining, currency, locale),
              })}
            </p>
          ) : null}
          {/* VAT (product + cash-fee only; shipping is flat + VAT-inclusive) sits under Shipment. */}
          {/* VAT row: EXCLUSIVE only — the extracted VAT figure added on top (the SINGLE
              combined figure: product VAT + cash-arrangement fee VAT). For inclusive VAT the
              amount is baked into the item prices, so we show no row here — just the
              "VAT Inclusive" note under the Total below. */}
          {!vatInclusive && vatRatePercent != null && combinedVatAmount > 0 ? (
            <div className="flex items-baseline justify-between gap-4 text-ink-500">
              <span>{t("checkout.vatLabel")}</span>
              <span className="tabular-nums text-right">
                <CurrencyAmount amount={combinedVatAmount} currency={currency} locale={locale} />
              </span>
            </div>
          ) : null}
          <div className="flex items-baseline justify-between gap-4 border-t border-ink-100 pt-2 font-medium text-ink-900">
            <span>{t("common.total")}</span>
            <span className="tabular-nums text-right"><CurrencyAmount amount={total} currency={currency} locale={locale} /></span>
          </div>
          {/* "VAT Inclusive" note under the total when prices already include VAT
              (mirrors the shop card + PDP wording). */}
          {vatInclusive ? (
            <p className="text-right text-xs text-ink-400">{t("product.vatInclusive")}</p>
          ) : null}
          {vatUncertain ? (
            <p className="text-xs text-ink-400">{t("checkout.vatEstimateNote")}</p>
          ) : null}
        </div>

        <Divider />

        {/* Coupon — collapsible, closed by default until the customer opts in. */}
        {promoResult ? (
          <div className="flex items-center justify-between rounded-xl border border-bloom-200 bg-bloom-50 px-3 py-2 text-sm text-bloom-700">
            <div>
              <p className="font-semibold uppercase tracking-wider">{promoCode}</p>
              <p className="text-xs">
                {discount > 0
                  ? t("checkout.promoAppliedAmount", {
                      amount: formatCurrency(discount, currency, locale),
                    })
                  : t("checkout.applied")}
              </p>
            </div>
            <button type="button" onClick={onClear} className="text-xs underline">
              {t("common.remove")}
            </button>
          </div>
        ) : couponOpen ? (
          <div className="flex flex-col gap-2">
            <div className="flex gap-2">
              <input
                placeholder={t("checkout.enterCode")}
                value={promoCode}
                onChange={(e) => setPromoCode(e.target.value)}
                className="flex-1 rounded-lg border border-ink-200 bg-white px-3 py-2 text-sm uppercase placeholder:normal-case placeholder:text-ink-400 focus:border-bloom-500 focus:outline-none"
              />
              <Button
                type="button"
                variant="outline"
                size="md"
                onClick={onApply}
                isLoading={applying}
              >
                {t("common.apply")}
              </Button>
            </div>
            {promoError ? <p className="text-xs text-bloom-700">{promoError}</p> : null}
          </div>
        ) : (
          <button
            type="button"
            onClick={onToggleCoupon}
            className="flex items-center justify-between text-sm text-bloom-700 hover:text-bloom-800"
          >
            <span>
              {t("checkout.haveCoupon")}{" "}
              <span className="font-medium underline underline-offset-2">
                {t("checkout.enterCodeLink")}
              </span>
            </span>
            <ChevronDown size={14} />
          </button>
        )}
      </Card>

      <Card variant="flat" padding="lg" className="flex flex-col gap-4">
        <div className="flex flex-col gap-3">
          <p className="text-sm font-semibold uppercase tracking-[0.14em] text-bloom-700">
            {t("checkout.deliveryHeading")}
          </p>

          <label className="flex cursor-pointer items-start gap-3 rounded-2xl border border-ink-900 bg-cream-50 p-4">
            <input
              type="radio"
              name="deliveryType"
              checked={deliveryType === "STANDARD"}
              onChange={() => onDeliveryTypeChange("STANDARD")}
              className="mt-1 h-4 w-4 accent-ink-900"
            />
            <div>
              <p className="font-medium text-ink-900">{t("checkout.standardDelivery")}</p>
              <p className="text-sm text-ink-500">
                {effectiveStandardDeliveryDays == null
                  ? t("checkout.standardDeliveryEtaUnknown")
                  : effectiveStandardDeliveryDays === 0
                    ? t("checkout.standardDeliveryEtaZero")
                    : t("checkout.standardDeliveryEta", {
                        days: formatDayCount(effectiveStandardDeliveryDays, appLocale),
                      })}
              </p>
            </div>
          </label>

          <label className="flex cursor-pointer items-start gap-3 rounded-2xl border border-ink-200 p-4">
            <input
              type="radio"
              name="deliveryType"
              checked={deliveryType === "SCHEDULED"}
              onChange={() => onDeliveryTypeChange("SCHEDULED")}
              className="mt-1 h-4 w-4 accent-ink-900"
            />
            <div className="flex-1">
              <p className="font-medium text-ink-900">{t("checkout.scheduledDelivery")}</p>
              {deliveryType === "SCHEDULED" ? (
                <div className="mt-3" onClick={(e) => e.stopPropagation()}>
                  <DeliveryDatePicker
                    aria-label={t("checkout.scheduledDelivery")}
                    minKey={effectiveMinKey}
                    maxKey={maxScheduledKey}
                    todayKey={todayScheduledKey}
                    allowedWeekdays={allowedWeekdays}
                    blackoutKeys={blackoutKeys}
                    value={scheduledDeliveryAt}
                    onChange={onScheduledDeliveryAtChange}
                  />
                  <p className="mt-2 text-xs text-ink-500">
                    {t("checkout.scheduledDeliveryHint")}
                  </p>
                </div>
              ) : null}
            </div>
          </label>
        </div>

        <Divider />

        {/* Payment method. When online payment (MyFatoorah) is available for this region +
            signed-in customer, offer a choice; otherwise fall back to the COD-only display
            (or the "COD unavailable" notice when the resolved area disables COD). */}
        {onlinePayAvailable ? (
          <div className="flex flex-col gap-3">
            <label
              className={cn(
                "flex cursor-pointer items-start gap-3 rounded-2xl border p-4 transition",
                paymentMethod === "MYFATOORAH"
                  ? "border-ink-900 bg-cream-50"
                  : "border-ink-200 bg-white"
              )}
            >
              <input
                type="radio"
                name="payment"
                className="mt-1 h-4 w-4 accent-ink-900"
                checked={paymentMethod === "MYFATOORAH"}
                onChange={() => onPaymentMethodChange("MYFATOORAH")}
              />
              <div>
                <p className="font-medium text-ink-900">{t("checkout.payOnline")}</p>
              </div>
            </label>

            {!codUnavailable ? (
              <label
                className={cn(
                  "flex cursor-pointer items-start gap-3 rounded-2xl border p-4 transition",
                  paymentMethod === "COD"
                    ? "border-ink-900 bg-cream-50"
                    : "border-ink-200 bg-white"
                )}
              >
                <input
                  type="radio"
                  name="payment"
                  className="mt-1 h-4 w-4 accent-ink-900"
                  checked={paymentMethod === "COD"}
                  onChange={() => onPaymentMethodChange("COD")}
                />
                <div>
                  <p className="font-medium text-ink-900">{t("checkout.cod")}</p>
                </div>
              </label>
            ) : null}
          </div>
        ) : codUnavailable ? (
          <div
            role="alert"
            className="rounded-2xl border border-(--color-danger) bg-bloom-50 p-4 text-sm text-bloom-700"
          >
            {t("checkout.codUnavailable")}
          </div>
        ) : (
          <div className="flex items-start gap-3 rounded-2xl border border-ink-900 bg-cream-50 p-4">
            <input
              type="radio"
              name="payment"
              defaultChecked
              className="mt-1 h-4 w-4 accent-ink-900"
              readOnly
            />
            <div>
              <p className="font-medium text-ink-900">{t("checkout.cod")}</p>
            </div>
          </div>
        )}

        {/* Min/max order gates — mirrored from the resolved config; backend re-checks. */}
        {belowMinOrder && minOrderAmount != null ? (
          <div
            role="alert"
            className="rounded-lg border border-bloom-200 bg-bloom-50 px-3 py-2 text-sm text-bloom-700"
          >
            {t("checkout.minOrderError", {
              amount: formatCurrency(minOrderAmount, currency, locale),
            })}
          </div>
        ) : null}
        {aboveMaxOrder && maxOrderAmount != null ? (
          <div
            role="alert"
            className="rounded-lg border border-bloom-200 bg-bloom-50 px-3 py-2 text-sm text-bloom-700"
          >
            {t("checkout.maxOrderError", {
              amount: formatCurrency(maxOrderAmount, currency, locale),
            })}
          </div>
        ) : null}

        <Button
          type="button"
          size="xl"
          fullWidth
          onClick={onPlaceOrder}
          isLoading={isPlacing}
          disabled={placeOrderDisabled}
        >
          {t("checkout.placeOrder")} ·{" "}
          <CurrencyAmount amount={total} currency={currency} locale={locale} />
        </Button>
      </Card>
    </aside>
  );
}
