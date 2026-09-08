import { downloadBlob } from "@/lib/download";

/**
 * Renders an on-screen receipt node to a real, downloadable PDF entirely on the
 * client — no backend endpoint involved.
 *
 * Why rasterise the DOM instead of drawing the receipt programmatically: the
 * storefront is bilingual (English + Arabic/RTL) and product titles can be
 * Arabic even in the English UI. Capturing the already-rendered node lets the
 * browser shape every script correctly, so the PDF always matches what the
 * customer sees. We use `html2canvas-pro` rather than classic `html2canvas`
 * because Tailwind v4 emits `oklch()` colors, which the classic build can't
 * parse.
 *
 * Both heavy libraries are imported lazily here so they never touch the initial
 * bundle — only a click on "Download PDF" pulls them in.
 */

/** White margin around the artwork, in points (72pt = 1in). An edge-to-edge
 *  raster reads like a screenshot rather than an invoice, and printers clip it. */
const MARGIN_PT = 28;

/** JPEG quality for the page rasters — high enough that 2× text stays sharp. */
const JPEG_QUALITY = 0.94;

/**
 * A receipt that overflows A4 only slightly is shrunk onto a single page rather
 * than split: two pages where the second holds nothing but a totals block read
 * far worse than one page at 80%. Below this scale the type gets too small to
 * shrink any further, so we paginate instead.
 */
const MIN_SINGLE_PAGE_SCALE = 0.72;

/**
 * How far above a page boundary a break may be pulled to reach a blank row,
 * as a fraction of the page. Wide enough to always find the gap between two
 * item rows, tight enough that no page ends up conspicuously short.
 */
const BREAK_SEARCH_BAND = 0.3;

/**
 * When a full page would leave less than this much content behind, the
 * remainder is split evenly between two pages instead — otherwise the receipt
 * ends on a page holding a single sliver of the footer.
 */
const MIN_TAIL_FILL = 0.15;

/** Pixel channels this far apart still count as "the same colour". */
const UNIFORM_TOLERANCE = 6;

/**
 * Fixes applied to the cloned DOM html2canvas is about to rasterise — the live
 * receipt is never touched.
 *
 * 1. The AED/SAR signs are inline `<svg>` glyphs sized in font-relative units
 *    (see <CurrencyAmount>). html2canvas rasterises an SVG through its
 *    width/height *attributes*, which `em`/`cap` values make meaningless, so
 *    the signs come out mis-scaled and off-baseline. Each one becomes its ISO
 *    code instead — the text form `formatCurrency()` already uses for printable
 *    output, matching the plain-text amounts elsewhere in the receipt.
 * 2. Tabular figures are switched back to proportional (see below).
 */
function prepareCaptureClone(doc: Document) {
  doc.querySelectorAll("[data-currency-sign]").forEach((sign) => {
    const code = sign.getAttribute("data-currency-sign");
    if (!code) return;
    const text = doc.createElement("span");
    // NBSP so the code never wraps away from its amount.
    text.textContent = `${code} `;
    sign.replaceWith(text);
  });

  // html2canvas positions text from its own glyph-advance measurements, which
  // ignore `font-variant-numeric` — so `tabular-nums` figures drift apart in the
  // capture ("#1016" comes out as "#1 01 6"). The PDF is a fixed raster whose
  // columns are already aligned by the layout, so tabular widths buy nothing
  // here: switch the feature off, for the clone only.
  const style = doc.createElement("style");
  style.textContent = "*{font-variant-numeric:normal!important}";
  doc.head.appendChild(style);
}

/**
 * True when every sampled pixel on this canvas row is one colour — a gap between
 * rows, a hairline divider, or a flat section band. Cutting a page there never
 * slices through a line of text or a product thumbnail.
 */
function isUniformRow(
  band: Uint8ClampedArray,
  width: number,
  row: number
): boolean {
  const base = row * width * 4;
  const r = band[base];
  const g = band[base + 1];
  const b = band[base + 2];
  // Every 4th pixel is plenty to catch text/imagery, and keeps the scan cheap.
  for (let x = 4; x < width; x += 4) {
    const i = base + x * 4;
    if (
      Math.abs(band[i] - r) > UNIFORM_TOLERANCE ||
      Math.abs(band[i + 1] - g) > UNIFORM_TOLERANCE ||
      Math.abs(band[i + 2] - b) > UNIFORM_TOLERANCE
    ) {
      return false;
    }
  }
  return true;
}

/**
 * Lowest uniform row in `[minEnd, hardEnd)`, searched upwards from the page
 * boundary so every page carries as much as it can. Falls back to `hardEnd` (a
 * hard cut) when that whole band is solid content, so the walk always advances.
 */
