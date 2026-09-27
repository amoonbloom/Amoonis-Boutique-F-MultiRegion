import { LocalizedLink } from "@/components/ui/LocalizedLink";
import {
  InstagramIcon,
  FacebookIcon,
  TikTokIcon,
  ThreadsIcon,
  SnapchatIcon,
  XIcon,
  YouTubeIcon,
} from "@/components/icons";
import { EmailLink, PhoneLink } from "@/components/ui/ContactLink";
import { siteConfig } from "@/config/site";
import { ROUTES } from "@/constants/routes";
import { getServerT } from "@/i18n/server";
import { getServerRegion } from "@/services/serverRegion";
import { getCachedCategories, getCachedRegions } from "@/services/catalogCache";

/**
 * Resolves a footer shop-column link to a real category, or null when that
 * category isn't publicly visible.
 *
 * The labels in the shop column are hardcoded, but `getCachedCategories()`
 * returns only what the STOREFRONT may see — so a category that is renamed,
 * removed, or set to DRAFT simply isn't in the list. Previously this fell back
 * to the full shop page, which meant a hidden (draft) category kept advertising
 * itself in the footer of every page and dumped the customer on /shop, where
 * its products don't exist. Returning null lets the caller drop the link
 * entirely instead.
 */
function categoryHref(
  categories: { id: string; title?: string }[],
  pattern: RegExp
): string | null {
  const match = categories.find((c) => pattern.test(c.title ?? ""));
  return match ? ROUTES.category(match.id) : null;
}

function FooterLink({ href, label }: { href: string; label: string }) {
  const isExternal = href.startsWith("http");
  const className = "text-sm text-cream-100/80 transition-colors hover:text-bloom-300";
  if (isExternal) {
    return (
      <a href={href} target="_blank" rel="noreferrer" className={className}>
        {label}
      </a>
    );
  }
  return (
    <LocalizedLink href={href} className={className}>
      {label}
    </LocalizedLink>
  );
}

