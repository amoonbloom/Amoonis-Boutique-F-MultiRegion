"use client";

import { useEffect, useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { addressesApi } from "@/features/addresses/api/addresses.api";
import { deliveryZonesApi } from "@/features/delivery-zones/api/delivery-zones.api";
import { queryKeys } from "@/services/queryKeys";
import { Button, Input, Modal } from "@/components/ui";
import { PhoneDialCode } from "@/components/ui/PhoneDialCode";
import { Spinner } from "@/components/ui/Loader";
import { ConfirmDialog } from "@/components/admin/ConfirmDialog";
import { useToast } from "@/hooks/useToast";
import { useT } from "@/i18n/useT";
import { useCurrency } from "@/features/location/hooks/useCurrency";
import { stripKnownCallingCode } from "@/features/regions/countries";
import { PencilIcon, PinIcon, PlusIcon, TrashIcon } from "@/components/icons";
import type { MessageKey } from "@/i18n";
import { localizedName } from "@/features/location/localizedName";
import {
  PHONE_LTR_CLASS,
  formatPhoneDigitsForDisplay,
  handlePhoneInputChange,
  handlePhoneKeyDown,
  normalizePhoneDigits,
  phoneNumberSchema,
} from "@/lib/phoneInput";
import type {
  ApiAddress,
  ApiAddressCreateInput,
} from "@/features/addresses/types";

// Mirrors CheckoutClient.tsx's dial-code convention exactly: the field stores
// one E.164-ish string in the existing `phone` column (no backend schema
// change). The prefix itself comes from useCurrency()'s `dialCode`, derived
// automatically from the region's `iso2` — see countries.ts.
const stripDialCode = stripKnownCallingCode;

type TranslateFn = (key: MessageKey) => string;

const makeAddressSchema = (
  t: TranslateFn,
  zoneRequired: boolean,
  nationalPhoneLength: number | null
) =>
  z.object({
    label: z.string().optional(),
    fullName: z.string().min(1, t("validation.required")),
    phone: phoneNumberSchema(t, nationalPhoneLength),
    area: z.string().min(1, t("validation.required")),
    deliveryZoneId: zoneRequired
      ? z.string().min(1, t("validation.required"))
      : z.string().optional(),
    isDefault: z.boolean().optional(),
  });

type FormValues = z.infer<ReturnType<typeof makeAddressSchema>>;

export function AddressBook() {
  const toast = useToast();
  const queryClient = useQueryClient();
  const { t, locale } = useT();
  const [editing, setEditing] = useState<ApiAddress | null>(null);
  const [creating, setCreating] = useState(false);
  const [pendingDelete, setPendingDelete] = useState<ApiAddress | null>(null);

  const query = useQuery({
    queryKey: queryKeys.addresses.list(),
    queryFn: () => addressesApi.list(),
  });

  const deleteMutation = useMutation({
    mutationFn: (id: string) => addressesApi.remove(id),
    onSuccess: () => {
      toast.success({ title: t("address.removed") });
      setPendingDelete(null);
      queryClient.invalidateQueries({ queryKey: queryKeys.addresses.all });
    },
    onError: (err) => toast.fromError(t("address.removeError"), err),
  });

  if (query.isPending) {
    return (
      <div className="flex justify-center py-12">
        <Spinner size="lg" />
      </div>
    );
  }

  if (query.isError) {
    return (
      <div className="rounded-2xl border border-bloom-200 bg-bloom-50 p-8 text-center">
        <p className="text-sm text-bloom-700">{t("address.loadError")}</p>
        <Button
          variant="outline"
          size="sm"
          className="mt-4"
          onClick={() => query.refetch()}
          disabled={query.isFetching}
        >
          {t("error.retry")}
        </Button>
      </div>
    );
  }

  const addresses = query.data ?? [];

  return (
    <div className="flex flex-col gap-4">
      {/* Header "Add" button only when there are addresses — the empty state has
          its own prominent CTA below, so we don't show two add buttons at once. */}
      {addresses.length > 0 && (
        <div className="flex justify-end">
          <Button
            leadingIcon={<PlusIcon size={14} />}
            size="sm"
            onClick={() => setCreating(true)}
          >
            {t("address.addAddress")}
          </Button>
        </div>
      )}

      {addresses.length === 0 ? (
        <div className="rounded-2xl border border-ink-100 bg-white px-6 py-12 text-center">
          <div className="mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-full bg-bloom-50 text-bloom-600">
            <PinIcon size={24} />
          </div>
          <p className="font-display text-xl text-ink-900">{t("address.emptyTitle")}</p>
          <p className="mx-auto mt-1.5 max-w-sm text-sm text-ink-500">
            {t("address.emptyBody")}
          </p>
          <Button
            leadingIcon={<PlusIcon size={16} />}
            className="mt-6"
            onClick={() => setCreating(true)}
          >
            {t("address.addAddress")}
          </Button>
        </div>
      ) : (
        <div className="grid gap-3 sm:grid-cols-2">
          {addresses.map((a) => {
            // Legacy addresses saved before this feature has no `area` — fall
            // back to the old street/city line so nothing renders blank.
            const locationLine = a.area
              ? `${a.area}${a.deliveryZone ? `, ${localizedName(a.deliveryZone, locale)}` : ""}`
              : `${a.streetAddress}${a.apartment ? `, ${a.apartment}` : ""}, ${a.city}`;
            return (
              <div
                key={a.id}
                className="rounded-2xl border border-ink-100 bg-white p-4"
              >
                <div className="mb-2 flex items-start justify-between gap-2">
                  <div className="min-w-0">
                    <p className="text-sm font-semibold text-ink-900 wrap-break-word">
                      {a.label || a.fullName}
                    </p>
                    <div className="mt-1 flex flex-wrap items-center gap-1.5">
                      {a.isDefault ? (
                        <span className="inline-block rounded-full bg-bloom-100 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wider text-bloom-700">
                          {t("common.default")}
                        </span>
                      ) : null}
                      {/* Region badge so a shopper can tell which region each saved
                          address belongs to (it's only selectable at checkout in
                          that region). */}
                      {a.region ? (
                        <span className="inline-block rounded-full bg-ink-100 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wider text-ink-600">
                          {locale === "ar" && a.region.name_ar
                            ? a.region.name_ar
                            : a.region.name}
                        </span>
                      ) : null}
                    </div>
                  </div>
                  <div className="flex shrink-0 items-center gap-1">
                    <button
                      type="button"
                      onClick={() => setEditing(a)}
                      className="inline-flex h-9 w-9 items-center justify-center rounded-md text-ink-500 hover:bg-ink-50 hover:text-ink-900"
                      aria-label={t("common.edit")}
                    >
                      <PencilIcon size={16} />
                    </button>
                    <button
                      type="button"
                      onClick={() => setPendingDelete(a)}
                      className="inline-flex h-9 w-9 items-center justify-center rounded-md text-bloom-700 hover:bg-bloom-50"
                      aria-label={t("common.delete")}
                    >
                      <TrashIcon size={16} />
                    </button>
                  </div>
                </div>
                <p className="text-sm text-ink-700">{a.fullName}</p>
                <p className="text-xs text-ink-500">
                  <span dir="ltr" className="[unicode-bidi:isolate]">{a.phone}</span>
                </p>
                <p className="mt-2 text-sm text-ink-700 wrap-break-word">{locationLine}</p>
              </div>
            );
          })}
        </div>
      )}

      <ConfirmDialog
        open={Boolean(pendingDelete)}
        title={t("address.removeTitle")}
        confirmLabel={t("common.remove")}
        destructive
        loading={deleteMutation.isPending}
        onConfirm={() => pendingDelete && deleteMutation.mutate(pendingDelete.id)}
        onClose={() => setPendingDelete(null)}
      />

      <AddressFormModal
        open={creating}
        onClose={() => setCreating(false)}
        title={t("address.newAddress")}
      />
      <AddressFormModal
        open={Boolean(editing)}
        initial={editing ?? undefined}
        onClose={() => setEditing(null)}
        title={t("address.editAddress")}
      />
    </div>
  );
}

interface AddressFormModalProps {
  open: boolean;
  onClose: () => void;
  initial?: ApiAddress;
  title: string;
}

function AddressFormModal({ open, onClose, initial, title }: AddressFormModalProps) {
  const toast = useToast();
  const queryClient = useQueryClient();
  const { t, locale: uiLocale } = useT();
  const { countryCode, dialCode, phoneDigitLimit, nationalPhoneLength } = useCurrency();
  const regionCode = countryCode;

  const zonesQuery = useQuery({
    queryKey: queryKeys.deliveryZones.list(regionCode),
    queryFn: () => deliveryZonesApi.list(regionCode),
    enabled: Boolean(regionCode) && open,
  });
  const zones = zonesQuery.data ?? [];
  const zoneRequired = !zonesQuery.isPending && zones.length > 0;

  const emptyDefaults: FormValues = useMemo(
    () => ({
      label: "",
      fullName: "",
      phone: "",
      area: "",
      deliveryZoneId: "",
      isDefault: false,
    }),
    []
  );

  const schema = useMemo(
    () => makeAddressSchema(t, zoneRequired, nationalPhoneLength),
    [t, zoneRequired, nationalPhoneLength]
  );

  const initialValues: FormValues | undefined = initial
    ? {
        label: initial.label ?? "",
        fullName: initial.fullName,
        phone: formatPhoneDigitsForDisplay(stripDialCode(initial.phone), uiLocale),
        area: initial.area ?? "",
        deliveryZoneId: initial.deliveryZoneId ?? "",
        isDefault: initial.isDefault,
      }
    : undefined;

  const {
    register,
    handleSubmit,
    reset,
    formState: { errors },
  } = useForm<FormValues>({
    resolver: zodResolver(schema),
    defaultValues: initialValues ?? emptyDefaults,
    values: initialValues ?? emptyDefaults,
  });
  const phoneField = register("phone");

  // Reset to a blank form the next time this modal opens for "add new" (avoids
  // showing a just-closed edit's leftover values if the user immediately clicks
  // "Add address" afterward — `values` above only re-syncs for the edit case).
  useEffect(() => {
    if (open && !initial) reset(emptyDefaults);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  const mutation = useMutation({
    mutationFn: async (values: FormValues) => {
      const payload: ApiAddressCreateInput = {
        label: values.label?.trim() || null,
        fullName: values.fullName.trim(),
        phone: `${dialCode}${normalizePhoneDigits(values.phone).replace(/[\s-]/g, "")}`,
        area: values.area.trim(),
        deliveryZoneId: values.deliveryZoneId || null,
        isDefault: values.isDefault,
      };
      if (initial) {
        return addressesApi.update(initial.id, payload);
      }
      return addressesApi.create(payload);
    },
    onSuccess: () => {
      toast.success({ title: initial ? t("address.updated") : t("address.saved") });
      queryClient.invalidateQueries({ queryKey: queryKeys.addresses.all });
      reset(emptyDefaults);
      onClose();
    },
    onError: (err) => toast.fromError(t("address.saveError"), err),
  });

  return (
    <Modal open={open} onClose={onClose} title={title} size="lg">
      <form
        onSubmit={handleSubmit((v) => mutation.mutate(v))}
        className="grid gap-4 sm:grid-cols-2"
        noValidate
      >
        <Input
          label={t("address.label")}
          placeholder={t("address.labelPlaceholder")}
          containerClassName="sm:col-span-2"
          {...register("label")}
        />
        <Input
          label={t("checkout.fullName")}
          error={errors.fullName?.message}
          containerClassName="sm:col-span-2"
          {...register("fullName")}
        />
        <Input
          label={t("checkout.area")}
          placeholder={t("checkout.areaPlaceholder")}
          hint={t("checkout.areaHint")}
          error={errors.area?.message}
          {...register("area")}
        />
        <div className="flex flex-col gap-1.5">
          <label
            htmlFor="address-zone"
            className="text-xs font-semibold uppercase tracking-[0.12em] text-ink-500"
          >
            {regionCode === "UAE" ? t("checkout.emirate") : t("checkout.province")}
          </label>
          {zonesQuery.isPending ? (
            <div className="flex h-12 items-center rounded-2xl border border-ink-200 px-4">
              <Spinner size="sm" />
            </div>
          ) : zones.length === 0 ? (
            <p className="flex h-12 items-center text-xs text-ink-400">
              {t("checkout.emirateUnavailable")}
            </p>
          ) : (
            <select
              id="address-zone"
              className="h-12 rounded-2xl border border-ink-200 bg-white px-4 text-sm text-ink-900 focus:border-bloom-400 focus:outline-none focus:ring-4 focus:ring-bloom-100"
              {...register("deliveryZoneId")}
            >
              <option value="">
                {regionCode === "UAE" ? t("checkout.selectEmirate") : t("checkout.selectProvince")}
              </option>
              {zones.map((z) => (
                <option key={z.id} value={z.id}>
                  {uiLocale === "ar" && z.name_ar ? z.name_ar : z.name}
                </option>
              ))}
            </select>
          )}
          {errors.deliveryZoneId?.message ? (
            <p className="text-xs text-bloom-700">{errors.deliveryZoneId.message}</p>
          ) : null}
        </div>
        <div className="flex flex-col gap-1.5 sm:col-span-2">
          <label
            htmlFor="address-phone"
            className="text-xs font-semibold uppercase tracking-[0.12em] text-ink-500"
          >
            {t("checkout.phone")}
          </label>
          <div
            dir="ltr"
            className={
              "flex h-12 items-center rounded-2xl border bg-white transition-all " +
              (errors.phone
                ? "border-(--color-danger)"
                : "border-ink-200 focus-within:border-bloom-400 focus-within:ring-4 focus-within:ring-bloom-100")
            }
          >
            <PhoneDialCode dialCode={dialCode} />
            <input
              id="address-phone"
              type="tel"
              inputMode="numeric"
              autoComplete="tel-national"
              dir="ltr"
              maxLength={phoneDigitLimit}
              className={`h-full min-w-0 flex-1 rounded-e-2xl bg-transparent px-3 text-start text-sm text-ink-900 placeholder:text-ink-400 focus:outline-none ${PHONE_LTR_CLASS}`}
              onKeyDown={(event) => handlePhoneKeyDown(event, phoneDigitLimit)}
              {...phoneField}
              onChange={(event) =>
                handlePhoneInputChange(event, uiLocale, phoneField.onChange, phoneDigitLimit)
              }
            />
          </div>
          {errors.phone?.message ? (
            <p className="text-xs text-bloom-700">{errors.phone.message}</p>
          ) : null}
        </div>

        <label className="sm:col-span-2 inline-flex cursor-pointer items-center gap-2">
          <input
            type="checkbox"
            className="h-4 w-4 accent-bloom-600"
            {...register("isDefault")}
          />
          <span className="text-sm text-ink-900">{t("address.useAsDefault")}</span>
        </label>

        <div className="sm:col-span-2 flex justify-end gap-2">
          <Button variant="outline" type="button" onClick={onClose}>
            {t("common.cancel")}
          </Button>
          <Button type="submit" isLoading={mutation.isPending}>
            {initial ? t("account.saveChanges") : t("address.saveAddress")}
          </Button>
        </div>
      </form>
    </Modal>
  );
}
