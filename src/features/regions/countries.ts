/**
 * Country picker data for the admin "New region" flow. Names (English +
 * Arabic) are resolved at runtime via `Intl.DisplayNames` off the ISO
 * 3166-1 alpha-2 code — not hand-typed — so they're accurate for every
 * country without maintaining ~195 translated strings by hand. Currency is
 * the one piece `Intl` can't give us, so it's a curated ISO 4217 lookup
 * below: a helpful default the admin can always overwrite, never
 * authoritative (mirrors how `shippingFlatRate`/`legalEntity` already work
 * as editable suggestions, not locked values).
 *
 * The code list itself is exactly the flags we self-host in `/public/flags`
 * (see RegionFlag.tsx) — a country only shows up in the picker if we can
 * actually render its flag. A handful of non-country/alias codes in that set
 * (EU, UN — not countries at all; UK/FX/SU/YU/AN — historical aliases that
 * `Intl.DisplayNames` happily resolves to the SAME name as their modern
 * replacement: GB/FR/RU/RS/CW respectively) are excluded explicitly below —
 * confirmed by scanning every code for name collisions, not guessed.
 */

/** Not real, separately-selectable countries — either not a country at all
 *  (EU, UN) or a historical/alias code CLDR resolves to the same name as its
 *  modern replacement, which would otherwise show as a confusing duplicate
 *  (UK≡GB, FX≡FR, SU≡RU, YU≡RS, AN≡CW). XK (Kosovo) is kept even though it
 *  has no unique official ISO 3166-1 code — it doesn't duplicate anything. */
const EXCLUDED_ISO2 = new Set(["EU", "UN", "UK", "FX", "SU", "YU", "AN"]);

const FLAG_ISO2_CODES = [
  "AC", "AD", "AE", "AF", "AG", "AI", "AL", "AM", "AN", "AO", "AQ", "AR", "AS", "AT", "AU", "AW", "AX", "AZ",
  "BA", "BB", "BD", "BE", "BF", "BG", "BH", "BI", "BJ", "BL", "BM", "BN", "BO", "BQ", "BR", "BS", "BT", "BV",
  "BW", "BY", "BZ", "CA", "CC", "CD", "CF", "CG", "CH", "CI", "CK", "CL", "CM", "CN", "CO", "CP", "CQ", "CR",
  "CU", "CV", "CW", "CX", "CY", "CZ", "DE", "DG", "DJ", "DK", "DM", "DO", "DZ", "EA", "EC", "EE", "EG", "EH",
  "ER", "ES", "ET", "EU", "FI", "FJ", "FK", "FM", "FO", "FR", "FX", "GA", "GB", "GD", "GE", "GF", "GG", "GH",
  "GI", "GL", "GM", "GN", "GP", "GQ", "GR", "GS", "GT", "GU", "GW", "GY", "HK", "HM", "HN", "HR", "HT", "HU",
  "IC", "ID", "IE", "IL", "IM", "IN", "IO", "IQ", "IR", "IS", "IT", "JE", "JM", "JO", "JP", "KE", "KG", "KH",
  "KI", "KM", "KN", "KP", "KR", "KW", "KY", "KZ", "LA", "LB", "LC", "LI", "LK", "LR", "LS", "LT", "LU", "LV",
  "LY", "MA", "MC", "MD", "ME", "MF", "MG", "MH", "MK", "ML", "MM", "MN", "MO", "MP", "MQ", "MR", "MS", "MT",
  "MU", "MV", "MW", "MX", "MY", "MZ", "NA", "NC", "NE", "NF", "NG", "NI", "NL", "NO", "NP", "NR", "NU", "NZ",
  "OM", "PA", "PE", "PF", "PG", "PH", "PK", "PL", "PM", "PN", "PR", "PS", "PT", "PW", "PY", "QA", "RE", "RO",
  "RS", "RU", "RW", "SA", "SB", "SC", "SD", "SE", "SG", "SH", "SI", "SJ", "SK", "SL", "SM", "SN", "SO", "SR",
  "SS", "ST", "SU", "SV", "SX", "SY", "SZ", "TA", "TC", "TD", "TF", "TG", "TH", "TJ", "TK", "TL", "TM", "TN",
  "TO", "TR", "TT", "TV", "TW", "TZ", "UA", "UG", "UK", "UM", "UN", "US", "UY", "UZ", "VA", "VC", "VE", "VG",
  "VI", "VN", "VU", "WF", "WS", "XK", "XX", "YE", "YT", "YU", "ZA", "ZM", "ZW",
];

