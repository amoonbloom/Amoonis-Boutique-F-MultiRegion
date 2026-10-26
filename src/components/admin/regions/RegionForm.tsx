"use client";

import { useEffect, useMemo } from "react";
import { useForm, useFieldArray } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { Button, Input } from "@/components/ui";
import { PlusIcon, TrashIcon } from "@/components/icons";
import { RegionFlag } from "@/features/location/components/RegionFlag";
import { CountryPicker } from "./CountryPicker";
import { useT } from "@/i18n/useT";
import { cn } from "@/lib/cn";
import type { ApiRegion, ApiRegionCreateInput } from "@/features/regions/types";
import type { CountryOption } from "@/features/regions/countries";

interface RegionFormProps {
  initial?: ApiRegion;
  onSubmit: (payload: ApiRegionCreateInput) => Promise<void>;
  submitLabel: string;
  submitting?: boolean;
}

/** Curated IANA timezone list for the region picker — GCC first, since that's
 *  where every live region operates today. Kept short on purpose: this drives
 *  same-day cutoff / allowed-weekday / blackout math, so it's the operating
 *  timezone, not a full tz database dump. */
const TIMEZONE_OPTIONS = [
  "Asia/Dubai",
  "Asia/Riyadh",
  "Asia/Qatar",
  "Asia/Kuwait",
  "Asia/Bahrain",
  "Asia/Muscat",
] as const;

const DEFAULT_TIMEZONE = "Asia/Dubai";

/** Matches the visual language of the `Input` component (rounded-2xl, bloom focus
 *  ring) for the native controls (timezone <select>, blackout date/time inputs)
 *  that the `Input` wrapper doesn't cover. */
const NATIVE_CONTROL_CLASS =
  "h-[50px] w-full rounded-2xl border border-ink-200 bg-white px-4 text-base text-ink-900 focus:border-bloom-400 focus:outline-none focus:ring-4 focus:ring-bloom-100";

/** 0=Sun..6=Sat, matching the backend's `deliveryDays` convention. Each maps to
 *  a short weekday i18n key rendered as a checkbox. */
const WEEKDAYS: { day: number; labelKey: string }[] = [
  { day: 0, labelKey: "weekdaySun" },
  { day: 1, labelKey: "weekdayMon" },
  { day: 2, labelKey: "weekdayTue" },
  { day: 3, labelKey: "weekdayWed" },
  { day: 4, labelKey: "weekdayThu" },
  { day: 5, labelKey: "weekdayFri" },
  { day: 6, labelKey: "weekdaySat" },
];


