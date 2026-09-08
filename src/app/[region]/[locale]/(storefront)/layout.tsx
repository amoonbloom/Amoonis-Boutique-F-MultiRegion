import type { ReactNode } from "react";
import { cookies, headers } from "next/headers";
import { notFound, redirect } from "next/navigation";
import { Header } from "@/components/layout/Header";
import { Footer } from "@/components/layout/Footer";
import { WhatsAppFloatButton } from "@/components/layout/WhatsAppFloatButton";
import { CartDrawer } from "@/features/cart/components/CartDrawer";
import { CartPersistence } from "@/features/cart/components/CartPersistence";
import { CartSync } from "@/features/cart/components/CartSync";
import { WishlistPersistence } from "@/features/wishlist/components/WishlistPersistence";
import { LocationPersistence } from "@/features/location/components/LocationPersistence";
import { RegionLocaleSync } from "@/features/location/components/RegionLocaleSync";
import { LocationOnboarding } from "@/features/location/components/LocationOnboarding";
import { AuthHydrator } from "@/features/auth/components/AuthHydrator";
import { ScrollManager } from "@/components/layout/ScrollManager";
import { getServerLocale } from "@/i18n/server";
import { t } from "@/i18n";
import { getCachedRegions, getCachedPublicSettings } from "@/services/catalogCache";
import {
  LOCALES,
  activeRegionSlugs,
  buildPrefix,
  parsePrefix,
  regionSlug,
  withLocale,
  withPrefix,
  PATHNAME_HEADER,
  SEARCH_HEADER,
  LOCALE_CHOSEN_COOKIE,
} from "@/features/location/routing";

/**
 * Storefront shell for the `/:region/:locale` segment. This is the AUTHORITATIVE
 * validation boundary for the URL: the edge proxy only shape-checks the prefix,
 * so a bad locale is turned into a 404 here, and a region slug that isn't active
 * (validated against the live active-regions list) is bounced to an open region.
 * The proxy has already injected the matching `x-region-slug`/`x-locale` headers,
 * so the server resolvers used throughout the tree resolve to this region/locale.
 */
export default async function StorefrontLayout({
  children,
  params,
}: Readonly<{ children: ReactNode; params: Promise<{ region: string; locale: string }> }>) {
  const { region, locale: localeParam } = await params;
  if (!(LOCALES as string[]).includes(localeParam)) notFound();

  // Where the visitor actually asked to go. Both redirects below rebuild the URL
  // and must carry BOTH of these through, or the destination is lost — an
  // emailed `/order/status?id=…` used to arrive at the homepage with no order.
  const requestHeaders = await headers();
  const requestPath =
    requestHeaders.get(PATHNAME_HEADER) ?? buildPrefix(region, localeParam);
  const requestSearch = requestHeaders.get(SEARCH_HEADER) ?? "";

  const regions = await getCachedRegions().catch(() => []);
  // `GET /regions` (public) already returns ONLY active regions, so any slug that
  // isn't in this list is either hidden-by-admin or unknown.
  if (!activeRegionSlugs(regions).includes(region.toLowerCase())) {
    // Don't 404 when other regions are OPEN — that strands every visitor whose
    // default/last-used region has been hidden (the edge proxy sends a bare "/"
    // to NEXT_PUBLIC_DEFAULT_REGION_SLUG; if that region is hidden, the old code
    // 404'd even though another region was live). Bounce to the best available
    // active region instead: the one flagged default, else the first by
    // sortOrder. The target is guaranteed active (drawn from this same list), so
    // it can't loop, and the proxy re-syncs the region_slug cookie on the
    // redirect, so a later bare-path visit lands here directly. Only a store
    // with ZERO open regions 404s.
    //
    // The requested sub-path and query ride along: swapping the region is no
    // reason to forget which page the visitor asked for.
    const fallback = regions.find((r) => r.isDefault) ?? regions[0];
    if (fallback) {
      const rest = parsePrefix(requestPath)?.rest ?? "/";
      const prefix = buildPrefix(regionSlug(fallback), localeParam);
      redirect(withPrefix(prefix, rest) + requestSearch);
    }
    notFound();
  }

  // Global default language (flash-free). A visitor who hasn't explicitly picked
  // a language (no `locale_chosen` cookie) is redirected — server-side, before
  // any paint — to the admin's configured default (Settings.defaultLocale). An
  // explicit choice always wins. A backend blip just skips the redirect (the
  // page renders in the URL's locale) rather than erroring. This can't loop:
  // after the redirect the URL locale equals the default, so the guard is false.
  const settings = await getCachedPublicSettings().catch(() => null);
  const defaultLocale = settings?.defaultLocale;
  if (
    defaultLocale &&
    (LOCALES as string[]).includes(defaultLocale) &&
    defaultLocale !== localeParam
  ) {
    const chose = (await cookies()).get(LOCALE_CHOSEN_COOKIE)?.value === "1";
    if (!chose) redirect(withLocale(requestPath, defaultLocale) + requestSearch);
  }

  const locale = await getServerLocale();
  return (
    <>
      <ScrollManager />
      <AuthHydrator />
      <CartPersistence />
      <CartSync />
      <WishlistPersistence />
      <RegionLocaleSync />
      <LocationPersistence />
      <LocationOnboarding />
      <a
        href="#main"
        className="sr-only focus:not-sr-only focus:absolute focus:inset-s-4 focus:top-4 focus:z-50 focus:rounded-full focus:bg-ink-900 focus:px-4 focus:py-2 focus:text-sm focus:text-white"
      >
        {t(locale, "a11y.skipToContent")}
      </a>
      <Header />
      <main id="main" className="flex flex-1 flex-col">
        {children}
      </main>
      <Footer />
      <WhatsAppFloatButton />
      <CartDrawer />
    </>
  );
}
