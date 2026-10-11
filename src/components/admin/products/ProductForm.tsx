"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import {
  useFieldArray,
  useForm,
  Controller,
  useWatch,
  type Control,
  type UseFormRegister,
  type UseFormSetValue,
  type FieldErrors,
} from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { useQuery } from "@tanstack/react-query";
import { categoriesApi } from "@/features/categories/api/categories.api";
import { regionsApi } from "@/features/regions/api/regions.api";
import { deliveryZonesApi } from "@/features/delivery-zones/api/delivery-zones.api";
import { queryKeys } from "@/services/queryKeys";
import { Button, Input } from "@/components/ui";
import { RichTextEditor } from "@/components/admin/regions/RichTextEditor";
import { ImageUpload } from "@/components/admin/ImageUpload";
import { RegionPicker } from "@/components/admin/RegionPicker";
import { FormSection as Card } from "@/components/admin/FormSection";
import { Select } from "@/components/admin/Select";
import { SortableList, SortableItem } from "@/components/admin/Sortable";
import {
  PlusIcon,
  TrashIcon,
  GripVerticalIcon,
  ChevronDown,
  CloseIcon,
} from "@/components/icons";
import { isColorGroupTitle, swatchForValue } from "@/features/products/facets";
import { cn } from "@/lib/cn";
import { useT } from "@/i18n/useT";
import { useToast } from "@/hooks/useToast";
import type {
  ApiProduct,
  ApiProductCreateInput,
  ApiProductDescriptionInput,
  ApiProductVariantColorInput,
  ApiProductVariantInput,
  ApiProductZoneLead,
} from "@/features/products/api-types";

interface DescriptionBlockFormValue {
  title?: string | null;
  title_ar?: string | null;
  description?: string | null;
  description_ar?: string | null;
}

/** Labeled rich-text body field — matches the Textarea label/error styling so it
 *  drops into the description cards in place of the old plain textareas. */
function RichTextField({
  label,
  dir,
  value,
  onChange,
  error,
  placeholder,
  className,
}: {
  label: string;
  dir?: "ltr" | "rtl";
  value: string;
  onChange: (html: string) => void;
  error?: string;
  placeholder?: string;
  className?: string;
}) {
  return (
    <div className={`flex flex-col gap-1.5 ${className ?? ""}`}>
      <label className="text-xs font-semibold uppercase tracking-[0.12em] text-ink-700">
        {label}
      </label>
      <RichTextEditor value={value ?? ""} onChange={onChange} dir={dir} placeholder={placeholder} />
      {error ? <p className="text-xs text-(--color-danger)">{error}</p> : null}
    </div>
  );
}

/** Trim a form-state description-block list into API input shape, dropping blocks
 *  with no body — shared by the top-level `descriptions` card and each variant's own
 *  override list, which have identical shapes and cleaning rules. */
function cleanDescriptionBlocks(
  blocks: DescriptionBlockFormValue[] | undefined
): ApiProductDescriptionInput[] {
  return (blocks ?? [])
    .map((d) => ({
      title: d.title?.trim() || null,
      title_ar: d.title_ar?.trim() || null,
      description: (d.description ?? "").trim(),
      description_ar: d.description_ar?.trim() || null,
    }))
    .filter((d) => d.description !== "");
}

interface VariantColorFormValue {
  label?: string | null;
  label_ar?: string | null;
  images?: string[];
}

/** Trim a form-state colour list (for ONE size) into API input shape, dropping
 *  entries with no label — mirrors cleanDescriptionBlocks. */
function cleanVariantColors(
  colors: VariantColorFormValue[] | undefined
): ApiProductVariantColorInput[] {
  return (colors ?? [])
    .map((c) => ({
      label: c.label?.trim() || null,
      label_ar: c.label_ar?.trim() || null,
      images: (c.images ?? []).filter((u) => u && u.trim()),
    }))
    .filter((c) => c.label !== null || c.label_ar !== null);
}

function useProductFormSchema() {
  const { t } = useT();
  return useMemo(() => {
    // A description block is valid when it has a body, OR is COMPLETELY empty (an
    // empty block added via "+ Add block" then abandoned is simply dropped at submit
    // time — it must never silently block the whole product from saving). A block
    // with a heading but no body is still (correctly) flagged as needing a body.
    const descriptionSchema = z
      .object({
        title: z.string().optional().nullable(),
        title_ar: z.string().optional().nullable(),
        description: z.string().optional().nullable(),
        description_ar: z.string().optional().nullable(),
      })
      .refine(
        (d) => {
          const hasBody = (d.description ?? "").trim() !== "";
          const hasOther =
            (d.title ?? "").trim() !== "" ||
            (d.title_ar ?? "").trim() !== "" ||
            (d.description_ar ?? "").trim() !== "";
          return hasBody || !hasOther;
        },
        { path: ["description"], message: t("admin.productForm.descriptionRequired") }
      );

    // One colour choice within ONE size's own list (e.g. Large's "Pink") — an
    // empty/unlabeled entry is simply dropped at submit time, same convention as
    // descriptionSchema above.
    const colorEntrySchema = z.object({
      label: z.string().optional().nullable(),
      label_ar: z.string().optional().nullable(),
      images: z.array(z.string()).optional(),
    });

    const optionSchema = z.object({
      title: z.string().min(1, t("admin.productForm.optionTitleRequired")),
      title_ar: z.string().optional().nullable(),
      options: z.array(z.string()).min(1, t("admin.productForm.optionValuesRequired")),
      options_ar: z.array(z.string()).optional(),
      // Optional per-choice image URLs (first photo of each set), aligned with `options`.
      optionImages: z.array(z.string()).optional(),
      // Optional per-choice swatch colours (hex), aligned by index with `options`.
      optionColors: z.array(z.string()).optional(),
      // Optional per-choice image SETS (several photos per value), aligned with `options`.
      optionImageSets: z.array(z.array(z.string())).optional(),
      // Marks this group as the one whose values become priced Product.variants
      // (e.g. "Size"). At most one group may be true — enforced by the UI.
      isVariantAxis: z.boolean().optional(),
      // Per-value price/subtitle, aligned by index with `options` — only meaningful
      // (and only shown/edited) when isVariantAxis is true.
      variantPrices: z.array(z.number().nullable()).optional(),
      variantDiscountedPrices: z.array(z.number().nullable()).optional(),
      variantSubtitle: z.array(z.string()).optional(),
      variantSubtitle_ar: z.array(z.string()).optional(),
      // Which value index is the default (shown before the shopper picks one). null =
      // no explicit choice — the server defaults to the first value.
      variantDefaultIndex: z.number().nullable().optional(),
      // Optional per-value description-block OVERRIDES, aligned with `options`. Each
      // entry is that size's own block list (same shape as the top-level `descriptions`
      // card) — an empty array means this size has no override and shares the
      // product's shared blocks instead.
      variantDescriptions: z.array(z.array(descriptionSchema)).optional(),
      // Optional per-value COLOUR choices, aligned with `options` — e.g. Large gets
      // its own Pink/Blue/Red while Medium only gets Blue/Black. Entirely independent
      // per size (unlike variantDescriptions, there's no "shared" fallback to inherit).
      variantColors: z.array(z.array(colorEntrySchema)).optional(),
      // Optional per-value PER-REGION price overrides, aligned with `options`. Each
      // entry is a map keyed by regionId → { price, discountedPrice } for that size in
      // that region (blank = same as the size's base price). One column rendered per
      // non-default region (see overrideRegions). The variant equivalent of the
      // product-level `regionPrices` above.
      variantRegionPrices: z
        .array(
          z.record(
            z.string(),
            z.object({
              price: z.number().nonnegative().nullable(),
              discountedPrice: z.number().nonnegative().nullable(),
            })
          )
        )
        .optional(),
    });

    return z.object({
      title: z.string().min(1, t("admin.productForm.productTitleRequired")),
      title_ar: z.string().optional().nullable(),
      subtitle: z.string().optional().nullable(),
      subtitle_ar: z.string().optional().nullable(),
      price: z
        .number({ message: t("admin.productForm.priceInvalid") })
        .nonnegative(t("admin.productForm.priceMin")),
      discountedPrice: z.number().nonnegative(t("admin.productForm.discountMin")).nullable(),
      // Per-region manual price overrides, keyed by regionId — no auto FX, admin
      // enters each region's price explicitly. One row rendered per active
      // non-default region (see overrideRegions below).
      regionPrices: z.record(
        z.string(),
        z.object({
          price: z.number().nonnegative().nullable(),
          discountedPrice: z.number().nonnegative().nullable(),
          // Per-region "ships within N days" override for this product.
          deliveryLeadDays: z
            .number()
            .int(t("admin.productForm.deliveryLeadDaysInvalid"))
            .min(0, t("admin.productForm.deliveryLeadDaysInvalid"))
            .max(30, t("admin.productForm.deliveryLeadDaysInvalid"))
            .nullable(),
          // Per-region cash-arrangement fee schedule override (both-or-neither —
          // enforced server-side; see utils/cashArrangementMath.js). `.nullish()` so an
          // untouched override (undefined) is accepted the same as an explicit null.
          cashArrangementFeeStepAmount: z.number().positive().nullish(),
          cashArrangementFeeMarginPercent: z.number().nonnegative().nullish(),
        })
      ),
      // Per-zone "ships within N days" overrides, keyed by zoneId (null/blank = no
      // override — falls through the region/product/category/default chain).
      // Per-zone records are keyed by zoneId; an empty (untouched) zone override comes through
      // as `undefined`, so the value schema must be `.nullish()` (null OR undefined = no
      // override), not just `.nullable()` — otherwise every unset zone fails validation.
      zoneLeadDays: z.record(
        z.string(),
        z
          .number()
          .int(t("admin.productForm.deliveryLeadDaysInvalid"))
          .min(0, t("admin.productForm.deliveryLeadDaysInvalid"))
          .max(30, t("admin.productForm.deliveryLeadDaysInvalid"))
          .nullish()
      ),
      // Per-zone VISIBILITY. zoneId -> true means "hide this product in that zone".
      // A separate record (not folded into zoneLeadDays' number shape) for the same
      // reason the fee records are separate; merged into one array at submit time.
      // Tolerant on purpose: react-hook-form leaves a key behind when a checkbox is
      // cleared, and a strict z.boolean() would reject that `undefined` — failing the
      // WHOLE form. handleSubmit() has no onInvalid handler, so that surfaced as a
      // "Save changes" button that silently did nothing.
      hiddenZones: z.record(z.string(), z.boolean().optional()).optional(),
      // Per-zone cash-arrangement fee schedule overrides — kept as sibling records (not
      // merged into zoneLeadDays' bare-number shape) so the existing lead-days state
      // stays untouched; merged back into one combined array at submit time.
      zoneCashArrangementFeeStepAmount: z.record(z.string(), z.number().positive().nullish()),
      zoneCashArrangementFeeMarginPercent: z.record(z.string(), z.number().nonnegative().nullish()),
      // Gift card add-on — free personalized message, toggled per product.
      giftCardEnabled: z.boolean(),
      // null = inherit the category default (then the global MESSAGE default).
      giftCardMode: z.enum(["MESSAGE", "NAME"]).nullable(),
      giftCardExtraPrice: z.number().nonnegative().nullable(),
      // Custom name add-on — customer types a name at add-to-cart time for this fee.
      customNameEnabled: z.boolean(),
      customNamePrice: z.number().nonnegative().nullable(),
      quantity: z
        .number()
        .int(t("admin.productForm.quantityWhole"))
        .nonnegative(t("admin.productForm.quantityMin")),
      // Overrides Category.deliveryLeadDays / Settings.defaultDeliveryLeadDays for
      // this product specifically. Null = no override (falls through the chain).
      deliveryLeadDays: z
        .number()
        .int()
        .min(0, t("admin.productForm.deliveryLeadDaysInvalid"))
        .max(30, t("admin.productForm.deliveryLeadDaysInvalid"))
        .nullable(),
      // Default cash-arrangement fee schedule for this product (both-or-neither).
      cashArrangementFeeStepAmount: z.number().positive().nullable(),
      cashArrangementFeeMarginPercent: z.number().nonnegative().nullable(),
      categoryId: z.string().optional().nullable(),
      status: z.enum(["DRAFT", "PUBLISHED"]),
      // Per-region "coming soon": which of the product's regions it's a teaser in
      // (visible but not orderable there). Empty = available in every region it's in.
      comingSoonRegionIds: z.array(z.string()),
      // Per-region "on sale": which of the product's regions show a Sale badge + label.
      onSaleRegionIds: z.array(z.string()),
      saleLabel: z.string().optional(),
      saleLabel_ar: z.string().optional(),
      regionIds: z.array(z.string()),
      images: z.array(z.string().url()).max(10, t("admin.productForm.imagesMax")),
      descriptions: z.array(descriptionSchema),
      productOptions: z.array(optionSchema),
    });
  }, [t]);
}