/** ISO 3166-1 alpha-2 -> ISO 4217 currency code. Covers UN member states and
 *  common territories; deliberately left blank (not guessed) for a handful of
 *  uninhabited/disputed/ambiguous codes rather than risk a wrong default. */
const CURRENCY_BY_ISO2: Record<string, string> = {
  AD: "EUR", AE: "AED", AF: "AFN", AG: "XCD", AI: "XCD", AL: "ALL", AM: "AMD", AO: "AOA", AR: "ARS",
  AS: "USD", AT: "EUR", AU: "AUD", AW: "AWG", AX: "EUR", AZ: "AZN", BA: "BAM", BB: "BBD", BD: "BDT",
  BE: "EUR", BF: "XOF", BG: "BGN", BH: "BHD", BI: "BIF", BJ: "XOF", BM: "BMD", BN: "BND", BO: "BOB",
  BQ: "USD", BR: "BRL", BS: "BSD", BT: "BTN", BW: "BWP", BY: "BYN", BZ: "BZD", CA: "CAD", CC: "AUD",
  CD: "CDF", CF: "XAF", CG: "XAF", CH: "CHF", CI: "XOF", CK: "NZD", CL: "CLP", CM: "XAF", CN: "CNY",
  CO: "COP", CR: "CRC", CU: "CUP", CV: "CVE", CW: "ANG", CX: "AUD", CY: "EUR", CZ: "CZK", DE: "EUR",
  DJ: "DJF", DK: "DKK", DM: "XCD", DO: "DOP", DZ: "DZD", EC: "USD", EE: "EUR", EG: "EGP", EH: "MAD",
  ER: "ERN", ES: "EUR", ET: "ETB", FI: "EUR", FJ: "FJD", FK: "FKP", FM: "USD", FO: "DKK", FR: "EUR",
  GA: "XAF", GB: "GBP", GD: "XCD", GE: "GEL", GF: "EUR", GG: "GBP", GH: "GHS", GI: "GIP", GL: "DKK",
  GM: "GMD", GN: "GNF", GP: "EUR", GQ: "XAF", GR: "EUR", GS: "GBP", GT: "GTQ", GU: "USD", GW: "XOF",
  GY: "GYD", HK: "HKD", HN: "HNL", HR: "EUR", HT: "HTG", HU: "HUF", ID: "IDR", IE: "EUR", IL: "ILS",
  IM: "GBP", IN: "INR", IO: "USD", IQ: "IQD", IR: "IRR", IS: "ISK", IT: "EUR", JE: "GBP", JM: "JMD",
  JO: "JOD", JP: "JPY", KE: "KES", KG: "KGS", KH: "KHR", KI: "AUD", KM: "KMF", KN: "XCD", KP: "KPW",
  KR: "KRW", KW: "KWD", KY: "KYD", KZ: "KZT", LA: "LAK", LB: "LBP", LC: "XCD", LI: "CHF", LK: "LKR",
  LR: "LRD", LS: "LSL", LT: "EUR", LU: "EUR", LV: "EUR", LY: "LYD", MA: "MAD", MC: "EUR", MD: "MDL",
  ME: "EUR", MF: "EUR", MG: "MGA", MH: "USD", MK: "MKD", ML: "XOF", MM: "MMK", MN: "MNT", MO: "MOP",
  MP: "USD", MQ: "EUR", MR: "MRU", MS: "XCD", MT: "EUR", MU: "MUR", MV: "MVR", MW: "MWK", MX: "MXN",
  MY: "MYR", MZ: "MZN", NA: "NAD", NC: "XPF", NE: "XOF", NF: "AUD", NG: "NGN", NI: "NIO", NL: "EUR",
  NO: "NOK", NP: "NPR", NR: "AUD", NU: "NZD", NZ: "NZD", OM: "OMR", PA: "PAB", PE: "PEN", PF: "XPF",
  PG: "PGK", PH: "PHP", PK: "PKR", PL: "PLN", PM: "EUR", PN: "NZD", PR: "USD", PS: "ILS", PT: "EUR",
  PW: "USD", PY: "PYG", QA: "QAR", RE: "EUR", RO: "RON", RS: "RSD", RU: "RUB", RW: "RWF", SA: "SAR",
  SB: "SBD", SC: "SCR", SD: "SDG", SE: "SEK", SG: "SGD", SH: "SHP", SI: "EUR", SJ: "NOK", SK: "EUR",
  SL: "SLE", SM: "EUR", SN: "XOF", SO: "SOS", SR: "SRD", SS: "SSP", ST: "STN", SV: "USD", SX: "ANG",
  SY: "SYP", SZ: "SZL", TC: "USD", TD: "XAF", TG: "XOF", TH: "THB", TJ: "TJS", TK: "NZD", TL: "USD",
  TM: "TMT", TN: "TND", TO: "TOP", TR: "TRY", TT: "TTD", TV: "AUD", TW: "TWD", TZ: "TZS", UA: "UAH",
  UG: "UGX", US: "USD", UY: "UYU", UZ: "UZS", VA: "EUR", VC: "XCD", VE: "VES", VG: "USD", VI: "USD",
  VN: "VND", VU: "VUV", WF: "XPF", WS: "WST", YE: "YER", YT: "EUR", ZA: "ZAR", ZM: "ZMW", ZW: "ZWL",
};

