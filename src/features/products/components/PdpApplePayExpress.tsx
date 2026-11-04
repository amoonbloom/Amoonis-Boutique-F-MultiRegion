"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { useQuery } from "@tanstack/react-query";
import { Input, Modal } from "@/components/ui";
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
import { useT } from "@/i18n/useT";
import { writePendingOnlineOrder } from "@/lib/pendingOnlineOrder";
import { ApiError } from "@/services/http";
import { queryKeys } from "@/services/queryKeys";
import { useAppDispatch, useAppSelector } from "@/store";
import { pushToast } from "@/store/slices/ui.slice";
import type { Product } from "../types";

const MOYASAR_PAYMENTS_URL = "https://api.moyasar.com/v1/payments";

type ApplePayContact = {
  givenName?: string;
  familyName?: string;
  phoneNumber?: string;
  emailAddress?: string;
};

type ApplePayPaymentAuthorizedEvent = {
  payment: {
    token: unknown;
    shippingContact?: ApplePayContact;
  };
};

type ApplePayValidateMerchantEvent = {
  validationURL: string;
};

type ApplePaySessionInstance = {
  onvalidatemerchant:
    | ((event: ApplePayValidateMerchantEvent) => void)
    | null;
  onpaymentauthorized:
    | ((event: ApplePayPaymentAuthorizedEvent) => void)
    | null;
  oncancel: (() => void) | null;
  begin: () => void;
  abort: () => void;
  completeMerchantValidation: (merchantSession: unknown) => void;
  completePayment: (status: number) => void;
};

type ApplePaySessionCtor = {
  new (version: number, request: Record<string, unknown>): ApplePaySessionInstance;
  canMakePayments?: () => boolean;
  supportsVersion?: (version: number) => boolean;
  STATUS_SUCCESS: number;
  STATUS_FAILURE: number;
};

type PendingExpressOrder = {
  id: string;
  isGuest: boolean;
  totalAmount: number;
  currency: string;
  orderNumber: number | null;
};

type MoyasarBootstrap = NonNullable<
  Awaited<ReturnType<typeof ordersApi.getMoyasarFormConfig>>
>;

function getApplePaySession(): ApplePaySessionCtor | undefined {
  if (typeof window === "undefined") return undefined;
  return (window as Window & { ApplePaySession?: ApplePaySessionCtor }).ApplePaySession;
}

function applePaySupported(): boolean {
  const AP = getApplePaySession();
  if (!AP) return false;
  try {
    return typeof AP.canMakePayments === "function" ? AP.canMakePayments() : true;
  } catch {
    return false;
  }
}

/** Map Moyasar/bootstrap network ids to Apple Pay JS network names. */
function mapSupportedNetworks(networks: string[] | undefined): string[] {
  const mapped = (networks ?? ["visa", "masterCard", "mada", "amex"]).map((n) => {
    const key = String(n).toLowerCase();
    if (key === "mastercard" || key === "master_card") return "masterCard";
    if (key === "amex" || key === "americanexpress") return "amex";
    if (key === "mada") return "mada";
    if (key === "visa") return "visa";
    return n;
  });
  return mapped.length > 0 ? mapped : ["visa", "masterCard", "mada", "amex"];
}

