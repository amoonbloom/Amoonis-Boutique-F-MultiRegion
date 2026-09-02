import { z } from "zod";
import type { ChangeEvent, KeyboardEvent } from "react";
import type { MessageKey } from "@/i18n";
import type { Locale } from "@/store/slices/ui.slice";
import { DEFAULT_MAX_PHONE_DIGITS } from "@/features/regions/countries";

/** Isolate LTR phone input text inside Arabic (RTL) layouts. */
export const PHONE_LTR_CLASS = "[unicode-bidi:isolate]";

const ARABIC_INDIC = "٠١٢٣٤٥٦٧٨٩";
const EXTENDED_ARABIC_INDIC = "۰۱۲۳۴۵۶۷۸۹";

const PHONE_NAV_KEYS = new Set([
  "Backspace",
  "Delete",
  "Tab",
  "Escape",
  "Enter",
  "ArrowLeft",
  "ArrowRight",
  "Home",
  "End",
]);

export type PhoneTranslateFn = (
  key: MessageKey,
  vars?: Record<string, string | number>
) => string;

/** Western digits only — used for API/storage. */
export function normalizePhoneDigits(value: string): string {
  return value
    .replace(/[٠-٩]/g, (digit) => String(ARABIC_INDIC.indexOf(digit)))
    .replace(/[۰-۹]/g, (digit) => String(EXTENDED_ARABIC_INDIC.indexOf(digit)))
    .replace(/[^\d\s-]/g, "");
}

/** Count stored digits (ignores spaces/dashes). */
export function countPhoneDigits(value: string): number {
  return normalizePhoneDigits(value).replace(/[\s-]/g, "").length;
}

/** Arabic-Indic digits for display when the UI locale is Arabic. */
export function formatPhoneDigitsForDisplay(
  value: string,
  locale: Locale = "en"
): string {
  const western = normalizePhoneDigits(value).replace(/[\s-]/g, "");
  if (locale !== "ar") return western;
  return western.replace(/[0-9]/g, (digit) => ARABIC_INDIC[Number(digit)] ?? digit);
}

export function isAllowedPhoneKey(key: string): boolean {
  return /^[0-9٠-٩۰-۹\s-]$/.test(key);
}

export function isPhoneDigitKey(key: string): boolean {
  return /^[0-9٠-٩۰-۹]$/.test(key);
}

export function handlePhoneKeyDown(
  event: KeyboardEvent<HTMLInputElement>,
  maxDigits: number = DEFAULT_MAX_PHONE_DIGITS
): void {
  if (PHONE_NAV_KEYS.has(event.key) || event.ctrlKey || event.metaKey) {
    return;
  }
  if (isPhoneDigitKey(event.key)) {
    if (countPhoneDigits(event.currentTarget.value) >= maxDigits) {
      event.preventDefault();
    }
    return;
  }
  if (isAllowedPhoneKey(event.key)) {
    return;
  }
  event.preventDefault();
}

/** Accept Arabic-keyboard digits; show Arabic numerals in AR, store Western digits. */
export function handlePhoneInputChange(
  event: ChangeEvent<HTMLInputElement>,
  locale: Locale,
  onChange: (event: ChangeEvent<HTMLInputElement>) => void,
  maxDigits: number = DEFAULT_MAX_PHONE_DIGITS
): void {
  let western = normalizePhoneDigits(event.target.value).replace(/[\s-]/g, "");
  if (western.length > maxDigits) {
    western = western.slice(0, maxDigits);
  }
  event.target.value = formatPhoneDigitsForDisplay(western, locale);
  onChange({
    ...event,
    target: { ...event.target, value: western },
  });
}

/** Zod schema for the national-number portion (dial code is prefixed separately). */
export function phoneNumberSchema(
  t: PhoneTranslateFn,
  nationalLength: number | null
) {
  return z.string().superRefine((val, ctx) => {
    const digits = countPhoneDigits(val);
    if (digits === 0) {
      ctx.addIssue({ code: "custom", message: t("validation.required") });
      return;
    }
    if (nationalLength != null) {
      if (digits !== nationalLength) {
        ctx.addIssue({
          code: "custom",
          message: t("validation.phoneDigits", { count: nationalLength }),
        });
      }
      return;
    }
    if (digits < 4) {
      ctx.addIssue({ code: "custom", message: t("validation.required") });
    }
  });
}
