"use client";

import Script from "next/script";
import { useEffect, useRef } from "react";
import { usePathname } from "next/navigation";
import {
  META_PIXEL_ID,
  PAGEVIEW_EXCLUDED_PATH_PATTERN,
  isPageViewSuppressed,
  trackPixelPageView,
} from "@/lib/metaPixel";

/**
 * Meta Pixel base code plus PageView handling.
 *
 * PageView fires on every page except the order confirmation page, which
 * reports Purchase only. The inline snippet covers the first document load
 * (so it doesn't depend on hydration) and skips its own PageView on the
 * confirmation page; the effect covers client-side route changes, which don't
 * reload the document and so would otherwise never be counted.
 */
export function MetaPixel() {
  const pathname = usePathname();
  const isFirstRender = useRef(true);

  useEffect(() => {
    // The first page load is already covered by the inline snippet.
    if (isFirstRender.current) {
      isFirstRender.current = false;
      return;
    }
    if (isPageViewSuppressed(pathname)) return;
    trackPixelPageView();
  }, [pathname]);

  if (!META_PIXEL_ID) return null;

  return (
    <>
      <Script id="meta-pixel-init" strategy="afterInteractive">
        {`!function(f,b,e,v,n,t,s)
        {if(f.fbq)return;n=f.fbq=function(){n.callMethod?
        n.callMethod.apply(n,arguments):n.queue.push(arguments)};
        if(!f._fbq)f._fbq=n;n.push=n;n.loaded=!0;n.version='2.0';
        n.queue=[];t=b.createElement(e);t.async=!0;
        t.src=v;s=b.getElementsByTagName(e)[0];
        s.parentNode.insertBefore(t,s)}(window,document,'script',
        'https://connect.facebook.net/en_US/fbevents.js');
        fbq('init','${META_PIXEL_ID}');
        if(!/${PAGEVIEW_EXCLUDED_PATH_PATTERN}/.test(location.pathname))fbq('track','PageView');`}
      </Script>

      {!isPageViewSuppressed(pathname) && (
        <noscript>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            height="1"
            width="1"
            alt=""
            style={{ display: "none" }}
            src={`https://www.facebook.com/tr?id=${META_PIXEL_ID}&ev=PageView&noscript=1`}
          />
        </noscript>
      )}
    </>
  );
}