export function RegionForm({
  initial,
  onSubmit,
  submitLabel,
  submitting,
}: RegionFormProps) {
  const { t } = useT();
  // No explicit `mode` prop (unlike UserForm) — RegionForm has always inferred
  // create vs. edit from whether `initial` is present, and every caller
  // already relies on that.
  const isCreate = !initial;

  const { createSchema, editSchema } = useMemo(() => {
    const base = z.object({
      code: z
        .string()
        .min(2, t("admin.regionForm.codeMin"))
        .max(10, t("admin.regionForm.codeMax")),
      name: z.string().min(1, t("admin.regionForm.nameRequired")),
      name_ar: z.string().optional().nullable(),
      currency: z
        .string()
        .length(3, t("admin.regionForm.currencyLength"))
        .toUpperCase(),
      legalEntity: z.string().max(200, t("admin.regionForm.legalEntityMax")).optional(),
      shippingFlatRate: z.number().nonnegative(t("admin.regionForm.shippingFlatRateMin")).nullable(),
      standardDeliveryDays: z
        .number()
        .int(t("admin.regionForm.standardDeliveryDaysWhole"))
        .nonnegative(t("admin.regionForm.standardDeliveryDaysMin"))
        .nullable(),
      // City-level delivery configuration. Defaults live in `defaultValues`
      // below (not `.default()` here) so the schema's input and output types
      // stay identical — the resolver cast relies on that, exactly like the
      // rest of this schema.
      timezone: z.string().min(1),
      freeDeliveryThreshold: z
        .number()
        .nonnegative(t("admin.regionForm.freeDeliveryThresholdMin"))
        .nullable(),
      deliveryDays: z.array(z.number().int().min(0).max(6)),
      sameDayEnabled: z.boolean(),
      // Kept as a plain string in form state ("" = none) to avoid a null in a
      // controlled time input; normalized to null on submit.
      sameDayCutoff: z.string(),
      codEnabled: z.boolean(),
      onlinePaymentEnabled: z.boolean(),
      applePayEnabled: z.boolean(),
      cardPaymentEnabled: z.boolean(),
      shortAddressEnabled: z.boolean(),
      tabbyEnabled: z.boolean(),
      blackoutDates: z.array(
        z.object({
          id: z.string().optional(),
          date: z.string(),
          label: z.string(),
          label_ar: z.string(),
        })
      ),
      iso2: z
        .string()
        .refine((v) => v === "" || /^[A-Za-z]{2}$/.test(v), t("admin.regionForm.iso2Invalid"))
        .optional(),
      urlSlug: z
        .string()
        .refine((v) => v === "" || /^[a-z0-9-]+$/.test(v), t("admin.regionForm.urlSlugInvalid"))
        .optional(),
      contactEmail: z
        .string()
        .refine((v) => v === "" || z.string().email().safeParse(v).success, t("admin.regionForm.contactEmailInvalid"))
        .optional(),
      contactPhone: z.string().optional(),
      whatsappNumber: z.string().optional(),
      address: z.string().optional(),
      address_ar: z.string().optional(),
      hours: z.string().optional(),
      hours_ar: z.string().optional(),
      instagramUrl: z.string().optional(),
      facebookUrl: z.string().optional(),
      tiktokUrl: z.string().optional(),
      threadsUrl: z.string().optional(),
      snapchatUrl: z.string().optional(),
      xUrl: z.string().optional(),
      youtubeUrl: z.string().optional(),
      sortOrder: z
        .number()
        .int(t("admin.regionForm.sortOrderWhole"))
        .min(0, t("admin.regionForm.sortOrderMin")),
      isDefault: z.boolean(),
      isActive: z.boolean(),
    });

    // Legal-page content is authored per region in the rich-text Pages editor
    // (RegionLegalPage) — the region form no longer collects any legal-citation
    // fields, so the schema is the same for create and edit.
    return {
      createSchema: base,
      editSchema: base,
    };
  }, [t]);

  type FormValues = z.infer<typeof createSchema>;

  const {
    register,
    handleSubmit,
    reset,
    watch,
    setValue,
    control,
    formState: { errors },
  } = useForm<FormValues>({
    resolver: zodResolver(
      (isCreate ? createSchema : editSchema) as unknown as typeof createSchema
    ),
    defaultValues: {
      code: "",
      name: "",
      name_ar: "",
      currency: "AED",
      legalEntity: "",
      shippingFlatRate: null,
      standardDeliveryDays: null,
      timezone: DEFAULT_TIMEZONE,
      freeDeliveryThreshold: null,
      deliveryDays: [],
      sameDayEnabled: false,
      sameDayCutoff: "",
      codEnabled: true,
      onlinePaymentEnabled: false,
      applePayEnabled: true,
      cardPaymentEnabled: true,
      shortAddressEnabled: false,
      tabbyEnabled: false,
      blackoutDates: [],
      iso2: "",
      urlSlug: "",
      contactEmail: "",
      contactPhone: "",
      whatsappNumber: "",
      address: "",
      address_ar: "",
      hours: "",
      hours_ar: "",
      instagramUrl: "",
      facebookUrl: "",
      tiktokUrl: "",
      threadsUrl: "",
      snapchatUrl: "",
      xUrl: "",
      youtubeUrl: "",
      sortOrder: 0,
      isDefault: false,
      isActive: true,
    },
  });

  const iso2Value = watch("iso2");
  const sameDayEnabled = watch("sameDayEnabled");
  const onlinePaymentEnabled = watch("onlinePaymentEnabled");
  const selectedDeliveryDays = watch("deliveryDays") ?? [];

  const {
    fields: blackoutFields,
    append: appendBlackout,
    remove: removeBlackout,
  } = useFieldArray({ control, name: "blackoutDates" });

  // deliveryDays is a number[] (0=Sun..6=Sat), not a set of boolean flags, so the
  // weekday checkboxes are driven manually rather than via `register` (which would
  // collect checked values as strings). Kept sorted so the payload is stable.
  const toggleDeliveryDay = (day: number) => {
    const current = watch("deliveryDays") ?? [];
    const next = current.includes(day)
      ? current.filter((d) => d !== day)
      : [...current, day].sort((a, b) => a - b);
    setValue("deliveryDays", next, { shouldDirty: true });
  };


  // The whole point of the picker: one search replaces four hand-typed,
  // typo-prone fields. Currency is only overwritten when we have a confident
  // default (see countries.ts) — otherwise the admin's existing value (or the
  // AED default) is left alone rather than being cleared to guess wrong.
  const applyCountry = (c: CountryOption) => {
    setValue("code", c.iso2.toUpperCase(), { shouldDirty: true, shouldValidate: true });
    setValue("name", c.nameEn, { shouldDirty: true, shouldValidate: true });
    setValue("name_ar", c.nameAr, { shouldDirty: true });
    setValue("iso2", c.iso2.toUpperCase(), { shouldDirty: true, shouldValidate: true });
    // Default the public-route slug to the lowercased ISO code (e.g. "ae"),
    // still fully editable afterwards — same convenience as the other fields.
    setValue("urlSlug", c.iso2.toLowerCase(), { shouldDirty: true, shouldValidate: true });
    if (c.currency) {
      setValue("currency", c.currency, { shouldDirty: true, shouldValidate: true });
    }
  };

  useEffect(() => {
    if (!initial) return;
    reset({
      code: initial.code,
      name: initial.name,
      name_ar: initial.name_ar ?? "",
      currency: initial.currency ?? "AED",
      legalEntity: initial.legalEntity ?? "",
      shippingFlatRate: initial.shippingFlatRate != null ? Number(initial.shippingFlatRate) : null,
      standardDeliveryDays: initial.standardDeliveryDays ?? null,
      timezone: initial.timezone || DEFAULT_TIMEZONE,
      freeDeliveryThreshold:
        initial.freeDeliveryThreshold != null ? Number(initial.freeDeliveryThreshold) : null,
      deliveryDays: initial.deliveryDays ?? [],
      sameDayEnabled: initial.sameDayEnabled ?? false,
      sameDayCutoff: initial.sameDayCutoff ?? "",
      codEnabled: initial.codEnabled ?? true,
      onlinePaymentEnabled: initial.onlinePaymentEnabled ?? false,
      applePayEnabled: initial.applePayEnabled ?? true,
      cardPaymentEnabled: initial.cardPaymentEnabled ?? true,
      shortAddressEnabled: initial.shortAddressEnabled ?? false,
      tabbyEnabled: initial.tabbyEnabled ?? false,
      blackoutDates: (initial.blackoutDates ?? []).map((b) => ({
        id: b.id,
        date: b.date,
        label: b.label ?? "",
        label_ar: b.label_ar ?? "",
      })),
      iso2: initial.iso2 ?? "",
      urlSlug: initial.urlSlug ?? "",
      contactEmail: initial.contactEmail ?? "",
      contactPhone: initial.contactPhone ?? "",
      whatsappNumber: initial.whatsappNumber ?? "",
      address: initial.address ?? "",
      address_ar: initial.address_ar ?? "",
      hours: initial.hours ?? "",
      hours_ar: initial.hours_ar ?? "",
      instagramUrl: initial.instagramUrl ?? "",
      facebookUrl: initial.facebookUrl ?? "",
      tiktokUrl: initial.tiktokUrl ?? "",
      threadsUrl: initial.threadsUrl ?? "",
      snapchatUrl: initial.snapchatUrl ?? "",
      xUrl: initial.xUrl ?? "",
      youtubeUrl: initial.youtubeUrl ?? "",
      sortOrder: initial.sortOrder,
      isDefault: initial.isDefault,
      isActive: initial.isActive,
    });
  }, [initial, reset]);

  const submit = handleSubmit(async (v) => {
    await onSubmit({
      code: v.code.trim().toUpperCase(),
      name: v.name.trim(),
      name_ar: v.name_ar?.trim() || null,
      currency: v.currency.trim().toUpperCase(),
      legalEntity: v.legalEntity?.trim() || null,
      shippingFlatRate: v.shippingFlatRate,
      standardDeliveryDays: v.standardDeliveryDays,
      timezone: v.timezone?.trim() || DEFAULT_TIMEZONE,
      freeDeliveryThreshold: v.freeDeliveryThreshold,
      deliveryDays: v.deliveryDays ?? [],
      sameDayEnabled: v.sameDayEnabled,
      sameDayCutoff: v.sameDayCutoff?.trim() ? v.sameDayCutoff.trim() : null,
      codEnabled: v.codEnabled,
      onlinePaymentEnabled: v.onlinePaymentEnabled,
      applePayEnabled: v.applePayEnabled,
      cardPaymentEnabled: v.cardPaymentEnabled,
      shortAddressEnabled: v.shortAddressEnabled,
      tabbyEnabled: v.tabbyEnabled,
      blackoutDates: (v.blackoutDates ?? [])
        .filter((b) => b.date?.trim())
        .map((b) => ({
          ...(b.id ? { id: b.id } : {}),
          date: b.date.trim(),
          label: b.label?.trim() || null,
          label_ar: b.label_ar?.trim() || null,
        })),
      iso2: v.iso2?.trim() ? v.iso2.trim().toUpperCase() : null,
      urlSlug: v.urlSlug?.trim() ? v.urlSlug.trim().toLowerCase() : null,
      contactEmail: v.contactEmail?.trim() || null,
      contactPhone: v.contactPhone?.trim() || null,
      whatsappNumber: v.whatsappNumber?.trim() || null,
      address: v.address?.trim() || null,
      address_ar: v.address_ar?.trim() || null,
      hours: v.hours?.trim() || null,
      hours_ar: v.hours_ar?.trim() || null,
      instagramUrl: v.instagramUrl?.trim() || null,
      facebookUrl: v.facebookUrl?.trim() || null,
      tiktokUrl: v.tiktokUrl?.trim() || null,
      threadsUrl: v.threadsUrl?.trim() || null,
      snapchatUrl: v.snapchatUrl?.trim() || null,
      xUrl: v.xUrl?.trim() || null,
      youtubeUrl: v.youtubeUrl?.trim() || null,
      sortOrder: v.sortOrder,
      isDefault: v.isDefault,
      isActive: v.isActive,
    } as Parameters<typeof onSubmit>[0]);
  });

  return (
    <form onSubmit={submit} className="grid gap-6 lg:grid-cols-[2fr_1fr]" noValidate>
      <div className="flex flex-col gap-6">
        <section className="rounded-2xl border border-ink-100 bg-white p-5 sm:p-6">
          <h3 className="mb-4 font-display text-lg text-ink-900">{t("admin.regionForm.detailsHeading")}</h3>
          <div className="mb-5">
            <CountryPicker onSelect={applyCountry} />
            <p className="mt-1.5 text-[11px] text-ink-400">
              {t("admin.regionForm.countryPickerHint")}
            </p>
          </div>
          <div className="grid gap-4 sm:grid-cols-2">
            <Input
              label={t("admin.regionForm.codeLabel")}
              placeholder="UAE"
              hint={t("admin.regionForm.codeHint")}
              error={errors.code?.message}
              {...register("code")}
            />
            <Input
              label={t("admin.regionForm.sortOrderLabel")}
              type="number"
              step="1"
              min="0"
              hint={t("admin.regionForm.sortOrderHint")}
              error={errors.sortOrder?.message}
              {...register("sortOrder", { valueAsNumber: true })}
            />
            <Input
              label={t("admin.regionForm.nameEnLabel")}
              placeholder="United Arab Emirates"
              error={errors.name?.message}
              {...register("name")}
            />
            <Input
              label={t("admin.regionForm.nameArLabel")}
              dir="rtl"
              placeholder="الإمارات العربية المتحدة"
              {...register("name_ar")}
            />
            <Input
              label={t("admin.regionForm.currencyLabel")}
              placeholder="AED"
              hint={t("admin.regionForm.currencyHint")}
              error={errors.currency?.message}
              {...register("currency")}
            />
            <Input
              label={t("admin.regionForm.legalEntityLabel")}
              placeholder="AMOON BLOOM Trading L.L.C S.O.C™"
              hint={t("admin.regionForm.legalEntityHint")}
              error={errors.legalEntity?.message}
              containerClassName="sm:col-span-2"
              {...register("legalEntity")}
            />
            <Input
              label={t("admin.regionForm.shippingFlatRateLabel")}
              type="number"
              step="0.01"
              min="0"
              placeholder="25.00"
              hint={t("admin.regionForm.shippingFlatRateHint")}
              error={errors.shippingFlatRate?.message}
              {...register("shippingFlatRate", {
                setValueAs: (v) => (v === "" || v === null || v === undefined ? null : Number(v)),
              })}
            />
            <Input
              label={t("admin.regionForm.standardDeliveryDaysLabel")}
              type="number"
              step="1"
              min="0"
              placeholder="3"
              hint={t("admin.regionForm.standardDeliveryDaysHint")}
              error={errors.standardDeliveryDays?.message}
              {...register("standardDeliveryDays", {
                setValueAs: (v) => (v === "" || v === null || v === undefined ? null : Number(v)),
              })}
            />
            <div className="flex items-end gap-3">
              <Input
                label={t("admin.regionForm.iso2Label")}
                placeholder="AE"
                maxLength={2}
                hint={t("admin.regionForm.iso2Hint")}
                error={errors.iso2?.message}
                containerClassName="flex-1"
                {...register("iso2")}
              />
              <RegionFlag
                region={/^[A-Za-z]{2}$/.test(iso2Value ?? "") ? { iso2: iso2Value ?? null, name: "" } : undefined}
                shape="circle"
                className="mb-2.5 h-10 w-10"
              />
            </div>
            <Input
              label={t("admin.regionForm.urlSlugLabel")}
              placeholder="ae"
              hint={t("admin.regionForm.urlSlugHint")}
              error={errors.urlSlug?.message}
              {...register("urlSlug")}
            />
          </div>
        </section>

        <section className="rounded-2xl border border-ink-100 bg-white p-5 sm:p-6">
          <h3 className="mb-1 font-display text-lg text-ink-900">{t("admin.regionForm.deliveryConfigHeading")}</h3>
          <p className="mb-4 text-xs text-ink-500">{t("admin.regionForm.deliveryConfigHint")}</p>
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="flex flex-col gap-1.5">
              <label
                htmlFor="region-timezone"
                className="text-xs font-semibold uppercase tracking-[0.12em] text-ink-700"
              >
                {t("admin.regionForm.timezoneLabel")}
              </label>
              <select
                id="region-timezone"
                className={NATIVE_CONTROL_CLASS}
                {...register("timezone")}
              >
                {TIMEZONE_OPTIONS.map((tz) => (
                  <option key={tz} value={tz}>
                    {tz}
                  </option>
                ))}
              </select>
              <p className="text-xs text-ink-500">{t("admin.regionForm.timezoneHint")}</p>
            </div>
            <Input
              label={t("admin.regionForm.freeDeliveryThresholdLabel")}
              type="number"
              step="0.01"
              min="0"
              placeholder="200.00"
              hint={t("admin.regionForm.freeDeliveryThresholdHint")}
              error={errors.freeDeliveryThreshold?.message}
              {...register("freeDeliveryThreshold", {
                setValueAs: (v) => (v === "" || v === null || v === undefined ? null : Number(v)),
              })}
            />
          </div>

          <div className="mt-5">
            <p className="text-xs font-semibold uppercase tracking-[0.12em] text-ink-700">
              {t("admin.regionForm.deliveryDaysLabel")}
            </p>
            <div className="mt-2 flex flex-wrap gap-2">
              {WEEKDAYS.map(({ day, labelKey }) => {
                const checked = selectedDeliveryDays.includes(day);
                return (
                  <label
                    key={day}
                    className={cn(
                      "flex cursor-pointer items-center gap-2 rounded-full border px-3.5 py-1.5 text-sm transition-colors",
                      checked
                        ? "border-bloom-500 bg-bloom-50 text-bloom-700"
                        : "border-ink-200 text-ink-700 hover:border-ink-300"
                    )}
                  >
                    <input
                      type="checkbox"
                      checked={checked}
                      onChange={() => toggleDeliveryDay(day)}
                      className="h-4 w-4 accent-bloom-600"
                    />
                    {t(`admin.regionForm.${labelKey}` as Parameters<typeof t>[0])}
                  </label>
                );
              })}
            </div>
            <p className="mt-2 text-xs text-ink-500">{t("admin.regionForm.deliveryDaysHint")}</p>
          </div>

          <div className="mt-5 grid gap-4 sm:grid-cols-2">
            <div>
              <label className="flex cursor-pointer items-center gap-3">
                <input
                  type="checkbox"
                  {...register("sameDayEnabled")}
                  className="h-5 w-5 accent-bloom-600"
                />
                <span className="text-sm text-ink-900">{t("admin.regionForm.sameDayEnabledLabel")}</span>
              </label>
              <p className="mt-1 text-xs text-ink-500">{t("admin.regionForm.sameDayEnabledHint")}</p>
              <label className="mt-4 flex cursor-pointer items-center gap-3">
                <input
                  type="checkbox"
                  {...register("codEnabled")}
                  className="h-5 w-5 accent-bloom-600"
                />
                <span className="text-sm text-ink-900">{t("admin.regionForm.codEnabledLabel")}</span>
              </label>
              <p className="mt-1 text-xs text-ink-500">{t("admin.regionForm.codEnabledHint")}</p>
              <label className="mt-4 flex cursor-pointer items-center gap-3">
                <input
                  type="checkbox"
                  {...register("onlinePaymentEnabled")}
                  className="h-5 w-5 accent-bloom-600"
                />
                <span className="text-sm text-ink-900">{t("admin.regionForm.onlinePaymentEnabledLabel")}</span>
              </label>
              <p className="mt-1 text-xs text-ink-500">{t("admin.regionForm.onlinePaymentEnabledHint")}</p>
              {/* Which online methods are offered — only relevant while online payment is on.
                  Nested (indented + border) and disabled when the master toggle is off. */}
              <div
                className={`ms-4 mt-3 border-s-2 border-ink-100 ps-4 ${
                  onlinePaymentEnabled ? "" : "pointer-events-none opacity-50"
                }`}
              >
                <label className="flex cursor-pointer items-center gap-3">
                  <input
                    type="checkbox"
                    {...register("applePayEnabled")}
                    disabled={!onlinePaymentEnabled}
                    className="h-5 w-5 accent-bloom-600"
                  />
                  <span className="text-sm text-ink-900">{t("admin.regionForm.applePayEnabledLabel")}</span>
                </label>
                <p className="mt-1 text-xs text-ink-500">{t("admin.regionForm.applePayEnabledHint")}</p>
                <label className="mt-3 flex cursor-pointer items-center gap-3">
                  <input
                    type="checkbox"
                    {...register("cardPaymentEnabled")}
                    disabled={!onlinePaymentEnabled}
                    className="h-5 w-5 accent-bloom-600"
                  />
                  <span className="text-sm text-ink-900">{t("admin.regionForm.cardPaymentEnabledLabel")}</span>
                </label>
                <p className="mt-1 text-xs text-ink-500">{t("admin.regionForm.cardPaymentEnabledHint")}</p>
              </div>
              <label className="mt-4 flex cursor-pointer items-center gap-3">
                <input
                  type="checkbox"
                  {...register("tabbyEnabled")}
                  className="h-5 w-5 accent-bloom-600"
                />
                <span className="text-sm text-ink-900">{t("admin.regionForm.tabbyEnabledLabel")}</span>
              </label>
              <p className="mt-1 text-xs text-ink-500">{t("admin.regionForm.tabbyEnabledHint")}</p>
              <label className="mt-4 flex cursor-pointer items-center gap-3">
                <input
                  type="checkbox"
                  {...register("shortAddressEnabled")}
                  className="h-5 w-5 accent-bloom-600"
                />
                <span className="text-sm text-ink-900">{t("admin.regionForm.shortAddressEnabledLabel")}</span>
              </label>
              <p className="mt-1 text-xs text-ink-500">{t("admin.regionForm.shortAddressEnabledHint")}</p>
            </div>
            <Input
              label={t("admin.regionForm.sameDayCutoffLabel")}
              type="time"
              disabled={!sameDayEnabled}
              hint={t("admin.regionForm.sameDayCutoffHint")}
              error={errors.sameDayCutoff?.message}
              {...register("sameDayCutoff")}
            />
          </div>

          <div className="mt-6">
            <p className="text-xs font-semibold uppercase tracking-[0.12em] text-ink-700">
              {t("admin.regionForm.blackoutDatesLabel")}
            </p>
            <p className="mt-1 mb-3 text-xs text-ink-500">{t("admin.regionForm.blackoutDatesHint")}</p>
            {blackoutFields.length === 0 ? (
              <p className="mb-3 text-sm text-ink-400">{t("admin.regionForm.blackoutEmpty")}</p>
            ) : (
              <div className="flex flex-col gap-2">
                {blackoutFields.map((field, i) => (
                  <div key={field.id} className="flex items-center gap-2">
                    <input
                      type="date"
                      aria-label={t("admin.regionForm.blackoutDateLabel")}
                      className={cn(NATIVE_CONTROL_CLASS, "w-auto shrink-0")}
                      {...register(`blackoutDates.${i}.date`)}
                    />
                    <input
                      className={NATIVE_CONTROL_CLASS}
                      placeholder={t("admin.regionForm.blackoutLabelPlaceholder")}
                      {...register(`blackoutDates.${i}.label`)}
                    />
                    <input
                      className={NATIVE_CONTROL_CLASS}
                      dir="rtl"
                      placeholder={t("admin.regionForm.blackoutLabelArPlaceholder")}
                      {...register(`blackoutDates.${i}.label_ar`)}
                    />
                    <button
                      type="button"
                      onClick={() => removeBlackout(i)}
                      aria-label={t("admin.regionForm.blackoutRemoveRow")}
                      className="shrink-0 rounded-md p-2 text-bloom-700 hover:bg-bloom-50"
                    >
                      <TrashIcon size={16} />
                    </button>
                  </div>
                ))}
              </div>
            )}
            <button
              type="button"
              onClick={() => appendBlackout({ date: "", label: "", label_ar: "" })}
              className="mt-3 inline-flex items-center gap-1.5 text-sm font-medium text-bloom-700 hover:text-bloom-800"
            >
              <PlusIcon size={16} /> {t("admin.regionForm.blackoutAddRow")}
            </button>
          </div>
        </section>

        <section className="rounded-2xl border border-ink-100 bg-white p-5 sm:p-6">
          <h3 className="mb-1 font-display text-lg text-ink-900">{t("admin.regionForm.contactHeading")}</h3>
          <p className="mb-4 text-xs text-ink-500">{t("admin.regionForm.contactHint")}</p>
          <div className="grid gap-4 sm:grid-cols-2">
            <Input
              label={t("admin.regionForm.contactEmailLabel")}
              type="email"
              placeholder="support@amoonbloom.com"
              error={errors.contactEmail?.message}
              {...register("contactEmail")}
            />
            <Input
              label={t("admin.regionForm.contactPhoneLabel")}
              placeholder="+971 50 606 7910"
              {...register("contactPhone")}
            />
            <Input
              label={t("admin.regionForm.whatsappNumberLabel")}
              placeholder="+971 50 606 7910"
              hint={t("admin.regionForm.whatsappNumberHint")}
              containerClassName="sm:col-span-2"
              {...register("whatsappNumber")}
            />
            <Input
              label={t("admin.regionForm.addressLabel")}
              placeholder="Dubai, United Arab Emirates"
              {...register("address")}
            />
            <Input
              label={t("admin.regionForm.addressArLabel")}
              dir="rtl"
              placeholder="دبي، الإمارات العربية المتحدة"
              {...register("address_ar")}
            />
            <Input
              label={t("admin.regionForm.hoursLabel")}
              placeholder="Daily · 10:00 — 00:00 (Dubai time)"
              {...register("hours")}
            />
            <Input
              label={t("admin.regionForm.hoursArLabel")}
              dir="rtl"
              placeholder="يوميا · 10:00 — 00:00 بتوقيت دبي"
              {...register("hours_ar")}
            />
          </div>
        </section>

        <section className="rounded-2xl border border-ink-100 bg-white p-5 sm:p-6">
          <h3 className="mb-1 font-display text-lg text-ink-900">{t("admin.regionForm.socialHeading")}</h3>
          <p className="mb-4 text-xs text-ink-500">{t("admin.regionForm.socialHint")}</p>
          <div className="grid gap-4 sm:grid-cols-2">
            <Input label="Instagram" placeholder="https://instagram.com/…" {...register("instagramUrl")} />
            <Input label="Facebook" placeholder="https://facebook.com/…" {...register("facebookUrl")} />
            <Input label="TikTok" placeholder="https://tiktok.com/@…" {...register("tiktokUrl")} />
            <Input label="Threads" placeholder="https://threads.com/@…" {...register("threadsUrl")} />
            <Input label="Snapchat" placeholder="https://snapchat.com/add/…" {...register("snapchatUrl")} />
            <Input label="X (Twitter)" placeholder="https://x.com/…" {...register("xUrl")} />
            <Input label="YouTube" placeholder="https://youtube.com/@…" {...register("youtubeUrl")} />
          </div>
        </section>

      </div>

      <aside>
        <section className="rounded-2xl border border-ink-100 bg-white p-5 sm:p-6">
          <h3 className="mb-4 font-display text-lg text-ink-900">{t("admin.regionForm.visibilityHeading")}</h3>
          <label className="flex cursor-pointer items-center gap-3">
            <input
              type="checkbox"
              {...register("isActive")}
              className="h-5 w-5 accent-bloom-600"
            />
            <span className="text-sm text-ink-900">{t("admin.regionForm.activeLabel")}</span>
          </label>
          <label className="mt-4 flex cursor-pointer items-center gap-3">
            <input
              type="checkbox"
              {...register("isDefault")}
              className="h-5 w-5 accent-bloom-600"
            />
            <span className="text-sm text-ink-900">{t("admin.regionForm.defaultLabel")}</span>
          </label>
          <p className="mt-3 text-xs text-ink-500">
            {t("admin.regionForm.defaultHint")}
          </p>
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
