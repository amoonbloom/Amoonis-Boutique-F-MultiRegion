import type { Metadata } from "next";
import localFont from "next/font/local";
import { dehydrate } from "@tanstack/react-query";
import {
  GoogleTagManagerScript,
  GoogleTagManagerNoScript,
} from "@/components/layout/GoogleTagManager";
import { MetaPixel } from "@/components/layout/MetaPixel";
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
 * Self-hosted faces (next/font/local). next/font/google downloads from
 * fonts.gstatic.com at build time; Turbopack flaky CDN responses (extensionless
 * /l/font?kit=… URLs) fail Docker/Coolify builds with "could not resolve …
 * Fraunces". Bundling the woff2 files removes that network dependency.
 * Same CSS variables as before so Tailwind / globals.css stay unchanged.
 */
const jakarta = localFont({
  src: [
    { path: "./fonts/plus-jakarta-sans-latin-400-normal.woff2", weight: "400", style: "normal" },
    { path: "./fonts/plus-jakarta-sans-latin-500-normal.woff2", weight: "500", style: "normal" },
    { path: "./fonts/plus-jakarta-sans-latin-600-normal.woff2", weight: "600", style: "normal" },
  ],
  variable: "--font-jakarta",
  display: "swap",
});

const fraunces = localFont({
  src: [
    { path: "./fonts/fraunces-latin-wght-normal.woff2", weight: "400 600", style: "normal" },
    { path: "./fonts/fraunces-latin-wght-italic.woff2", weight: "400 600", style: "italic" },
  ],
  variable: "--font-fraunces",
  display: "swap",
});

const ibmPlexArabic = localFont({
  src: [
    { path: "./fonts/ibm-plex-sans-arabic-500-normal.woff2", weight: "500", style: "normal" },
    { path: "./fonts/ibm-plex-sans-arabic-600-normal.woff2", weight: "600", style: "normal" },
    { path: "./fonts/ibm-plex-sans-arabic-700-normal.woff2", weight: "700", style: "normal" },
  ],
  variable: "--font-arabic-heading",
  display: "swap",
  preload: true,
});

const notoArabic = localFont({
  src: [
    { path: "./fonts/noto-sans-arabic-400-normal.woff2", weight: "400", style: "normal" },
    { path: "./fonts/noto-sans-arabic-500-normal.woff2", weight: "500", style: "normal" },
    { path: "./fonts/noto-sans-arabic-600-normal.woff2", weight: "600", style: "normal" },
  ],
  variable: "--font-arabic-body",
  display: "swap",
  preload: true,
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
        <MetaPixel />
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
