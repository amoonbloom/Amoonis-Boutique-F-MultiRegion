import { LocalizedLink } from "@/components/ui/LocalizedLink";
import { Container, Button } from "@/components/ui";
import { AlertIcon } from "@/components/icons";
import { ROUTES } from "@/constants/routes";
import { getServerLocale } from "@/i18n/server";
import { t } from "@/i18n";

export const metadata = { title: "Order issue" };

export default async function OrderErrorPage(
  props: PageProps<"/[region]/[locale]/order/error">
) {
  const search = await props.searchParams;
  const message =
    typeof search?.message === "string" ? search.message : undefined;
  const tabbyReason =
    typeof search?.tabby === "string" ? search.tabby.toLowerCase() : undefined;
  const locale = await getServerLocale();

  const body =
    message ||
    (tabbyReason === "cancel"
      ? t(locale, "checkout.tabbyCancelMessage")
      : tabbyReason === "failure"
        ? t(locale, "checkout.tabbyFailureMessage")
        : t(locale, "order.errorBody"));

  return (
    <Container className="flex min-h-[60vh] flex-col items-center justify-center py-24 text-center">
      <span className="inline-flex h-16 w-16 items-center justify-center rounded-full bg-rose-50 text-rose-700">
        <AlertIcon size={32} />
      </span>
      <p className="mt-6 text-xs font-semibold uppercase tracking-[0.18em] text-bloom-700">
        {t(locale, "order.errorEyebrow")}
      </p>
      <h1 className="mt-2 font-display text-5xl font-medium leading-tight text-ink-900 md:text-6xl">
        {t(locale, "order.errorTitle")}
      </h1>
      <p className="mt-4 max-w-lg text-base text-ink-600">{body}</p>
      <div className="mt-8 flex flex-wrap justify-center gap-3">
        <LocalizedLink href={ROUTES.checkout} className="contents">
          <Button size="lg">{t(locale, "order.tryAgain")}</Button>
        </LocalizedLink>
        <LocalizedLink href="/contact" className="contents">
          <Button size="lg" variant="outline">
            {t(locale, "order.contactConcierge")}
          </Button>
        </LocalizedLink>
      </div>
    </Container>
  );
}
