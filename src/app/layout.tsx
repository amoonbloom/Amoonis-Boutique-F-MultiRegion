import type { Metadata } from "next";
import {
  Plus_Jakarta_Sans,
  Fraunces,
  IBM_Plex_Sans_Arabic,
  Noto_Sans_Arabic,
} from "next/font/google";
import { dehydrate } from "@tanstack/react-query";
import {
  GoogleTagManagerScript,
  GoogleTagManagerNoScript,
} from "@/components/layout/GoogleTagManager";
import { StoreProvider } from "@/store/providers/StoreProvider";
import { QueryProvider } from "@/store/providers/QueryProvider";
import { MotionProvider } from "@/components/motion/MotionProvider";
import { ToastViewport } from "@/components/ui/Toast";
import { siteConfig } from "@/config/site";
import { getServerLocale } from "@/i18n/server";
import { dirFor } from "@/i18n";
import { getServerRegion } from "@/services/serverRegion";
import { getCachedRegions } from "@/services/catalogCache";
import { deriveActiveRegions } from "@/features/location/activeRegions";
import { createQueryClient } from "@/services/queryClient";
import { queryKeys } from "@/services/queryKeys";
import "./globals.css";

/**
 * Single typeface for the entire product. Plus Jakarta Sans gives us a clean,
 * modern, SaaS-grade voice from 13px UI text up to large editorial display
 * weights without any face-mixing. We expose two CSS variables — one for body,
 * one for display — but they resolve to the same family with different
 * weights / tracking applied at the component level via Tailwind utilities.
 */
const jakarta = Plus_Jakarta_Sans({
  variable: "--font-jakarta",
  subsets: ["latin"],
  display: "swap",
  // Only the weights actually used in the UI (400 body, 500 medium, 600
  // semibold). 700/800 were shipped but never referenced — dropping them
  // removes two font files from the critical path.
  weight: ["400", "500", "600"],
});

/**
 * Fraunces — a warm, high-contrast editorial serif — is our DISPLAY face for
 * headings. Paired with Jakarta for body/UI, it gives the boutique a refined,
 * florist-editorial voice instead of a generic single-sans look.
 */
const fraunces = Fraunces({
  variable: "--font-fraunces",
  subsets: ["latin"],
  display: "swap",
  // Display weights in use are 400/500/600; 700 was unused. Italic is kept for
  // the editorial heading accents (e.g. hero title accent).
  weight: ["400", "500", "600"],
  style: ["normal", "italic"],
});

/**
 * Arabic faces. The Latin pair above (Jakarta/Fraunces) ship no Arabic glyphs,
 * so Arabic text would otherwise fall back to an uncontrolled OS font. These
 * mirror the two-role split (display heading / body) with Arabic-covering
 * faces and match the client's live site exactly: IBM Plex Sans Arabic for
 * headings, Noto Sans Arabic for body. Applied only under `dir="rtl"` via
 * globals.css so the Latin experience is untouched.
 */
const ibmPlexArabic = IBM_Plex_Sans_Arabic({
  variable: "--font-arabic-heading",
  subsets: ["arabic"],
  display: "swap",
  preload: true,
  weight: ["500", "600", "700"],
});

const notoArabic = Noto_Sans_Arabic({
  variable: "--font-arabic-body",
  subsets: ["arabic"],
  display: "swap",
  preload: true,
  weight: ["400", "500", "600"],
});

export const metadata: Metadata = {
  title: {
    default: `${siteConfig.name} — ${siteConfig.tagline}`,
    template: `%s · ${siteConfig.name}`,
  },
  description: siteConfig.description,
  metadataBase: new URL(siteConfig.url),
  applicationName: siteConfig.name,
  authors: [{ name: siteConfig.name }],
  keywords: [
    "flowers",
    "gifts",
    "luxury gifting",
    "boutique",
    "same day delivery",
    "Amoon Bloom",
  ],
  openGraph: {
    title: siteConfig.name,
    description: siteConfig.description,
    url: siteConfig.url,
    siteName: siteConfig.name,
    type: "website",
  },
  twitter: {
    card: "summary_large_image",
    title: siteConfig.name,
    description: siteConfig.description,
  },
};

export default async function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  const [locale, region, apiRegions] = await Promise.all([
    getServerLocale(),
    getServerRegion(),
    getCachedRegions().catch(() => []),
  ]);
  const { activeRegions, defaultCountry } = deriveActiveRegions(apiRegions);
  // `region` (the cookie value) already IS the region's code — no mapping step.
  const initialCountry = region && activeRegions.includes(region) ? region : defaultCountry;
  // Resolve the currency server-side from the SAME regions list, so the price
  // glyph (AED/SAR sign) renders correctly and identically on server + first
  // client render (see StoreProvider.initialCurrency / useCurrency). Falls back
  // to the store default when the region has no match.
  const initialCurrency =
    apiRegions.find((r) => r.code === initialCountry)?.currency ?? siteConfig.currency;

  // Seed the client query cache with the same regions list used above, so
  // client components resolving currency/country text from it (useCurrency,
  // useRegionCopy) get data on their very first render instead of a fresh
  // client-side fetch — that race was flipping currency signs/country names
  // right after hydration and tripping React's hydration-mismatch check.
  const queryClient = createQueryClient();
  queryClient.setQueryData(queryKeys.regions.list(), apiRegions);
  const dehydratedState = dehydrate(queryClient);

  return (
    <html
      lang={locale}
      dir={dirFor(locale)}
      className={`${jakarta.variable} ${fraunces.variable} ${ibmPlexArabic.variable} ${notoArabic.variable} h-full antialiased`}
    >
      <body className="min-h-full flex flex-col bg-cream-50 text-ink-900 font-sans">
        <GoogleTagManagerNoScript />
        <GoogleTagManagerScript />
        <StoreProvider
          initialLocale={locale}
          initialCountry={initialCountry}
          initialCurrency={initialCurrency}
          initialActiveRegions={activeRegions}
          initialDefaultCountry={defaultCountry}
        >
          <QueryProvider dehydratedState={dehydratedState}>
            <MotionProvider>
              {children}
              <ToastViewport />
            </MotionProvider>
          </QueryProvider>
        </StoreProvider>
      </body>
    </html>
  );
}
