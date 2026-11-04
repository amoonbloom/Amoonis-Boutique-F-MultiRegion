"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Input, Modal } from "@/components/ui";
import { PhoneDialCode } from "@/components/ui/PhoneDialCode";
import {
  MoyasarPayForm,
  type MoyasarInitiatingResult,
} from "@/components/checkout/MoyasarPayForm";
import { ROUTES } from "@/constants/routes";
import { STORAGE_KEYS } from "@/constants/storage-keys";
import { deliveryZonesApi } from "@/features/delivery-zones/api/delivery-zones.api";
import { useCurrency } from "@/features/location/hooks/useCurrency";
import { useLocalizedHref } from "@/features/location/useLocalizedHref";
import { ordersApi } from "@/features/orders/api/orders.api";
import {
  isValidShortAddress,
  maskShortAddress,
  SHORT_ADDRESS_LENGTH,
  SHORT_ADDRESS_PLACEHOLDER,
} from "@/features/orders/shortAddress";
import type { ApiGuestCheckoutItem } from "@/features/orders/types";
import { stripKnownCallingCode } from "@/features/regions/countries";
import { useT } from "@/i18n/useT";
import { writePendingOnlineOrder } from "@/lib/pendingOnlineOrder";
import {
  PHONE_LTR_CLASS,
  countPhoneDigits,
  handlePhoneInputChange,
  handlePhoneKeyDown,
  normalizePhoneDigits,
} from "@/lib/phoneInput";
import { ApiError } from "@/services/http";
import { queryKeys } from "@/services/queryKeys";
import { useAppDispatch, useAppSelector } from "@/store";
import { pushToast } from "@/store/slices/ui.slice";
import type { Product } from "../types";

type ApplePaySessionCtor = { canMakePayments?: () => boolean };

function applePaySupported(): boolean {
  if (typeof window === "undefined") return false;
  const AP = (window as Window & { ApplePaySession?: ApplePaySessionCtor })
    .ApplePaySession;
  if (!AP) return false;
  try {
    return typeof AP.canMakePayments === "function" ? AP.canMakePayments() : true;
  } catch {
    return false;
  }
}

/** Official-style Apple logo mark for the black express CTA. */
function AppleLogoMark({ className }: { className?: string }) {
  return (
    <svg
      className={className}
      viewBox="0 0 17 20"
      width="17"
      height="20"
      aria-hidden="true"
      focusable="false"
    >
      <path
        fill="currentColor"
        d="M13.94 10.64c.02 2.3 2.02 3.07 2.04 3.08-.02.05-.32 1.1-1.05 2.17-.63.94-1.29 1.87-2.32 1.89-1.01.02-1.34-.6-2.5-.6-1.16 0-1.52.58-2.48.62-1 .04-1.76-1.01-2.4-1.94C3.91 13.86 2.9 10.3 4.3 7.9c.7-1.19 1.94-1.94 3.29-1.96 1.03-.02 2 .69 2.5.69.5 0 1.67-.85 2.81-.73.48.02 1.82.19 2.68 1.46-.07.04-1.6.93-1.64 3.0zM11.5 4.3c.55-.67.93-1.6.82-2.53-.8.03-1.76.53-2.33 1.2-.51.59-.96 1.54-.84 2.45.89.07 1.8-.45 2.35-1.12z"
      />
    </svg>
  );
}

export type PdpApplePayExpressProps = {
  product: Product;
  /** Grouped personalization lines ready for express-checkout. */
  items: ApiGuestCheckoutItem[];
  /** Preview total before shipping/VAT (unit×qty + custom names + cash + fees). */
  previewAmount: number;
  open: boolean;
  onClose: () => void;
  /** True while gift/custom-name/cash modals are open — disables the CTA. */
  personalizationBusy?: boolean;
  /** Opens the sheet after the personalization chain finishes. */
  onRequestOpen: () => void;
};