/** ISO 3166-1 alpha-2 -> international calling code (E.164 country code,
 *  with a leading "+", digits only after that). Several codes are shared by
 *  more than one country/territory (e.g. "+1" for the whole NANP zone,
 *  "+7" for Russia and Kazakhstan) — that's correct, not a collision, since
 *  the calling code alone doesn't need to be unique per country. Drives the
 *  checkout/account phone field's dial-code prefix automatically from the
 *  region's `iso2` (see getCallingCode below) — deliberately NOT a per-region
 *  admin field, since the calling code is a property of the country, not a
 *  business choice like currency or shipping rate. Left blank (absent from
 *  this map) only for a handful of uninhabited/disputed codes, mirroring
 *  CURRENCY_BY_ISO2's "don't guess" rule. */
const CALLING_CODE_BY_ISO2: Record<string, string> = {
  AD: "+376", AE: "+971", AF: "+93", AG: "+1", AI: "+1", AL: "+355", AM: "+374", AO: "+244", AR: "+54",
  AS: "+1", AT: "+43", AU: "+61", AW: "+297", AX: "+358", AZ: "+994", BA: "+387", BB: "+1", BD: "+880",
  BE: "+32", BF: "+226", BG: "+359", BH: "+973", BI: "+257", BJ: "+229", BM: "+1", BN: "+673", BO: "+591",
  BQ: "+599", BR: "+55", BS: "+1", BT: "+975", BW: "+267", BY: "+375", BZ: "+501", CA: "+1", CC: "+61",
  CD: "+243", CF: "+236", CG: "+242", CH: "+41", CI: "+225", CK: "+682", CL: "+56", CM: "+237", CN: "+86",
  CO: "+57", CR: "+506", CU: "+53", CV: "+238", CW: "+599", CX: "+61", CY: "+357", CZ: "+420", DE: "+49",
  DJ: "+253", DK: "+45", DM: "+1", DO: "+1", DZ: "+213", EC: "+593", EE: "+372", EG: "+20", EH: "+212",
  ER: "+291", ES: "+34", ET: "+251", FI: "+358", FJ: "+679", FK: "+500", FM: "+691", FO: "+298", FR: "+33",
  GA: "+241", GB: "+44", GD: "+1", GE: "+995", GF: "+594", GG: "+44", GH: "+233", GI: "+350", GL: "+299",
  GM: "+220", GN: "+224", GP: "+590", GQ: "+240", GR: "+30", GS: "+500", GT: "+502", GU: "+1", GW: "+245",
  GY: "+592", HK: "+852", HM: "+672", HN: "+504", HR: "+385", HT: "+509", HU: "+36", ID: "+62", IE: "+353",
  IL: "+972", IM: "+44", IN: "+91", IO: "+246", IQ: "+964", IR: "+98", IS: "+354", IT: "+39", JE: "+44",
  JM: "+1", JO: "+962", JP: "+81", KE: "+254", KG: "+996", KH: "+855", KI: "+686", KM: "+269", KN: "+1",
  KP: "+850", KR: "+82", KW: "+965", KY: "+1", KZ: "+7", LA: "+856", LB: "+961", LC: "+1", LI: "+423",
  LK: "+94", LR: "+231", LS: "+266", LT: "+370", LU: "+352", LV: "+371", LY: "+218", MA: "+212", MC: "+377",
  MD: "+373", ME: "+382", MF: "+590", MG: "+261", MH: "+692", MK: "+389", ML: "+223", MM: "+95", MN: "+976",
  MO: "+853", MP: "+1", MQ: "+596", MR: "+222", MS: "+1", MT: "+356", MU: "+230", MV: "+960", MW: "+265",
  MX: "+52", MY: "+60", MZ: "+258", NA: "+264", NC: "+687", NE: "+227", NF: "+672", NG: "+234", NI: "+505",
  NL: "+31", NO: "+47", NP: "+977", NR: "+674", NU: "+683", NZ: "+64", OM: "+968", PA: "+507", PE: "+51",
  PF: "+689", PG: "+675", PH: "+63", PK: "+92", PL: "+48", PM: "+508", PN: "+64", PR: "+1", PS: "+970",
  PT: "+351", PW: "+680", PY: "+595", QA: "+974", RE: "+262", RO: "+40", RS: "+381", RU: "+7", RW: "+250",
  SA: "+966", SB: "+677", SC: "+248", SD: "+249", SE: "+46", SG: "+65", SH: "+290", SI: "+386", SJ: "+47",
  SK: "+421", SL: "+232", SM: "+378", SN: "+221", SO: "+252", SR: "+597", SS: "+211", ST: "+239", SV: "+503",
  SX: "+1", SY: "+963", SZ: "+268", TC: "+1", TD: "+235", TG: "+228", TH: "+66", TJ: "+992", TK: "+690",
  TL: "+670", TM: "+993", TN: "+216", TO: "+676", TR: "+90", TT: "+1", TV: "+688", TW: "+886", TZ: "+255",
  UA: "+380", UG: "+256", US: "+1", UY: "+598", UZ: "+998", VA: "+379", VC: "+1", VE: "+58", VG: "+1",
  VI: "+1", VN: "+84", VU: "+678", WF: "+681", WS: "+685", YE: "+967", YT: "+262", ZA: "+27", ZM: "+260",
  ZW: "+263",
};

