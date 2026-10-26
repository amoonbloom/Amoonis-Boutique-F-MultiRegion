"use client";

import { useEffect, useId, useRef } from "react";

declare global {
  interface Window {
    TabbyCard?: new (opts: {
      selector: string;
      currency: string;
      price: string;
      lang?: string;
      shouldInheritBg?: boolean;
      publicKey: string;
      merchantCode: string;
    }) => unknown;
  }
}

type TabbyCheckoutCardProps = {
  /** Order total in the active region currency. */
  price: number;
  currency: string;
  lang: "en" | "ar";
  publicKey: string;
  merchantCode: string;
};

const SCRIPT_SRC = "https://checkout.tabby.ai/tabby-card.js";

function loadTabbyCardScript(): Promise<void> {
  if (typeof window === "undefined") return Promise.resolve();
  if (window.TabbyCard) return Promise.resolve();
  const existing = document.querySelector<HTMLScriptElement>(`script[src="${SCRIPT_SRC}"]`);
  if (existing) {
    return new Promise((resolve, reject) => {
      if (window.TabbyCard) resolve();
      else {
        existing.addEventListener("load", () => resolve(), { once: true });
        existing.addEventListener("error", () => reject(new Error("TabbyCard script failed")), {
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
    script.onerror = () => reject(new Error("TabbyCard script failed"));
    document.body.appendChild(script);
  });
}

/**
 * Official Tabby checkout snippet (TabbyCard). Mount only while Tabby is selected.
 * Container id must NOT be "TabbyCard" — that shadows window.TabbyCard (per Tabby docs).
 */
export function TabbyCheckoutCard({
  price,
  currency,
  lang,
  publicKey,
  merchantCode,
}: TabbyCheckoutCardProps) {
  const reactId = useId().replace(/:/g, "");
  const containerId = `tabby-checkout-card-${reactId}`;
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
        await loadTabbyCardScript();
        if (cancelled || thisMount !== mountKey.current) return;
        // Recreate the host node so re-inits don't leave an empty shell.
        const host = document.getElementById(containerId);
        if (!host || !window.TabbyCard) return;
        host.replaceChildren();
        // eslint-disable-next-line no-new
        new window.TabbyCard({
          selector: `#${containerId}`,
          currency: cur,
          price: Number(price).toFixed(2),
          lang,
          shouldInheritBg: true,
          publicKey,
          merchantCode,
        });
      } catch (err) {
        console.warn("[tabby] checkout card failed to load:", err);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [containerId, price, currency, lang, publicKey, merchantCode]);

  if (!publicKey || !merchantCode) return null;

  return (
    <div
      id={containerId}
      className="mt-3 min-h-[3rem] w-full min-w-[280px] max-w-full overflow-hidden"
      // Stop label click from toggling the radio when interacting with the snippet.
      onClick={(e) => e.preventDefault()}
      onKeyDown={(e) => e.stopPropagation()}
    />
  );
}
