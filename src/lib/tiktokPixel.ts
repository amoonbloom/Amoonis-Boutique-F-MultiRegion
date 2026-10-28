type Ttq = {
  page: (...args: unknown[]) => void;
  track: (...args: unknown[]) => void;
  load: (...args: unknown[]) => void;
  [key: string]: unknown;
};

declare global {
  interface Window {
    ttq?: Ttq;
    TiktokAnalyticsObject?: string;
  }
}

/**
 * TikTok Pixel id from Ads Manager ("Amoon TIKTOK"). Hardcoded as the default
 * so the pixel is live without hosting config; set NEXT_PUBLIC_TIKTOK_PIXEL_ID
 * to override, or to an empty string to disable.
 */
const ENV_PIXEL_ID = process.env.NEXT_PUBLIC_TIKTOK_PIXEL_ID;

export const TIKTOK_PIXEL_ID =
  ENV_PIXEL_ID === undefined ? "CUKHVCRC77U8E2TJKLLG" : ENV_PIXEL_ID.trim();

/** URL region slugs where this pixel should run (KSA + Oman). */
const ENABLED_REGION_SLUGS = new Set(["sa", "om"]);

/** True when the path is under /sa/... or /om/... */
export function isTikTokPixelRegion(pathname: string): boolean {
  const slug = pathname.split("/").filter(Boolean)[0]?.toLowerCase();
  return Boolean(slug && ENABLED_REGION_SLUGS.has(slug));
}

const READY_TIMEOUT_MS = 20_000;
const POLL_INTERVAL_MS = 200;

function withTtq(run: (ttq: Ttq) => void): void {
  if (typeof window === "undefined" || !TIKTOK_PIXEL_ID) return;

  if (window.ttq) {
    run(window.ttq);
    return;
  }

  const startedAt = Date.now();
  const timer = window.setInterval(() => {
    if (window.ttq) {
      window.clearInterval(timer);
      run(window.ttq);
      return;
    }
    if (Date.now() - startedAt > READY_TIMEOUT_MS) window.clearInterval(timer);
  }, POLL_INTERVAL_MS);
}

/** TikTok page view — covers client-side App Router navigations. */
export function trackTikTokPage(): void {
  withTtq((ttq) => ttq.page());
}