/** National significant number length (digits only, excluding country code). */
const NATIONAL_PHONE_LENGTH_BY_ISO2: Record<string, number> = {
  AE: 9,
  SA: 9,
};

/** Max digits when no country-specific length is configured (ITU E.164 cap). */
export const DEFAULT_MAX_PHONE_DIGITS = 15;

/** Exact national digit count for a region's `iso2`, or null when unknown. */
export function getNationalPhoneLength(iso2: string | null | undefined): number | null {
  if (!iso2) return null;
  return NATIONAL_PHONE_LENGTH_BY_ISO2[iso2.toUpperCase()] ?? null;
}

/** Hard input cap: exact national length when known, otherwise a safe default. */
export function getPhoneDigitLimit(iso2: string | null | undefined): number {
  return getNationalPhoneLength(iso2) ?? DEFAULT_MAX_PHONE_DIGITS;
}

/** All distinct calling codes in the map above, longest-first, so a prefix
 *  scan (see stripKnownCallingCode) matches the longest code before a
 *  shorter one that happens to also match (e.g. checks "+299" before "+2"). */
const KNOWN_CALLING_CODES = Array.from(new Set(Object.values(CALLING_CODE_BY_ISO2))).sort(
  (a, b) => b.length - a.length
);

/** The dial-code prefix for a region, derived from its `iso2` — e.g. "+212"
 *  for Morocco, "+92" for Pakistan. Returns null when `iso2` is unset or not
 *  in the map (a region without `iso2` set shows no prefix, same as before). */