export type ProductFormValues = z.infer<ReturnType<typeof useProductFormSchema>>;

interface ProductFormProps {
  initial?: ApiProduct;
  onSubmit: (payload: ApiProductCreateInput) => Promise<void>;
  submitting?: boolean;
  submitLabel: string;
}

const emptyDefaults: ProductFormValues = {
  title: "",
  title_ar: "",
  subtitle: "",
  subtitle_ar: "",
  price: 0,
  discountedPrice: null,
  regionPrices: {},
  zoneLeadDays: {},
  hiddenZones: {},
  zoneCashArrangementFeeStepAmount: {},
  zoneCashArrangementFeeMarginPercent: {},
  giftCardEnabled: false,
  giftCardMode: null,
  giftCardExtraPrice: null,
  customNameEnabled: false,
  customNamePrice: null,
  quantity: 0,
  deliveryLeadDays: null,
  cashArrangementFeeStepAmount: null,
  cashArrangementFeeMarginPercent: null,
  categoryId: null,
  status: "PUBLISHED",
  comingSoonRegionIds: [],
  onSaleRegionIds: [],
  saleLabel: "",
  saleLabel_ar: "",
  regionIds: [],
  images: [],
  descriptions: [],
  productOptions: [],
};

/** An input ref that RHF attaches to a leaf error — enough to scroll/focus it. */
type ErrorRef = { scrollIntoView?: (o?: ScrollIntoViewOptions) => void; focus?: () => void };

/**
 * Walk react-hook-form's nested error tree (objects, arrays like
 * `productOptions.0.options`, `descriptions.1.description`) and return the FIRST
 * leaf error's message + its input ref. Lets the submit handler tell the admin
 * exactly what's wrong and jump to the field, instead of the button silently doing
 * nothing when a validation error sits on a scrolled-off field.
 */
function findFirstFieldError(node: unknown): { message: string; ref?: ErrorRef } | null {
  if (!node || typeof node !== "object") return null;
  const n = node as Record<string, unknown>;
  if (typeof n.message === "string" && n.message.length > 0) {
    return { message: n.message, ref: n.ref as ErrorRef | undefined };
  }
  for (const [key, value] of Object.entries(n)) {
    // Skip RHF's own leaf metadata so we don't recurse into DOM refs.
    if (key === "ref" || key === "message" || key === "type" || key === "types") continue;
    const found = findFirstFieldError(value);
    if (found) return found;
  }
  return null;
}

