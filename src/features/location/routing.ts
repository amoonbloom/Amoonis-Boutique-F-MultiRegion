/**
 * Region + locale URL routing — the single source of truth for the storefront's
 * permanent public routes `/:regionSlug/:locale/...` (e.g. `/ae/en/shop`,
 * `/sa/ar/`).
 *
 * WHY: the region and language used to live only in cookies, so every
 * region/language variant shared one URL — bad for shareable links, QA, and
 * SEO. Now the URL carries `/:regionSlug/:locale` and is the source of truth;
 * the cookies are kept in sync so the axios `X-Region` interceptor, the Redux
 * seed, and the ~40 existing SSR consumers keep working unchanged.
 *
 * IMPORTANT: `regionSlug` (lowercase, e.g. "ae") is a WEB-only routing token. It
 * is NOT what the API is scoped by — the backend is still scoped by the region
 * `code` (e.g. "UAE") via the `X-Region` header / `?region=`. Use `codeForSlug`
 * / `slugForCode` (against the live `GET /regions` list) to convert between them.
 */
import type { Locale } from "@/store/slices/ui.slice";
import type { ApiRegion } from "@/features/regions/types";

/** Supported UI languages, in display order. */
export const LOCALES: Locale[] = ["en", "ar"];
export const DEFAULT_LOCALE: Locale = "en";

/**
 * Locale check kept local (not imported from `@/i18n`) so this module — which
 * the edge `proxy` imports — stays free of the heavy messages bundle at the edge.
 */
export function isLocaleSlug(v: unknown): v is Locale {
  return v === "en" || v === "ar";
}

/**
 * Region slug used when a first-time visitor has no prior choice.
 *
 * The edge proxy runs before anything can ask the API which regions are open,
 * so this first guess is static — but it must not be a region that has since
 * been switched off, or every cookie-less visitor (everyone arriving from an
 * email or a search result) takes a detour through a dead region. Set
 * NEXT_PUBLIC_DEFAULT_REGION_SLUG per deployment to whichever market is live;
 * the literal below is only the historical home market's fallback.
 *
 * Read straight off `process.env` rather than through `@/config/env` so this
 * module — which the edge proxy imports — stays free of the zod bundle.
 */
export const DEFAULT_REGION_SLUG =
  process.env.NEXT_PUBLIC_DEFAULT_REGION_SLUG?.trim().toLowerCase() || "ae";

/**
 * Request headers the edge `proxy` injects from the validated URL prefix so the
 * server resolvers (`getServerLocale`, `getServerRegion*`) can read the active
 * region/locale WITHOUT threading route `params` through the ~40 SSR consumers.
 * Also mirrored into these cookie names so a bare-path first visit can be
 * redirected to the visitor's last region/locale.
 */
export const REGION_SLUG_HEADER = "x-region-slug";
export const LOCALE_HEADER = "x-locale";
/** Full request pathname the edge `proxy` injects so the `[region]/[locale]`
 *  layout can build a same-path redirect (e.g. the flash-free default-language
 *  redirect) without re-deriving the sub-path from route params. */
export const PATHNAME_HEADER = "x-pathname";
/** The request's query string (`?id=…`, leading "?" included, "" when absent),
 *  injected alongside PATHNAME_HEADER. Kept separate because the layout's
 *  redirects rebuild the path from route params and would otherwise silently
 *  drop the query — which is how emailed `/order/status?id=…` links used to
 *  land the customer on the homepage with no order. */
export const SEARCH_HEADER = "x-search";
/** Cookie holding the region SLUG (distinct from the existing `region` cookie, which holds the CODE for X-Region). */
export const REGION_SLUG_COOKIE = "region_slug";
/** Set to "1" once the visitor explicitly picks a language (LocaleToggle). While
 *  unset, the storefront layout redirects a first-time visitor to the admin's
 *  global default language (Settings.defaultLocale); once set, their own choice
 *  always wins. A COOKIE (not localStorage) so the server layout can read it and
 *  do the redirect before the page paints. */
export const LOCALE_CHOSEN_COOKIE = "locale_chosen";

/**
 * Loose shape check for a region URL segment. The AUTHORITATIVE validation is
 * done against the live active-regions list (see `activeRegionSlugs`) in the
 * `[region]/[locale]` layout — this regex only lets the edge proxy cheaply tell
 * "this looks like a region slug" from "this is a bare path needing a redirect"
 * without fetching data at the edge.
 */
