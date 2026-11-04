"use client";

import { useEffect, useRef, useState } from "react";
import type { MoyasarEmbeddedForm } from "@/features/orders/types";
import { ordersApi } from "@/features/orders/api/orders.api";
import { useT } from "@/i18n/useT";

type MoyasarGlobal = {
  init: (config: Record<string, unknown>) => void;
};

declare global {
  interface Window {
    Moyasar?: MoyasarGlobal;
  }
}

/** Overrides returned from on_initiating after the checkout order is created. */
export type MoyasarInitiatingResult = {
  orderId: string;
  isGuest: boolean;
  amount: number;
  description: string;
  callbackUrl: string;
  metadata: Record<string, string>;
};

type Props = {
  /** Initial form config (pay page: full order config; checkout: bootstrap + cart amount). */
  form: Pick<
    MoyasarEmbeddedForm,
    | "publishableApiKey"
    | "amount"
    | "currency"
    | "description"
    | "callbackUrl"
    | "language"
    | "methods"
    | "supportedNetworks"
    | "scriptUrl"
    | "cssUrl"
  > & {
    metadata?: Record<string, string>;
    applePay?: MoyasarEmbeddedForm["applePay"];
  };
  /**
   * Pay page: order already exists. Checkout: omit and provide onInitiating so the
   * order is created when the customer taps Pay / Apple Pay.
   */
  orderId?: string;
  isGuest?: boolean;
  /** Create/validate order before Moyasar charges; return false to abort. */
  onInitiating?: () => Promise<false | MoyasarInitiatingResult>;
  onFailure?: (message: string) => void;
};

function ensureStylesheet(href: string) {
  if (document.querySelector(`link[data-moyasar-css="${href}"]`)) return;
  const link = document.createElement("link");
  link.rel = "stylesheet";
  link.href = href;
  link.dataset.moyasarCss = href;
  document.head.appendChild(link);
}

function loadScript(src: string): Promise<void> {
  if (window.Moyasar) return Promise.resolve();
  const existing = document.querySelector<HTMLScriptElement>(
    `script[data-moyasar-js="${src}"]`
  );
  if (existing) {
    return new Promise((resolve, reject) => {
      existing.addEventListener("load", () => resolve());
      existing.addEventListener("error", () =>
        reject(new Error("Failed to load Moyasar form script"))
      );
      if (window.Moyasar) resolve();
    });
  }
  return new Promise((resolve, reject) => {
    const script = document.createElement("script");
    script.src = src;
    script.async = true;
    script.dataset.moyasarJs = src;
    script.onload = () => resolve();
    script.onerror = () => reject(new Error("Failed to load Moyasar form script"));
    document.body.appendChild(script);
  });
}

/**
 * Embeds Moyasar Form so the customer never goes to checkout.moyasar.com.
 * On checkout, pass onInitiating to create the order when Pay is pressed.
 * 3DS may briefly leave for the bank ACS, then returns to our callback_url.
 */
