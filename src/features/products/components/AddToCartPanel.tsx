"use client";

import { useEffect, useRef, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { m, AnimatePresence } from "motion/react";
import { Button, CurrencyAmount } from "@/components/ui";
import { BagIcon, HeartIcon, CheckIcon, SparkleIcon, PencilIcon } from "@/components/icons";
import { microTransition } from "@/lib/motion";
import { QuantitySelector } from "./QuantitySelector";
import { OptionPicker } from "./OptionPicker";
import { ShippingLeadNote } from "./ShippingLeadNote";
import { YesNoToggle } from "./YesNoToggle";
import { GiftCardModal, type GiftCardEntry } from "./GiftCardModal";
import { CustomNameModal, type CustomNameEntry } from "./CustomNameModal";
import { CashArrangementModal, type CashUnitEntry } from "./CashArrangementModal";
import { usePdpImage, type PdpAddResult } from "./PdpImageContext";
import { useCart } from "@/features/cart/hooks/useCart";
import { useCurrency } from "@/features/location/hooks/useCurrency";
import { formatCurrency } from "@/lib/format";
import { cashArrangementApi } from "@/features/cash-arrangement/api/cash-arrangement.api";
import { computeCashArrangementFee } from "@/features/cash-arrangement/cashArrangementFee";
import { queryKeys } from "@/services/queryKeys";
import { useAppDispatch, useAppSelector } from "@/store";
import { pushToast, toggleCartDrawer } from "@/store/slices/ui.slice";
import { toggleWishlistItem } from "@/store/slices/wishlist.slice";
import type { CartLineCashArrangement } from "@/store/slices/cart.slice";
import { cn } from "@/lib/cn";
import { useT } from "@/i18n/useT";
import type { Product } from "../types";
import { resolveActivePhotoGroup } from "../variantResolution";

interface AddToCartPanelProps {
  product: Product;
  /** Same-day cutoff ("HH:mm") when same-day delivery is enabled for the current
   *  region/zone; null when not offered. Drives the same-day line in ShippingLeadNote. */
  sameDayCutoff?: string | null;
  /** Region code — only used to key the cash-arrangement eligibility query. */
  regionCode?: string;
}

/** One unit's captured add-ons, ready to add to cart. */
interface UnitConfig {
  giftCardSelected: boolean;
  message: string | null;
  customName: string | null;
  cashArrangement: CartLineCashArrangement | null;
}

export function AddToCartPanel({ product, sameDayCutoff, regionCode }: AddToCartPanelProps) {
  const dispatch = useAppDispatch();
  const { add } = useCart();
  const { t } = useT();
  const { currency, locale } = useCurrency();
  // Selection is owned by PdpImageProvider (shared with ProductGallery) so picking a
  // colour here and clicking its photo in the gallery are the same action.
  // `registerAddHandler` lets the mobile sticky bar trigger this panel's exact
  // add-to-cart with the live colour/name/gift-card/qty (it lives elsewhere in the tree).
  const {
    selected,
    selectOption,
    registerAddHandler,
    activeVariant,
    activeVariantColor,
    selectVariantColor,
  } = usePdpImage();
  const wishlisted = useAppSelector((s) =>
    s.wishlist.items.some((i) => i.productId === product.id)
  );
  const [qty, setQty] = useState(1);
  const [justAdded, setJustAdded] = useState(false);
  const addedTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  // Same variant-aware price ProductPrice/StickyAddToCart show above the fold — must match
  // what's actually about to be charged for the cash-arrangement price preview below.
  const unitPrice = activeVariant
    ? activeVariant.discountedPrice != null && activeVariant.discountedPrice < activeVariant.price
      ? activeVariant.discountedPrice
      : activeVariant.price
    : product.price.amount;

  // Gift card add-on: complimentary, opted into with an inline Yes/No. The toggle
  // only RECORDS the choice — the modal that collects ONE card message per unit
  // (see GiftCardModal) opens later, when "Add to cart" is clicked (see
  // startAddFlow), so it always reflects whatever quantity the shopper has settled
  // on by then rather than whatever it was the moment they said "Yes".
  const [giftCard, setGiftCard] = useState(false);
  const [giftCards, setGiftCards] = useState<GiftCardEntry[]>([]);
  const [giftModalOpen, setGiftModalOpen] = useState(false);
  // Custom name add-on: paid, opted into with an inline Yes/No — same deferred-to-
  // add-click pattern as the gift card above.
  const [customNameSelected, setCustomNameSelected] = useState(false);
  const [customNames, setCustomNames] = useState<CustomNameEntry[]>([]);
  const [customNameModalOpen, setCustomNameModalOpen] = useState(false);
  // Which step of the "Add to cart" confirmation chain is currently open (if any).
  // Drives onGiftSave/onCustomNameSave/onCashSave: only advance the chain (or
  // actually add to cart) when a modal's Save/Cancel fires AS PART OF that chain —
  // a Save/Cancel from the standalone "Edit" button (addStep === "idle") just
  // records the entries.
  const [addStep, setAddStep] = useState<"idle" | "gift" | "customName" | "cash">("idle");
  // Resolves the in-flight startAddFlow() promise once the chain finishes (added,
  // or the shopper cancelled a step) — lets the mobile sticky bar's requestAdd()
  // await the SAME multi-step confirmation instead of racing ahead of it.
  const pendingAddResolveRef = useRef<
    ((result: PdpAddResult | PromiseLike<PdpAddResult>) => void) | null
  >(null);

  // Cash arrangement add-on: opted into with an inline Yes/No that opens a modal collecting
  // ONE cash arrangement per unit (see CashArrangementModal), so a shopper buying several can
  // attach a different cash amount to each. Region-level eligibility resolve (no zone) —
  // authoritative fee/denominations for the real cart+zone are re-resolved at order time.
  const cashQuery = useQuery({
    queryKey: queryKeys.cashArrangement.resolve(regionCode, undefined, [product.id]),
    queryFn: () => cashArrangementApi.resolve({ cartLines: [{ productId: product.id }] }),
    enabled: Boolean(regionCode),
  });
  const cashConfig = cashQuery.data;
  const cashEligible = Boolean(cashConfig?.eligible);
  const [cashEnabled, setCashEnabled] = useState(false);
  const [cashEntries, setCashEntries] = useState<CashUnitEntry[]>([]);
  const [cashModalOpen, setCashModalOpen] = useState(false);

  useEffect(() => {
    return () => {
      if (addedTimer.current) clearTimeout(addedTimer.current);
    };
  }, []);

  // If the product becomes ineligible (or the toggle is turned off), drop any collected cash.
  const onCashToggle = (v: boolean) => {
    if (v) {
      setCashEnabled(true);
      setCashModalOpen(true);
    } else {
      setCashEnabled(false);
      setCashEntries([]);
    }
  };
  const onCashCancel = () => {
    setCashModalOpen(false);
    if (cashEntries.length === 0) setCashEnabled(false);
    // A cancel mid-"Add to cart" aborts the whole add — mirrors onGiftCancel/onCustomNameCancel.
    if (addStep === "cash") {
      setAddStep("idle");
      settleAddFlow({ ok: false });
    }
  };
  const onCashSave = (entries: CashUnitEntry[]) => {
    setCashModalOpen(false);
    const anyIncluded = entries.some((e) => e.included && Number(e.cashAmount) > 0);
    const nextCashEntries = anyIncluded ? entries : [];
    setCashEnabled(anyIncluded);
    setCashEntries(nextCashEntries);

    if (addStep !== "cash") return; // opened via the standalone "Edit" button — just save
    setAddStep("idle");
    // Cash arrangement is always the LAST step of the chain (gift card / custom name,
    // if any, already ran and committed a render ago) — perform the add.
    settleAddFlow(handleAdd({ cashEntries: nextCashEntries }));
  };
  const includedCashCount = cashEntries.filter((e) => e.included && Number(e.cashAmount) > 0).length;
  // Both feed the price-preview section below so the fee is visible on the product page
  // itself, not only once the shopper reaches checkout (client feedback: surfacing it for
  // the first time at checkout reads as a surprise fee).
  const totalCashAmount = cashEntries.reduce((sum, e) => {
    const amt = Number(e.cashAmount);
    return e.included && amt > 0 ? sum + amt : sum;
  }, 0);
  const totalCashFee =
    cashConfig?.feeStepAmount == null || cashConfig?.feeMarginPercent == null
      ? 0
      : cashEntries.reduce((sum, e) => {
          const amt = Number(e.cashAmount);
          if (!e.included || !(amt > 0)) return sum;
          return (
            sum +
            computeCashArrangementFee(amt, {
              feeStepAmount: cashConfig.feeStepAmount!,
              feeMarginPercent: cashConfig.feeMarginPercent!,
            })
          );
        }, 0);
  // Only reopen the cash modal on "Add to cart" when there's actually something unresolved —
  // i.e. qty was raised past the last saved entries, so the new unit(s) have no decision yet.
  // A saved entries array always has exactly as many slots as the qty it was saved at (see
  // CashArrangementModal's seed()), so `< qty` alone means new, undecided units exist; qty
  // being lowered afterwards needs no reopen since every remaining unit was already decided.
  const cashNeedsConfirmation = cashEnabled && cashEligible && qty > cashEntries.length;

  // Settles the in-flight startAddFlow() promise (if any) — called whenever the
  // chain finishes, whether by actually adding to cart or by a cancel abort.
  const settleAddFlow = (result: PdpAddResult | Promise<PdpAddResult>) => {
    const resolve = pendingAddResolveRef.current;
    pendingAddResolveRef.current = null;
    resolve?.(result);
  };

  // --- Gift card toggle + modal wiring -------------------------------------
  // The toggle only records the choice now — see startAddFlow for when the modal
  // actually opens. The "Yes"/"No" still flips instantly so the UI responds.
  const onGiftToggle = (v: boolean) => {
    setGiftCard(v);
    if (!v) setGiftCards([]);
  };
  const onGiftCancel = () => {
    setGiftModalOpen(false);
    // Cancelling before any card was saved leaves the toggle at "No".
    if (giftCards.length === 0) setGiftCard(false);
    // A cancel mid-"Add to cart" aborts the whole add — nothing gets added with
    // half-confirmed personalization. The shopper can just click Add again.
    if (addStep === "gift") {
      setAddStep("idle");
      settleAddFlow({ ok: false });
    }
  };
  const onGiftSave = (entries: GiftCardEntry[]) => {
    setGiftModalOpen(false);
    const anyIncluded = entries.some((e) => e.included);
    const nextGiftCards = anyIncluded ? entries : [];
    setGiftCard(anyIncluded);
    setGiftCards(nextGiftCards);

    if (addStep !== "gift") return; // opened via the standalone "Edit" button — just save
    if (customNameSelected) {
      setAddStep("customName");
      setCustomNameModalOpen(true);
    } else if (cashNeedsConfirmation) {
      setAddStep("cash");
      setCashModalOpen(true);
    } else {
      setAddStep("idle");
      settleAddFlow(handleAdd({ giftCards: nextGiftCards }));
    }
  };
  const includedCardCount = giftCards.filter((e) => e.included).length;

  // --- Custom name toggle + modal wiring (mirrors the gift card) ------------
  const onCustomNameToggle = (v: boolean) => {
    setCustomNameSelected(v);
    if (!v) setCustomNames([]);
  };
  const onCustomNameCancel = () => {
    setCustomNameModalOpen(false);
    // Cancelling before any name was saved leaves the toggle at "No".
    if (customNames.length === 0) setCustomNameSelected(false);
    if (addStep === "customName") {
      setAddStep("idle");
      settleAddFlow({ ok: false });
    }
  };
  const onCustomNameSave = (entries: CustomNameEntry[]) => {
    setCustomNameModalOpen(false);
    const anyIncluded = entries.some((e) => e.included && e.name.trim());
    const nextCustomNames = anyIncluded ? entries : [];
    setCustomNameSelected(anyIncluded);
    setCustomNames(nextCustomNames);

    if (addStep !== "customName") return; // opened via the standalone "Edit" button
    if (cashNeedsConfirmation) {
      setAddStep("cash");
      setCashModalOpen(true);
    } else {
      setAddStep("idle");
      // Gift card, if any, ran first and its entries already committed a render
      // ago — perform the add.
      settleAddFlow(handleAdd({ customNames: nextCustomNames }));
    }
  };
  const includedNameCount = customNames.filter((e) => e.included && e.name.trim()).length;

  // Current variant selection (title-keyed) + the representative photo of that variant.
  const buildSelection = () => {
    const selectedByTitle = (product.options ?? []).reduce<Record<string, string>>(
      (acc, opt) => {
        const value = selected[opt.id];
        if (value && value.trim()) acc[opt.title] = value;
        return acc;
      },
      {}
    );
    // The active variant's own colour (e.g. Large's Pink/Blue/Red) isn't a real
    // ProductOption group, so it's captured under its own synthetic key instead of
    // the loop above.
    if (activeVariantColor) {
      selectedByTitle[t("product.colorOptionLabel")] = activeVariantColor.label;
    }
    // Same priority/fallback rule as the main gallery (PdpImageContext): when the
    // active variant has its own colours, ITS choice wins (falling back to the
    // variant's own photo only if that specific colour has none); otherwise defer
    // entirely to the generic multi-group system — shared via variantResolution.ts
    // so the cart-line thumbnail can never disagree with what the PDP just showed.
    const variantImage = activeVariant?.colors?.length
      ? activeVariantColor?.images[0] ?? activeVariant.images[0]
      : resolveActivePhotoGroup(product.options, selected)?.images[0];
    return {
      selectedByTitle: Object.keys(selectedByTitle).length > 0 ? selectedByTitle : null,
      variantImage,
    };
  };

  const confirmAdded = () => {
    dispatch(toggleCartDrawer(true));
    setJustAdded(true);
    if (addedTimer.current) clearTimeout(addedTimer.current);
    addedTimer.current = setTimeout(() => setJustAdded(false), 1600);
  };

  // `overrides` carries a step's just-saved entries when handleAdd is invoked in
  // the SAME event-handler tick as setGiftCards/setCustomNames (that state hasn't
  // rendered yet, so reading it from the closure would see the stale array) — see
  // onGiftSave/onCustomNameSave. Any step that already committed in an EARLIER
  // tick (there's a full render between chain steps) is safely read from state.
  const handleAdd = async (overrides?: {
    giftCards?: GiftCardEntry[];
    customNames?: CustomNameEntry[];
    cashEntries?: CashUnitEntry[];
  }): Promise<PdpAddResult> => {
    if (!product.inStock || product.comingSoon) return { ok: false };
    const { selectedByTitle, variantImage } = buildSelection();
    const effectiveGiftCards = overrides?.giftCards ?? giftCards;
    const effectiveCustomNames = overrides?.customNames ?? customNames;
    const effectiveCashEntries = overrides?.cashEntries ?? cashEntries;

    // One config per unit: each unit's own gift card (message, or none), its own custom
    // name (or none), and its own cash arrangement (amount/denom/note, or none). A unit
    // past the saved entries (qty raised afterwards) gets a sensible default — though in
    // practice startAddFlow always re-opens the cash modal first when cashEnabled, so
    // effectiveCashEntries is already re-seeded to `qty` length by the time this runs.
    const units: UnitConfig[] = Array.from({ length: qty }, (_, i) => {
      const entry = giftCard ? effectiveGiftCards[i] ?? { included: true, message: "" } : undefined;
      const hasCard = !!entry?.included;
      const nameEntry = customNameSelected ? effectiveCustomNames[i] : undefined;
      const unitName = nameEntry?.included && nameEntry.name.trim() ? nameEntry.name.trim() : null;
      const cEntry = cashEnabled && cashEligible ? effectiveCashEntries[i] : undefined;
      const cashAmt = cEntry && cEntry.included ? Number(cEntry.cashAmount) : 0;
      const cashArrangement: CartLineCashArrangement | null =
        cashAmt > 0
          ? { cashAmount: cashAmt, denomination: cEntry!.denomination ?? null, note: (cEntry!.note ?? "").trim() }
          : null;
      return {
        giftCardSelected: hasCard,
        message: hasCard ? entry!.message.trim() || null : null,
        customName: unitName,
        cashArrangement,
      };
    });

    // Group identical unit configs so the same personalization becomes one line of the right
    // quantity; distinct ones (different messages, card vs no card, or DIFFERENT cash) stay
    // separate lines.
    const groups = new Map<string, { unit: UnitConfig; count: number }>();
    for (const u of units) {
      const cashKey = u.cashArrangement
        ? [u.cashArrangement.cashAmount, u.cashArrangement.denomination, u.cashArrangement.note]
        : null;
      const key = JSON.stringify([u.giftCardSelected, u.message ?? "", u.customName ?? "", cashKey]);
      const g = groups.get(key);
      if (g) g.count += 1;
      else groups.set(key, { unit: u, count: 1 });
    }

    let anyOk = false;
    // Sequential so the first add creates the server cart row before the rest fire.
    for (const { unit, count } of groups.values()) {
      const res = await add(product, count, selectedByTitle, {
        variantImage,
        giftCardSelected: unit.giftCardSelected,
        message: unit.message,
        customName: unit.customName,
        cashArrangement: unit.cashArrangement,
      });
      if (res.ok) anyOk = true;
    }
    if (!anyOk) return { ok: false };
    confirmAdded();
    return { ok: true };
  };

  // Entry point for the "Add to cart" button (and the mobile sticky bar, via
  // requestAdd). If any add-on is turned on, walks the shopper through its modal
  // FIRST — Gift card, then Custom name, then Cash arrangement — so what they
  // confirm always matches the quantity on screen right now (this is what fixes
  // "raise qty to 2 after configuring cash for 1 and the 2nd unit silently gets
  // no cash arrangement" — cashNeedsConfirmation re-opens the modal, pre-seeded
  // for the current qty, whenever it was raised past the last saved entries).
  // Gift card / custom name have no such qty-aware skip since re-seeding them per
  // unit is comparatively cheap and their modals are quick — cash is the one add-on
  // heavy enough (fee calc, denominations) that reopening it for no reason, on
  // every single add-to-cart click, would be an annoyance. Only resolves once the
  // whole chain settles (added, or aborted by a cancel).
  const startAddFlow = (): Promise<PdpAddResult> => {
    if (!product.inStock || product.comingSoon) return Promise.resolve({ ok: false });
    return new Promise<PdpAddResult>((resolve) => {
      pendingAddResolveRef.current = resolve;
      if (giftCard) {
        setAddStep("gift");
        setGiftModalOpen(true);
      } else if (customNameSelected) {
        setAddStep("customName");
        setCustomNameModalOpen(true);
      } else if (cashNeedsConfirmation) {
        setAddStep("cash");
        setCashModalOpen(true);
      } else {
        pendingAddResolveRef.current = null;
        resolve(handleAdd());
      }
    });
  };

  // Expose this panel's add handler to the shared PDP context via a stable wrapper
  // that always calls the latest `startAddFlow` (which closes over the current
  // qty/colour/name/gift-card state). Lets the mobile sticky bar run the same
  // add-to-cart confirmation chain.
  const latestAdd = useRef(startAddFlow);
  useEffect(() => {
    latestAdd.current = startAddFlow;
  });
  useEffect(() => {
    const stable = () => latestAdd.current();
    registerAddHandler(stable);
    return () => registerAddHandler(null);
  }, [registerAddHandler]);

  return (
    <div id="add-to-cart-panel" className="flex flex-col gap-5">
      {product.deliveryLeadDays != null && (
        <ShippingLeadNote days={product.deliveryLeadDays} sameDayCutoff={sameDayCutoff} />
      )}

      {product.options && product.options.length > 0 && (
        <div className="flex flex-col gap-5">
          {product.options.map((opt) => (
            <OptionPicker
              key={opt.id}
              title={opt.title}
              options={opt.options}
              colors={opt.optionColors}
              value={selected[opt.id] ?? null}
              onChange={(v) => selectOption(opt.id, v)}
            />
          ))}
        </div>
      )}

      {/* The active variant's OWN colours (e.g. Large's Pink/Blue/Red) — entirely
          independent from any other size's list, so this re-renders from scratch
          whenever Size changes. Not a real ProductOption group, so it's rendered
          separately from the loop above. */}
      {activeVariant?.colors && activeVariant.colors.length > 0 && (
        <OptionPicker
          title={t("product.colorOptionLabel")}
          options={activeVariant.colors.map((c) => c.label)}
          value={activeVariantColor?.label ?? null}
          onChange={(label) => {
            const match = activeVariant.colors!.find((c) => c.label === label);
            if (match) selectVariantColor(match.id);
          }}
        />
      )}

      {product.giftCardEnabled && (
        <div className="flex flex-col gap-2">
          <div className="flex items-center justify-between gap-4 rounded-2xl border border-ink-100 bg-white px-4 py-3">
            <div>
              <p className="text-sm font-medium text-ink-900">{t("product.giftCardOption")}</p>
              <p className="text-xs text-ink-500">{t("product.giftCardComplimentary")}</p>
            </div>
            <YesNoToggle value={giftCard} onChange={onGiftToggle} />
          </div>
          {giftCard && includedCardCount > 0 && (
            <button
              type="button"
              onClick={() => setGiftModalOpen(true)}
              className="flex items-center justify-between gap-3 rounded-xl border border-blush-100 bg-blush-50/60 px-3.5 py-2.5 text-left transition-colors hover:bg-blush-50"
            >
              <span className="inline-flex items-center gap-2 text-sm text-ink-700">
                <SparkleIcon size={14} className="text-bloom-500" />
                {includedCardCount === 1
                  ? t("product.giftCardSummaryOne")
                  : t("product.giftCardSummaryMany", { count: includedCardCount })}
              </span>
              <span className="inline-flex items-center gap-1 text-xs font-medium text-bloom-700">
                <PencilIcon size={12} />
                {t("product.giftCardEdit")}
              </span>
            </button>
          )}
        </div>
      )}

      {product.customNameEnabled && (
        <div className="flex flex-col gap-2">
          <div className="flex items-center justify-between gap-4 rounded-2xl border border-ink-100 bg-white px-4 py-3">
            <p className="text-sm font-medium text-ink-900">
              {t("product.customNameOption", {
                price: formatCurrency(product.customNamePrice ?? 0, currency, locale),
              })}
            </p>
            <YesNoToggle value={customNameSelected} onChange={onCustomNameToggle} />
          </div>
          {customNameSelected && includedNameCount > 0 && (
            <button
              type="button"
              onClick={() => setCustomNameModalOpen(true)}
              className="flex items-center justify-between gap-3 rounded-xl border border-blush-100 bg-blush-50/60 px-3.5 py-2.5 text-left transition-colors hover:bg-blush-50"
            >
              <span className="inline-flex items-center gap-2 text-sm text-ink-700">
                <PencilIcon size={14} className="text-bloom-500" />
                {includedNameCount === 1
                  ? t("product.customNameSummaryOne")
                  : t("product.customNameSummaryMany", { count: includedNameCount })}
              </span>
              <span className="inline-flex items-center gap-1 text-xs font-medium text-bloom-700">
                <PencilIcon size={12} />
                {t("product.giftCardEdit")}
              </span>
            </button>
          )}
        </div>
      )}

      {/* Per-unit cash arrangement — placed above the quantity/add row (like the gift card),
          matching the client layout. Only shown when eligible for this product/region. */}
      {cashEligible && (
        <div className="flex flex-col gap-2">
          <div className="flex items-center justify-between gap-4 rounded-2xl border border-ink-100 bg-white px-4 py-3">
            <div>
              <p className="text-sm font-medium text-ink-900">{t("checkout.cashArrangementTitle")}</p>
              <p className="text-xs text-ink-500">{t("checkout.cashArrangementSubtitle")}</p>
            </div>
            <YesNoToggle value={cashEnabled} onChange={onCashToggle} />
          </div>
          {cashEnabled && includedCashCount > 0 && (
            <button
              type="button"
              onClick={() => setCashModalOpen(true)}
              className="flex items-center justify-between gap-3 rounded-xl border border-blush-100 bg-blush-50/60 px-3.5 py-2.5 text-left transition-colors hover:bg-blush-50"
            >
              <span className="inline-flex items-center gap-2 text-sm text-ink-700">
                <SparkleIcon size={14} className="text-bloom-500" />
                {includedCashCount === 1
                  ? t("product.cashSummaryOne")
                  : t("product.cashSummaryMany", { count: includedCashCount })}
              </span>
              <span className="inline-flex shrink-0 items-center gap-1 text-xs font-medium text-bloom-700">
                <PencilIcon size={12} />
                {t("product.giftCardEdit")}
              </span>
            </button>
          )}
        </div>
      )}

      {/* Full price preview once cash is added — client feedback: the fee must be visible
          here on the PDP, not first revealed at checkout. Mirrors CashArrangementSection's
          checkout breakdown (product price / cash amount / fee / subtotal before VAT), just
          summed across the whole quantity instead of one unit. */}
      {cashEnabled && includedCashCount > 0 && (
        <div className="flex flex-col gap-2 rounded-2xl border border-ink-100 bg-white p-4 text-sm">
          <div className="flex justify-between text-ink-600">
            <span>{t("checkout.productPriceLabel")}</span>
            <CurrencyAmount amount={unitPrice * qty} currency={currency} locale={locale} />
          </div>
          <div className="flex justify-between text-ink-600">
            <span>{t("checkout.cashAmountLineLabel")}</span>
            <CurrencyAmount amount={totalCashAmount} currency={currency} locale={locale} />
          </div>
          <div className="flex justify-between text-ink-600">
            <span>{t("checkout.cashArrangementFeeLabel")}</span>
            <CurrencyAmount amount={totalCashFee} currency={currency} locale={locale} />
          </div>
          <div className="flex justify-between border-t border-ink-100 pt-2 font-semibold text-ink-900">
            <span>{t("checkout.cashSubtotalBeforeVatLabel")}</span>
            <CurrencyAmount
              amount={unitPrice * qty + totalCashAmount + totalCashFee}
              currency={currency}
              locale={locale}
            />
          </div>
        </div>
      )}

      {/* Quantity + Add to cart in one row (client-style); the quantity box matches the
          button height. Sold-out state is shown on the button itself, so no separate note. */}
      <div className="flex items-stretch gap-3">
        <QuantitySelector value={qty} onChange={setQty} />
        <m.div className="flex-1" whileTap={{ scale: 0.98 }}>
          <Button
            fullWidth
            size="xl"
            onClick={startAddFlow}
            disabled={!product.inStock || product.comingSoon}
            leadingIcon={
              product.inStock && !product.comingSoon && justAdded ? (
                <m.span
                  key="check"
                  initial={{ scale: 0, rotate: -20 }}
                  animate={{ scale: 1, rotate: 0 }}
                  transition={microTransition}
                >
                  <CheckIcon size={18} />
                </m.span>
              ) : (
                <BagIcon size={18} />
              )
            }
          >
            <AnimatePresence mode="wait" initial={false}>
              <m.span
                key={justAdded ? "added" : "add"}
                initial={{ opacity: 0, y: 6 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -6 }}
                transition={microTransition}
                className="inline-block"
              >
                {product.comingSoon
                  ? t("common.comingSoon")
                  : !product.inStock
                  ? t("common.soldOut")
                  : justAdded
                  ? t("common.addedToCart")
                  : t("common.addToCart")}
              </m.span>
            </AnimatePresence>
          </Button>
        </m.div>
      </div>
      {product.comingSoon && (
        <p className="mt-2 text-sm text-ink-500">{t("common.comingSoonNote")}</p>
      )}

      <Button
        fullWidth
        size="lg"
        variant="outline"
        leadingIcon={<HeartIcon size={18} className={cn(wishlisted && "fill-current")} />}
        aria-pressed={wishlisted}
        onClick={() => {
          dispatch(toggleWishlistItem({ product }));
          dispatch(
            pushToast({
              title: wishlisted ? t("wishlist.removed") : t("wishlist.saved"),
              description: product.title,
              variant: wishlisted ? "default" : "success",
            })
          );
        }}
      >
        {wishlisted ? t("common.saved") : t("common.save")}
      </Button>

      {product.giftCardEnabled && (
        <GiftCardModal
          open={giftModalOpen}
          quantity={qty}
          mode={product.giftCardMode}
          initial={giftCards}
          onCancel={onGiftCancel}
          onSave={onGiftSave}
        />
      )}

      {product.customNameEnabled && (
        <CustomNameModal
          open={customNameModalOpen}
          quantity={qty}
          initial={customNames}
          price={product.customNamePrice}
          currency={currency}
          locale={locale}
          onCancel={onCustomNameCancel}
          onSave={onCustomNameSave}
        />
      )}

      {cashEligible && cashConfig && (
        <CashArrangementModal
          open={cashModalOpen}
          quantity={qty}
          config={cashConfig}
          initial={cashEntries}
          currency={currency}
          locale={locale}
          onCancel={onCashCancel}
          onSave={onCashSave}
        />
      )}
    </div>
  );
}
