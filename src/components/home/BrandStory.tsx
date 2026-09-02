import { LocalizedLink } from "@/components/ui/LocalizedLink";
import { Section, Button } from "@/components/ui";
import { Reveal } from "@/components/motion/primitives";
import { ArrowRight } from "@/components/icons";
import { ROUTES } from "@/constants/routes";
import { getServerLocale } from "@/i18n/server";
import { t } from "@/i18n";

/**
 * Brand story blurb ("Online gift shop") — mirrors the client's about section.
 * Centered editorial copy on cream with a two-column body and single CTA.
 */
export async function BrandStory() {
  const locale = await getServerLocale();

  return (
    <Section spacing="lg" tone="cream" containerSize="md">
      <Reveal>
        <div className="mx-auto max-w-5xl text-center">
          <p className="text-xs font-semibold uppercase tracking-[0.2em] text-bloom-700">
            {t(locale, "home.storyEyebrow")}
          </p>
          <h2 className="mt-4 font-display text-3xl font-medium leading-tight text-ink-900 md:text-4xl lg:text-5xl">
            {t(locale, "home.storyTitle")}
          </h2>
          <div className="mt-5 grid gap-6 text-start md:grid-cols-2 md:gap-10">
            <p className="text-base leading-relaxed text-ink-600 md:text-lg">
              {t(locale, "home.storyBodyCol1")}
            </p>
            <p className="text-base leading-relaxed text-ink-600 md:text-lg">
              {t(locale, "home.storyBodyCol2")}
            </p>
          </div>
          <p className="mt-6 text-base leading-relaxed text-ink-600 md:text-lg">
            {t(locale, "home.storyBodyFooter")}
          </p>
          <LocalizedLink href={ROUTES.shop} className="mt-8 inline-flex">
            <Button
              variant="primary"
              size="lg"
              trailingIcon={<ArrowRight size={18} className="rtl:-scale-x-100" />}
            >
              {t(locale, "home.storyCta")}
            </Button>
          </LocalizedLink>
        </div>
      </Reveal>
    </Section>
  );
}