export function MoyasarPayForm({
  form,
  orderId,
  isGuest = false,
  onInitiating,
  onFailure,
}: Props) {
  const { t } = useT();
  const [ready, setReady] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);
  const sessionRef = useRef<{ orderId: string; isGuest: boolean } | null>(
    orderId ? { orderId, isGuest } : null
  );
  const onInitiatingRef = useRef(onInitiating);
  const onFailureRef = useRef(onFailure);
  onInitiatingRef.current = onInitiating;
  onFailureRef.current = onFailure;

  useEffect(() => {
    if (orderId) sessionRef.current = { orderId, isGuest };
  }, [orderId, isGuest]);

  useEffect(() => {
    let cancelled = false;

    (async () => {
      try {
        ensureStylesheet(form.cssUrl);
        await loadScript(form.scriptUrl);
        if (cancelled) return;
        if (!window.Moyasar) {
          throw new Error("Moyasar form unavailable");
        }

        // Wait a tick so .mysr-form is committed in the DOM (Strict Mode safe).
        await new Promise((r) => requestAnimationFrame(() => r(undefined)));
        if (cancelled) return;

        const host = document.querySelector(".mysr-form");
        if (!host) throw new Error("Payment form container missing");
        host.innerHTML = "";

        const methods = [...form.methods];
        // Moyasar requires an absolute callback URL; resolve relative paths on the client.
        const callbackUrl = (() => {
          try {
            return new URL(form.callbackUrl, window.location.origin).toString();
          } catch {
            return form.callbackUrl;
          }
        })();
        const initConfig: Record<string, unknown> = {
          element: ".mysr-form",
          amount: form.amount,
          currency: form.currency,
          description: form.description,
          publishable_api_key: form.publishableApiKey,
          callback_url: callbackUrl,
          language: form.language,
          methods,
          supported_networks: form.supportedNetworks,
          metadata: form.metadata ?? {},
          // Keep Moyasar's designed ~360px layout so card icons don't crush the number field.
          fixed_width: true,
          on_initiating: async () => {
            const handler = onInitiatingRef.current;
            if (!handler) return true;
            try {
              const result = await handler();
              if (result === false) return false;
              sessionRef.current = {
                orderId: result.orderId,
                isGuest: result.isGuest,
              };
              return {
                amount: result.amount,
                description: result.description,
                callback_url: result.callbackUrl,
                metadata: result.metadata,
              };
            } catch (e) {
              const message =
                e instanceof Error && e.message.trim()
                  ? e.message
                  : t("checkout.moyasarPayFailed");
              onFailureRef.current?.(message);
              return false;
            }
          },
          on_completed: async (payment: { id?: string }) => {
            const paymentId = payment?.id ? String(payment.id) : "";
            const session = sessionRef.current;
            if (!paymentId || !session?.orderId) return;
            try {
              if (session.isGuest) {
                await ordersApi.attachMoyasarGuestPayment(
                  session.orderId,
                  paymentId
                );
              } else {
                await ordersApi.attachMoyasarPayment(session.orderId, paymentId);
              }
            } catch (e) {
              console.warn("[moyasar] attach payment id failed", e);
            }
          },
          on_failure: async (err: string) => {
            const message =
              typeof err === "string" && err.trim()
                ? err
                : t("checkout.moyasarPayFailed");
            onFailureRef.current?.(message);
          },
        };

        if (methods.includes("applepay") && form.applePay) {
          initConfig.apple_pay = {
            country: form.applePay.country,
            label: form.applePay.label,
            validate_merchant_url: form.applePay.validateMerchantUrl,
          };
        }

        // Apple Pay button is rendered by Moyasar only when the browser supports it
        // (Safari on Apple devices with Apple Pay). Elsewhere the method is omitted.
        window.Moyasar.init(initConfig);

        // Ensure card-number text never sits under the absolute brand icons.
        const syncCardIconPadding = () => {
          const input = host.querySelector<HTMLElement>(
            ".mysr-form-ccInputGroup > .mysr-form-input"
          );
          const icons = host.querySelector<HTMLElement>(".mysr-form-ccIconsGroup");
          if (!input || !icons) return;
          const iconW = Math.ceil(icons.getBoundingClientRect().width);
          if (iconW > 0) {
            input.style.setProperty(
              "padding-right",
              `${iconW + 14}px`,
              "important"
            );
          }
        };
        requestAnimationFrame(() => {
          syncCardIconPadding();
          requestAnimationFrame(syncCardIconPadding);
        });

        if (!cancelled) setReady(true);
      } catch (e) {
        const message =
          e instanceof Error ? e.message : t("checkout.moyasarFormLoadError");
        if (!cancelled) {
          setLoadError(message);
          onFailureRef.current?.(message);
        }
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [
    form.amount,
    form.callbackUrl,
    form.publishableApiKey,
    form.cssUrl,
    form.scriptUrl,
    form.currency,
    form.description,
    form.language,
    // methods / networks / applePay: re-init when the enabled set changes
    form.methods.join(","),
    form.supportedNetworks.join(","),
    form.applePay?.country,
    form.applePay?.label,
    form.applePay?.validateMerchantUrl,
    t,
  ]);

  return (
    <div className="w-full">
      {!ready && !loadError ? (
        <p className="mb-4 text-sm text-ink-500">{t("checkout.moyasarFormLoading")}</p>
      ) : null}
      {loadError ? (
        <p className="mb-4 rounded-xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-800">
          {loadError}
        </p>
      ) : null}
      <div className="mysr-form min-h-[280px]" />
    </div>
  );
}
