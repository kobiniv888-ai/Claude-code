import { parsePhoneNumberFromString, type CountryCode } from "libphonenumber-js/max";
import { siteConfig } from "@/config/site";

/**
 * Phone-number rules for login codes. Uses the full ("max") metadata so validation is exact —
 * import this from server code; client components validate with react-phone-number-input.
 */

/** Phone-only accounts get a placeholder email on this reserved (.invalid) domain. */
export const PLACEHOLDER_EMAIL_DOMAIN = "phone.bayit.invalid";

export function placeholderEmailForPhone(phoneNumber: string): string {
  const digits = phoneNumber.replace(/\D/g, "");
  return `${digits}@${PLACEHOLDER_EMAIL_DOMAIN}`;
}

export function isPlaceholderEmail(email: string | null | undefined): boolean {
  return !!email && email.toLowerCase().endsWith(`@${PLACEHOLDER_EMAIL_DOMAIN}`);
}

/** SMS codes are only sent to these countries (protection against SMS-pumping fraud). */
export function isSmsCountryAllowed(country: string | null | undefined): boolean {
  return !!country && (siteConfig.phone.smsAllowedCountries as readonly string[]).includes(country);
}

export type PhoneCheck =
  | { ok: true; e164: string; country: CountryCode }
  | { ok: false; reason: "invalid" | "country_not_supported" };

/** Validates an E.164 number for login codes: a real number in an allowed country. */
export function checkLoginPhoneNumber(phoneNumber: unknown): PhoneCheck {
  if (typeof phoneNumber !== "string" || !/^\+[1-9]\d{6,14}$/.test(phoneNumber)) {
    return { ok: false, reason: "invalid" };
  }
  const parsed = parsePhoneNumberFromString(phoneNumber);
  if (!parsed || !parsed.isValid() || parsed.number !== phoneNumber) {
    return { ok: false, reason: "invalid" };
  }
  if (!parsed.country || !isSmsCountryAllowed(parsed.country)) {
    return { ok: false, reason: "country_not_supported" };
  }
  return { ok: true, e164: parsed.number, country: parsed.country };
}

/** "+995 555 12 34 56" — readable international format (falls back to the input). */
export function formatPhoneInternational(phoneNumber: string): string {
  return parsePhoneNumberFromString(phoneNumber)?.formatInternational() ?? phoneNumber;
}
