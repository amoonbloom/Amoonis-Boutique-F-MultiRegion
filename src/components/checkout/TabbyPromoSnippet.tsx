"use client";

import { useEffect, useId, useRef } from "react";

declare global {
  interface Window {
    TabbyPromo?: new (opts: {
      selector: string;
      currency: string;
      price: string;
      lang?: string;
      source?: "product" | "cart";
      shouldInheritBg?: boolean;
      publicKey: string;
      merchantCode: string;
    }) => unknown;
  }
}

type TabbyPromoSnippetProps = {
  price: number;
  currency: string;
  lang: "en" | "ar";
  source: "product" | "cart";
  publicKey: string;
  merchantCode: string;
  className?: string;
};

const SCRIPT_SRC = "https://checkout.tabby.ai/tabby-promo.js";

function loadTabbyPromoScript(): Promise<void> {
  if (typeof window === "undefined") return Promise.resolve();
  if (window.TabbyPromo) return Promise.resolve();
  const existing = document.querySelector<HTMLScriptElement>(`script[src="${SCRIPT_SRC}"]`);
  if (existing) {
    return new Promise((resolve, reject) => {
      if (window.TabbyPromo) resolve();
      else {
        existing.addEventListener("load", () => resolve(), { once: true });
        existing.addEventListener("error", () => reject(new Error("TabbyPromo script failed")), {
          once: true,
        });
      }
    });
  }
  return new Promise((resolve, reject) => {
    const script = document.createElement("script");
    script.src = SCRIPT_SRC;
    script.async = true;
    script.onload = () => resolve();
    script.onerror = () => reject(new Error("TabbyPromo script failed"));
    document.body.appendChild(script);
  });
}

/**
 * Official TabbyPromo for product / cart pages.
 * Container id must NOT be "TabbyPromo" (shadows the constructor — Tabby docs).
 */
export function TabbyPromoSnippet({
  price,
  currency,
  lang,
  source,
  publicKey,
  merchantCode,
  className,
}: TabbyPromoSnippetProps) {
  const reactId = useId().replace(/:/g, "");
  const containerId = `tabby-promo-${source}-${reactId}`;
  const mountKey = useRef(0);

  useEffect(() => {
    if (!publicKey || !merchantCode) return;
    if (!Number.isFinite(price) || price <= 0) return;
    const cur = String(currency || "").toUpperCase();
    if (cur !== "SAR" && cur !== "AED") return;

    let cancelled = false;
    mountKey.current += 1;
    const thisMount = mountKey.current;

    (async () => {
      try {
        await loadTabbyPromoScript();
        if (cancelled || thisMount !== mountKey.current) return;
        const host = document.getElementById(containerId);
        if (!host || !window.TabbyPromo) return;
        // Clear in place — never replaceWith (breaks React ownership; cart refresh crash).
        host.replaceChildren();
        // eslint-disable-next-line no-new
        new window.TabbyPromo({
          selector: `#${containerId}`,
          currency: cur,
          price: Number(price).toFixed(2),
          lang,
          source,
          shouldInheritBg: true,
          publicKey,
          merchantCode,
        });
      } catch (err) {
        console.warn("[tabby] promo snippet failed to load:", err);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [containerId, price, currency, lang, source, publicKey, merchantCode, className]);

  if (!publicKey || !merchantCode) return null;
  if (!Number.isFinite(price) || price <= 0) return null;

  return <div id={containerId} className={className ?? "mt-3 w-full min-w-[280px]"} />;
}
