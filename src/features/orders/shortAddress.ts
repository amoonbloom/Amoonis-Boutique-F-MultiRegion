/**
 * Saudi National Address "short address" code — the 4-letter + 4-digit code printed on
 * a building's address plate (e.g. "JHRC3674").
 *
 * Kept as its own module (not inlined in the checkout form) because the same rules are
 * needed wherever the code is shown or re-validated: checkout, the receipt, the admin
 * order view and the invoice.
 */

/** Canonical stored/validated form: exactly 4 uppercase letters then 4 digits. */
export const SHORT_ADDRESS_REGEX = /^[A-Z]{4}[0-9]{4}$/;

/** Shown in the input so the expected shape is obvious at a glance. */
export const SHORT_ADDRESS_PLACEHOLDER = "ABCD1234";

export const SHORT_ADDRESS_LENGTH = 8;

/**
 * Coerces whatever the customer typed or pasted into the canonical shape, enforcing the
 * ordering rule as they type: the first 4 characters may only be LETTERS and the last 4
 * may only be DIGITS. A character that would violate that is dropped rather than
 * inserted — so typing a digit into an empty field produces nothing (the customer
 * literally cannot start with a number), and typing a letter after the 4 letters are
 * filled is ignored.
 *
 * Separators are tolerated on paste ("jhrc-3674" / "JHRC 3674" -> "JHRC3674") since the
 * code is often written with one on the plate or in a message.
 */
export function maskShortAddress(raw: string): string {
  const cleaned = (raw ?? "").toUpperCase().replace(/[^A-Z0-9]/g, "");
  let letters = "";
  let digits = "";
  for (const ch of cleaned) {
    if (letters.length < 4) {
      // Letters phase — digits are rejected outright, enforcing "letters first".
      if (ch >= "A" && ch <= "Z") letters += ch;
    } else if (digits.length < 4) {
      // Digits phase — stray letters are rejected.
      if (ch >= "0" && ch <= "9") digits += ch;
    } else {
      break; // Full: 4 + 4.
    }
  }
  return letters + digits;
}

/** True only for a complete, correctly-ordered code. */
export function isValidShortAddress(value: string): boolean {
  return SHORT_ADDRESS_REGEX.test(value);
}
