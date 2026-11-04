"use client";

import { useEffect, useMemo, useState } from "react";
import { useSearchParams } from "next/navigation";
import { useQuery } from "@tanstack/react-query";
import { Container } from "@/components/ui";
import { LocalizedLink } from "@/components/ui/LocalizedLink";
import { MoyasarPayForm } from "@/components/checkout/MoyasarPayForm";
import { ROUTES } from "@/constants/routes";
import { ordersApi } from "@/features/orders/api/orders.api";
import { useLocalizedHref } from "@/features/location/useLocalizedHref";
import { useT } from "@/i18n/useT";
import { formatCurrency } from "@/lib/format";
import { useCurrency } from "@/features/location/hooks/useCurrency";
import type { MoyasarEmbeddedForm } from "@/features/orders/types";

export function MoyasarPayClient() {
  const { t, locale } = useT();
  const localize = useLocalizedHref();
  const { currency, locale: intlLocale } = useCurrency();
  const search = useSearchParams();
  const orderId = search.get("id") || "";
  const isGuest = search.get("guest") === "1";
  const [formError, setFormError] = useState<string | null>(null);
  // Avoid SSR/client searchParams hydration mismatch — wait until mounted.
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);

  const callbackUrl = useMemo(() => {
    if (!mounted || !orderId) return "";
    const u = new URL(
      localize(ROUTES.orderMoyasarReturn),
      window.location.origin
    );
    u.searchParams.set("oid", orderId);
    if (isGuest) u.searchParams.set("guest", "1");
    return u.toString();
  }, [mounted, orderId, isGuest, localize]);

  const payQuery = useQuery({
    queryKey: ["moyasar-pay", orderId, isGuest, callbackUrl, locale],
    enabled: Boolean(mounted && orderId && callbackUrl),
    retry: 1,
    queryFn: async () => {
      const opts = {
        returnUrl: callbackUrl,
        lang: (locale === "ar" ? "ar" : "en") as "en" | "ar",
      };
      return isGuest
        ? ordersApi.guestPay(orderId, opts)
        : ordersApi.pay(orderId, opts);
    },
  });

  // Fallback: if API ever returns redirect mode, leave to hosted URL.
  useEffect(() => {
    if (payQuery.data?.mode === "redirect" && payQuery.data.paymentUrl) {
      window.location.href = payQuery.data.paymentUrl;
    }
  }, [payQuery.data]);

  if (!mounted) {
    // First paint (SSR + pre-mount): same loading shell on server and client.
    return (
      <Container className="py-16 text-center">
        <p className="text-sm text-ink-500">{t("checkout.moyasarFormLoading")}</p>
      </Container>
    );
  }

  if (!orderId) {
    return (
      <Container className="py-16 text-center">
        <h1 className="font-display text-3xl text-ink-900">
          {t("checkout.moyasarPayTitle")}
        </h1>
        <p className="mt-3 text-ink-600">{t("checkout.moyasarMissingOrder")}</p>
        <LocalizedLink
          href={ROUTES.checkout}
          className="mt-6 inline-block text-sm font-medium text-bloom-700 underline"
        >
          {t("checkout.backToCheckout")}
        </LocalizedLink>
      </Container>
    );
  }

  if (payQuery.isLoading || payQuery.isFetching) {
    return (
      <Container className="py-16 text-center">
        <p className="text-sm text-ink-500">{t("checkout.moyasarFormLoading")}</p>
      </Container>
    );
  }

  if (payQuery.isError || !payQuery.data) {
    const message =
      payQuery.error instanceof Error
        ? payQuery.error.message
        : t("checkout.moyasarFormLoadError");
    return (
      <Container className="py-16 text-center">
        <h1 className="font-display text-3xl text-ink-900">
          {t("checkout.moyasarPayTitle")}
        </h1>
        <p className="mt-3 text-ink-600">{message}</p>
        <LocalizedLink
          href={ROUTES.checkout}
          className="mt-6 inline-block text-sm font-medium text-bloom-700 underline"
        >
          {t("checkout.backToCheckout")}
        </LocalizedLink>
      </Container>
    );
  }

  const form = payQuery.data.form as MoyasarEmbeddedForm | null;
  if (payQuery.data.mode !== "embedded" || !form) {
    return (
      <Container className="py-16 text-center">
        <p className="text-sm text-ink-500">{t("checkout.moyasarFormLoading")}</p>
      </Container>
    );
  }

  const amountMajor = form.amount / 100;

  return (
    <Container className="max-w-lg py-12 md:py-16">
      <p className="text-xs font-semibold uppercase tracking-[0.18em] text-bloom-700">
        {t("checkout.moyasarPayEyebrow")}
      </p>
      <h1 className="mt-2 font-display text-3xl font-medium text-ink-900 md:text-4xl">
        {t("checkout.moyasarPayTitle")}
      </h1>
      <p className="mt-2 text-sm text-ink-600">
        {t("checkout.moyasarPayHint", {
          amount: formatCurrency(amountMajor, form.currency || currency, intlLocale),
        })}
      </p>

      {formError ? (
        <p className="mt-4 rounded-xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-800">
          {formError}
        </p>
      ) : null}

      <div className="mt-8 rounded-2xl border border-ink-100 bg-white p-4 sm:p-6">
        <MoyasarPayForm
          orderId={orderId}
          isGuest={isGuest}
          form={form}
          onFailure={setFormError}
        />
      </div>

      <p className="mt-6 text-center text-xs text-ink-500">
        <LocalizedLink href={ROUTES.checkout} className="underline hover:text-ink-800">
          {t("checkout.backToCheckout")}
        </LocalizedLink>
        {" · "}
        <LocalizedLink
          href={`${ROUTES.orderError}?id=${encodeURIComponent(orderId)}`}
          className="underline hover:text-ink-800"
        >
          {t("checkout.moyasarCancelPay")}
        </LocalizedLink>
      </p>
    </Container>
  );
}
