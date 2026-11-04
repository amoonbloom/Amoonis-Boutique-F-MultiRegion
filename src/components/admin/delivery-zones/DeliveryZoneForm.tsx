"use client";

import { useEffect, useMemo } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { useQuery } from "@tanstack/react-query";
import { Button, Input } from "@/components/ui";
import { Spinner } from "@/components/ui/Loader";
import { regionsApi } from "@/features/regions/api/regions.api";
import { queryKeys } from "@/services/queryKeys";
import { useT } from "@/i18n/useT";
import type { ApiDeliveryZone, ApiDeliveryZoneCreateInput } from "@/features/delivery-zones/types";

interface DeliveryZoneFormProps {
  initial?: ApiDeliveryZone;
  /** Pre-selects and locks the region when creating from within a region's context. */
  defaultRegionId?: string;
  onSubmit: (payload: ApiDeliveryZoneCreateInput) => Promise<void>;
  submitLabel: string;
  submitting?: boolean;
}

// 0=Sun..6=Sat — the i18n key for each weekday's short label, indexed by the
// weekday number the backend expects in `deliveryDays`.
const WEEKDAY_KEYS = [
  "weekdaySun",
  "weekdayMon",
  "weekdayTue",
  "weekdayWed",
  "weekdayThu",
  "weekdayFri",
  "weekdaySat",
] as const;

/** Parses a numeric text input to a number, mapping blank/empty to null (= inherit / no bound). */
const numberOrNull = (v: unknown): number | null =>
  v === "" || v === null || v === undefined ? null : Number(v);

