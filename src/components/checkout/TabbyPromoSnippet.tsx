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
 *
 * On cart qty changes the price updates frequently. Tabby's promo script does not
 * reliably re-bind after clearing the same DOM node, so each amount gets a fresh
 * host id/key and we remount TabbyPromo against that node.
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
  const priceToken = Number.isFinite(price) && price > 0 ? Number(price).toFixed(2) : "0";
  const priceIdPart = priceToken.replace(".", "-");
  const containerId = `tabby-promo-${source}-${reactId}-${priceIdPart}`;
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
        // Fresh host per priceToken — only clear leftover nodes if any.
        host.replaceChildren();
        // eslint-disable-next-line no-new
        new window.TabbyPromo({
          selector: `#${containerId}`,
          currency: cur,
          price: priceToken,
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
  }, [containerId, price, priceToken, currency, lang, source, publicKey, merchantCode]);

  if (!publicKey || !merchantCode) return null;
  if (!Number.isFinite(price) || price <= 0) return null;

  return (
    <div className={className ?? "mt-3 w-full min-w-[280px]"}>
      <div
        key={containerId}
        id={containerId}
        className="w-full min-w-[280px]"
        data-tabby-promo-price={priceToken}
      />
    </div>
  );
}
