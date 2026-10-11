"use client";

import { useEffect, useMemo, useRef } from "react";
import { useForm, Controller } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { useQuery } from "@tanstack/react-query";
import { Button, Input, Textarea } from "@/components/ui";
import { ImageUpload } from "@/components/admin/ImageUpload";
import { RegionPicker } from "@/components/admin/RegionPicker";
import { FormSection } from "@/components/admin/FormSection";
import { Select } from "@/components/admin/Select";
import { regionsApi } from "@/features/regions/api/regions.api";
import { deliveryZonesApi } from "@/features/delivery-zones/api/delivery-zones.api";
import { queryKeys } from "@/services/queryKeys";
import { useT } from "@/i18n/useT";
import type {
  ApiCategory,
  ApiCategoryCreateInput,
  ApiCategoryRegionLead,
  ApiCategoryZoneLead,
} from "@/features/categories/api-types";

interface CategoryFormProps {
  initial?: ApiCategory;
  onSubmit: (payload: ApiCategoryCreateInput) => Promise<void>;
  submitLabel: string;
  submitting?: boolean;
}

export function CategoryForm({ initial, onSubmit, submitLabel, submitting }: CategoryFormProps) {
  const { t, locale } = useT();
  const schema = useMemo(
    () =>
      z.object({
        title: z.string().min(1, t("admin.categoryForm.titleRequired")),
        title_ar: z.string().optional().nullable(),
        description: z.string().optional().nullable(),
        description_ar: z.string().optional().nullable(),
        image: z.string().url().nullable(),
        status: z.enum(["DRAFT", "PUBLISHED"]),
        // Per-region "coming soon": which of the category's regions it's a teaser in
        // (cascades to its products there). Empty = live in every region it's in.
        comingSoonRegionIds: z.array(z.string()),
        // Per-region "on sale": cascades a Sale badge to the category's products + a label.
        onSaleRegionIds: z.array(z.string()),
        saleLabel: z.string().optional(),
        saleLabel_ar: z.string().optional(),
        // null = no category default (products fall through to the MESSAGE default).
        giftCardMode: z.enum(["MESSAGE", "NAME"]).nullable(),
        draftScope: z.enum(["HOME_ONLY", "ENTIRE_STORE"]),
        deliveryLeadDays: z
          .number()
          .int()
          .min(0, t("admin.categoryForm.deliveryLeadDaysInvalid"))
          .max(30, t("admin.categoryForm.deliveryLeadDaysInvalid"))
          .nullable(),
        // Default cash-arrangement fee schedule for this category (both-or-neither;
        // enforced server-side — see utils/cashArrangementMath.js).
        cashArrangementFeeStepAmount: z.number().positive().nullable(),
        cashArrangementFeeMarginPercent: z.number().nonnegative().nullable(),
        regionIds: z.array(z.string()),
        // Per-region lead-time overrides, keyed by regionId (null = no override).
        // Per-region/zone records are keyed by id; an untouched override comes through as
        // `undefined`, so the value schema must be `.nullish()` (null OR undefined = no
        // override), not just `.nullable()` — else every unset region/zone fails validation.
        regionLeadDays: z.record(
          z.string(),
          z
            .number()
            .int(t("admin.categoryForm.deliveryLeadDaysInvalid"))
            .min(0, t("admin.categoryForm.deliveryLeadDaysInvalid"))
            .max(30, t("admin.categoryForm.deliveryLeadDaysInvalid"))
            .nullish()
        ),
        // Per-region cash-arrangement fee schedule overrides — sibling records (not
        // merged into regionLeadDays' bare-number shape); merged back into one
        // combined array at submit time.
        regionCashArrangementFeeStepAmount: z.record(z.string(), z.number().positive().nullish()),
        regionCashArrangementFeeMarginPercent: z.record(z.string(), z.number().nonnegative().nullish()),
        // Per-zone lead-time overrides, keyed by zoneId (null/blank = no override).
        zoneLeadDays: z.record(
          z.string(),
          z
            .number()
            .int(t("admin.categoryForm.deliveryLeadDaysInvalid"))
            .min(0, t("admin.categoryForm.deliveryLeadDaysInvalid"))
            .max(30, t("admin.categoryForm.deliveryLeadDaysInvalid"))
            .nullish()
        ),
        // zoneId -> true means "hide this category (and its products) in that zone".
        // Value is optional because clearing a checkbox can leave an `undefined`
        // behind, and a strict boolean would invalidate the entire form — which shows
        // up as a Save button that does nothing (there is no onInvalid handler).
        hiddenZones: z.record(z.string(), z.boolean().optional()).optional(),
        zoneCashArrangementFeeStepAmount: z.record(z.string(), z.number().positive().nullish()),
        zoneCashArrangementFeeMarginPercent: z.record(z.string(), z.number().nonnegative().nullish()),
      }),
    [t]
  );

  type FormValues = z.infer<typeof schema>;

  const {
    register,
    control,
    watch,
    setValue,
    handleSubmit,
    reset,
    formState: { errors },
  } = useForm<FormValues>({
    resolver: zodResolver(schema),
    defaultValues: {
      title: "",
      title_ar: "",
      description: "",
      description_ar: "",
      image: null,
      status: "PUBLISHED",
      comingSoonRegionIds: [],
      onSaleRegionIds: [],
      saleLabel: "",
      saleLabel_ar: "",
      giftCardMode: null,
      draftScope: "HOME_ONLY",
      deliveryLeadDays: null,
      cashArrangementFeeStepAmount: null,
      cashArrangementFeeMarginPercent: null,
      regionIds: [],
      regionLeadDays: {},
      regionCashArrangementFeeStepAmount: {},
      regionCashArrangementFeeMarginPercent: {},
      zoneLeadDays: {},
      hiddenZones: {},
      zoneCashArrangementFeeStepAmount: {},
      zoneCashArrangementFeeMarginPercent: {},
    },
  });

  // Regions the category is in (from the picker) drive which per-region lead-day
  // inputs to show, and we need their names for the labels.
  const regionsQuery = useQuery({
    queryKey: queryKeys.regions.list(),
    queryFn: () => regionsApi.list(),
  });
  // All delivery zones (staff token returns every region's zones when no `region`
  // is passed). We filter per region below, mirroring the per-region lead pattern.
  const zonesQuery = useQuery({
    queryKey: queryKeys.deliveryZones.list(),
    queryFn: () => deliveryZonesApi.list(),
  });
  const allZones = zonesQuery.data ?? [];
  const selectedRegionIds = watch("regionIds");
  const watchedStatus = watch("status");
  const comingSoonRegionIds = watch("comingSoonRegionIds") ?? [];
  const onSaleRegionIds = watch("onSaleRegionIds") ?? [];
  const watchedGiftCardMode = watch("giftCardMode");
  const selectedRegions = (regionsQuery.data ?? []).filter((r) =>
    selectedRegionIds?.includes(r.id)
  );

  // Reset the form ONLY when a different category loads — not on every `initial`
  // reference change. A background refetch (react-query window-focus / staleness)
  // returning a fresh object would otherwise re-run reset() and wipe unsaved edits,
  // e.g. a per-region delivery day the admin just typed but hasn't saved.
  const initedForId = useRef<string | null>(null);
  useEffect(() => {
    if (!initial) return;
    if (initedForId.current === initial.id) return;
    initedForId.current = initial.id;
    reset({
      title: initial.title,
      title_ar: initial.title_ar ?? "",
      description: initial.description ?? "",
      description_ar: initial.description_ar ?? "",
      image: initial.image,
      status: initial.status ?? "PUBLISHED",
      comingSoonRegionIds: initial.comingSoonRegionIds ?? [],
      onSaleRegionIds: initial.onSaleRegionIds ?? [],
      saleLabel: initial.saleLabel ?? "",
      saleLabel_ar: initial.saleLabel_ar ?? "",
      giftCardMode: initial.giftCardMode ?? null,
      draftScope: initial.draftScope ?? "HOME_ONLY",
      deliveryLeadDays: initial.deliveryLeadDays ?? null,
      cashArrangementFeeStepAmount: initial.cashArrangementFeeStepAmount ?? null,
      cashArrangementFeeMarginPercent: initial.cashArrangementFeeMarginPercent ?? null,
      regionIds: initial.regionIds ?? [],
      regionLeadDays: Object.fromEntries(
        (initial.regionLeadDays ?? []).map((rl) => [rl.regionId, rl.deliveryLeadDays])
      ),
      regionCashArrangementFeeStepAmount: Object.fromEntries(
        (initial.regionLeadDays ?? []).map((rl) => [rl.regionId, rl.cashArrangementFeeStepAmount ?? null])
      ),
      regionCashArrangementFeeMarginPercent: Object.fromEntries(
        (initial.regionLeadDays ?? []).map((rl) => [rl.regionId, rl.cashArrangementFeeMarginPercent ?? null])
      ),
      zoneLeadDays: Object.fromEntries(
        (initial.zoneLeadDays ?? []).map((zl) => [zl.zoneId, zl.deliveryLeadDays ?? null])
      ),
      hiddenZones: Object.fromEntries(
        (initial.zoneLeadDays ?? []).filter((zl) => zl.hidden).map((zl) => [zl.zoneId, true])
      ),
      zoneCashArrangementFeeStepAmount: Object.fromEntries(
        (initial.zoneLeadDays ?? []).map((zl) => [zl.zoneId, zl.cashArrangementFeeStepAmount ?? null])
      ),
      zoneCashArrangementFeeMarginPercent: Object.fromEntries(
        (initial.zoneLeadDays ?? []).map((zl) => [zl.zoneId, zl.cashArrangementFeeMarginPercent ?? null])
      ),
    });
  }, [initial, reset]);

  const submit = handleSubmit(async (values) => {
    await onSubmit({
      title: values.title.trim(),
      title_ar: values.title_ar?.trim() || null,
      description: values.description?.trim() || null,
      description_ar: values.description_ar?.trim() || null,
      image: values.image,
      status: values.status,
      comingSoonRegionIds:
        values.status === "PUBLISHED"
          ? (values.comingSoonRegionIds ?? []).filter((id) => (values.regionIds ?? []).includes(id))
          : [],
      // On sale is orthogonal to status (visual badge) — keep it regardless of draft/published.
      onSaleRegionIds: (values.onSaleRegionIds ?? []).filter((id) => (values.regionIds ?? []).includes(id)),
      saleLabel: values.saleLabel?.trim() || null,
      saleLabel_ar: values.saleLabel_ar?.trim() || null,
      giftCardMode: values.giftCardMode,
      draftScope: values.draftScope,
      deliveryLeadDays: values.deliveryLeadDays,
      cashArrangementFeeStepAmount: values.cashArrangementFeeStepAmount,
      cashArrangementFeeMarginPercent: values.cashArrangementFeeMarginPercent,
      regionIds: values.regionIds,
      // Send every per-region lead the form holds; the backend only applies the
      // ones for regions the category is actually in (targetRegionIds). We do NOT
      // filter here by values.regionIds — an id-format mismatch would silently
      // drop the override and the backend would keep the stale value.
      //
      // Lead days and the cash-arrangement fee schedule are edited as separate
      // form-state records (see regionCashArrangementFee*/zoneCashArrangementFee*
      // above) but submitted as ONE combined array per region/zone — matches the
      // backend's CategoryRegion/CategoryZone row, which carries all fields together.
      regionLeadDays: (() => {
        const regionIds = new Set([
          ...Object.keys(values.regionLeadDays ?? {}),
          ...Object.keys(values.regionCashArrangementFeeStepAmount ?? {}),
          ...Object.keys(values.regionCashArrangementFeeMarginPercent ?? {}),
        ]);
        const rows: ApiCategoryRegionLead[] = [];
        for (const regionId of regionIds) {
          rows.push({
            regionId,
            deliveryLeadDays: values.regionLeadDays?.[regionId] ?? null,
            cashArrangementFeeStepAmount: values.regionCashArrangementFeeStepAmount?.[regionId] ?? null,
            cashArrangementFeeMarginPercent: values.regionCashArrangementFeeMarginPercent?.[regionId] ?? null,
          });
        }
        return rows;
      })(),
      // Per-zone overrides — drop a zone entirely only when it has NONE of the three
      // overrides set (server treats a missing zone as "no override at all").
      zoneLeadDays: (() => {
        const zoneIds = new Set([
          ...Object.keys(values.zoneLeadDays ?? {}),
          ...Object.keys(values.hiddenZones ?? {}),
          ...Object.keys(values.zoneCashArrangementFeeStepAmount ?? {}),
          ...Object.keys(values.zoneCashArrangementFeeMarginPercent ?? {}),
        ]);
        const rows: ApiCategoryZoneLead[] = [];
        for (const zoneId of zoneIds) {
          const deliveryLeadDays = values.zoneLeadDays?.[zoneId] ?? null;
          const cashArrangementFeeStepAmount = values.zoneCashArrangementFeeStepAmount?.[zoneId] ?? null;
          const cashArrangementFeeMarginPercent = values.zoneCashArrangementFeeMarginPercent?.[zoneId] ?? null;
          // A hide with no lead/fee override still needs its row written.
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
    });
  });

  return (
    <form onSubmit={submit} className="grid gap-6 lg:grid-cols-[2fr_1fr]" noValidate>
      <div className="flex flex-col gap-6">
        <section className="rounded-2xl border border-ink-100 bg-white p-5 sm:p-6">
          <h3 className="mb-4 font-display text-lg text-ink-900">{t("admin.categoryForm.namesHeading")}</h3>
          <div className="grid gap-4 sm:grid-cols-2">
            <Input
              label={t("admin.categoryForm.titleEn")}
              placeholder="Eid Gifts"
              error={errors.title?.message}
              {...register("title")}
            />
            <Input
              label={t("admin.categoryForm.titleAr")}
              dir="rtl"
              placeholder="هدايا العيد"
              {...register("title_ar")}
            />
          </div>
        </section>

        <section className="rounded-2xl border border-ink-100 bg-white p-5 sm:p-6">
          <h3 className="mb-4 font-display text-lg text-ink-900">{t("admin.categoryForm.descriptionsHeading")}</h3>
          <Textarea label={t("admin.categoryForm.descriptionEn")} rows={3} {...register("description")} />
          <Textarea
            label={t("admin.categoryForm.descriptionAr")}
            rows={3}
            dir="rtl"
            containerClassName="mt-3"
            {...register("description_ar")}
          />
        </section>
      </div>

      <aside className="flex flex-col gap-6">
        <section className="rounded-2xl border border-ink-100 bg-white p-5 sm:p-6">
          <h3 className="mb-1 font-display text-lg text-ink-900">
            {t("admin.categoryForm.visibilityHeading")}
          </h3>
          <p className="mb-3 text-xs text-ink-500">
            {t("admin.categoryForm.visibilityHint")}
          </p>
          {/* Published / Draft. "Coming soon" is now PER-REGION (card below) — a
              coming-soon region keeps the category visible there but neither it nor its
              products can be ordered, while other regions stay fully live. */}
          <Select
            value={watchedStatus}
            onChange={(v) => setValue("status", v as "DRAFT" | "PUBLISHED", { shouldDirty: true })}
            triggerClassName="w-full rounded-lg py-2 justify-between"
            aria-label={t("admin.categoryForm.visibilityHeading")}
            options={[
              { value: "PUBLISHED", label: t("admin.categoryForm.statusPublished") },
              { value: "DRAFT", label: t("admin.categoryForm.statusDraft") },
            ]}
          />
          {watchedStatus === "PUBLISHED" && (
            <div className="mt-4 border-t border-ink-100 pt-4">
              <p className="text-sm font-medium text-ink-800">{t("admin.categoryForm.comingSoonHeading")}</p>
              <p className="mt-0.5 mb-2 text-xs text-ink-500">{t("admin.categoryForm.comingSoonDescription")}</p>
              {(() => {
                const csRegions = selectedRegions.length
                  ? selectedRegions
                  : (regionsQuery.data ?? []).filter((r) => r.isDefault);
                if (csRegions.length === 0) {
                  return <p className="text-sm text-ink-400">{t("admin.categoryForm.comingSoonNoRegions")}</p>;
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
            </div>
          )}
          <div className="mt-4 border-t border-ink-100 pt-4">
            <p className="text-sm font-medium text-ink-800">{t("admin.categoryForm.saleHeading")}</p>
            <p className="mt-0.5 mb-2 text-xs text-ink-500">{t("admin.categoryForm.saleDescription")}</p>
            {(() => {
              const saleRegions = selectedRegions.length
                ? selectedRegions
                : (regionsQuery.data ?? []).filter((r) => r.isDefault);
              if (saleRegions.length === 0) {
                return <p className="text-sm text-ink-400">{t("admin.categoryForm.comingSoonNoRegions")}</p>;
              }
              return (
                <div className="flex flex-col gap-3">
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
                      label={t("admin.categoryForm.saleLabelEn")}
                      placeholder={t("admin.categoryForm.saleLabelPlaceholder")}
                      {...register("saleLabel")}
                    />
                    <Input
                      label={t("admin.categoryForm.saleLabelAr")}
                      placeholder={t("admin.categoryForm.saleLabelPlaceholderAr")}
                      dir="rtl"
                      {...register("saleLabel_ar")}
                    />
                  </div>
                </div>
              );
            })()}
          </div>
          {watchedStatus === "DRAFT" && (
            <div className="mt-4">
              <label className="mb-1 block text-sm font-medium text-ink-800">
                Draft scope
              </label>
              <p className="mb-2 text-xs text-ink-500">
                Where this draft category is hidden.
              </p>
              <Controller
                control={control}
                name="draftScope"
                render={({ field }) => (
                  <Select
                    value={field.value}
                    onChange={field.onChange}
                    triggerClassName="w-full rounded-lg py-2 justify-between"
                    aria-label="Draft scope"
                    options={[
                      {
                        value: "HOME_ONLY",
                        label: "Home page only — products still show in Shop",
                      },
                      {
                        value: "ENTIRE_STORE",
                        label: "Entire store — also hide its products from Shop",
                      },
                    ]}
                  />
                )}
              />
            </div>
          )}
        </section>

        <section className="rounded-2xl border border-ink-100 bg-white p-5 sm:p-6">
          <h3 className="mb-1 font-display text-lg text-ink-900">
            {t("admin.categoryForm.deliveryLeadDaysHeading")}
          </h3>
          <p className="mb-3 text-xs text-ink-500">
            {t("admin.categoryForm.deliveryLeadDaysHint")}
          </p>
          <Input
            type="number"
            min={0}
            max={30}
            step={1}
            placeholder={t("admin.categoryForm.deliveryLeadDaysPlaceholder")}
            error={errors.deliveryLeadDays?.message}
            {...register("deliveryLeadDays", {
              setValueAs: (v) => (v === "" || v === null || v === undefined ? null : Number(v)),
            })}
          />
        </section>

        <section className="rounded-2xl border border-ink-100 bg-white p-5 sm:p-6">
          <h3 className="mb-1 font-display text-lg text-ink-900">
            {t("admin.categoryForm.giftModeHeading")}
          </h3>
          <p className="mb-3 text-xs text-ink-500">
            {t("admin.categoryForm.giftModeHint")}
          </p>
          <Select
            value={watchedGiftCardMode ?? ""}
            onChange={(v) =>
              setValue("giftCardMode", v === "" ? null : (v as "MESSAGE" | "NAME"), {
                shouldDirty: true,
              })
            }
            triggerClassName="w-full rounded-lg py-2 justify-between"
            aria-label={t("admin.categoryForm.giftModeHeading")}
            options={[
              { value: "", label: t("admin.categoryForm.giftModeNone") },
              { value: "MESSAGE", label: t("admin.categoryForm.giftModeMessage") },
              { value: "NAME", label: t("admin.categoryForm.giftModeName") },
            ]}
          />
        </section>

        <section className="rounded-2xl border border-ink-100 bg-white p-5 sm:p-6">
          <h3 className="mb-1 font-display text-lg text-ink-900">
            {t("admin.categoryForm.cashArrangementFeeHeading")}
          </h3>
          <p className="mb-3 text-xs text-ink-500">
            {t("admin.categoryForm.cashArrangementFeeHint")}
          </p>
          <div className="grid gap-3 sm:grid-cols-2">
            <Input
              label={t("admin.categoryForm.cashArrangementFeeStepAmountLabel")}
              type="number"
              min={0}
              step={0.01}
              error={errors.cashArrangementFeeStepAmount?.message}
              {...register("cashArrangementFeeStepAmount", {
                setValueAs: (v) => (v === "" || v === null || v === undefined ? null : Number(v)),
              })}
            />
            <Input
              label={t("admin.categoryForm.cashArrangementFeeMarginPercentLabel")}
              type="number"
              min={0}
              step={0.01}
              error={errors.cashArrangementFeeMarginPercent?.message}
              {...register("cashArrangementFeeMarginPercent", {
                setValueAs: (v) => (v === "" || v === null || v === undefined ? null : Number(v)),
              })}
            />
          </div>
        </section>

        <FormSection title="Regions">
          <Controller
            control={control}
            name="regionIds"
            render={({ field }) => (
              <RegionPicker selectedIds={field.value} onChange={field.onChange} />
            )}
          />
        </FormSection>

        {/* Zone visibility sits directly under Regions: it narrows the same
            "where is this sold" decision from region down to individual zones.
            Collapsed by default so the panel stays small until it's needed. */}
        {selectedRegions.length > 0 && (
          <FormSection
            title={t("admin.categoryForm.zoneVisibilityHeading")}
            description={t("admin.categoryForm.zoneVisibilityHint")}
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
                        {t("admin.categoryForm.zoneNoZonesNote")}
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
          </FormSection>
        )}

        {selectedRegions.length > 0 && (
          <FormSection
            title={t("admin.categoryForm.regionLeadDaysHeading")}
            description={t("admin.categoryForm.regionLeadDaysHint")}
            collapsible
          >
            <div className="flex flex-col gap-4">
              {selectedRegions.map((region) => {
                const regionZones = allZones.filter((z) => z.regionId === region.id);
                return (
                  <div key={region.id} className="flex flex-col gap-2">
                    <Controller
                      control={control}
                      name={`regionLeadDays.${region.id}`}
                      render={({ field }) => (
                        <Input
                          label={region.name}
                          type="number"
                          min={0}
                          max={30}
                          step={1}
                          placeholder={t("admin.categoryForm.deliveryLeadDaysPlaceholder")}
                          // Fully controlled so the typed value is always captured into
                          // form state — no register/mount-timing gaps for these
                          // conditionally-rendered per-region fields.
                          value={field.value ?? ""}
                          onChange={(e) =>
                            field.onChange(e.target.value === "" ? null : Number(e.target.value))
                          }
                        />
                      )}
                    />
                    <div className="grid grid-cols-2 gap-2">
                      <Controller
                        control={control}
                        name={`regionCashArrangementFeeStepAmount.${region.id}`}
                        render={({ field }) => (
                          <Input
                            label={t("admin.categoryForm.regionCashArrangementFeeStepAmountLabel", {
                              region: region.name,
                            })}
                            type="number"
                            min={0}
                            step={0.01}
                            placeholder="—"
                            value={field.value ?? ""}
                            onChange={(e) =>
                              field.onChange(e.target.value === "" ? null : Number(e.target.value))
                            }
                          />
                        )}
                      />
                      <Controller
                        control={control}
                        name={`regionCashArrangementFeeMarginPercent.${region.id}`}
                        render={({ field }) => (
                          <Input
                            label={t("admin.categoryForm.regionCashArrangementFeeMarginPercentLabel", {
                              region: region.name,
                            })}
                            type="number"
                            min={0}
                            step={0.01}
                            placeholder="—"
                            value={field.value ?? ""}
                            onChange={(e) =>
                              field.onChange(e.target.value === "" ? null : Number(e.target.value))
                            }
                          />
                        )}
                      />
                    </div>
                    {/* Per-zone overrides, nested under the region so the hierarchy
                        reads region → its zones. */}
                    <div className="border-s-2 border-ink-100 ps-3">
                      <p className="mb-1 text-[11px] font-semibold uppercase tracking-[0.12em] text-ink-500">
                        {t("admin.categoryForm.zoneLeadDaysHeading")}
                      </p>
                      {regionZones.length === 0 ? (
                        <p className="text-[11px] text-ink-400">
                          {t("admin.categoryForm.zoneNoZonesNote")}
                        </p>
                      ) : (
                        <div className="flex flex-col gap-2">
                          {regionZones.map((zone) => (
                            <div key={zone.id} className="flex flex-col gap-1.5">
                              <Controller
                                control={control}
                                name={`zoneLeadDays.${zone.id}`}
                                render={({ field }) => (
                                  <Input
                                    label={zone.name}
                                    type="number"
                                    min={0}
                                    max={30}
                                    step={1}
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
                              <div className="grid grid-cols-2 gap-2">
                                <Controller
                                  control={control}
                                  name={`zoneCashArrangementFeeStepAmount.${zone.id}`}
                                  render={({ field }) => (
                                    <Input
                                      label={t("admin.categoryForm.zoneCashArrangementFeeStepAmountLabel", {
                                        zone: zone.name,
                                      })}
                                      type="number"
                                      min={0}
                                      step={0.01}
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
                                      label={t("admin.categoryForm.zoneCashArrangementFeeMarginPercentLabel", {
                                        zone: zone.name,
                                      })}
                                      type="number"
                                      min={0}
                                      step={0.01}
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
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          </FormSection>
        )}

        <section className="rounded-2xl border border-ink-100 bg-white p-5 sm:p-6">
          <h3 className="mb-4 font-display text-lg text-ink-900">{t("admin.categoryForm.coverImageHeading")}</h3>
          <Controller
            control={control}
            name="image"
            render={({ field }) => (
              <ImageUpload
                value={field.value}
                onChange={field.onChange}
                path="uploads"
                label=""
                previewClassName="aspect-square w-full"
                hint={t("admin.categoryForm.coverImageHint")}
              />
            )}
          />
        </section>
      </aside>

      <div className="lg:col-span-2 flex justify-end">
        <Button type="submit" size="lg" isLoading={submitting}>
          {submitLabel}
        </Button>
      </div>
    </form>
  );
}