function findBreakRow(
  ctx: CanvasRenderingContext2D,
  width: number,
  minEnd: number,
  hardEnd: number
): number {
  const height = hardEnd - minEnd;
  if (height <= 0) return hardEnd;

  let band: Uint8ClampedArray;
  try {
    band = ctx.getImageData(0, minEnd, width, height).data;
  } catch {
    // Tainted canvas (a product image served without CORS headers) — the pixels
    // aren't readable, so fall back to fixed-height pages.
    return hardEnd;
  }

  for (let row = height - 1; row >= 0; row--) {
    if (isUniformRow(band, width, row)) return minEnd + row + 1;
  }
  return hardEnd;
}

/**
 * Render an on-screen receipt node to a PDF Blob (same output as
 * downloadReceiptPdf, but returns the Blob instead of downloading it) — so the
 * caller can hand it to the Web Share API as a real file, or download it.
 */
export async function generateReceiptPdfBlob(node: HTMLElement): Promise<Blob> {
  const [{ default: html2canvas }, { jsPDF }] = await Promise.all([
    import("html2canvas-pro"),
    import("jspdf"),
  ]);

  const canvas = await html2canvas(node, {
    // 2× keeps text/thumbnails crisp when the PDF is opened or printed.
    scale: 2,
    backgroundColor: "#ffffff",
    useCORS: true,
    logging: false,
    // The receipt's screen-only bits (order tracker, etc.) already carry the
    // `.no-print` class; skipping the same nodes keeps the PDF a clean invoice,
    // exactly matching what the print stylesheet omits.
    ignoreElements: (el) => el.classList.contains("no-print"),
    onclone: prepareCaptureClone,
  });

  const pdf = new jsPDF({ unit: "pt", format: "a4" });
  const pageW = pdf.internal.pageSize.getWidth();
  const pageH = pdf.internal.pageSize.getHeight();
  const contentW = pageW - MARGIN_PT * 2;
  const contentH = pageH - MARGIN_PT * 2;

  // Points per canvas pixel once the capture is fitted to the content width.
  const fitScale = contentW / canvas.width;
  const fullH = canvas.height * fitScale;

  // One page — either it already fits, or it overflows little enough that
  // shrinking it beats splitting it.
  const shrink = contentH / fullH;
  if (shrink >= MIN_SINGLE_PAGE_SCALE) {
    const w = shrink >= 1 ? contentW : contentW * shrink;
    const h = shrink >= 1 ? fullH : contentH;
    pdf.addImage(
      canvas.toDataURL("image/jpeg", JPEG_QUALITY),
      "JPEG",
      // Centre the artwork when shrinking has narrowed it.
      MARGIN_PT + (contentW - w) / 2,
      MARGIN_PT,
      w,
      h
    );
    return pdf.output("blob");
  }

  // Multi-page: cut the capture into page-height slices, nudging each break up
  // to the nearest blank/divider row so no item row, thumbnail or totals line
  // is ever sliced in half across a page boundary.
  const ctx = canvas.getContext("2d");
  const rowsPerPage = Math.floor(contentH / fitScale);
  const searchBand = Math.floor(rowsPerPage * BREAK_SEARCH_BAND);

  // One scratch canvas, resized per slice (assigning `height` also clears it).
  const slice = document.createElement("canvas");
  slice.width = canvas.width;
  const sliceCtx = slice.getContext("2d");

  let top = 0;
  let firstPage = true;
  while (top < canvas.height) {
    const remaining = canvas.height - top;
    let end: number;
    if (remaining <= rowsPerPage) {
      end = canvas.height; // Last page — everything left fits.
    } else {
      // Filling this page would leave `tail` behind. When that tail is a mere
      // sliver, split what remains across two even pages instead.
      const tail = remaining - rowsPerPage;
      const target =
        tail < rowsPerPage * MIN_TAIL_FILL
          ? top + Math.ceil(remaining / 2)
          : top + rowsPerPage;
      end = ctx
        ? findBreakRow(
            ctx,
            canvas.width,
            Math.max(top + 1, target - searchBand),
            target
          )
        : target;
    }
    const sliceH = end - top;

    slice.height = sliceH;
    if (sliceCtx) {
      sliceCtx.fillStyle = "#ffffff";
      sliceCtx.fillRect(0, 0, slice.width, sliceH);
      sliceCtx.drawImage(
        canvas,
        0,
        top,
        canvas.width,
        sliceH,
        0,
        0,
        canvas.width,
        sliceH
      );
    }

    if (!firstPage) pdf.addPage();
    pdf.addImage(
      slice.toDataURL("image/jpeg", JPEG_QUALITY),
      "JPEG",
      MARGIN_PT,
      MARGIN_PT,
      contentW,
      sliceH * fitScale
    );

    firstPage = false;
    top = end;
  }

  return pdf.output("blob");
}

/**
 * Renders an on-screen receipt node to a real, downloadable PDF entirely on the
 * client — no backend endpoint involved. See generateReceiptPdfBlob for the
 * capture details.
 */
export async function downloadReceiptPdf(
  node: HTMLElement,
  filename: string
): Promise<void> {
  const blob = await generateReceiptPdfBlob(node);
  downloadBlob(blob, filename);
}