export function DeliveryZoneForm({
  initial,
  defaultRegionId,
  onSubmit,
  submitLabel,
  submitting,
}: DeliveryZoneFormProps) {
  const { t } = useT();
  const regionsQuery = useQuery({
    queryKey: queryKeys.regions.list(),
    queryFn: () => regionsApi.list(),
  });

  const schema = useMemo(
    () =>
      z
        .object({
          regionId: z.string().min(1, t("admin.deliveryZoneForm.regionRequired")),
          name: z.string().min(1, t("admin.deliveryZoneForm.nameRequired")),
          name_ar: z.string().optional().nullable(),
          isActive: z.boolean(),
          // Per-zone overrides — null / "inherit" / [] = inherit the parent region.
          shippingFlatRate: z.number().nonnegative(t("admin.deliveryZoneForm.nonNegative")).nullable(),
          freeDeliveryThreshold: z.number().nonnegative(t("admin.deliveryZoneForm.nonNegative")).nullable(),
          sameDayEnabled: z.enum(["inherit", "true", "false"]),
          sameDayCutoff: z.string().optional().nullable(),
          standardLeadDays: z
            .number()
            .int(t("admin.deliveryZoneForm.wholeNumber"))
            .nonnegative(t("admin.deliveryZoneForm.nonNegative"))
            .nullable(),
          standardLeadDaysMax: z
            .number()
            .int(t("admin.deliveryZoneForm.wholeNumber"))
            .nonnegative(t("admin.deliveryZoneForm.nonNegative"))
            .nullable(),
          deliveryDays: z.array(z.number().int()),
          codEnabled: z.enum(["inherit", "true", "false"]),
          minOrderAmount: z.number().nonnegative(t("admin.deliveryZoneForm.nonNegative")).nullable(),
          maxOrderAmount: z.number().nonnegative(t("admin.deliveryZoneForm.nonNegative")).nullable(),
        })
        .refine(
          (v) =>
            v.minOrderAmount == null ||
            v.maxOrderAmount == null ||
            v.minOrderAmount <= v.maxOrderAmount,
          {
            message: t("admin.deliveryZoneForm.maxLessThanMin"),
            path: ["maxOrderAmount"],
          }
        )
        .refine(
          (v) =>
            v.standardLeadDaysMax == null ||
            v.standardLeadDays == null ||
            v.standardLeadDaysMax >= v.standardLeadDays,
          {
            message: t("admin.deliveryZoneForm.standardLeadDaysMaxLessThanMin"),
            path: ["standardLeadDaysMax"],
          }
        ),
    [t]
  );

  type FormValues = z.infer<typeof schema>;

  const {
    register,
    handleSubmit,
    reset,
    watch,
    setValue,
    formState: { errors },
  } = useForm<FormValues>({
    resolver: zodResolver(schema),
    defaultValues: {
      regionId: defaultRegionId ?? "",
      name: "",
      name_ar: "",
      isActive: true,
      shippingFlatRate: null,
      freeDeliveryThreshold: null,
      sameDayEnabled: "inherit",
      sameDayCutoff: "",
      standardLeadDays: null,
      standardLeadDaysMax: null,
      deliveryDays: [],
      codEnabled: "inherit",
      minOrderAmount: null,
      maxOrderAmount: null,
    },
  });

  useEffect(() => {
    if (!initial) return;
    const triState = (v: boolean | null): "inherit" | "true" | "false" =>
      v == null ? "inherit" : v ? "true" : "false";
    reset({
      regionId: initial.regionId,
      name: initial.name,
      name_ar: initial.name_ar ?? "",
      isActive: initial.isActive,
      shippingFlatRate: initial.shippingFlatRate != null ? Number(initial.shippingFlatRate) : null,
      freeDeliveryThreshold:
        initial.freeDeliveryThreshold != null ? Number(initial.freeDeliveryThreshold) : null,
      sameDayEnabled: triState(initial.sameDayEnabled),
      sameDayCutoff: initial.sameDayCutoff ?? "",
      standardLeadDays: initial.standardLeadDays ?? null,
      standardLeadDaysMax: initial.standardLeadDaysMax ?? null,
      deliveryDays: initial.deliveryDays ?? [],
      codEnabled: triState(initial.codEnabled),
      minOrderAmount: initial.minOrderAmount != null ? Number(initial.minOrderAmount) : null,
      maxOrderAmount: initial.maxOrderAmount != null ? Number(initial.maxOrderAmount) : null,
    });
  }, [initial, reset]);

  const deliveryDays = watch("deliveryDays") ?? [];
  const toggleDay = (day: number) => {
    const next = deliveryDays.includes(day)
      ? deliveryDays.filter((d) => d !== day)
      : [...deliveryDays, day].sort((a, b) => a - b);
    setValue("deliveryDays", next, { shouldDirty: true, shouldValidate: true });
  };

  const submit = handleSubmit(async (v) => {
    const triToBool = (s: "inherit" | "true" | "false"): boolean | null =>
      s === "inherit" ? null : s === "true";
    await onSubmit({
      regionId: v.regionId,
      name: v.name.trim(),
      name_ar: v.name_ar?.trim() || null,
      isActive: v.isActive,
      shippingFlatRate: v.shippingFlatRate,
      freeDeliveryThreshold: v.freeDeliveryThreshold,
      sameDayEnabled: triToBool(v.sameDayEnabled),
      sameDayCutoff: v.sameDayCutoff?.trim() || null,
      standardLeadDays: v.standardLeadDays,
      standardLeadDaysMax: v.standardLeadDaysMax,
      deliveryDays: v.deliveryDays,
      codEnabled: triToBool(v.codEnabled),
      minOrderAmount: v.minOrderAmount,
      maxOrderAmount: v.maxOrderAmount,
    });
  });

  const selectClass =
    "h-12 rounded-2xl border border-ink-200 bg-white px-4 text-sm text-ink-900 focus:border-bloom-400 focus:outline-none focus:ring-4 focus:ring-bloom-100";
  const labelClass = "text-xs font-semibold uppercase tracking-[0.12em] text-ink-500";
  const hintClass = "text-xs text-ink-500";

  return (
    <form onSubmit={submit} className="grid gap-6 lg:grid-cols-[2fr_1fr]" noValidate>
      <div className="flex flex-col gap-6">
        <section className="rounded-2xl border border-ink-100 bg-white p-5 sm:p-6">
          <h3 className="mb-4 font-display text-lg text-ink-900">{t("admin.deliveryZoneForm.detailsHeading")}</h3>
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="flex flex-col gap-1.5">
              <label
                htmlFor="zone-region"
                className={labelClass}
              >
                {t("admin.deliveryZoneForm.regionLabel")}
              </label>
              {regionsQuery.isPending ? (
                <div className="flex h-12 items-center rounded-2xl border border-ink-200 px-4">
                  <Spinner size="sm" />
                </div>
              ) : (
                <select
                  id="zone-region"
                  className={selectClass}
                  {...register("regionId")}
                >
                  <option value="">{t("admin.deliveryZoneForm.selectRegion")}</option>
                  {regionsQuery.data?.map((r) => (
                    <option key={r.id} value={r.id}>
                      {r.name} ({r.code})
                    </option>
                  ))}
                </select>
              )}
              {errors.regionId?.message ? (
                <p className="text-xs text-bloom-700">{errors.regionId.message}</p>
              ) : null}
            </div>
            <Input
              label={t("admin.regionForm.nameEnLabel")}
              placeholder="Dubai"
              error={errors.name?.message}
              {...register("name")}
            />
            <Input
              label={t("admin.regionForm.nameArLabel")}
              dir="rtl"
              placeholder="دبي"
              {...register("name_ar")}
            />
          </div>
        </section>

        <section className="rounded-2xl border border-ink-100 bg-white p-5 sm:p-6">
          <h3 className="mb-1 font-display text-lg text-ink-900">
            {t("admin.deliveryZoneForm.configHeading")}
          </h3>
          <p className="mb-4 text-xs text-ink-500">{t("admin.deliveryZoneForm.configHint")}</p>
          <div className="grid gap-4 sm:grid-cols-2">
            <Input
              label={t("admin.deliveryZoneForm.shippingFlatRateLabel")}
              type="number"
              step="0.01"
              min="0"
              placeholder="25.00"
              hint={t("admin.deliveryZoneForm.shippingFlatRateHint")}
              error={errors.shippingFlatRate?.message}
              {...register("shippingFlatRate", { setValueAs: numberOrNull })}
            />
            <Input
              label={t("admin.deliveryZoneForm.freeDeliveryThresholdLabel")}
              type="number"
              step="0.01"
              min="0"
              placeholder="150.00"
              hint={t("admin.deliveryZoneForm.freeDeliveryThresholdHint")}
              error={errors.freeDeliveryThreshold?.message}
              {...register("freeDeliveryThreshold", { setValueAs: numberOrNull })}
            />

            <div className="flex flex-col gap-1.5">
              <label htmlFor="zone-same-day" className={labelClass}>
                {t("admin.deliveryZoneForm.sameDayEnabledLabel")}
              </label>
              <select id="zone-same-day" className={selectClass} {...register("sameDayEnabled")}>
                <option value="inherit">{t("admin.deliveryZoneForm.inheritOption")}</option>
                <option value="true">{t("admin.deliveryZoneForm.yesOption")}</option>
                <option value="false">{t("admin.deliveryZoneForm.noOption")}</option>
              </select>
              <p className={hintClass}>{t("admin.deliveryZoneForm.sameDayEnabledHint")}</p>
            </div>
            <Input
              label={t("admin.deliveryZoneForm.sameDayCutoffLabel")}
              type="time"
              hint={t("admin.deliveryZoneForm.sameDayCutoffHint")}
              error={errors.sameDayCutoff?.message}
              {...register("sameDayCutoff")}
            />

            <Input
              label={t("admin.deliveryZoneForm.standardLeadDaysLabel")}
              type="number"
              step="1"
              min="0"
              placeholder="3"
              hint={t("admin.deliveryZoneForm.standardLeadDaysHint")}
              error={errors.standardLeadDays?.message}
              {...register("standardLeadDays", { setValueAs: numberOrNull })}
            />
            <Input
              label={t("admin.deliveryZoneForm.standardLeadDaysMaxLabel")}
              type="number"
              step="1"
              min="0"
              placeholder="5"
              hint={t("admin.deliveryZoneForm.standardLeadDaysMaxHint")}
              error={errors.standardLeadDaysMax?.message}
              {...register("standardLeadDaysMax", { setValueAs: numberOrNull })}
            />
            <div className="flex flex-col gap-1.5">
              <label htmlFor="zone-cod" className={labelClass}>
                {t("admin.deliveryZoneForm.codEnabledLabel")}
              </label>
              <select id="zone-cod" className={selectClass} {...register("codEnabled")}>
                <option value="inherit">{t("admin.deliveryZoneForm.inheritOption")}</option>
                <option value="true">{t("admin.deliveryZoneForm.yesOption")}</option>
                <option value="false">{t("admin.deliveryZoneForm.noOption")}</option>
              </select>
              <p className={hintClass}>{t("admin.deliveryZoneForm.codEnabledHint")}</p>
            </div>

            <Input
              label={t("admin.deliveryZoneForm.minOrderAmountLabel")}
              type="number"
              step="0.01"
              min="0"
              placeholder="0.00"
              hint={t("admin.deliveryZoneForm.minOrderHint")}
              error={errors.minOrderAmount?.message}
              {...register("minOrderAmount", { setValueAs: numberOrNull })}
            />
            <Input
              label={t("admin.deliveryZoneForm.maxOrderAmountLabel")}
              type="number"
              step="0.01"
              min="0"
              placeholder="0.00"
              hint={t("admin.deliveryZoneForm.maxOrderHint")}
              error={errors.maxOrderAmount?.message}
              {...register("maxOrderAmount", { setValueAs: numberOrNull })}
            />

            <div className="flex flex-col gap-1.5 sm:col-span-2">
              <span className={labelClass}>{t("admin.deliveryZoneForm.deliveryDaysLabel")}</span>
              <div className="flex flex-wrap gap-2">
                {WEEKDAY_KEYS.map((key, day) => {
                  const checked = deliveryDays.includes(day);
                  return (
                    <label
                      key={key}
                      className={`flex cursor-pointer items-center gap-2 rounded-2xl border px-3 py-2 text-sm ${
                        checked
                          ? "border-bloom-400 bg-bloom-50 text-ink-900"
                          : "border-ink-200 bg-white text-ink-600"
                      }`}
                    >
                      <input
                        type="checkbox"
                        className="h-4 w-4 accent-bloom-600"
                        checked={checked}
                        onChange={() => toggleDay(day)}
                      />
                      {t(`admin.deliveryZoneForm.${key}` as Parameters<typeof t>[0])}
                    </label>
                  );
                })}
              </div>
              <p className={hintClass}>{t("admin.deliveryZoneForm.deliveryDaysHint")}</p>
            </div>
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
            <span className="text-sm text-ink-900">{t("admin.deliveryZoneForm.activeLabel")}</span>
          </label>
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
