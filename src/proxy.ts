import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import {
  LOCALES,
  DEFAULT_LOCALE,
  DEFAULT_REGION_SLUG,
  parsePrefix,
  buildPrefix,
  REGION_SLUG_HEADER,
  LOCALE_HEADER,
  PATHNAME_HEADER,
  SEARCH_HEADER,
  REGION_SLUG_COOKIE,
  type ParsedPrefix,
} from "@/features/location/routing";

/**
 * Edge proxy (Next 16's renamed Middleware) — two jobs:
 *
 * 1. REGION/LOCALE ROUTING. Every storefront URL is `/:regionSlug/:locale/...`
 *    (e.g. `/ae/en/shop`), so region + language live in the URL (shareable,
 *    indexable, QA-able) instead of only in cookies. A bare/unprefixed path is
 *    redirected to the canonical prefixed URL, choosing the visitor's last
 *    region/locale (cookies) or, on a first visit, their `Accept-Language` with
 *    a fallback to `/ae/en`. When the prefix is present we inject it as request
 *    headers so the server resolvers (`getServerLocale`/`getServerRegion*`) can
 *    read it without threading route params through every SSR consumer, and
 *    mirror it into cookies so the next bare-path visit stays consistent. The
 *    AUTHORITATIVE slug/locale validation (404 on an unknown region) happens in
 *    the `[region]/[locale]` layout — the edge only does a cheap shape check so
 *    it never fetches data here (per Next's proxy guidance).
 *
 * 2. OPTIMISTIC AUTH BOUNCE. Same defense-in-depth as before: a request with no
 *    session cookie to `/admin/*` or `/:region/:locale/account/*` is redirected
 *    to login before it reaches those pages. Role enforcement still happens in
 *    `AdminShell`/`AccountGuard` and the backend authorizes every request.
 */

const SESSION_COOKIE = "amoonis.session";
const LOCALE_COOKIE = "locale"; // inlined (not imported from @/i18n) to keep the edge bundle light

const YEAR_SECONDS = 31_536_000;

/** First-visit locale: prior cookie choice → Accept-Language (Arabic?) → English. */
function pickLocale(request: NextRequest): string {
  const cookieLocale = request.cookies.get(LOCALE_COOKIE)?.value;
  if (cookieLocale && (LOCALES as string[]).includes(cookieLocale)) return cookieLocale;
  const accept = (request.headers.get("accept-language") ?? "").toLowerCase();
  if (/(^|[,\s])ar\b/.test(accept)) return "ar";
  return DEFAULT_LOCALE;
}

/** First-visit region slug: last-used cookie → default (UAE). */
function pickRegionSlug(request: NextRequest): string {
  return request.cookies.get(REGION_SLUG_COOKIE)?.value || DEFAULT_REGION_SLUG;
}

function redirectToLogin(request: NextRequest, nextPath: string, parsed?: ParsedPrefix) {
  const slug = parsed?.regionSlug ?? pickRegionSlug(request);
  const locale = parsed?.locale ?? pickLocale(request);
  const url = new URL(`${buildPrefix(slug, locale)}/login`, request.url);
  url.searchParams.set("next", nextPath);
  return NextResponse.redirect(url);
}

export function proxy(request: NextRequest) {
  const { pathname } = request.nextUrl;
  const hasSession = request.cookies.has(SESSION_COOKIE);

  // 1) Admin area is intentionally UNPREFIXED. Optimistic session bounce only.
  if (pathname === "/admin" || pathname.startsWith("/admin/")) {
    if (hasSession) return NextResponse.next();
    return redirectToLogin(request, pathname);
  }

  // 2) Storefront: require the /:regionSlug/:locale prefix.
  const parsed = parsePrefix(pathname);
  if (!parsed) {
    const url = request.nextUrl.clone();
    const prefix = buildPrefix(pickRegionSlug(request), pickLocale(request));
    url.pathname = pathname === "/" ? prefix : `${prefix}${pathname}`;
    return NextResponse.redirect(url);
  }

  // 3) Account area needs a session (login target keeps the current prefix).
  if (parsed.rest === "/account" || parsed.rest.startsWith("/account/")) {
    if (!hasSession) return redirectToLogin(request, pathname, parsed);
  }

  // 4) Inject the validated region/locale for the SSR resolvers, and mirror to
  //    cookies so a later bare-path visit lands on the same region/locale.
  const requestHeaders = new Headers(request.headers);
  requestHeaders.set(REGION_SLUG_HEADER, parsed.regionSlug);
  requestHeaders.set(LOCALE_HEADER, parsed.locale);
  // Full path AND query so the layout can build a same-path redirect (flash-free
  // default language, unavailable-region fallback) without re-deriving the
  // sub-path from route params — and without dropping `?id=…` on the way.
  requestHeaders.set(PATHNAME_HEADER, pathname);
  requestHeaders.set(SEARCH_HEADER, request.nextUrl.search);
  const res = NextResponse.next({ request: { headers: requestHeaders } });
  const cookieOpts = { path: "/", maxAge: YEAR_SECONDS, sameSite: "lax" as const };
  res.cookies.set(REGION_SLUG_COOKIE, parsed.regionSlug, cookieOpts);
  res.cookies.set(LOCALE_COOKIE, parsed.locale, cookieOpts);
  return res;
}

export const config = {
  // Run on everything EXCEPT Next internals, API routes, SEO files, and any path
  // with a file extension (static assets). Storefront pages + /admin still match.
  matcher: [
    "/((?!api|_next|robots.txt|sitemap.xml|manifest.webmanifest|.*\\.).*)",
  ],
};
