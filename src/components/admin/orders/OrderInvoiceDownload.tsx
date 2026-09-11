"use client";

import { useRef, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import {
  Menu,
  MenuTrigger,
  MenuContent,
  MenuHeader,
  MenuItem,
  MenuSeparator,
} from "@/components/ui";
import { regionsApi } from "@/features/regions/api/regions.api";
import { queryKeys } from "@/services/queryKeys";
import { resolveRegionContact } from "@/features/location/regionContact";
import { downloadReceiptPdf } from "@/features/orders/receiptPdf";
import { downloadBlob } from "@/lib/download";
import { ordersApi } from "@/features/orders/api/orders.api";
import { OrderInvoiceDocument } from "./OrderInvoiceDocument";
import { useT } from "@/i18n/useT";
import { useToast } from "@/hooks/useToast";
import type { Locale } from "@/store/slices/ui.slice";
import type { ApiOrder } from "@/features/orders/types";

const DownloadIcon = () => (
  <svg width={16} height={16} viewBox="0 0 24 24" fill="none" aria-hidden>
    <path
      d="M12 3v12m0 0 4-4m-4 4-4-4M4 17v2a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-2"
      stroke="currentColor"
      strokeWidth={1.8}
      strokeLinecap="round"
      strokeLinejoin="round"
    />
  </svg>
);

const ChevronIcon = () => (
  <svg width={14} height={14} viewBox="0 0 24 24" fill="none" aria-hidden>
    <path
      d="m6 9 6 6 6-6"
      stroke="currentColor"
      strokeWidth={1.8}
      strokeLinecap="round"
      strokeLinejoin="round"
    />
  </svg>
);

/**
 * "Download invoice" control for the admin order detail page. Opens a menu where
 * the admin picks a LANGUAGE and a FORMAT independently of the panel's own UI
 * locale — so an English-browsing admin can still hand a customer an Arabic
 * invoice.
 *
 * PDF is produced entirely client-side: the invoice is rendered off-screen (one
 * hidden copy per language, kept mounted so the fonts/logo are already laid out)
 * and rasterised by the shared receipt pipeline, which lets the browser shape
 * Arabic/RTL for free. Excel is streamed from the backend (see ordersApi.invoiceFile).
 */
export function OrderInvoiceDownload({ order }: { order: ApiOrder }) {
  const { t } = useT();
  const toast = useToast();
  const [busy, setBusy] = useState(false);

  const enRef = useRef<HTMLDivElement | null>(null);
  const arRef = useRef<HTMLDivElement | null>(null);

  // Contact info follows the ORDER's region, not the admin's current browsing
  // region — a Saudi order must always show Saudi contact details. Shares the
  // cache-warmed regions list every other region-aware view queries.
  const regionsQuery = useQuery({
    queryKey: queryKeys.regions.list(),
    queryFn: () => regionsApi.list(),
    staleTime: 5 * 60_000,
  });
  const orderRegion = regionsQuery.data?.find((r) => r.id === order.regionId);
  const regionCode = orderRegion?.code ?? null;
  const enContact = resolveRegionContact(orderRegion, "en");
  const arContact = resolveRegionContact(orderRegion, "ar");

  const orderRef = order.orderNumber ?? order.id.slice(0, 8);

  const handlePdf = async (loc: Locale) => {
    const node = loc === "ar" ? arRef.current : enRef.current;
    if (!node || busy) return;
    setBusy(true);
    try {
      // The Arabic face may not have painted yet on first open — wait for it so
      // the raster captures shaped glyphs, not the fallback font.
      if (document.fonts?.ready) await document.fonts.ready;
      await downloadReceiptPdf(node, `invoice-${orderRef}.pdf`);
    } catch (err) {
      toast.fromError(t("invoice.download"), err);
    } finally {
      setBusy(false);
    }
  };

  const handleExcel = async (loc: Locale) => {
    if (busy) return;
    setBusy(true);
    try {
      const { blob, filename } = await ordersApi.invoiceFile(order.id, {
        format: "xlsx",
        lang: loc,
      });
      downloadBlob(blob, filename);
    } catch (err) {
      toast.fromError(t("invoice.download"), err);
    } finally {
      setBusy(false);
    }
  };

  return (
    <>
      <Menu>
        <MenuTrigger
          className="inline-flex items-center gap-2 rounded-full border border-ink-200 bg-transparent px-4 py-2 text-sm font-medium text-ink-900 transition-colors hover:border-ink-300 hover:bg-cream-100 disabled:cursor-not-allowed disabled:opacity-60"
        >
          <DownloadIcon />
          <span>{t("invoice.download")}</span>
          <ChevronIcon />
        </MenuTrigger>
        <MenuContent align="end" className="min-w-64">
          <MenuHeader
            title={t("invoice.download")}
            subtitle={t("invoice.pdf") + " · " + t("invoice.excel")}
          />
          <MenuSeparator />
          <MenuItem onSelect={() => handlePdf("en")} disabled={busy}>
            {t("invoice.pdf")} — {t("invoice.english")}
          </MenuItem>
          <MenuItem onSelect={() => handlePdf("ar")} disabled={busy}>
            {t("invoice.pdf")} — {t("invoice.arabic")}
          </MenuItem>
          <MenuSeparator />
          <MenuItem onSelect={() => handleExcel("en")} disabled={busy}>
            {t("invoice.excel")} — {t("invoice.english")}
          </MenuItem>
          <MenuItem onSelect={() => handleExcel("ar")} disabled={busy}>
            {t("invoice.excel")} — {t("invoice.arabic")}
          </MenuItem>
        </MenuContent>
      </Menu>

      {/* Off-screen invoice sources for the PDF raster. Kept mounted (not
          display:none) so html2canvas has real layout to capture, and one per
          language so either can be produced instantly. Never shown or read by AT. */}
      <div
        aria-hidden
        className="pointer-events-none fixed top-0 left-[-10000px] -z-10"
      >
        <div ref={enRef}>
          <OrderInvoiceDocument
            order={order}
            locale="en"
            contact={enContact}
            region={orderRegion}
            regionCode={regionCode}
          />
        </div>
        <div ref={arRef}>
          <OrderInvoiceDocument
            order={order}
            locale="ar"
            contact={arContact}
            region={orderRegion}
            regionCode={regionCode}
          />
        </div>
      </div>
    </>
  );
}