export async function Footer() {
  const regionCode = await getServerRegion();
  const [{ t, locale }, categories, regions] = await Promise.all([
    getServerT(),
    getCachedCategories().catch(() => []),
    getCachedRegions().catch(() => []),
  ]);

  // Region-specific legal entity name for the copyright line (admin-editable per
  // region). Falls back to the default region, then the static site config, so
  // regions without one set (or a failed fetch) still render a sensible line.
  const currentRegion =
    regions.find((r) => r.code.toUpperCase() === regionCode?.toUpperCase()) ??
    regions.find((r) => r.isDefault) ??
    null;
  const legalEntity = currentRegion?.legalEntity?.trim() || siteConfig.legalEntity;

  // Country name for the currently selected region (e.g. "Saudi Arabia" on
  // /sa/), used in the footer's address/hours lines instead of a hardcoded
  // "Dubai, UAE" — falls back to the site default when no region resolved.
  const regionCountryName =
    (locale === "ar" ? currentRegion?.name_ar : currentRegion?.name)?.trim() ||
    currentRegion?.name?.trim() ||
    null;

  const columns = [
    {
      title: t("footer.explore"),
      links: [
        { href: ROUTES.home, label: t("common.home") },
        { href: ROUTES.shop, label: t("common.shop") },
        { href: "/#best-sellers", label: t("footer.bestSeller") },
        { href: ROUTES.contact, label: t("nav.contact") },
      ],
    },
    {
      title: t("footer.shop"),
      // A category that isn't publicly visible (DRAFT, renamed, removed) resolves
      // to null and is DROPPED here — otherwise the footer of every page keeps
      // advertising a hidden category and sends the customer to a shop page that
      // doesn't contain its products.
      links: (
        [
          {
            href: categoryHref(categories, /gift\s*box/i),
            label: t("footer.giftBoxes"),
          },
          {
            href: categoryHref(categories, /flower\s*bouquet/i),
            label: t("footer.flowerBouquets"),
          },
          {
            href: categoryHref(categories, /flower\s*mug/i),
            label: t("footer.flowerMugs"),
          },
          {
            href: categoryHref(categories, /newborn/i),
            label: t("footer.newbornGifts"),
          },
        ] as { href: string | null; label: string }[]
      ).filter((l): l is { href: string; label: string } => l.href !== null),
    },
  ];

  // Legal/policy links — only shown for pages the admin has actually published
  // in this region ("hidden until set"). If none are published, the whole "Care"
  // column is omitted rather than rendered empty.
  const legalLinks: { slug: string; href: string; label: string }[] = [
    { slug: "terms", href: ROUTES.terms, label: t("footer.termsConditions") },
    { slug: "refund-policy", href: ROUTES.refundPolicy, label: t("footer.refundReturnPolicy") },
    { slug: "product-disclaimer", href: ROUTES.productDisclaimer, label: t("footer.productDisclaimer") },
    { slug: "privacy", href: ROUTES.privacy, label: t("footer.privacyPolicy") },
    { slug: "shipping-policy", href: ROUTES.shippingPolicy, label: t("footer.shippingPolicy") },
  ];
  const publishedSlugs = new Set(currentRegion?.publishedPageSlugs ?? []);
  const careLinks = legalLinks
    .filter((l) => publishedSlugs.has(l.slug))
    .map(({ href, label }) => ({ href, label }));
  if (careLinks.length > 0) {
    columns.push({ title: t("footer.care"), links: careLinks });
  }

  // Region-specific contact info (admin-editable per region), same fallback
  // convention as legalEntity above. Address/hours specifically fall back to
  // the pre-existing behavior (region country name / the {city}-templated
  // hours string) rather than jumping straight to siteConfig — that's what
  // every region without an explicit override already shows today.
  const contactPhone = currentRegion?.contactPhone?.trim() || siteConfig.contact.phone;
  const contactEmail = currentRegion?.contactEmail?.trim() || siteConfig.contact.email;
  const contactAddress =
    (locale === "ar" ? currentRegion?.address_ar?.trim() : undefined) ||
    currentRegion?.address?.trim() ||
    regionCountryName ||
    siteConfig.contact.address;
  const contactHours =
    (locale === "ar" ? currentRegion?.hours_ar?.trim() : undefined) ||
    currentRegion?.hours?.trim() ||
    t("footer.hoursTemplate", { city: regionCountryName ?? "" });

  const contactLines: (
    | { type: "phone" | "email" | "text"; value: string }
  )[] = [
    { type: "phone", value: contactPhone },
    { type: "email", value: contactEmail },
    { type: "text", value: contactAddress },
    { type: "text", value: contactHours },
  ];

  // Per-region social links (admin-editable). An icon is shown ONLY when the
  // current region has set that link — no site-wide fallback — so a network the
  // region left blank is hidden entirely (via the .filter below).
  const socials = [
    { href: currentRegion?.instagramUrl?.trim() || "", label: "Instagram", Icon: InstagramIcon },
    { href: currentRegion?.facebookUrl?.trim() || "", label: "Facebook", Icon: FacebookIcon },
    { href: currentRegion?.tiktokUrl?.trim() || "", label: "TikTok", Icon: TikTokIcon },
    { href: currentRegion?.threadsUrl?.trim() || "", label: "Threads", Icon: ThreadsIcon },
    { href: currentRegion?.snapchatUrl?.trim() || "", label: "Snapchat", Icon: SnapchatIcon },
    { href: currentRegion?.xUrl?.trim() || "", label: "X", Icon: XIcon },
    { href: currentRegion?.youtubeUrl?.trim() || "", label: "YouTube", Icon: YouTubeIcon },
  ].filter((s) => s.href);

  return (
    <footer className="bg-[#170b10] text-cream-100">
      <div className="mx-auto max-w-7xl px-6 py-16 lg:px-8">
        <div className="max-w-lg">
          <LocalizedLink href={ROUTES.home} className="inline-flex items-center">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src="/logo.svg" alt={siteConfig.name} className="h-10 w-auto sm:h-12" />
          </LocalizedLink>
          <p className="mt-5 text-sm leading-relaxed text-cream-100/70">
            {t("footer.brandDesc", { country: regionCountryName ?? "" })}
          </p>
          <div className="mt-6 flex items-center gap-3">
            {socials.map(({ href, label, Icon }) => (
              <a
                key={label}
                href={href}
                target="_blank"
                rel="noreferrer"
                aria-label={label}
                className="inline-flex h-10 w-10 items-center justify-center rounded-full bg-white/8 text-cream-100/80 transition-colors hover:bg-white/15 hover:text-bloom-300"
              >
                <Icon size={17} />
              </a>
            ))}
          </div>
        </div>

        <div className="mt-12 border-t border-white/10" />

        <div className="mt-12 grid gap-10 sm:grid-cols-2 lg:grid-cols-4">
          {columns.map((column) => (
            <div key={column.title}>
              <p className="text-xs font-semibold uppercase tracking-[0.18em] text-bloom-400">
                {column.title}
              </p>
              <ul className="mt-4 flex flex-col gap-2.5">
                {column.links.map((link) => (
                  <li key={link.label}>
                    <FooterLink href={link.href} label={link.label} />
                  </li>
                ))}
              </ul>
            </div>
          ))}

          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.18em] text-bloom-400">
              {t("nav.contact")}
            </p>
            <ul className="mt-4 flex flex-col gap-2.5">
              {contactLines.map((line) => (
                <li key={line.value} className="flex items-start gap-2 text-sm text-cream-100/80">
                  <span aria-hidden className="mt-2 h-1 w-1 shrink-0 rounded-full bg-cream-100/50" />
                  {line.type === "phone" ? (
                    <PhoneLink
                      phone={line.value}
                      className="text-cream-100/80 no-underline hover:text-bloom-300"
                    />
                  ) : line.type === "email" ? (
                    <EmailLink
                      email={line.value}
                      className="text-cream-100/80 no-underline hover:text-bloom-300"
                    />
                  ) : (
                    <span>{line.value}</span>
                  )}
                </li>
              ))}
            </ul>
          </div>
        </div>
      </div>

      <div className="mx-auto max-w-7xl px-6 pb-10 lg:px-8">
        <div className="rounded-2xl border border-white/10 px-6 py-4 text-xs text-cream-100/50">
          © {new Date().getFullYear()} {legalEntity}. {t("footer.rights")}
        </div>
      </div>
    </footer>
  );
}