export function ProductForm({ initial, onSubmit, submitting, submitLabel }: ProductFormProps) {
  const { t, locale } = useT();
  const toast = useToast();
  const productFormSchema = useProductFormSchema();
  const categoriesQuery = useQuery({
    queryKey: queryKeys.categories.list(),
    queryFn: () => categoriesApi.list(),
  });
  // Same query key as RegionPicker below — shares its cache entry, no extra request.
  const regionsQuery = useQuery({
    queryKey: queryKeys.regions.list(),
    queryFn: () => regionsApi.list(),
  });
  // Every non-default active region gets its own price-override row, unconditionally
  // (not gated on the Regions visibility checkboxes) — matches the old fixed SAR
  // section's behavior, now extended to every region instead of just Saudi Arabia.
  const overrideRegions = (regionsQuery.data ?? []).filter((r) => !r.isDefault);
  // All delivery zones (staff token returns every region's zones when no `region`
  // is passed). Filtered per selected region below for the per-zone lead inputs.
  const zonesQuery = useQuery({
    queryKey: queryKeys.deliveryZones.list(),
    queryFn: () => deliveryZonesApi.list(),
  });
  const allZones = zonesQuery.data ?? [];

  const {
    register,
    control,
    handleSubmit,
    reset,
    setValue,
    watch,
    formState: { errors },
  } = useForm<ProductFormValues>({
    resolver: zodResolver(productFormSchema),
    defaultValues: emptyDefaults,
  });

  // Hydrate form when initial data arrives.
  useEffect(() => {
    if (!initial) return;
    reset({
      title: initial.title,
      title_ar: initial.title_ar ?? "",
      subtitle: initial.subtitle ?? "",
      subtitle_ar: initial.subtitle_ar ?? "",
      price: initial.price,
      discountedPrice: initial.discountedPrice,
      regionPrices: Object.fromEntries(
        (initial.regionPrices ?? []).map((rp) => [
          rp.regionId,
          {
            price: rp.price,
            discountedPrice: rp.discountedPrice,
            deliveryLeadDays: rp.deliveryLeadDays ?? null,
            cashArrangementFeeStepAmount: rp.cashArrangementFeeStepAmount ?? null,
            cashArrangementFeeMarginPercent: rp.cashArrangementFeeMarginPercent ?? null,
          },
        ])
      ),
      zoneLeadDays: Object.fromEntries(
        (initial.zoneLeadDays ?? []).map((zl) => [zl.zoneId, zl.deliveryLeadDays ?? null])
      ),
      hiddenZones: Object.fromEntries(
        (initial.zoneLeadDays ?? [])
          .filter((zl) => zl.hidden)
          .map((zl) => [zl.zoneId, true])
      ),
      zoneCashArrangementFeeStepAmount: Object.fromEntries(
        (initial.zoneLeadDays ?? []).map((zl) => [zl.zoneId, zl.cashArrangementFeeStepAmount ?? null])
      ),
      zoneCashArrangementFeeMarginPercent: Object.fromEntries(
        (initial.zoneLeadDays ?? []).map((zl) => [zl.zoneId, zl.cashArrangementFeeMarginPercent ?? null])
      ),
      giftCardEnabled: initial.giftCardEnabled ?? false,
      giftCardMode: initial.giftCardMode ?? null,
      giftCardExtraPrice: initial.giftCardExtraPrice ?? null,
      customNameEnabled: initial.customNameEnabled ?? false,
      customNamePrice: initial.customNamePrice ?? null,
      quantity: initial.quantity,
      deliveryLeadDays: initial.deliveryLeadDays ?? null,
      cashArrangementFeeStepAmount: initial.cashArrangementFeeStepAmount ?? null,
      cashArrangementFeeMarginPercent: initial.cashArrangementFeeMarginPercent ?? null,
      categoryId: initial.categoryId,
      status: initial.status ?? "PUBLISHED",
      comingSoonRegionIds: initial.comingSoonRegionIds ?? [],
      onSaleRegionIds: initial.onSaleRegionIds ?? [],
      saleLabel: initial.saleLabel ?? "",
      saleLabel_ar: initial.saleLabel_ar ?? "",
      regionIds: initial.regionIds ?? [],
      images: initial.images,
      descriptions: initial.descriptions.map((d) => ({
        title: d.title ?? "",
        title_ar: d.title_ar ?? "",
        description: d.description,
        description_ar: d.description_ar ?? "",
      })),
      productOptions: initial.productOptions.map((o) => {
        // When this is the priced-variant axis, line up each option value with its
        // ProductVariant row (matched by label, EN first then AR) so the price/
        // subtitle inputs open pre-filled instead of blank.
        const matchedVariants = o.isVariantAxis
          ? o.options.map((val, i) =>
              (initial.variants ?? []).find(
                (v) => v.optionValue === val || v.optionValue_ar === o.options_ar?.[i]
              )
            )
          : [];
        const defaultIdx = matchedVariants.findIndex((v) => v?.isDefault);
        return {
          title: o.title,
          title_ar: o.title_ar ?? "",
          options: o.options,
          options_ar: o.options_ar,
          optionImages: o.optionImages ?? [],
          optionColors: o.optionColors ?? [],
          // Reconstruct each value's photo set so the picker opens with the
          // CURRENTLY-assigned images already selected. Reconcile per value (not
          // all-or-nothing): prefer that value's set, but when the set is missing
          // or empty fall back to its single `optionImages[i]` — otherwise images
          // stored only in `optionImages` (mobile app / older data) would load as
          // empty and look like they must be re-picked from scratch.
          optionImageSets: (() => {
            const sets = o.optionImageSets ?? [];
            const singles = o.optionImages ?? [];
            const len = Math.max(
              o.options?.length ?? 0,
              sets.length,
              singles.length
            );
            return Array.from({ length: len }, (_, i) => {
              const set = (sets[i] ?? []).filter((u) => u && u.trim());
              if (set.length > 0) return set;
              const single = (singles[i] ?? "").trim();
              return single ? [single] : [];
            });
          })(),
          isVariantAxis: o.isVariantAxis ?? false,
          variantPrices: matchedVariants.map((v) => v?.price ?? null),
          variantDiscountedPrices: matchedVariants.map((v) => v?.discountedPrice ?? null),
          variantSubtitle: matchedVariants.map((v) => v?.subtitle ?? ""),
          variantSubtitle_ar: matchedVariants.map((v) => v?.subtitle_ar ?? ""),
          variantDefaultIndex: defaultIdx >= 0 ? defaultIdx : null,
          variantDescriptions: matchedVariants.map((v) =>
            (v?.descriptions ?? []).map((d) => ({
              title: d.title ?? "",
              title_ar: d.title_ar ?? "",
              description: d.description,
              description_ar: d.description_ar ?? "",
            }))
          ),
          variantColors: matchedVariants.map((v) =>
            (v?.colors ?? []).map((c) => ({
              label: c.label ?? "",
              label_ar: c.label_ar ?? "",
              images: c.images ?? [],
            }))
          ),
          // Per-value per-region price map, keyed by regionId — pre-fills each
          // size's per-region price inputs from its ProductVariantRegion rows.
          variantRegionPrices: matchedVariants.map((v) =>
            Object.fromEntries(
              (v?.regionPrices ?? []).map((rp) => [
                rp.regionId,
                { price: rp.price ?? null, discountedPrice: rp.discountedPrice ?? null },
              ])
            )
          ),
        };
      }),
    });
  }, [initial, reset]);

  const descriptionsArray = useFieldArray({ control, name: "descriptions" });
  const optionsArray = useFieldArray({ control, name: "productOptions" });

  const images = watch("images");
  const giftCardEnabled = watch("giftCardEnabled");
  const giftCardMode = watch("giftCardMode");
  const customNameEnabled = watch("customNameEnabled");
  const status = watch("status");
  const comingSoonRegionIds = watch("comingSoonRegionIds") ?? [];
  const onSaleRegionIds = watch("onSaleRegionIds") ?? [];
  // Regions the product is in (from the picker) decide which regions' zones get
  // per-zone delivery-time inputs — only zones of selected regions are shown.
  const selectedRegionIds = watch("regionIds");
  const selectedRegions = (regionsQuery.data ?? []).filter((r) =>
    selectedRegionIds?.includes(r.id)
  );

  const submit = handleSubmit(async (values) => {
    let payload: ApiProductCreateInput;
    try {
    // Drop entirely-empty blocks (validation lets them through; they carry nothing).
    const cleanedDescriptions = cleanDescriptionBlocks(values.descriptions);
    // Built alongside cleanedOptions below: the one group (if any) flagged
    // isVariantAxis contributes one ApiProductVariantInput per kept value.
    let cleanedVariants: ApiProductVariantInput[] = [];
    const cleanedOptions = values.productOptions
      .map((o) => {
        // Keep each value's EN label, AR label, and photo on the same index so
        // the shop can read them index-aligned. Drop rows with an empty EN label.
        const options: string[] = [];
        const options_ar: string[] = [];
        const optionImages: string[] = [];
        const optionColors: string[] = [];
        const optionImageSets: string[][] = [];
        const variantsForGroup: ApiProductVariantInput[] = [];
        (o.options ?? []).forEach((s, i) => {
          const v = s.trim();
          if (!v) return;
          options.push(v);
          const vAr = (o.options_ar?.[i] ?? "").trim();
          options_ar.push(vAr);
          const set = (o.optionImageSets?.[i] ?? [])
            .map((u) => (u ?? "").trim())
            .filter(Boolean);
          optionImageSets.push(set);
          // Keep the single per-value image = first of the set (mobile/hover).
          optionImages.push(set[0] ?? (o.optionImages?.[i] ?? "").trim());
          optionColors.push((o.optionColors?.[i] ?? "").trim());
          if (o.isVariantAxis) {
            variantsForGroup.push({
              optionValue: v,
              optionValue_ar: vAr || null,
              price: o.variantPrices?.[i] ?? 0,
              discountedPrice: o.variantDiscountedPrices?.[i] ?? null,
              images: set,
              subtitle: o.variantSubtitle?.[i]?.trim() || null,
              subtitle_ar: o.variantSubtitle_ar?.[i]?.trim() || null,
              isDefault: options.length - 1 === o.variantDefaultIndex,
              // Empty = this size has no override and shares the product's shared
              // `descriptions` blocks instead.
              descriptions: cleanDescriptionBlocks(o.variantDescriptions?.[i]),
              // Entirely independent per size — e.g. Large's own Pink/Blue/Red,
              // Medium's own Blue/Black. Empty = this size has no colour picker.
              colors: cleanVariantColors(o.variantColors?.[i]),
              // Per-region price overrides for this size — only rows where a price was
              // actually entered (a blank region = same as this size's base price).
              regionPrices: Object.entries(o.variantRegionPrices?.[i] ?? {})
                .map(([regionId, val]) => ({
                  regionId,
                  price: val?.price ?? null,
                  discountedPrice: val?.discountedPrice ?? null,
                }))
                .filter((rp) => rp.price != null),
            });
          }
        });
        if (o.isVariantAxis && variantsForGroup.length > 0) cleanedVariants = variantsForGroup;
        return {
          title: o.title.trim(),
          title_ar: o.title_ar?.trim() || null,
          options,
          options_ar,
          optionImages,
          optionColors,
          optionImageSets,
          isVariantAxis: !!o.isVariantAxis,
        };
      })
      // Drop entirely-empty groups (a title with no usable values).
      .filter((o) => o.options.length > 0);

    payload = {
      title: values.title.trim(),
      title_ar: values.title_ar?.trim() || null,
      subtitle: values.subtitle?.trim() || null,
      subtitle_ar: values.subtitle_ar?.trim() || null,
      price: values.price,
      discountedPrice:
        values.discountedPrice === null || values.discountedPrice === undefined
          ? null
          : Number(values.discountedPrice),
      regionPrices: Object.entries(values.regionPrices ?? {}).map(([regionId, v]) => ({
        regionId,
        price: v.price ?? null,
        discountedPrice: v.discountedPrice ?? null,
        deliveryLeadDays: v.deliveryLeadDays ?? null,
        cashArrangementFeeStepAmount: v.cashArrangementFeeStepAmount ?? null,
        cashArrangementFeeMarginPercent: v.cashArrangementFeeMarginPercent ?? null,
      })),
      // Per-zone overrides — lead days and the cash-arrangement fee schedule are edited
      // as separate form-state records (see zoneCashArrangementFee* above) but submitted
      // as ONE combined array (matches the backend's ProductZone row, which carries all
      // three fields together). Drop a zone entirely only when it has NONE of the three
      // overrides set (server treats a missing zone as "no override at all").
      zoneLeadDays: (() => {
        const zoneIds = new Set([
          ...Object.keys(values.zoneLeadDays ?? {}),
          ...Object.keys(values.hiddenZones ?? {}),
          ...Object.keys(values.zoneCashArrangementFeeStepAmount ?? {}),
          ...Object.keys(values.zoneCashArrangementFeeMarginPercent ?? {}),
        ]);
        const rows: ApiProductZoneLead[] = [];
        for (const zoneId of zoneIds) {
          const deliveryLeadDays = values.zoneLeadDays?.[zoneId] ?? null;
          const cashArrangementFeeStepAmount = values.zoneCashArrangementFeeStepAmount?.[zoneId] ?? null;
          const cashArrangementFeeMarginPercent =
            values.zoneCashArrangementFeeMarginPercent?.[zoneId] ?? null;
          // `hidden` alone is reason enough to send a row — visibility lives on the
          // same join table, so a zone that is only hidden (no lead/fee override)
          // must still be written or the hide is silently dropped.
          const hidden = values.hiddenZones?.[zoneId] === true;
          if (
            deliveryLeadDays == null &&
            cashArrangementFeeStepAmount == null &&
            cashArrangementFeeMarginPercent == null &&
            !hidden
          ) {
            continue;
          }
          rows.push({
            zoneId,
            deliveryLeadDays: deliveryLeadDays == null ? null : Number(deliveryLeadDays),
            cashArrangementFeeStepAmount,
            cashArrangementFeeMarginPercent,
            hidden,
          });
        }
        return rows;
      })(),
      giftCardEnabled: values.giftCardEnabled,
      giftCardMode: values.giftCardMode,
      giftCardExtraPrice:
        values.giftCardExtraPrice === null || values.giftCardExtraPrice === undefined
          ? null
          : Number(values.giftCardExtraPrice),
      customNameEnabled: values.customNameEnabled,
      customNamePrice:
        values.customNamePrice === null || values.customNamePrice === undefined
          ? null
          : Number(values.customNamePrice),
      quantity: values.quantity,
      deliveryLeadDays:
        values.deliveryLeadDays === null || values.deliveryLeadDays === undefined
          ? null
          : Number(values.deliveryLeadDays),
      cashArrangementFeeStepAmount:
        values.cashArrangementFeeStepAmount === null || values.cashArrangementFeeStepAmount === undefined
          ? null
          : Number(values.cashArrangementFeeStepAmount),
      cashArrangementFeeMarginPercent:
        values.cashArrangementFeeMarginPercent === null || values.cashArrangementFeeMarginPercent === undefined
          ? null
          : Number(values.cashArrangementFeeMarginPercent),
      categoryId: values.categoryId || null,
      status: values.status,
      // Only a published product can be a teaser; drafting clears it (backend enforces too).
      comingSoonRegionIds:
        values.status === "PUBLISHED"
          ? (values.comingSoonRegionIds ?? []).filter((id) => (values.regionIds ?? []).includes(id))
          : [],
      // On sale is orthogonal to status (visual badge) — keep it regardless of draft/published.
      onSaleRegionIds: (values.onSaleRegionIds ?? []).filter((id) => (values.regionIds ?? []).includes(id)),
      saleLabel: values.saleLabel?.trim() || null,
      saleLabel_ar: values.saleLabel_ar?.trim() || null,
      regionIds: values.regionIds,
      images: values.images,
      descriptions: cleanedDescriptions,
      productOptions: cleanedOptions,
      variants: cleanedVariants,
    };
    } catch (err) {
      // Surface ANY exception thrown while building the payload (not just
      // network/API errors, which the caller's mutation onError already toasts) —
      // a silent throw here would otherwise make "Create/Save product" look like
      // it does nothing, with no feedback at all.
      console.error("[ProductForm] failed to build the save payload:", err);
      toast.error({
        title: "Could not save this product",
        description: err instanceof Error ? err.message : String(err),
      });
      return;
    }
    await onSubmit(payload);
  }, (formErrors) => {
    // Validation blocked the submit. Without this, react-hook-form calls nothing
    // and the button looks dead — the exact "Create product does nothing" report.
    // Log the whole tree, toast the first concrete reason, and jump to that field
    // (it's often scrolled off-screen, e.g. an empty description block or a variant).
    console.warn("[ProductForm] validation blocked submit:", formErrors);
    const first = findFirstFieldError(formErrors);
    toast.error({
      title: t("admin.productForm.validationFailedTitle"),
      description: first?.message ?? t("admin.productForm.validationFailedGeneric"),
    });
    const ref = first?.ref;
    if (ref?.scrollIntoView) {
      ref.scrollIntoView({ behavior: "smooth", block: "center" });
      window.setTimeout(() => ref.focus?.(), 350);
    }
  });

  return (
    <form onSubmit={submit} className="grid gap-6 lg:grid-cols-[2fr_1fr]" noValidate>
      {/* MAIN COLUMN */}
      <div className="flex flex-col gap-6">
        <Card title={t("admin.productForm.basicsHeading")}>
          <div className="grid gap-4 sm:grid-cols-2">
            <Input
              label={t("admin.productForm.titleEn")}
              placeholder="Garden Bouquet"
              error={errors.title?.message}
              {...register("title")}
            />
            <Input
              label={t("admin.productForm.titleAr")}
              placeholder="باقة الحديقة"
              dir="rtl"
              {...register("title_ar")}
            />
            <Input
              label={t("admin.productForm.subtitleEn")}
              placeholder="A garden in bloom"
              {...register("subtitle")}
            />
            <Input
              label={t("admin.productForm.subtitleAr")}
              dir="rtl"
              {...register("subtitle_ar")}
            />
          </div>
        </Card>

        <Card title={t("admin.productForm.pricingHeading")}>
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            <Input
              label={t("admin.productForm.priceLabel")}
              type="number"
              step="0.01"
              min="0"
              error={errors.price?.message}
              {...register("price", { valueAsNumber: true })}
            />
            <Input
              label={t("admin.productForm.discountedPriceLabel")}
              type="number"
              step="0.01"
              min="0"
              hint={t("admin.productForm.discountedPriceHint")}
              {...register("discountedPrice", {
                setValueAs: (v) => (v === "" || v === null || v === undefined ? null : Number(v)),
              })}
            />
            <Input
              label={t("admin.productForm.stockLabel")}
              type="number"
              step="1"
              min="0"
              error={errors.quantity?.message}
              {...register("quantity", { valueAsNumber: true })}
            />
            <Input
              label={t("admin.productForm.deliveryLeadDaysLabel")}
              type="number"
              step="1"
              min="0"
              max="30"
              placeholder={t("admin.productForm.deliveryLeadDaysPlaceholder")}
              hint={t("admin.productForm.deliveryLeadDaysHint")}
              error={errors.deliveryLeadDays?.message}
              {...register("deliveryLeadDays", {
                setValueAs: (v) => (v === "" || v === null || v === undefined ? null : Number(v)),
              })}
            />
            <Input
              label={t("admin.productForm.cashArrangementFeeStepAmountLabel")}
              type="number"
              step="0.01"
              min="0"
              hint={t("admin.productForm.cashArrangementFeeStepAmountHint")}
              error={errors.cashArrangementFeeStepAmount?.message}
              {...register("cashArrangementFeeStepAmount", {
                setValueAs: (v) => (v === "" || v === null || v === undefined ? null : Number(v)),
              })}
            />
            <Input
              label={t("admin.productForm.cashArrangementFeeMarginPercentLabel")}
              type="number"
              step="0.01"
              min="0"
              hint={t("admin.productForm.cashArrangementFeeMarginPercentHint")}
              error={errors.cashArrangementFeeMarginPercent?.message}
              {...register("cashArrangementFeeMarginPercent", {
                setValueAs: (v) => (v === "" || v === null || v === undefined ? null : Number(v)),
              })}
            />
          </div>

          {overrideRegions.map((region) => (
            <div key={region.id} className="mt-4 border-t border-ink-100 pt-4">
              <p className="mb-1 text-xs font-semibold uppercase tracking-[0.12em] text-ink-700">
                {t("admin.productForm.regionalPricingHeading", {
                  region: region.name,
                  currency: region.currency,
                })}
              </p>
              <p className="mb-3 text-xs text-ink-500">
                {t("admin.productForm.regionalPricingHint", { currency: region.currency })}
              </p>
              <div className="grid gap-4 sm:grid-cols-3">
                <Input
                  label={t("admin.productForm.regionPriceLabel", { currency: region.currency })}
                  type="number"
                  step="0.01"
                  min="0"
                  error={
                    (errors.regionPrices as Record<string, { price?: { message?: string } }> | undefined)?.[
                      region.id
                    ]?.price?.message
                  }
                  {...register(`regionPrices.${region.id}.price`, {
                    setValueAs: (v) => (v === "" || v === null || v === undefined ? null : Number(v)),
                  })}
                />
                <Input
                  label={t("admin.productForm.regionDiscountedPriceLabel", { currency: region.currency })}
                  type="number"
                  step="0.01"
                  min="0"
                  hint={t("admin.productForm.regionDiscountedPriceHint")}
                  error={
                    (
                      errors.regionPrices as
                        | Record<string, { discountedPrice?: { message?: string } }>
                        | undefined
                    )?.[region.id]?.discountedPrice?.message
                  }
                  {...register(`regionPrices.${region.id}.discountedPrice`, {
                    setValueAs: (v) => (v === "" || v === null || v === undefined ? null : Number(v)),
                  })}
                />
                <Input
                  label={t("admin.productForm.regionLeadDaysLabel")}
                  type="number"
                  step="1"
                  min="0"
                  max="30"
                  hint={t("admin.productForm.regionLeadDaysHint")}
                  error={
                    (
                      errors.regionPrices as
                        | Record<string, { deliveryLeadDays?: { message?: string } }>
                        | undefined
                    )?.[region.id]?.deliveryLeadDays?.message
                  }
                  {...register(`regionPrices.${region.id}.deliveryLeadDays`, {
                    setValueAs: (v) => (v === "" || v === null || v === undefined ? null : Number(v)),
                  })}
                />
                <Input
                  label={t("admin.productForm.cashArrangementFeeStepAmountLabel")}
                  type="number"
                  step="0.01"
                  min="0"
                  hint={t("admin.productForm.regionCashArrangementFeeHint")}
                  error={
                    (
                      errors.regionPrices as
                        | Record<string, { cashArrangementFeeStepAmount?: { message?: string } }>
                        | undefined
                    )?.[region.id]?.cashArrangementFeeStepAmount?.message
                  }
                  {...register(`regionPrices.${region.id}.cashArrangementFeeStepAmount`, {
                    setValueAs: (v) => (v === "" || v === null || v === undefined ? null : Number(v)),
                  })}
                />
                <Input
                  label={t("admin.productForm.cashArrangementFeeMarginPercentLabel")}
                  type="number"
                  step="0.01"
                  min="0"
                  error={
                    (
                      errors.regionPrices as
                        | Record<string, { cashArrangementFeeMarginPercent?: { message?: string } }>
                        | undefined
                    )?.[region.id]?.cashArrangementFeeMarginPercent?.message
                  }
                  {...register(`regionPrices.${region.id}.cashArrangementFeeMarginPercent`, {
                    setValueAs: (v) => (v === "" || v === null || v === undefined ? null : Number(v)),
                  })}
                />
              </div>
            </div>
          ))}

          <div className="mt-4 border-t border-ink-100 pt-4">
            <p className="mb-3 text-xs font-semibold uppercase tracking-[0.12em] text-ink-700">
              Gift options
            </p>
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="flex flex-col gap-2">
                <label className="inline-flex cursor-pointer items-center gap-2">
                  <input
                    type="checkbox"
                    {...register("giftCardEnabled")}
                    className="h-5 w-5 accent-bloom-600"
                  />
                  <span className="text-sm font-medium text-ink-900">
                    Offer a gift card message
                  </span>
                </label>
                <Input
                  label="Extra charge (leave empty for free)"
                  type="number"
                  step="0.01"
                  min="0"
                  disabled={!giftCardEnabled}
                  error={errors.giftCardExtraPrice?.message}
                  {...register("giftCardExtraPrice", {
                    setValueAs: (v) => (v === "" || v === null || v === undefined ? null : Number(v)),
                  })}
                />
                {giftCardEnabled ? (
                  <div className="flex flex-col gap-1.5">
                    <label className="text-xs font-medium text-ink-700">
                      {t("admin.productForm.giftModeLabel")}
                    </label>
                    <Select
                      value={giftCardMode ?? ""}
                      onChange={(v) =>
                        setValue("giftCardMode", v === "" ? null : (v as "MESSAGE" | "NAME"), {
                          shouldDirty: true,
                        })
                      }
                      triggerClassName="w-full rounded-lg py-2 justify-between"
                      aria-label={t("admin.productForm.giftModeLabel")}
                      options={[
                        { value: "", label: t("admin.productForm.giftModeInherit") },
                        { value: "MESSAGE", label: t("admin.productForm.giftModeMessage") },
                        { value: "NAME", label: t("admin.productForm.giftModeName") },
                      ]}
                    />
                  </div>
                ) : null}
              </div>
              <div className="flex flex-col gap-2">
                <label className="inline-flex cursor-pointer items-center gap-2">
                  <input
                    type="checkbox"
                    {...register("customNameEnabled")}
                    className="h-5 w-5 accent-bloom-600"
                  />
                  <span className="text-sm font-medium text-ink-900">
                    Offer a custom name add-on
                  </span>
                </label>
                <Input
                  label="Extra charge"
                  type="number"
                  step="0.01"
                  min="0"
                  disabled={!customNameEnabled}
                  error={errors.customNamePrice?.message}
                  {...register("customNamePrice", {
                    setValueAs: (v) => (v === "" || v === null || v === undefined ? null : Number(v)),
                  })}
                />
              </div>
            </div>
          </div>
        </Card>

        {selectedRegions.length > 0 ? (
          <Card
            title={t("admin.productForm.zoneLeadDaysHeading")}
            description={t("admin.productForm.zoneLeadDaysHint")}
            collapsible
          >
            <div className="flex flex-col gap-4">
              {selectedRegions.map((region) => {
                const regionZones = allZones.filter((z) => z.regionId === region.id);
                return (
                  <div key={region.id} className="border-t border-ink-100 pt-4 first:border-t-0 first:pt-0">
                    <p className="mb-2 text-xs font-semibold uppercase tracking-[0.12em] text-ink-700">
                      {region.name}
                    </p>
                    {regionZones.length === 0 ? (
                      <p className="text-xs text-ink-400">
                        {t("admin.productForm.zoneNoZonesNote")}
                      </p>
                    ) : (
                      <>
                      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
                        {regionZones.map((zone) => (
                          <Controller
                            key={zone.id}
                            control={control}
                            name={`zoneLeadDays.${zone.id}`}
                            render={({ field }) => (
                              <Input
                                label={zone.name}
                                type="number"
                                min="0"
                                max="30"
                                step="1"
                                placeholder="—"
                                value={field.value ?? ""}
                                onChange={(e) =>
                                  field.onChange(
                                    e.target.value === "" ? null : Number(e.target.value)
                                  )
                                }
                              />
                            )}
                          />
                        ))}
                      </div>
                      <div className="mt-2 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
                        {regionZones.map((zone) => (
                          <div key={zone.id} className="grid grid-cols-2 gap-2">
                            <Controller
                              control={control}
                              name={`zoneCashArrangementFeeStepAmount.${zone.id}`}
                              render={({ field }) => (
                                <Input
                                  label={t("admin.productForm.zoneCashArrangementFeeStepAmountLabel", {
                                    zone: zone.name,
                                  })}
                                  type="number"
                                  min="0"
                                  step="0.01"
                                  placeholder="—"
                                  value={field.value ?? ""}
                                  onChange={(e) =>
                                    field.onChange(
                                      e.target.value === "" ? null : Number(e.target.value)
                                    )
                                  }
                                />
                              )}
                            />
                            <Controller
                              control={control}
                              name={`zoneCashArrangementFeeMarginPercent.${zone.id}`}
                              render={({ field }) => (
                                <Input
                                  label={t("admin.productForm.zoneCashArrangementFeeMarginPercentLabel", {
                                    zone: zone.name,
                                  })}
                                  type="number"
                                  min="0"
                                  step="0.01"
                                  placeholder="—"
                                  value={field.value ?? ""}
                                  onChange={(e) =>
                                    field.onChange(
                                      e.target.value === "" ? null : Number(e.target.value)
                                    )
                                  }
                                />
                              )}
                            />
                          </div>
                        ))}
                      </div>
                      </>
                    )}
                  </div>
                );
              })}
            </div>
          </Card>
        ) : null}

        <Card
          title={t("admin.productForm.descriptionsHeading")}
          action={
            <button
              type="button"
              onClick={() =>
                descriptionsArray.append({
                  title: "",
                  title_ar: "",
                  description: "",
                  description_ar: "",
                })
              }
              className="inline-flex items-center gap-1 text-sm font-medium text-bloom-700 hover:text-bloom-800"
            >
              <PlusIcon size={14} />
              {t("admin.productForm.addBlock")}
            </button>
          }
        >
          {descriptionsArray.fields.length === 0 ? (
            <p className="text-sm text-ink-500">
              {t("admin.productForm.descriptionsEmptyHint")}
            </p>
          ) : null}
          <div className="flex flex-col gap-4">
            {descriptionsArray.fields.map((field, index) => (
              <div
                key={field.id}
                className="rounded-xl border border-ink-100 bg-cream-50 p-4"
              >
                <div className="mb-3 flex items-center justify-between">
                  <p className="text-xs font-semibold uppercase tracking-wider text-ink-500">
                    {t("admin.productForm.blockLabel", { n: index + 1 })}
                  </p>
                  <button
                    type="button"
                    aria-label={t("admin.productForm.removeBlockAria")}
                    onClick={() => descriptionsArray.remove(index)}
                    className="rounded-md p-1.5 text-bloom-700 hover:bg-bloom-50"
                  >
                    <TrashIcon size={14} />
                  </button>
                </div>
                <div className="grid gap-3 sm:grid-cols-2">
                  <Input
                    label={t("admin.productForm.headingEn")}
                    placeholder="Care guide"
                    {...register(`descriptions.${index}.title`)}
                  />
                  <Input
                    label={t("admin.productForm.headingAr")}
                    dir="rtl"
                    {...register(`descriptions.${index}.title_ar`)}
                  />
                </div>
                <Controller
                  control={control}
                  name={`descriptions.${index}.description`}
                  render={({ field }) => (
                    <RichTextField
                      label={t("admin.productForm.bodyEn")}
                      className="mt-3"
                      value={field.value ?? ""}
                      onChange={field.onChange}
                      error={errors.descriptions?.[index]?.description?.message}
                    />
                  )}
                />
                <Controller
                  control={control}
                  name={`descriptions.${index}.description_ar`}
                  render={({ field }) => (
                    <RichTextField
                      label={t("admin.productForm.bodyAr")}
                      className="mt-3"
                      dir="rtl"
                      value={field.value ?? ""}
                      onChange={field.onChange}
                    />
                  )}
                />
              </div>
            ))}
          </div>
        </Card>

        <Card
          title={t("admin.productForm.variantsHeading")}
          description={t("admin.productForm.variantsDescription")}
          action={
            <div className="flex items-center gap-3">
              <button
                type="button"
                onClick={() =>
                  optionsArray.append({
                    title: "Colour",
                    title_ar: "اللون",
                    options: [""],
                    options_ar: [""],
                    optionImages: [""],
                    optionColors: [""],
                    isVariantAxis: false,
                  })
                }
                className="inline-flex items-center gap-1 text-sm font-medium text-bloom-700 hover:text-bloom-800"
              >
                <PlusIcon size={14} />
                {t("admin.productForm.addColour")}
              </button>
              <button
                type="button"
                onClick={() =>
                  optionsArray.append({
                    title: "",
                    title_ar: "",
                    options: [""],
                    options_ar: [""],
                    optionImages: [""],
                    optionColors: [""],
                    isVariantAxis: false,
                  })
                }
                className="inline-flex items-center gap-1 text-sm font-medium text-ink-600 hover:text-ink-900"
              >
                <PlusIcon size={14} />
                {t("admin.productForm.addOption")}
              </button>
              <button
                type="button"
                onClick={() => {
                  // Single-axis (v1): adding a new priced-variant group clears the
                  // flag on every existing group first.
                  optionsArray.fields.forEach((_, i) =>
                    setValue(`productOptions.${i}.isVariantAxis`, false)
                  );
                  optionsArray.append({
                    title: "Size",
                    title_ar: "المقاس",
                    options: [""],
                    options_ar: [""],
                    optionImages: [""],
                    optionColors: [""],
                    isVariantAxis: true,
                    variantPrices: [null],
                    variantDiscountedPrices: [null],
                    variantSubtitle: [""],
                    variantSubtitle_ar: [""],
                    variantDefaultIndex: null,
                    variantDescriptions: [[]],
                    variantColors: [[]],
                  });
                }}
                className="inline-flex items-center gap-1 text-sm font-medium text-ink-600 hover:text-ink-900"
              >
                <PlusIcon size={14} />
                {t("admin.productForm.addPricedVariant")}
              </button>
            </div>
          }
        >
          {optionsArray.fields.length === 0 ? (
            <div className="rounded-xl border border-dashed border-ink-200 bg-cream-50 p-5 text-center">
              <p className="text-sm font-medium text-ink-700">
                {t("admin.productForm.noVariantsTitle")}
              </p>
              <p className="mx-auto mt-1 max-w-md text-xs text-ink-500">
                {t("admin.productForm.noVariantsHint", {
                  addColour: t("admin.productForm.addColour"),
                  addOption: t("admin.productForm.addOption"),
                })}
              </p>
            </div>
          ) : null}
          <div className="flex flex-col gap-4">
            {optionsArray.fields.map((field, index) => (
              <OptionEditor
                key={field.id}
                index={index}
                control={control}
                register={register}
                setValue={setValue}
                images={images ?? []}
                onRemove={() => optionsArray.remove(index)}
                error={errors.productOptions?.[index]}
                onToggleVariantAxis={(next) => {
                  // Single-axis (v1): turning one group's price-variant flag on
                  // turns every other group's off.
                  optionsArray.fields.forEach((_, i) =>
                    setValue(`productOptions.${i}.isVariantAxis`, i === index && next)
                  );
                }}
              />
            ))}
          </div>
        </Card>
      </div>

      {/* SIDEBAR COLUMN */}
      <aside className="flex flex-col gap-6">
        <Card
          title={t("admin.productForm.visibilityHeading")}
          description={t("admin.productForm.visibilityDescription")}
        >
          {/* Published / Draft. "Coming soon" is now PER-REGION (see the card below) —
              a coming-soon region keeps the product PUBLISHED + visible but not orderable
              there, while it stays fully orderable in its other regions. */}
          <Select
            value={status}
            onChange={(v) => setValue("status", v as "DRAFT" | "PUBLISHED", { shouldDirty: true })}
            triggerClassName="w-full rounded-lg py-2 justify-between"
            aria-label={t("admin.productForm.visibilityHeading")}
            options={[
              { value: "PUBLISHED", label: t("admin.productForm.statusPublished") },
              { value: "DRAFT", label: t("admin.productForm.statusDraft") },
            ]}
          />
        </Card>

        <Card title="Regions">
          <Controller
            control={control}
            name="regionIds"
            render={({ field }) => (
              <RegionPicker selectedIds={field.value} onChange={field.onChange} />
            )}
          />
        </Card>

        {/* Zone visibility sits directly under Regions: it narrows the same
            "where is this sold" decision from region down to individual zones. */}
        {selectedRegions.length > 0 ? (
          <Card
            title={t("admin.productForm.zoneVisibilityHeading")}
            description={t("admin.productForm.zoneVisibilityHint")}
            collapsible
          >
            <div className="flex flex-col gap-4">
              {selectedRegions.map((region) => {
                const regionZones = allZones.filter((z) => z.regionId === region.id);
                return (
                  <div
                    key={region.id}
                    className="border-t border-ink-100 pt-4 first:border-t-0 first:pt-0"
                  >
                    <p className="mb-2 text-xs font-semibold uppercase tracking-[0.12em] text-ink-700">
                      {region.name}
                    </p>
                    {regionZones.length === 0 ? (
                      <p className="text-xs text-ink-400">
                        {t("admin.productForm.zoneNoZonesNote")}
                      </p>
                    ) : (
                      <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
                        {regionZones.map((zone) => (
                          <Controller
                            key={zone.id}
                            control={control}
                            name={`hiddenZones.${zone.id}`}
                            render={({ field }) => (
                              <label className="flex cursor-pointer items-center gap-2 rounded-xl border border-ink-200 px-3 py-2.5 transition-colors hover:bg-cream-50">
                                <input
                                  type="checkbox"
                                  className="h-4 w-4 accent-bloom-600"
                                  checked={field.value === true}
                                  // Always a real boolean — never undefined (see schema).
                                  onChange={(e) => field.onChange(e.target.checked)}
                                />
                                <span className="text-sm text-ink-800">{zone.name}</span>
                              </label>
                            )}
                          />
                        ))}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          </Card>
        ) : null}

        {status === "PUBLISHED" && (
          <Card
            title={t("admin.productForm.comingSoonHeading")}
            description={t("admin.productForm.comingSoonDescription")}
          >
            {(() => {
              const csRegions = selectedRegions.length
                ? selectedRegions
                : (regionsQuery.data ?? []).filter((r) => r.isDefault);
              if (csRegions.length === 0) {
                return <p className="text-sm text-ink-400">{t("admin.productForm.comingSoonNoRegions")}</p>;
              }
              return (
                <div className="flex flex-col gap-2">
                  {csRegions.map((r) => {
                    const checked = comingSoonRegionIds.includes(r.id);
                    return (
                      <label key={r.id} className="flex cursor-pointer items-center gap-2.5 text-sm text-ink-800">
                        <input
                          type="checkbox"
                          checked={checked}
                          onChange={(e) => {
                            const next = e.target.checked
                              ? [...comingSoonRegionIds, r.id]
                              : comingSoonRegionIds.filter((id) => id !== r.id);
                            setValue("comingSoonRegionIds", next, { shouldDirty: true });
                          }}
                          className="h-4 w-4 rounded border-ink-300 text-bloom-600 focus:ring-bloom-500/30"
                        />
                        <span>{locale === "ar" ? r.name_ar || r.name : r.name}</span>
                      </label>
                    );
                  })}
                </div>
              );
            })()}
          </Card>
        )}

        <Card
          title={t("admin.productForm.saleHeading")}
          description={t("admin.productForm.saleDescription")}
        >
          {(() => {
            const saleRegions = selectedRegions.length
              ? selectedRegions
              : (regionsQuery.data ?? []).filter((r) => r.isDefault);
            if (saleRegions.length === 0) {
              return <p className="text-sm text-ink-400">{t("admin.productForm.comingSoonNoRegions")}</p>;
            }
            return (
              <div className="flex flex-col gap-4">
                <div className="flex flex-col gap-2">
                  {saleRegions.map((r) => {
                    const checked = onSaleRegionIds.includes(r.id);
                    return (
                      <label key={r.id} className="flex cursor-pointer items-center gap-2.5 text-sm text-ink-800">
                        <input
                          type="checkbox"
                          checked={checked}
                          onChange={(e) => {
                            const next = e.target.checked
                              ? [...onSaleRegionIds, r.id]
                              : onSaleRegionIds.filter((id) => id !== r.id);
                            setValue("onSaleRegionIds", next, { shouldDirty: true });
                          }}
                          className="h-4 w-4 rounded border-ink-300 text-bloom-600 focus:ring-bloom-500/30"
                        />
                        <span>{locale === "ar" ? r.name_ar || r.name : r.name}</span>
                      </label>
                    );
                  })}
                </div>
                <div className="grid gap-3 sm:grid-cols-2">
                  <Input
                    label={t("admin.productForm.saleLabelEn")}
                    placeholder={t("admin.productForm.saleLabelPlaceholder")}
                    {...register("saleLabel")}
                  />
                  <Input
                    label={t("admin.productForm.saleLabelAr")}
                    placeholder={t("admin.productForm.saleLabelPlaceholderAr")}
                    dir="rtl"
                    {...register("saleLabel_ar")}
                  />
                </div>
              </div>
            );
          })()}
        </Card>

        <Card title={t("admin.productForm.categoryHeading")}>
          <Controller
            control={control}
            name="categoryId"
            render={({ field }) => (
              <Select
                value={field.value ?? ""}
                onChange={(v) => field.onChange(v === "" ? null : v)}
                triggerClassName="w-full rounded-lg py-2 justify-between"
                aria-label={t("admin.productForm.categoryHeading")}
                options={[
                  { value: "", label: t("admin.productForm.uncategorizedOption") },
                  ...(categoriesQuery.data ?? []).map((c) => ({
                    value: c.id,
                    label: c.title,
                  })),
                ]}
              />
            )}
          />
        </Card>

        <Card
          title={t("admin.productForm.imagesHeading", { count: images?.length ?? 0 })}
          description={t("admin.productForm.imagesDescription")}
        >
          {(images?.length ?? 0) > 0 ? (
            <SortableList
              items={images ?? []}
              getId={(url) => url}
              onReorder={(next) =>
                setValue("images", next, { shouldDirty: true })
              }
              strategy="grid"
              className="grid grid-cols-2 gap-2"
            >
              {(url, i) => (
                <SortableItem key={url} id={url}>
                  {({ setNodeRef, style, isDragging, handleProps }) => (
                    <div
                      ref={setNodeRef}
                      style={style}
                      className={cn(
                        "relative overflow-hidden rounded-lg border border-ink-100 bg-white",
                        isDragging && "shadow-(--shadow-lift)"
                      )}
                    >
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img
                        src={url}
                        alt=""
                        className="aspect-square w-full object-cover"
                      />
                      {i === 0 ? (
                        <span className="absolute inset-s-1 top-1 rounded-full bg-ink-900/70 px-2 py-0.5 text-[10px] font-medium text-white">
                          {t("admin.productForm.primaryBadge")}
                        </span>
                      ) : null}
                      <button
                        type="button"
                        {...handleProps}
                        aria-label={t("admin.common.dragToReorder")}
                        className="absolute inset-s-1 bottom-1 touch-none rounded-full bg-white/90 p-1 text-ink-600 shadow-sm hover:bg-white active:cursor-grabbing"
                        style={{ cursor: "grab" }}
                      >
                        <GripVerticalIcon size={14} />
                      </button>
                      <button
                        type="button"
                        aria-label={t("admin.productForm.removeImageAria")}
                        onClick={() =>
                          setValue(
                            "images",
                            (images ?? []).filter((u) => u !== url),
                            { shouldDirty: true }
                          )
                        }
                        className="absolute inset-e-1 top-1 rounded-full bg-white/90 p-1 text-ink-700 shadow-sm hover:bg-white"
                      >
                        <TrashIcon size={14} />
                      </button>
                    </div>
                  )}
                </SortableItem>
              )}
            </SortableList>
          ) : null}

          {(images?.length ?? 0) < 10 ? (
            <Controller
              control={control}
              name="images"
              render={({ field }) => (
                <ImageUpload
                  className="mt-3"
                  value={null}
                  path="products"
                  label=""
                  multiple
                  onChange={(url) => {
                    if (url) field.onChange([...(field.value ?? []), url]);
                  }}
                  onUploadMany={(urls) => {
                    // Append up to the 10-image cap, in the order chosen.
                    const current = field.value ?? [];
                    field.onChange([...current, ...urls].slice(0, 10));
                  }}
                />
              )}
            />
          ) : null}
        </Card>
      </aside>

      <div className="lg:col-span-2 flex justify-end gap-3">
        <Button type="submit" size="lg" isLoading={submitting}>
          {submitLabel}
        </Button>
      </div>
    </form>
  );
}

// --- Variant / option editor --------------------------------------------
// A group (e.g. "Colour") holds one or more values. Each value has an English +
// Arabic label and an optional product photo. When the group is a colour group,
// the shop shows a swatch per value AND swaps the main product image to that
// value's photo on hover/tap — so this editor mirrors the storefront 1:1.

interface OptionEditorProps {
  index: number;
  control: Control<ProductFormValues>;
  register: UseFormRegister<ProductFormValues>;
  setValue: UseFormSetValue<ProductFormValues>;
  images: string[];
  onRemove: () => void;
  error?: NonNullable<FieldErrors<ProductFormValues>["productOptions"]>[number];
  onToggleVariantAxis: (next: boolean) => void;
}

function OptionEditor({
  index,
  control,
  register,
  setValue,
  images,
  onRemove,
  error,
  onToggleVariantAxis,
}: OptionEditorProps) {
  const { t } = useT();
  const title = useWatch({ control, name: `productOptions.${index}.title` }) ?? "";
  const isColor = isColorGroupTitle(title);
  const isVariantAxis = useWatch({ control, name: `productOptions.${index}.isVariantAxis` }) ?? false;

  return (
    <div className="rounded-xl border border-ink-100 bg-cream-50 p-4">
      <div className="mb-3 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <p className="text-xs font-semibold uppercase tracking-wider text-ink-500">
            {isColor
              ? t("admin.productForm.colourVariantLabel")
              : t("admin.productForm.optionLabel", { n: index + 1 })}
          </p>
          {isColor ? (
            <span className="rounded-full bg-bloom-100 px-2 py-0.5 text-[10px] font-medium text-bloom-700">
              {t("admin.productForm.imageSwapBadge")}
            </span>
          ) : null}
          {isVariantAxis ? (
            <span className="rounded-full bg-bloom-100 px-2 py-0.5 text-[10px] font-medium text-bloom-700">
              {t("admin.productForm.pricedVariantBadge")}
            </span>
          ) : null}
        </div>
        <button
          type="button"
          aria-label={t("admin.productForm.removeOptionGroupAria")}
          onClick={onRemove}
          className="rounded-md p-1.5 text-bloom-700 hover:bg-bloom-50"
        >
          <TrashIcon size={14} />
        </button>
      </div>

      <div className="grid gap-3 sm:grid-cols-2">
        <Input
          label={t("admin.productForm.groupNameEn")}
          placeholder="Colour"
          error={error?.title?.message}
          {...register(`productOptions.${index}.title`)}
        />
        <Input
          label={t("admin.productForm.groupNameAr")}
          placeholder="اللون"
          dir="rtl"
          {...register(`productOptions.${index}.title_ar`)}
        />
      </div>

      <p className="mt-2 text-[11px] leading-relaxed text-ink-500">
        {isColor
          ? t("admin.productForm.colourHint")
          : t("admin.productForm.genericGroupHint")}
      </p>

      <label className="mt-3 flex cursor-pointer items-start gap-2 rounded-lg border border-ink-100 bg-white p-2.5">
        <input
          type="checkbox"
          checked={isVariantAxis}
          onChange={(e) => onToggleVariantAxis(e.target.checked)}
          className="mt-0.5 h-4 w-4 accent-bloom-600"
        />
        <span>
          <span className="block text-xs font-medium text-ink-900">
            {t("admin.productForm.pricedVariantToggleLabel")}
          </span>
          <span className="block text-[11px] text-ink-500">
            {t("admin.productForm.pricedVariantToggleHint")}
          </span>
        </span>
      </label>

      <OptionValueRows
        index={index}
        control={control}
        setValue={setValue}
        images={images}
        isColor={isColor}
        isVariantAxis={isVariantAxis}
        optionsError={error?.options?.message}
      />
    </div>
  );
}

// --- Per-value rows: label (EN/AR) + swatch + attached photo -------------

interface OptionValueRowsProps {
  index: number;
  control: Control<ProductFormValues>;
  setValue: UseFormSetValue<ProductFormValues>;
  images: string[];
  isColor: boolean;
  isVariantAxis: boolean;
  optionsError?: string;
}

function OptionValueRows({
  index,
  control,
  setValue,
  images,
  isColor,
  isVariantAxis,
  optionsError,
}: OptionValueRowsProps) {
  const { t, locale } = useT();
  // Non-default regions each get a per-size price column (same set as the
  // product-level per-region price rows). Shared query cache — no extra fetch.
  const regionsQuery = useQuery({ queryKey: queryKeys.regions.list(), queryFn: () => regionsApi.list() });
  const overrideRegions = (regionsQuery.data ?? []).filter((r) => !r.isDefault);
  // Which value row currently has its image picker expanded.
  const [pickerOpen, setPickerOpen] = useState<number | null>(null);
  // Close the open picker when clicking anywhere outside its row.
  const openRowRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (pickerOpen === null) return;
    const onDown = (e: MouseEvent) => {
      if (openRowRef.current && !openRowRef.current.contains(e.target as Node)) {
        setPickerOpen(null);
      }
    };
    document.addEventListener("mousedown", onDown);
    return () => document.removeEventListener("mousedown", onDown);
  }, [pickerOpen]);

  const options =
    useWatch({ control, name: `productOptions.${index}.options` }) ?? [];
  const optionsAr =
    useWatch({ control, name: `productOptions.${index}.options_ar` }) ?? [];
  const optionColors =
    useWatch({ control, name: `productOptions.${index}.optionColors` }) ?? [];
  const optionImageSets = (useWatch({
    control,
    name: `productOptions.${index}.optionImageSets`,
  }) ?? []) as string[][];
  const variantPrices = (useWatch({ control, name: `productOptions.${index}.variantPrices` }) ??
    []) as (number | null)[];
  const variantDiscountedPrices = (useWatch({
    control,
    name: `productOptions.${index}.variantDiscountedPrices`,
  }) ?? []) as (number | null)[];
  const variantSubtitle = (useWatch({ control, name: `productOptions.${index}.variantSubtitle` }) ??
    []) as string[];
  const variantSubtitleAr = (useWatch({
    control,
    name: `productOptions.${index}.variantSubtitle_ar`,
  }) ?? []) as string[];
  const variantDefaultIndex = useWatch({
    control,
    name: `productOptions.${index}.variantDefaultIndex`,
  }) ?? null;
  const variantDescriptions = (useWatch({
    control,
    name: `productOptions.${index}.variantDescriptions`,
  }) ?? []) as DescriptionBlockFormValue[][];
  const variantColors = (useWatch({
    control,
    name: `productOptions.${index}.variantColors`,
  }) ?? []) as VariantColorFormValue[][];
  const variantRegionPrices = (useWatch({
    control,
    name: `productOptions.${index}.variantRegionPrices`,
  }) ?? []) as Record<string, { price: number | null; discountedPrice: number | null }>[];
  // Which value row's colour-photo picker is open, keyed "valueIndex:colorIndex" —
  // independent from the value row's own `pickerOpen` above since a colour's photos
  // are nested one level deeper.
  const [colorPickerOpen, setColorPickerOpen] = useState<string | null>(null);
  const colorPickerRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (colorPickerOpen === null) return;
    // Listens on "click" (not "mousedown"): closing on mousedown collapses this
    // picker's photo grid mid-click — if the shopper's next click targets an
    // element that SHIFTS UP as a result (e.g. another size row's own "Add
    // colour" button, once this picker's height disappears), the browser's
    // mouseup/click phase can land on the wrong spot after that reflow. Closing
    // on the full "click" event instead lets the whole click sequence complete
    // against the ORIGINAL layout first.
    const onDown = (e: MouseEvent) => {
      if (colorPickerRef.current && !colorPickerRef.current.contains(e.target as Node)) {
        setColorPickerOpen(null);
      }
    };
    document.addEventListener("click", onDown);
    return () => document.removeEventListener("click", onDown);
  }, [colorPickerOpen]);

  const count = options.length;

  // Persist all parallel arrays together so a value's EN label, AR label, photo
  // set, swatch colour, and (when this group is the priced-variant axis) price/
  // discount/subtitle always share the same index (the server reads them aligned).
  // `optionImages` is derived = first photo of each set, which the mobile app and
  // card/hover swap read.
  const commit = (
    opts: string[],
    ars: string[],
    cols: string[],
    sets: string[][],
    prices: (number | null)[],
    discounts: (number | null)[],
    subtitle: string[],
    subtitleAr: string[]
  ) => {
    const imgs = sets.map((set) => set?.[0] ?? "");
    setValue(`productOptions.${index}.options`, opts, { shouldDirty: true });
    setValue(`productOptions.${index}.options_ar`, ars, { shouldDirty: true });
    setValue(`productOptions.${index}.optionColors`, cols, { shouldDirty: true });
    setValue(`productOptions.${index}.optionImageSets`, sets, { shouldDirty: true });
    setValue(`productOptions.${index}.optionImages`, imgs, { shouldDirty: true });
    setValue(`productOptions.${index}.variantPrices`, prices, { shouldDirty: true });
    setValue(`productOptions.${index}.variantDiscountedPrices`, discounts, { shouldDirty: true });
    setValue(`productOptions.${index}.variantSubtitle`, subtitle, { shouldDirty: true });
    setValue(`productOptions.${index}.variantSubtitle_ar`, subtitleAr, { shouldDirty: true });
  };
  const padded = () => {
    const ars = [...optionsAr];
    const cols = [...optionColors];
    const sets = optionImageSets.map((s) => (Array.isArray(s) ? [...s] : []));
    const prices = [...variantPrices];
    const discounts = [...variantDiscountedPrices];
    const subtitle = [...variantSubtitle];
    const subtitleAr = [...variantSubtitleAr];
    while (ars.length < count) ars.push("");
    while (cols.length < count) cols.push("");
    while (sets.length < count) sets.push([]);
    while (prices.length < count) prices.push(null);
    while (discounts.length < count) discounts.push(null);
    while (subtitle.length < count) subtitle.push("");
    while (subtitleAr.length < count) subtitleAr.push("");
    return { opts: [...options], ars, cols, sets, prices, discounts, subtitle, subtitleAr };
  };
  const setEn = (i: number, v: string) => {
    const s = padded();
    s.opts[i] = v;
    commit(s.opts, s.ars, s.cols, s.sets, s.prices, s.discounts, s.subtitle, s.subtitleAr);
  };
  const setArVal = (i: number, v: string) => {
    const s = padded();
    s.ars[i] = v;
    commit(s.opts, s.ars, s.cols, s.sets, s.prices, s.discounts, s.subtitle, s.subtitleAr);
  };
  const toggleImg = (i: number, url: string) => {
    const s = padded();
    const set = s.sets[i];
    s.sets[i] = set.includes(url) ? set.filter((u) => u !== url) : [...set, url];
    commit(s.opts, s.ars, s.cols, s.sets, s.prices, s.discounts, s.subtitle, s.subtitleAr);
  };
  const setColor = (i: number, hex: string) => {
    const s = padded();
    s.cols[i] = hex;
    commit(s.opts, s.ars, s.cols, s.sets, s.prices, s.discounts, s.subtitle, s.subtitleAr);
  };
  const setPrice = (i: number, v: number | null) => {
    const s = padded();
    s.prices[i] = v;
    commit(s.opts, s.ars, s.cols, s.sets, s.prices, s.discounts, s.subtitle, s.subtitleAr);
  };
  const setDiscountedPrice = (i: number, v: number | null) => {
    const s = padded();
    s.discounts[i] = v;
    commit(s.opts, s.ars, s.cols, s.sets, s.prices, s.discounts, s.subtitle, s.subtitleAr);
  };
  const setSubtitle = (i: number, v: string) => {
    const s = padded();
    s.subtitle[i] = v;
    commit(s.opts, s.ars, s.cols, s.sets, s.prices, s.discounts, s.subtitle, s.subtitleAr);
  };
  const setSubtitleAr = (i: number, v: string) => {
    const s = padded();
    s.subtitleAr[i] = v;
    commit(s.opts, s.ars, s.cols, s.sets, s.prices, s.discounts, s.subtitle, s.subtitleAr);
  };
  const setDefault = (i: number) => {
    setValue(`productOptions.${index}.variantDefaultIndex`, i, { shouldDirty: true });
  };
  // Per-value per-region price map — standalone field (nested one level deeper),
  // same pattern as variantDescriptions/variantColors. Kept padded to `count`.
  const padRegionPrices = () => {
    const r = variantRegionPrices.map((x) => (x && typeof x === "object" ? { ...x } : {}));
    while (r.length < count) r.push({});
    return r;
  };
  const setVariantRegionPrice = (
    i: number,
    regionId: string,
    field: "price" | "discountedPrice",
    value: number | null
  ) => {
    const next = padRegionPrices();
    const existing = next[i]?.[regionId];
    const entry = {
      price: existing?.price ?? null,
      discountedPrice: existing?.discountedPrice ?? null,
    };
    entry[field] = value;
    next[i] = { ...(next[i] ?? {}), [regionId]: entry };
    setValue(`productOptions.${index}.variantRegionPrices`, next, { shouldDirty: true });
  };
  // variantDescriptions is kept as its own field (not threaded through commit()/
  // padded() above) since block-level edits are nested one level deeper than the
  // other per-value fields — but addRow/removeRow still need to keep it padded/
  // spliced in lockstep with every other parallel array.
  const padDescs = () => {
    const d = variantDescriptions.map((x) => (Array.isArray(x) ? x : []));
    while (d.length < count) d.push([]);
    return d;
  };
  const setVariantDescriptions = (i: number, blocks: DescriptionBlockFormValue[]) => {
    const next = padDescs();
    next[i] = blocks;
    setValue(`productOptions.${index}.variantDescriptions`, next, { shouldDirty: true });
  };
  const toggleVariantCustomDescription = (i: number) => {
    const current = padDescs()[i];
    setVariantDescriptions(
      i,
      current.length > 0 ? [] : [{ title: "", title_ar: "", description: "", description_ar: "" }]
    );
  };
  const addVariantBlock = (i: number) => {
    setVariantDescriptions(i, [
      ...padDescs()[i],
      { title: "", title_ar: "", description: "", description_ar: "" },
    ]);
  };
  const removeVariantBlock = (i: number, blockIndex: number) => {
    setVariantDescriptions(
      i,
      padDescs()[i].filter((_, j) => j !== blockIndex)
    );
  };
  const setVariantBlockField = (
    i: number,
    blockIndex: number,
    field: "title" | "title_ar" | "description" | "description_ar",
    value: string
  ) => {
    setVariantDescriptions(
      i,
      padDescs()[i].map((b, j) => (j === blockIndex ? { ...b, [field]: value } : b))
    );
  };
  // variantColors follows the exact same standalone-field pattern as
  // variantDescriptions above (nested one level deeper than the other per-value
  // fields) — see that block's comment for why it isn't threaded through commit().
  const padColors = () => {
    const c = variantColors.map((x) => (Array.isArray(x) ? x : []));
    while (c.length < count) c.push([]);
    return c;
  };
  const setVariantColors = (i: number, colors: VariantColorFormValue[]) => {
    const next = padColors();
    next[i] = colors;
    setValue(`productOptions.${index}.variantColors`, next, { shouldDirty: true });
  };
  const addColorEntry = (i: number) => {
    setVariantColors(i, [...padColors()[i], { label: "", label_ar: "", images: [] }]);
  };
  const removeColorEntry = (i: number, colorIndex: number) => {
    setVariantColors(i, padColors()[i].filter((_, j) => j !== colorIndex));
    setColorPickerOpen(null);
  };
  const setColorField = (
    i: number,
    colorIndex: number,
    field: "label" | "label_ar",
    value: string
  ) => {
    setVariantColors(
      i,
      padColors()[i].map((c, j) => (j === colorIndex ? { ...c, [field]: value } : c))
    );
  };
  const toggleColorImage = (i: number, colorIndex: number, url: string) => {
    const colors = padColors();
    const current = colors[i][colorIndex]?.images ?? [];
    const nextImages = current.includes(url)
      ? current.filter((u) => u !== url)
      : [...current, url];
    setVariantColors(
      i,
      colors[i].map((c, j) => (j === colorIndex ? { ...c, images: nextImages } : c))
    );
  };
  const addRow = () => {
    const s = padded();
    commit(
      [...s.opts, ""],
      [...s.ars, ""],
      [...s.cols, ""],
      [...s.sets, []],
      [...s.prices, null],
      [...s.discounts, null],
      [...s.subtitle, ""],
      [...s.subtitleAr, ""]
    );
    setValue(`productOptions.${index}.variantDescriptions`, [...padDescs(), []], { shouldDirty: true });
    setValue(`productOptions.${index}.variantColors`, [...padColors(), []], { shouldDirty: true });
  };
  const removeRow = (i: number) => {
    const s = padded();
    commit(
      s.opts.filter((_, j) => j !== i),
      s.ars.filter((_, j) => j !== i),
      s.cols.filter((_, j) => j !== i),
      s.sets.filter((_, j) => j !== i),
      s.prices.filter((_, j) => j !== i),
      s.discounts.filter((_, j) => j !== i),
      s.subtitle.filter((_, j) => j !== i),
      s.subtitleAr.filter((_, j) => j !== i)
    );
    setValue(
      `productOptions.${index}.variantDescriptions`,
      padDescs().filter((_, j) => j !== i),
      { shouldDirty: true }
    );
    setValue(
      `productOptions.${index}.variantColors`,
      padColors().filter((_, j) => j !== i),
      { shouldDirty: true }
    );
    setPickerOpen(null);
    setColorPickerOpen(null);
    // Keep the default pointer valid — clear it if it pointed at the removed row,
    // shift it left if it pointed past it.
    if (variantDefaultIndex != null) {
      if (variantDefaultIndex === i) setValue(`productOptions.${index}.variantDefaultIndex`, null);
      else if (variantDefaultIndex > i)
        setValue(`productOptions.${index}.variantDefaultIndex`, variantDefaultIndex - 1);
    }
  };

  return (
    <div className="mt-3">
      <label className="mb-1.5 block text-xs font-medium text-ink-700">
        {isColor ? t("admin.productForm.coloursLabel") : t("admin.productForm.valuesLabel")}
      </label>

      <div className="flex flex-col gap-2">
        {options.map((value, i) => {
          const nameSwatch = isColor ? swatchForValue(value) : null;
          const custom = (optionColors[i] || "").trim();
          // What the swatch shows: an explicit picked colour wins over the
          // name-derived one; may still be undefined for an unknown name.
          const swatchBg = custom || nameSwatch?.swatch;
          // <input type=color> needs a plain #rrggbb; gradients/unknowns fall back.
          const hexRe = /^#([0-9a-f]{6})$/i;
          const pickerValue = hexRe.test(custom)
            ? custom
            : hexRe.test(nameSwatch?.swatch ?? "")
              ? (nameSwatch!.swatch as string)
              : "#dda0dd";
          const set = optionImageSets[i] ?? [];
          const firstImg = set[0] || "";
          // Photos already used by ANOTHER value in this group can't be reused.
          const takenElsewhere = new Set(
            optionImageSets.flatMap((s, j) => (j === i ? [] : s ?? []))
          );
          return (
            <div
              key={i}
              ref={pickerOpen === i ? openRowRef : undefined}
              className="rounded-lg border border-ink-100 bg-white p-2"
            >
              <div className="flex items-center gap-2">
                {isColor ? (
                  <div className="flex shrink-0 items-center gap-1">
                    <label
                      className={cn(
                        "relative flex h-7 w-7 cursor-pointer items-center justify-center overflow-hidden rounded-full border",
                        nameSwatch?.needsRing && !custom
                          ? "border-ink-300"
                          : "border-black/10"
                      )}
                      style={swatchBg ? { background: swatchBg } : undefined}
                      title={t("admin.productForm.pickColourTitle")}
                    >
                      {!swatchBg ? (
                        <span className="text-[10px] text-ink-400">?</span>
                      ) : null}
                      <input
                        type="color"
                        value={pickerValue}
                        onChange={(e) => setColor(i, e.target.value)}
                        aria-label={t("admin.productForm.pickColourAria", {
                          value: value || t("admin.productForm.thisValueFallback"),
                        })}
                        className="absolute inset-0 cursor-pointer opacity-0"
                      />
                    </label>
                    {custom ? (
                      <button
                        type="button"
                        onClick={() => setColor(i, "")}
                        title={t("admin.productForm.autoColourTitle")}
                        className="text-[10px] font-medium text-ink-400 hover:text-ink-700"
                      >
                        {t("admin.productForm.autoColourLabel")}
                      </button>
                    ) : null}
                  </div>
                ) : null}

                <input
                  value={value}
                  onChange={(e) => setEn(i, e.target.value)}
                  placeholder={isColor ? "Red" : t("admin.productForm.valuePlaceholderEn")}
                  className="h-9 min-w-0 flex-1 rounded-lg border border-ink-200 bg-white px-2.5 text-sm focus:border-bloom-500 focus:outline-none focus:ring-2 focus:ring-bloom-500/20"
                />
                <input
                  value={optionsAr[i] ?? ""}
                  onChange={(e) => setArVal(i, e.target.value)}
                  dir="rtl"
                  placeholder={isColor ? "أحمر" : t("admin.productForm.valuePlaceholderArShort")}
                  className="h-9 w-20 shrink-0 rounded-lg border border-ink-200 bg-white px-2.5 text-sm focus:border-bloom-500 focus:outline-none focus:ring-2 focus:ring-bloom-500/20"
                />

                <button
                  type="button"
                  onClick={() => setPickerOpen(pickerOpen === i ? null : i)}
                  disabled={images.length === 0}
                  className="flex h-9 shrink-0 items-center gap-1.5 rounded-lg border border-ink-200 bg-white px-2 text-xs text-ink-700 hover:border-ink-400 disabled:opacity-50"
                  aria-expanded={pickerOpen === i}
                >
                  {firstImg ? (
                    <>
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img
                        src={firstImg}
                        alt=""
                        className="h-6 w-6 rounded object-cover"
                      />
                      <span className="hidden sm:inline">
                        {set.length > 1
                          ? t("admin.productForm.photosCountLabel", { count: set.length })
                          : t("admin.productForm.photoLabel")}
                      </span>
                    </>
                  ) : (
                    <span>
                      {images.length === 0
                        ? t("admin.productForm.noImagesLabel")
                        : t("admin.productForm.addPhotosLabel")}
                    </span>
                  )}
                  <ChevronDown size={12} />
                </button>

                <button
                  type="button"
                  aria-label={t("admin.productForm.removeValueAria")}
                  onClick={() => removeRow(i)}
                  className="shrink-0 rounded-md p-1.5 text-ink-400 hover:bg-ink-50 hover:text-bloom-700"
                >
                  <CloseIcon size={14} />
                </button>
              </div>

              {isVariantAxis ? (
                <>
                <div className="mt-2 grid gap-2 border-t border-ink-100 pt-2 sm:grid-cols-[1fr_1fr_auto]">
                  <input
                    type="number"
                    step="0.01"
                    min="0"
                    value={variantPrices[i] ?? ""}
                    onChange={(e) =>
                      setPrice(i, e.target.value === "" ? null : Number(e.target.value))
                    }
                    placeholder={t("admin.productForm.variantPricePlaceholder")}
                    aria-label={t("admin.productForm.variantPriceAria", {
                      value: value || t("admin.productForm.thisValueFallback"),
                    })}
                    className="h-9 rounded-lg border border-ink-200 bg-white px-2.5 text-sm focus:border-bloom-500 focus:outline-none focus:ring-2 focus:ring-bloom-500/20"
                  />
                  <input
                    type="number"
                    step="0.01"
                    min="0"
                    value={variantDiscountedPrices[i] ?? ""}
                    onChange={(e) =>
                      setDiscountedPrice(i, e.target.value === "" ? null : Number(e.target.value))
                    }
                    placeholder={t("admin.productForm.variantDiscountedPricePlaceholder")}
                    aria-label={t("admin.productForm.variantDiscountedPriceAria", {
                      value: value || t("admin.productForm.thisValueFallback"),
                    })}
                    className="h-9 rounded-lg border border-ink-200 bg-white px-2.5 text-sm focus:border-bloom-500 focus:outline-none focus:ring-2 focus:ring-bloom-500/20"
                  />
                  <button
                    type="button"
                    onClick={() => setDefault(i)}
                    aria-pressed={variantDefaultIndex === i}
                    className={cn(
                      "h-9 shrink-0 whitespace-nowrap rounded-lg border px-2.5 text-xs font-medium",
                      variantDefaultIndex === i
                        ? "border-bloom-500 bg-bloom-50 text-bloom-700"
                        : "border-ink-200 bg-white text-ink-600 hover:border-ink-400"
                    )}
                  >
                    {variantDefaultIndex === i
                      ? t("admin.productForm.variantIsDefaultLabel")
                      : t("admin.productForm.variantSetDefaultLabel")}
                  </button>
                  <textarea
                    value={variantSubtitle[i] ?? ""}
                    onChange={(e) => setSubtitle(i, e.target.value)}
                    placeholder={t("admin.productForm.variantSubtitlePlaceholderEn")}
                    rows={2}
                    className="rounded-lg border border-ink-200 bg-white px-2.5 py-1.5 text-sm focus:border-bloom-500 focus:outline-none focus:ring-2 focus:ring-bloom-500/20 sm:col-span-2"
                  />
                  <textarea
                    value={variantSubtitleAr[i] ?? ""}
                    onChange={(e) => setSubtitleAr(i, e.target.value)}
                    dir="rtl"
                    placeholder={t("admin.productForm.variantSubtitlePlaceholderAr")}
                    rows={2}
                    className="rounded-lg border border-ink-200 bg-white px-2.5 py-1.5 text-sm focus:border-bloom-500 focus:outline-none focus:ring-2 focus:ring-bloom-500/20"
                  />
                </div>

                {overrideRegions.length > 0 && (
                  <div className="mt-2 border-t border-ink-100 pt-2">
                    <span className="text-xs font-medium text-ink-600">
                      {t("admin.productForm.variantRegionPricesLabel")}
                    </span>
                    <div className="mt-1.5 flex flex-col gap-1.5">
                      {overrideRegions.map((region) => {
                        const rp = variantRegionPrices[i]?.[region.id];
                        const regionName =
                          locale === "ar" ? region.name_ar || region.name : region.name;
                        return (
                          <div
                            key={region.id}
                            className="grid items-center gap-2 sm:grid-cols-[minmax(0,7rem)_1fr_1fr]"
                          >
                            <span className="truncate text-xs text-ink-500" title={regionName}>
                              {regionName} · {region.currency}
                            </span>
                            <input
                              type="number"
                              step="0.01"
                              min="0"
                              value={rp?.price ?? ""}
                              onChange={(e) =>
                                setVariantRegionPrice(
                                  i,
                                  region.id,
                                  "price",
                                  e.target.value === "" ? null : Number(e.target.value)
                                )
                              }
                              placeholder={t("admin.productForm.regionPriceLabel", {
                                currency: region.currency,
                              })}
                              className="h-9 rounded-lg border border-ink-200 bg-white px-2.5 text-sm focus:border-bloom-500 focus:outline-none focus:ring-2 focus:ring-bloom-500/20"
                            />
                            <input
                              type="number"
                              step="0.01"
                              min="0"
                              value={rp?.discountedPrice ?? ""}
                              onChange={(e) =>
                                setVariantRegionPrice(
                                  i,
                                  region.id,
                                  "discountedPrice",
                                  e.target.value === "" ? null : Number(e.target.value)
                                )
                              }
                              placeholder={t("admin.productForm.regionDiscountedPriceLabel", {
                                currency: region.currency,
                              })}
                              className="h-9 rounded-lg border border-ink-200 bg-white px-2.5 text-sm focus:border-bloom-500 focus:outline-none focus:ring-2 focus:ring-bloom-500/20"
                            />
                          </div>
                        );
                      })}
                    </div>
                    <p className="mt-1 text-[11px] text-ink-400">
                      {t("admin.productForm.variantRegionPricesHint")}
                    </p>
                  </div>
                )}

                <div className="mt-2 border-t border-ink-100 pt-2">
                  <div className="flex items-center justify-between gap-2">
                    <span className="text-xs font-medium text-ink-600">
                      {t("admin.productForm.variantDescriptionLabel")}
                    </span>
                    <button
                      type="button"
                      onClick={() => toggleVariantCustomDescription(i)}
                      className={cn(
                        "text-xs font-medium",
                        (variantDescriptions[i]?.length ?? 0) > 0
                          ? "text-bloom-700 hover:text-bloom-800"
                          : "text-ink-500 hover:text-ink-800"
                      )}
                    >
                      {(variantDescriptions[i]?.length ?? 0) > 0
                        ? t("admin.productForm.variantDescriptionUseShared")
                        : t("admin.productForm.variantDescriptionAddCustom")}
                    </button>
                  </div>

                  {(variantDescriptions[i]?.length ?? 0) === 0 ? (
                    <p className="mt-1 text-[11px] text-ink-400">
                      {t("admin.productForm.variantDescriptionSharedHint")}
                    </p>
                  ) : (
                    <div className="mt-2 flex flex-col gap-2">
                      {(variantDescriptions[i] ?? []).map((block, blockIndex) => (
                        <div
                          key={blockIndex}
                          className="rounded-lg border border-ink-100 bg-cream-50 p-3"
                        >
                          <div className="mb-2 flex items-center justify-between">
                            <p className="text-[11px] font-semibold uppercase tracking-wider text-ink-500">
                              {t("admin.productForm.blockLabel", { n: blockIndex + 1 })}
                            </p>
                            <button
                              type="button"
                              aria-label={t("admin.productForm.removeBlockAria")}
                              onClick={() => removeVariantBlock(i, blockIndex)}
                              className="rounded-md p-1 text-bloom-700 hover:bg-bloom-50"
                            >
                              <TrashIcon size={12} />
                            </button>
                          </div>
                          <div className="grid gap-2 sm:grid-cols-2">
                            <input
                              value={block.title ?? ""}
                              onChange={(e) =>
                                setVariantBlockField(i, blockIndex, "title", e.target.value)
                              }
                              placeholder={t("admin.productForm.headingEn")}
                              className="h-8 rounded-lg border border-ink-200 bg-white px-2.5 text-xs focus:border-bloom-500 focus:outline-none focus:ring-2 focus:ring-bloom-500/20"
                            />
                            <input
                              value={block.title_ar ?? ""}
                              onChange={(e) =>
                                setVariantBlockField(i, blockIndex, "title_ar", e.target.value)
                              }
                              dir="rtl"
                              placeholder={t("admin.productForm.headingAr")}
                              className="h-8 rounded-lg border border-ink-200 bg-white px-2.5 text-xs focus:border-bloom-500 focus:outline-none focus:ring-2 focus:ring-bloom-500/20"
                            />
                          </div>
                          <RichTextField
                            label={t("admin.productForm.bodyEn")}
                            className="mt-2"
                            value={block.description ?? ""}
                            onChange={(html) =>
                              setVariantBlockField(i, blockIndex, "description", html)
                            }
                          />
                          <RichTextField
                            label={t("admin.productForm.bodyAr")}
                            className="mt-2"
                            dir="rtl"
                            value={block.description_ar ?? ""}
                            onChange={(html) =>
                              setVariantBlockField(i, blockIndex, "description_ar", html)
                            }
                          />
                        </div>
                      ))}
                      <button
                        type="button"
                        onClick={() => addVariantBlock(i)}
                        className="inline-flex items-center gap-1 self-start text-xs font-medium text-bloom-700 hover:text-bloom-800"
                      >
                        <PlusIcon size={12} /> {t("admin.productForm.addBlock")}
                      </button>
                    </div>
                  )}
                </div>

                <div className="mt-2 border-t border-ink-100 pt-2">
                  <div className="flex items-center justify-between gap-2">
                    <span className="text-xs font-medium text-ink-600">
                      {t("admin.productForm.variantColorsLabel")}
                    </span>
                    <button
                      type="button"
                      onClick={() => addColorEntry(i)}
                      className="inline-flex items-center gap-1 text-xs font-medium text-bloom-700 hover:text-bloom-800"
                    >
                      <PlusIcon size={12} /> {t("admin.productForm.addColour")}
                    </button>
                  </div>

                  {(variantColors[i]?.length ?? 0) === 0 ? (
                    <p className="mt-1 text-[11px] text-ink-400">
                      {t("admin.productForm.variantColorsEmptyHint")}
                    </p>
                  ) : (
                    <div className="mt-2 flex flex-col gap-2">
                      {(variantColors[i] ?? []).map((color, colorIndex) => {
                        const colorKey = `${i}:${colorIndex}`;
                        const colorImages = color.images ?? [];
                        return (
                          <div
                            key={colorIndex}
                            ref={colorPickerOpen === colorKey ? colorPickerRef : undefined}
                            className="rounded-lg border border-ink-100 bg-cream-50 p-3"
                          >
                            <div className="mb-2 flex items-center justify-between">
                              <p className="text-[11px] font-semibold uppercase tracking-wider text-ink-500">
                                {t("admin.productForm.colourLabel", { n: colorIndex + 1 })}
                              </p>
                              <button
                                type="button"
                                aria-label={t("admin.productForm.removeColourAria")}
                                onClick={() => removeColorEntry(i, colorIndex)}
                                className="rounded-md p-1 text-bloom-700 hover:bg-bloom-50"
                              >
                                <TrashIcon size={12} />
                              </button>
                            </div>
                            <div className="grid gap-2 sm:grid-cols-[1fr_1fr_auto]">
                              <input
                                value={color.label ?? ""}
                                onChange={(e) => setColorField(i, colorIndex, "label", e.target.value)}
                                placeholder={t("admin.productForm.colourNamePlaceholderEn")}
                                className="h-8 rounded-lg border border-ink-200 bg-white px-2.5 text-xs focus:border-bloom-500 focus:outline-none focus:ring-2 focus:ring-bloom-500/20"
                              />
                              <input
                                value={color.label_ar ?? ""}
                                onChange={(e) => setColorField(i, colorIndex, "label_ar", e.target.value)}
                                dir="rtl"
                                placeholder={t("admin.productForm.colourNamePlaceholderAr")}
                                className="h-8 rounded-lg border border-ink-200 bg-white px-2.5 text-xs focus:border-bloom-500 focus:outline-none focus:ring-2 focus:ring-bloom-500/20"
                              />
                              <button
                                type="button"
                                onClick={() =>
                                  setColorPickerOpen(colorPickerOpen === colorKey ? null : colorKey)
                                }
                                disabled={images.length === 0}
                                className="flex h-8 shrink-0 items-center gap-1.5 rounded-lg border border-ink-200 bg-white px-2 text-xs text-ink-700 hover:border-ink-400 disabled:opacity-50"
                                aria-expanded={colorPickerOpen === colorKey}
                              >
                                {colorImages[0] ? (
                                  <>
                                    {/* eslint-disable-next-line @next/next/no-img-element */}
                                    <img
                                      src={colorImages[0]}
                                      alt=""
                                      className="h-5 w-5 rounded object-cover"
                                    />
                                    <span className="hidden sm:inline">
                                      {colorImages.length > 1
                                        ? t("admin.productForm.photosCountLabel", { count: colorImages.length })
                                        : t("admin.productForm.photoLabel")}
                                    </span>
                                  </>
                                ) : (
                                  <span>
                                    {images.length === 0
                                      ? t("admin.productForm.noImagesLabel")
                                      : t("admin.productForm.addPhotosLabel")}
                                  </span>
                                )}
                                <ChevronDown size={12} />
                              </button>
                            </div>

                            {colorPickerOpen === colorKey && images.length > 0 ? (
                              <div className="mt-2 border-t border-ink-100 pt-2">
                                <div className="flex flex-wrap gap-1.5">
                                  {images.map((url) => {
                                    const active = colorImages.includes(url);
                                    return (
                                      <button
                                        key={url}
                                        type="button"
                                        aria-pressed={active}
                                        aria-label={
                                          active
                                            ? t("admin.productForm.removePhotoAria")
                                            : t("admin.productForm.addPhotoAria")
                                        }
                                        onClick={() => toggleColorImage(i, colorIndex, url)}
                                        className={cn(
                                          "relative h-10 w-10 overflow-hidden rounded-md ring-offset-1",
                                          active
                                            ? "ring-2 ring-bloom-500"
                                            : "ring-1 ring-ink-200 hover:ring-ink-400"
                                        )}
                                      >
                                        {/* eslint-disable-next-line @next/next/no-img-element */}
                                        <img src={url} alt="" className="h-full w-full object-cover" />
                                      </button>
                                    );
                                  })}
                                </div>
                              </div>
                            ) : null}
                          </div>
                        );
                      })}
                    </div>
                  )}
                </div>
                </>
              ) : null}

              {pickerOpen === i && images.length > 0 ? (
                <div className="mt-2 border-t border-ink-100 pt-2">
                  <div className="flex flex-wrap gap-1.5">
                    {images.map((url) => {
                      const pos = set.indexOf(url);
                      const active = pos !== -1;
                      const taken = takenElsewhere.has(url);
                      return (
                        <button
                          key={url}
                          type="button"
                          disabled={taken && !active}
                          aria-pressed={active}
                          aria-label={
                            taken && !active
                              ? t("admin.productForm.alreadyUsedAria")
                              : active
                                ? t("admin.productForm.removePhotoAria")
                                : t("admin.productForm.addPhotoAria")
                          }
                          title={
                            taken && !active
                              ? t("admin.productForm.alreadyUsedAria")
                              : undefined
                          }
                          onClick={() => toggleImg(i, url)}
                          className={cn(
                            "relative h-12 w-12 overflow-hidden rounded-md ring-offset-1",
                            active
                              ? "ring-2 ring-bloom-500"
                              : "ring-1 ring-ink-200 hover:ring-ink-400",
                            taken && !active &&
                              "cursor-not-allowed opacity-40 grayscale hover:ring-ink-200"
                          )}
                        >
                          {/* eslint-disable-next-line @next/next/no-img-element */}
                          <img src={url} alt="" className="h-full w-full object-cover" />
                          {active ? (
                            <span className="absolute inset-e-0.5 top-0.5 flex h-4 w-4 items-center justify-center rounded-full bg-bloom-500 text-[9px] font-semibold text-white">
                              {pos + 1}
                            </span>
                          ) : null}
                        </button>
                      );
                    })}
                  </div>
                  <p className="mt-1.5 text-[11px] text-ink-400">
                    {t("admin.productForm.pickPhotosHint")}
                  </p>
                </div>
              ) : null}
            </div>
          );
        })}
      </div>

      {optionsError ? (
        <p className="mt-1 text-xs text-bloom-700">{optionsError}</p>
      ) : null}

      <button
        type="button"
        onClick={addRow}
        className="mt-2 inline-flex items-center gap-1 text-sm font-medium text-bloom-700 hover:text-bloom-800"
      >
        <PlusIcon size={14} />{" "}
        {isColor ? t("admin.productForm.addColour") : t("admin.productForm.addValueLabel")}
      </button>

      {images.length === 0 ? (
        <p className="mt-2 text-[11px] text-ink-400">
          {t("admin.productForm.uploadImagesHint")}
        </p>
      ) : null}
    </div>
  );
}