export function PdpApplePayExpress({
  product,
  items,
  previewAmount,
  open,
  onClose,
  personalizationBusy = false,
  onRequestOpen,
}: PdpApplePayExpressProps) {
  const dispatch = useAppDispatch();
  const localize = useLocalizedHref();
  const { t, locale: appLocale } = useT();
  const token = useAppSelector((s) => s.auth.token);
  const user = useAppSelector((s) => s.auth.user);
  const selectedCity = useAppSelector((s) => s.location.city);
  const {
    currency,
    countryCode,
    dialCode,
    phoneDigitLimit,
    nationalPhoneLength,
    onlinePaymentEnabled,
    onlinePaymentProvider,
    applePayEnabled,
    shortAddressEnabled,
  } = useCurrency();

  const gated =
    onlinePaymentEnabled &&
    onlinePaymentProvider === "MOYASAR" &&
    applePayEnabled &&
    product.inStock &&
    !product.comingSoon;

  const [fullName, setFullName] = useState("");
  const [phone, setPhone] = useState("");
  const [email, setEmail] = useState("");
  const [streetAddress, setStreetAddress] = useState("");
  const [shortAddress, setShortAddress] = useState("");
  const [fieldError, setFieldError] = useState<string | null>(null);
  const [appleOk, setAppleOk] = useState(true);
  const pendingOrderRef = useRef<{ id: string; isGuest: boolean } | null>(null);

  const zonesQuery = useQuery({
    queryKey: queryKeys.deliveryZones.list(countryCode),
    queryFn: () => deliveryZonesApi.list(countryCode),
    enabled: gated && Boolean(countryCode),
    staleTime: 5 * 60_000,
  });
  const zones = zonesQuery.data ?? [];
  const deliveryZoneId = useMemo(() => {
    if (!selectedCity) return undefined;
    return zones.find((z) => z.name === selectedCity)?.id;
  }, [zones, selectedCity]);

  const moyasarFormQuery = useQuery({
    queryKey: ["moyasar-form-config"],
    queryFn: () => ordersApi.getMoyasarFormConfig(),
    enabled: gated && open,
    staleTime: 10 * 60_000,
    retry: 1,
  });

  // Prefill contact when the sheet opens.
  useEffect(() => {
    if (!open) return;
    setAppleOk(applePaySupported());
    setFieldError(null);
    pendingOrderRef.current = null;
    if (user) {
      setFullName(
        (user.fullName || user.name || `${user.firstName ?? ""} ${user.lastName ?? ""}`).trim()
      );
      setPhone(stripKnownCallingCode(user.phone));
      setEmail(user.email ?? "");
    }
  }, [open, user]);

  const previewMinor = Math.max(100, Math.round(previewAmount * 100));

  const validateFields = useCallback((): string | null => {
    if (!fullName.trim()) return t("product.applePayNameRequired");
    const digits = countPhoneDigits(phone);
    if (digits === 0) return t("product.applePayPhoneRequired");
    if (nationalPhoneLength != null && digits !== nationalPhoneLength) {
      return t("validation.phoneDigits", { count: nationalPhoneLength });
    }
    if (digits < 4) return t("product.applePayPhoneRequired");
    if (shortAddressEnabled) {
      const cleaned = maskShortAddress(shortAddress);
      if (!isValidShortAddress(cleaned)) return t("checkout.shortAddressInvalid");
    }
    if (!selectedCity && !deliveryZoneId && !streetAddress.trim()) {
      return t("product.applePayNeedLocation");
    }
    return null;
  }, [
    fullName,
    phone,
    nationalPhoneLength,
    shortAddressEnabled,
    shortAddress,
    selectedCity,
    deliveryZoneId,
    streetAddress,
    t,
  ]);

  const onInitiating = useCallback(async (): Promise<false | MoyasarInitiatingResult> => {
    const err = validateFields();
    if (err) {
      setFieldError(err);
      dispatch(pushToast({ title: t("checkout.checkoutFailed"), description: err, variant: "error" }));
      return false;
    }
    setFieldError(null);

    try {
      let orderId = pendingOrderRef.current?.id;
      let isGuest = pendingOrderRef.current?.isGuest ?? !token;

      if (!orderId) {
        const area =
          streetAddress.trim() || selectedCity || "Express";
        const order = await ordersApi.expressCheckout({
          items,
          shippingAddress: {
            fullName: fullName.trim(),
            phone: `${dialCode}${normalizePhoneDigits(phone).replace(/[\s-]/g, "")}`,
            area,
            streetAddress: streetAddress.trim() || undefined,
            city: selectedCity || undefined,
            deliveryZoneId: deliveryZoneId || undefined,
            country: countryCode || undefined,
          },
          shortAddress: shortAddressEnabled
            ? maskShortAddress(shortAddress)
            : undefined,
          email: email.trim() || undefined,
          paymentMethod: "MOYASAR",
        });
        orderId = order.id;
        isGuest = !token;
        pendingOrderRef.current = { id: orderId, isGuest };
        if (isGuest) {
          try {
            sessionStorage.setItem(STORAGE_KEYS.guestOrder, JSON.stringify(order));
          } catch {
            /* sessionStorage unavailable */
          }
        }
        writePendingOnlineOrder(orderId);
      }

      const returnUrl = (() => {
        const u = new URL(localize(ROUTES.orderMoyasarReturn), window.location.origin);
        u.searchParams.set("oid", orderId!);
        if (isGuest) u.searchParams.set("guest", "1");
        return u.toString();
      })();

      const pay = isGuest
        ? await ordersApi.guestPay(orderId!, {
            returnUrl,
            lang: appLocale === "ar" ? "ar" : "en",
          })
        : await ordersApi.pay(orderId!, {
            returnUrl,
            lang: appLocale === "ar" ? "ar" : "en",
          });

      const form = pay.form;
      if (pay.mode !== "embedded" || !form) {
        throw new Error(t("checkout.moyasarFormLoadError"));
      }

      return {
        orderId: orderId!,
        isGuest,
        amount: form.amount,
        description: form.description,
        callbackUrl: form.callbackUrl,
        metadata: form.metadata,
      };
    } catch (e) {
      const message =
        e instanceof ApiError
          ? e.message
          : e instanceof Error
            ? e.message
            : t("checkout.orderFailed");
      setFieldError(message);
      dispatch(
        pushToast({
          title: t("checkout.checkoutFailed"),
          description: message,
          variant: "error",
        })
      );
      return false;
    }
  }, [
    validateFields,
    dispatch,
    t,
    token,
    items,
    streetAddress,
    selectedCity,
    fullName,
    dialCode,
    phone,
    deliveryZoneId,
    countryCode,
    shortAddressEnabled,
    shortAddress,
    email,
    localize,
    appLocale,
  ]);

  if (!gated) return null;

  const bootstrap = moyasarFormQuery.data;
  const ctaDisabled = personalizationBusy || !product.inStock || product.comingSoon;

  return (
    <>
      <div className="flex flex-col gap-3">
        <div className="flex items-center gap-3" aria-hidden="true">
          <span className="h-px flex-1 bg-ink-200" />
          <span className="text-xs font-medium uppercase tracking-[0.14em] text-ink-300">
            {t("product.applePayOr")}
          </span>
          <span className="h-px flex-1 bg-ink-200" />
        </div>
        <button
          type="button"
          disabled={ctaDisabled}
          onClick={onRequestOpen}
          className="inline-flex h-14 w-full items-center justify-center gap-2 rounded-2xl bg-black px-8 text-base font-medium text-white transition hover:bg-ink-900 disabled:cursor-not-allowed disabled:opacity-50"
          aria-label={t("product.applePayCta")}
        >
          <AppleLogoMark className="shrink-0 text-white" />
          <span>{t("product.applePayCta")}</span>
        </button>
      </div>

      <Modal
        open={open}
        onClose={onClose}
        title={t("product.applePaySheetTitle")}
        description={t("product.applePaySheetSubtitle")}
        size="md"
      >
        <div className="flex flex-col gap-4">
          {!appleOk ? (
            <p className="rounded-xl border border-ink-200 bg-cream-50 px-4 py-3 text-sm text-ink-700">
              {t("product.applePayUnsupported")}
            </p>
          ) : null}

          <Input
            label={t("product.applePayName")}
            requiredMark
            autoComplete="name"
            value={fullName}
            onChange={(e) => setFullName(e.target.value)}
          />

          <div className="flex flex-col gap-1.5">
            <label
              htmlFor="pdp-apple-pay-phone"
              className="text-xs font-semibold uppercase tracking-[0.12em] text-ink-500"
            >
              {t("product.applePayPhone")}
              <span className="ms-0.5 text-(--color-danger)" aria-hidden="true">
                *
              </span>
            </label>
            <div
              dir="ltr"
              className="flex h-12 items-center rounded-2xl border border-ink-200 bg-white transition-all focus-within:border-bloom-400 focus-within:ring-4 focus-within:ring-bloom-100"
            >
              <PhoneDialCode dialCode={dialCode} />
              <input
                id="pdp-apple-pay-phone"
                type="tel"
                inputMode="numeric"
                autoComplete="tel-national"
                dir="ltr"
                maxLength={phoneDigitLimit}
                value={phone}
                className={`h-full min-w-0 flex-1 rounded-e-2xl bg-transparent px-3 text-start text-sm text-ink-900 placeholder:text-ink-400 focus:outline-none ${PHONE_LTR_CLASS}`}
                onKeyDown={(event) => handlePhoneKeyDown(event, phoneDigitLimit)}
                onChange={(event) =>
                  handlePhoneInputChange(
                    event,
                    appLocale,
                    (e) => setPhone(e.target.value),
                    phoneDigitLimit
                  )
                }
              />
            </div>
          </div>

          {shortAddressEnabled ? (
            <Input
              label={t("product.applePayNationalAddress")}
              requiredMark
              hint={t("checkout.shortAddressHint")}
              placeholder={SHORT_ADDRESS_PLACEHOLDER}
              dir="ltr"
              inputMode="text"
              autoCapitalize="characters"
              autoComplete="off"
              spellCheck={false}
              maxLength={SHORT_ADDRESS_LENGTH}
              value={shortAddress}
              onChange={(e) => setShortAddress(maskShortAddress(e.target.value))}
              className="uppercase tracking-[0.18em]"
            />
          ) : null}

          <Input
            label={t("product.applePayEmailOptional")}
            type="email"
            autoComplete="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
          />

          <Input
            label={t("product.applePayAddressOptional")}
            autoComplete="street-address"
            value={streetAddress}
            onChange={(e) => setStreetAddress(e.target.value)}
          />

          {fieldError ? (
            <p className="rounded-xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-800">
              {fieldError}
            </p>
          ) : null}

          {appleOk && bootstrap ? (
            <div className="overflow-x-hidden rounded-2xl border border-ink-200 bg-white p-3 sm:p-4">
              <MoyasarPayForm
                form={{
                  publishableApiKey: bootstrap.publishableApiKey,
                  amount: previewMinor,
                  currency: String(currency || "SAR").toUpperCase(),
                  description: t("checkout.moyasarCheckoutDescription"),
                  callbackUrl: localize(ROUTES.orderMoyasarReturn),
                  language: appLocale === "ar" ? "ar" : "en",
                  methods: ["applepay"],
                  supportedNetworks: bootstrap.supportedNetworks,
                  scriptUrl: bootstrap.scriptUrl,
                  cssUrl: bootstrap.cssUrl,
                  applePay: bootstrap.applePay,
                  metadata: {},
                }}
                onInitiating={onInitiating}
                onFailure={(message) => {
                  setFieldError(message);
                  dispatch(
                    pushToast({
                      title: t("checkout.checkoutFailed"),
                      description: message,
                      variant: "error",
                    })
                  );
                }}
              />
            </div>
          ) : null}

          {appleOk && moyasarFormQuery.isLoading ? (
            <p className="text-sm text-ink-500">{t("checkout.moyasarFormLoading")}</p>
          ) : null}

          {appleOk && moyasarFormQuery.isError ? (
            <p className="rounded-xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-800">
              {t("checkout.moyasarFormLoadError")}
            </p>
          ) : null}
        </div>
      </Modal>
    </>
  );
}