export function getCallingCode(iso2: string | null | undefined): string | null {
  if (!iso2) return null;
  return CALLING_CODE_BY_ISO2[iso2.toUpperCase()] ?? null;
}

/** Strips a leading, RECOGNIZED calling code from a stored E.164-ish phone
 *  string (e.g. "+212612345678" -> "612345678"), regardless of the customer's
 *  CURRENT region — a saved number may have been entered under a different
 *  region than the one being viewed now. Falls back to stripping a bare "+"
 *  when no known code matches, so an unrecognized prefix still displays
 *  without a stray leading plus. */
export function stripKnownCallingCode(phone: string | null | undefined): string {
  if (!phone) return "";
  const known = KNOWN_CALLING_CODES.find((code) => phone.startsWith(code));
  return known ? phone.slice(known.length) : phone.replace(/^\+/, "");
}

export interface CountryOption {
  iso2: string;
  nameEn: string;
  nameAr: string;
  /** ISO 4217 code, or null when we don't have a confident default. */
  currency: string | null;
  /** International dial code (e.g. "+212"), or null when we don't have one. */
  callingCode: string | null;
}

let cache: CountryOption[] | null = null;

/**
 * All flag-backed countries with resolvable ISO names, sorted by English
 * name. Computed once per session (pure function of static data + the
 * runtime's ICU data, not of any component state).
 */
export function getCountryOptions(): CountryOption[] {
  if (cache) return cache;

  const dnEn = new Intl.DisplayNames(["en"], { type: "region" });
  const dnAr = new Intl.DisplayNames(["ar"], { type: "region" });

  const options: CountryOption[] = [];
  for (const code of FLAG_ISO2_CODES) {
    if (EXCLUDED_ISO2.has(code)) continue;
    let nameEn: string | undefined;
    let nameAr: string | undefined;
    try {
      nameEn = dnEn.of(code);
      nameAr = dnAr.of(code);
    } catch {
      continue; // not a resolvable region code (e.g. a legacy/reserved code)
    }
    // Intl echoes the input back unchanged when it can't resolve a name —
    // that's how we drop the non-country codes mixed into the flag set
    // (EU, UK, UN, XK, historical codes like SU/YU/AN) without maintaining
    // an exclusion list by hand.
    if (!nameEn || nameEn === code) continue;
    options.push({
      iso2: code,
      nameEn,
      nameAr: nameAr && nameAr !== code ? nameAr : nameEn,
      currency: CURRENCY_BY_ISO2[code] ?? null,
      callingCode: CALLING_CODE_BY_ISO2[code] ?? null,
    });
  }
  options.sort((a, b) => a.nameEn.localeCompare(b.nameEn));
  cache = options;
  return options;
}