/** Keep leading +, strip junk; prefix dialCode when no country code is present. */
function normalizeWalletPhone(raw: string, dialCode: string): string {
  const trimmed = String(raw || "").trim();
  if (!trimmed) return "";
  const hasPlus = trimmed.includes("+") || trimmed.startsWith("00");
  const digits = trimmed.replace(/\D/g, "");
  if (!digits) return "";
  if (hasPlus) {
    const normalized = digits.startsWith("00") ? digits.slice(2) : digits;
    return `+${normalized}`;
  }
  const codeDigits = String(dialCode || "").replace(/\D/g, "");
  if (codeDigits && digits.startsWith(codeDigits)) {
    return `+${digits}`;
  }
  return `${dialCode}${digits}`;
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

/** Safely end an Apple Pay session — abort/complete throw if already closed. */
function safeAbortSession(session: ApplePaySessionInstance | null) {
  if (!session) return;
  try {
    session.abort();
  } catch {
    /* already closed / unsupported after dismiss */
  }
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
  const router = useRouter();
  const localize = useLocalizedHref();
  const { t } = useT();
  const token = useAppSelector((s) => s.auth.token);
  const user = useAppSelector((s) => s.auth.user);
  const selectedCity = useAppSelector((s) => s.location.city);
  const {
    currency,
    countryCode,
    dialCode,
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

  const [streetAddress, setStreetAddress] = useState("");
  const [shortAddress, setShortAddress] = useState("");
  const [fieldError, setFieldError] = useState<string | null>(null);
  const [appleOk, setAppleOk] = useState(true);
  const [paying, setPaying] = useState(false);
  const [orderReady, setOrderReady] = useState(false);
  const [preparingOrder, setPreparingOrder] = useState(false);
  const pendingOrderRef = useRef<PendingExpressOrder | null>(null);
  const sessionBusyRef = useRef(false);
  const activeSessionRef = useRef<ApplePaySessionInstance | null>(null);
  const prepareGenRef = useRef(0);

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

  // Reset / abort whenever the sheet opens or closes so reopen is clean.
  // Closing must abort any live ApplePaySession — otherwise a second open/close
  // throws "The object does not support the operation or argument".
  useEffect(() => {
    if (!open) {
      safeAbortSession(activeSessionRef.current);
      activeSessionRef.current = null;
      sessionBusyRef.current = false;
      setPaying(false);
      setPreparingOrder(false);
      // Keep pendingOrderRef so a quick reopen can reuse the prepared order
      // without another create — cleared when fields/items change below.
      return;
    }
    setAppleOk(applePaySupported());
    setFieldError(null);
    setPaying(false);
    sessionBusyRef.current = false;
    safeAbortSession(activeSessionRef.current);
    activeSessionRef.current = null;
    // Fresh sheet: re-check order readiness (may already be cached in ref).
    setOrderReady(Boolean(pendingOrderRef.current));
    setPreparingOrder(false);
  }, [open]);

  // Changing line items / address means the pre-created order is stale.
  useEffect(() => {
    pendingOrderRef.current = null;
    setOrderReady(false);
  }, [items, shortAddress, streetAddress, selectedCity, deliveryZoneId, countryCode]);

  const validateSheetFields = useCallback((): string | null => {
    if (shortAddressEnabled) {
      const cleaned = maskShortAddress(shortAddress);
      if (!isValidShortAddress(cleaned)) return t("checkout.shortAddressInvalid");
    }
    if (!selectedCity && !deliveryZoneId && !streetAddress.trim()) {
      return t("product.applePayNeedLocation");
    }
    return null;
  }, [
    shortAddressEnabled,
    shortAddress,
    selectedCity,
    deliveryZoneId,
    streetAddress,
    t,
  ]);

  const failToast = useCallback(
    (message: string) => {
      setFieldError(message);
      dispatch(
        pushToast({
          title: t("checkout.checkoutFailed"),
          description: message,
          variant: "error",
        })
      );
    },
    [dispatch, t]
  );

  const ensureExpressOrder = useCallback(async (): Promise<PendingExpressOrder> => {
    const existing = pendingOrderRef.current;
    if (existing) return existing;

    const signedInName = user
      ? (
          user.fullName ||
          user.name ||
          `${user.firstName ?? ""} ${user.lastName ?? ""}`
        ).trim()
      : "";
    const signedInPhone = user?.phone ? String(user.phone).trim() : "";
    const signedInEmail = user?.email ? String(user.email).trim() : "";

    const fullName = signedInName || "Apple Pay Guest";
    const phone = signedInPhone || `${dialCode}500000000`;

    const area = streetAddress.trim() || selectedCity || "Express";
    const order = await ordersApi.expressCheckout({
      items,
      shippingAddress: {
        fullName,
        phone,
        area,
        streetAddress: streetAddress.trim() || undefined,
        city: selectedCity || undefined,
        deliveryZoneId: deliveryZoneId || undefined,
        country: countryCode || undefined,
      },
      shortAddress: shortAddressEnabled
        ? maskShortAddress(shortAddress)
        : undefined,
      email: signedInEmail || undefined,
      paymentMethod: "MOYASAR",
    });

    const isGuest = !token;
    const snapshot: PendingExpressOrder = {
      id: order.id,
      isGuest,
      totalAmount: Number(order.totalAmount),
      currency: String(order.currency || currency || "SAR").toUpperCase(),
      orderNumber: order.orderNumber ?? null,
    };
    pendingOrderRef.current = snapshot;

    if (isGuest) {
      try {
        sessionStorage.setItem(STORAGE_KEYS.guestOrder, JSON.stringify(order));
      } catch {
        /* sessionStorage unavailable */
      }
    }
    writePendingOnlineOrder(order.id);
    return snapshot;
  }, [
    user,
    dialCode,
    streetAddress,
    selectedCity,
    items,
    deliveryZoneId,
    countryCode,
    shortAddressEnabled,
    shortAddress,
    token,
    currency,
  ]);

  // Pre-create the order once sheet fields are valid so the Apple Pay click
  // handler can construct ApplePaySession synchronously (Safari requirement).
  useEffect(() => {
    if (!open || !gated || !appleOk) return;
    if (validateSheetFields() != null) {
      setPreparingOrder(false);
      setOrderReady(false);
      return;
    }
    if (pendingOrderRef.current) {
      setOrderReady(true);
      setPreparingOrder(false);
      return;
    }

    const gen = ++prepareGenRef.current;
    setPreparingOrder(true);
    setOrderReady(false);
    void ensureExpressOrder()
      .then(() => {
        if (prepareGenRef.current !== gen) return;
        setOrderReady(true);
        setPreparingOrder(false);
        setFieldError(null);
      })
      .catch((e) => {
        if (prepareGenRef.current !== gen) return;
        setPreparingOrder(false);
        setOrderReady(false);
        const message =
          e instanceof ApiError
            ? e.message
            : e instanceof Error
              ? e.message
              : t("checkout.orderFailed");
        failToast(message);
      });
  }, [
    open,
    gated,
    appleOk,
    validateSheetFields,
    ensureExpressOrder,
    failToast,
    t,
    items,
    shortAddress,
    streetAddress,
    selectedCity,
    deliveryZoneId,
  ]);

  /**
   * CRITICAL: Apple requires `new ApplePaySession(...)` inside the user-gesture
   * handler with NO await beforehand. Order must already exist in pendingOrderRef.
   */
  const startApplePay = useCallback(() => {
    if (sessionBusyRef.current || paying) return;

    const err = validateSheetFields();
    if (err) {
      failToast(err);
      return;
    }

    const AP = getApplePaySession();
    const bootstrap = moyasarFormQuery.data as MoyasarBootstrap | undefined;
    const orderSnap = pendingOrderRef.current;
    if (!AP || !applePaySupported() || !bootstrap) {
      failToast(t("product.applePayUnsupported"));
      return;
    }
    if (!orderSnap) {
      // Still preparing — kick another prepare and ask the shopper to tap again.
      void ensureExpressOrder()
        .then(() => setOrderReady(true))
        .catch(() => undefined);
      failToast(t("checkout.moyasarFormLoading"));
      return;
    }

    setFieldError(null);
    setPaying(true);
    sessionBusyRef.current = true;

    const version =
      typeof AP.supportsVersion === "function" && AP.supportsVersion(7) ? 7 : 6;
    const amount = Number(orderSnap.totalAmount).toFixed(2);
    const paymentRequest = {
      countryCode: bootstrap.applePay?.country || "SA",
      currencyCode: orderSnap.currency,
      supportedNetworks: mapSupportedNetworks(bootstrap.supportedNetworks),
      merchantCapabilities: ["supports3DS", "supportsCredit", "supportsDebit"],
      total: {
        label: bootstrap.applePay?.label || "Amoon Bloom",
        amount,
        type: "final",
      },
      requiredShippingContactFields: ["name", "phone", "email"],
    };

    // Abort any leftover session before starting a new one (reopen safety).
    safeAbortSession(activeSessionRef.current);
    activeSessionRef.current = null;

    let session: ApplePaySessionInstance;
    try {
      // Must stay synchronous — this is the user-gesture boundary Safari enforces.
      session = new AP(version, paymentRequest);
      activeSessionRef.current = session;
    } catch (e) {
      sessionBusyRef.current = false;
      setPaying(false);
      failToast(
        e instanceof Error ? e.message : t("checkout.moyasarPayFailed")
      );
      return;
    }

    const clearBusy = () => {
      if (activeSessionRef.current === session) {
        activeSessionRef.current = null;
      }
      sessionBusyRef.current = false;
      setPaying(false);
    };

    session.onvalidatemerchant = async (event) => {
      try {
        const validateUrl =
          bootstrap.applePay?.validateMerchantUrl ||
          "https://api.moyasar.com/v1/applepay/initiate";
        const res = await fetch(validateUrl, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            validation_url: event.validationURL,
            display_name: bootstrap.applePay?.label || "Amoon Bloom",
            domain_name: window.location.hostname,
            publishable_api_key: bootstrap.publishableApiKey,
          }),
        });
        if (!res.ok) {
          throw new Error(t("checkout.moyasarPayFailed"));
        }
        const merchantSession = await res.json();
        session.completeMerchantValidation(merchantSession);
      } catch (e) {
        safeAbortSession(session);
        clearBusy();
        failToast(
          e instanceof Error ? e.message : t("checkout.moyasarPayFailed")
        );
      }
    };

    session.onpaymentauthorized = async (event) => {
      const contact = event.payment.shippingContact;
      const given = contact?.givenName?.trim() || "";
      const family = contact?.familyName?.trim() || "";
      const fullName = `${given} ${family}`.trim();
      const phone = normalizeWalletPhone(contact?.phoneNumber || "", dialCode);
      const email = contact?.emailAddress?.trim() || undefined;

      if (!fullName || !phone) {
        try {
          session.completePayment(AP.STATUS_FAILURE);
        } catch {
          /* already closed */
        }
        clearBusy();
        failToast(t("product.applePayContactMissing"));
        return;
      }

      try {
        await ordersApi.updateExpressContact(orderSnap.id, {
          fullName,
          phone,
          email,
        });

        const amountMinor = Math.max(
          100,
          Math.round(Number(orderSnap.totalAmount) * 100)
        );
        const payRes = await fetch(MOYASAR_PAYMENTS_URL, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            amount: amountMinor,
            currency: orderSnap.currency,
            description: t("checkout.moyasarCheckoutDescription"),
            publishable_api_key: bootstrap.publishableApiKey,
            source: {
              type: "applepay",
              token: event.payment.token,
            },
            metadata: {
              order_id: orderSnap.id,
              order_number:
                orderSnap.orderNumber != null
                  ? String(orderSnap.orderNumber)
                  : orderSnap.id,
            },
          }),
        });
        const payment = (await payRes.json()) as {
          id?: string;
          status?: string;
          message?: string;
          type?: string;
        };

        if (!payRes.ok || !payment?.id || payment.status !== "paid") {
          try {
            session.completePayment(AP.STATUS_FAILURE);
          } catch {
            /* already closed */
          }
          clearBusy();
          failToast(
            payment?.message || payment?.type || t("checkout.moyasarPayFailed")
          );
          return;
        }

        if (orderSnap.isGuest) {
          await ordersApi.attachMoyasarGuestPayment(orderSnap.id, payment.id);
        } else {
          await ordersApi.attachMoyasarPayment(orderSnap.id, payment.id);
        }

        const confirm = await ordersApi.confirmMoyasarPayment({
          paymentId: payment.id,
          orderId: orderSnap.id,
        });

        try {
          session.completePayment(AP.STATUS_SUCCESS);
        } catch {
          /* already closed */
        }
        clearBusy();
        onClose();

        if (confirm.isPaid) {
          const qs = new URLSearchParams();
          qs.set("id", orderSnap.id);
          if (orderSnap.isGuest) qs.set("guest", "1");
          router.push(localize(`${ROUTES.orderSuccess}?${qs.toString()}`));
          return;
        }

        const returnQs = new URLSearchParams();
        returnQs.set("oid", orderSnap.id);
        returnQs.set("id", payment.id);
        if (orderSnap.isGuest) returnQs.set("guest", "1");
        router.push(
          localize(`${ROUTES.orderMoyasarReturn}?${returnQs.toString()}`)
        );
      } catch (e) {
        try {
          session.completePayment(AP.STATUS_FAILURE);
        } catch {
          /* already closed */
        }
        clearBusy();
        const message =
          e instanceof ApiError
            ? e.message
            : e instanceof Error
              ? e.message
              : t("checkout.moyasarPayFailed");
        failToast(message);
      }
    };

    session.oncancel = () => {
      clearBusy();
    };

    try {
      session.begin();
    } catch (e) {
      clearBusy();
      failToast(
        e instanceof Error ? e.message : t("checkout.moyasarPayFailed")
      );
    }
  }, [
    paying,
    validateSheetFields,
    failToast,
    moyasarFormQuery.data,
    t,
    ensureExpressOrder,
    dialCode,
    onClose,
    router,
    localize,
  ]);

  if (!gated) return null;

  const bootstrap = moyasarFormQuery.data;
  const ctaDisabled = personalizationBusy || !product.inStock || product.comingSoon;
  const payDisabled =
    paying ||
    preparingOrder ||
    !orderReady ||
    !appleOk ||
    !bootstrap ||
    moyasarFormQuery.isLoading;

  // previewAmount kept on the public props API (AddToCartPanel still passes it).
  void previewAmount;

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
        onClose={() => {
          // Abort before unmount so Apple's session isn't torn down uncleanly.
          safeAbortSession(activeSessionRef.current);
          activeSessionRef.current = null;
          sessionBusyRef.current = false;
          setPaying(false);
          onClose();
        }}
        title={t("product.applePaySheetTitle")}
        description={t("product.applePaySheetSubtitle")}
        size="md"
      >
        <div className="flex flex-col gap-4">
          {!appleOk ? (
            <p className="rounded-xl border border-ink-200 bg-cream-50 px-4 py-3 text-sm text-ink-700">
              {t("product.applePayUnsupported")}
            </p>
          ) : (
            <p className="text-sm text-ink-600">{t("product.applePayWalletHint")}</p>
          )}

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

          {appleOk && preparingOrder ? (
            <p className="text-sm text-ink-500">{t("checkout.moyasarFormLoading")}</p>
          ) : null}

          {/* Use our own button — Apple's <apple-pay-button> custom element throws
              "object does not support the operation or argument" when React
              unmounts it on modal close/reopen. ApplePaySession still runs from
              this click (user-gesture safe). */}
          {appleOk && bootstrap && !preparingOrder ? (
            <button
              type="button"
              disabled={payDisabled}
              onClick={startApplePay}
              className="inline-flex h-14 w-full items-center justify-center gap-2 rounded-2xl bg-black px-8 text-base font-medium text-white transition hover:bg-ink-900 disabled:cursor-not-allowed disabled:opacity-50"
              aria-label={t("product.applePayCta")}
            >
              <AppleLogoMark className="shrink-0 text-white" />
              <span>
                {paying
                  ? t("checkout.moyasarFormLoading")
                  : t("product.applePayCta")}
              </span>
            </button>
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