export const REGION_SLUG_RE = /^[a-z0-9-]{2,}$/;

export interface ParsedPrefix {
  regionSlug: string;
  locale: Locale;
  /** The remainder of the pathname after the prefix, always leading-slash (e.g. "/shop"). */
  rest: string;
}

/**
 * Extract the `/:regionSlug/:locale` prefix from a pathname if the first two
 * segments look like one (locale is a real locale, slug matches the shape).
 * Returns null for a bare/unprefixed path.
 */
export function parsePrefix(pathname: string): ParsedPrefix | null {
  const segs = pathname.split("/").filter(Boolean);
  if (segs.length < 2) return null;
  const [regionSlug, maybeLocale, ...restSegs] = segs;
  if (!REGION_SLUG_RE.test(regionSlug)) return null;
  if (!isLocaleSlug(maybeLocale)) return null;
  return {
    regionSlug,
    locale: maybeLocale,
    rest: "/" + restSegs.join("/"),
  };
}

/** Build a `/:regionSlug/:locale` prefix string. */
export function buildPrefix(regionSlug: string, locale: Locale | string): string {
  return `/${regionSlug}/${locale}`;
}

/**
 * Prepend a region/locale prefix to an app-relative path.
 * - `"/"` (home) → the prefix itself.
 * - Anything not starting with `"/"` (external URLs, `mailto:`, `#hash`) is
 *   returned untouched, so it's safe to call on any href.
 */
export function withPrefix(prefix: string, path: string): string {
  if (!path || path === "/") return prefix || "/";
  if (!path.startsWith("/")) return path;
  // Admin is intentionally NOT region/locale scoped — never prefix it.
  if (path === "/admin" || path.startsWith("/admin/")) return path;
  return `${prefix}${path}`;
}

/** Same pathname with the locale segment swapped (preserves region + rest). */
export function withLocale(pathname: string, nextLocale: Locale): string {
  const parsed = parsePrefix(pathname);
  const slug = parsed?.regionSlug ?? DEFAULT_REGION_SLUG;
  const rest = parsed ? parsed.rest : pathname;
  return withPrefix(buildPrefix(slug, nextLocale), rest);
}

/** Same pathname with the region-slug segment swapped (preserves locale + rest). */
export function withRegionSlug(pathname: string, nextSlug: string): string {
  const parsed = parsePrefix(pathname);
  const locale = parsed?.locale ?? DEFAULT_LOCALE;
  const rest = parsed ? parsed.rest : pathname;
  return withPrefix(buildPrefix(nextSlug, locale), rest);
}

/** The slug for a region: its explicit `urlSlug`, or a lowercased `code` fallback. */
export function regionSlug(region: Pick<ApiRegion, "code" | "urlSlug">): string {
  return region.urlSlug ?? region.code.toLowerCase();
}

/** Resolve a URL slug → region `code` (for API scoping / Redux `country`). */
export function codeForSlug(regions: ApiRegion[], slug: string): string | undefined {
  const s = slug.toLowerCase();
  return regions.find((r) => regionSlug(r) === s)?.code;
}

/** Resolve a region `code` → its URL slug (for building URLs from Redux `country`). */
export function slugForCode(regions: ApiRegion[], code: string): string | undefined {
  const r = regions.find((x) => x.code === code);
  return r ? regionSlug(r) : undefined;
}

/** Slugs of every currently-active region — used for route validation + static params. */
export function activeRegionSlugs(regions: ApiRegion[]): string[] {
  return regions.filter((r) => r.isActive).map(regionSlug);
}

/**
 * Build Next `Metadata.alternates` (canonical + hreflang `languages`) for a page
 * at `path` in a given region. Canonical points at the current locale; the
 * `languages` map cross-links every locale of the SAME region (+ x-default) so
 * search engines serve the right language variant. Absolute URLs (SEO needs them).
 */
export function localeAlternates(
  baseUrl: string,
  regionSlug: string,
  locale: Locale | string,
  path: string
): { canonical: string; languages: Record<string, string> } {
  const base = baseUrl.replace(/\/$/, "");
  const languages: Record<string, string> = {};
  for (const l of LOCALES) languages[l] = `${base}${withPrefix(buildPrefix(regionSlug, l), path)}`;
  languages["x-default"] = languages["en"];
  return {
    canonical: `${base}${withPrefix(buildPrefix(regionSlug, locale), path)}`,
    languages,
  };
}
