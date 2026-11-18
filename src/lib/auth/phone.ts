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

/** SMS codes are only sent to these countries (protection against SMS-pumping fraud, SECURITY_REPORT 3.2.a). */
export function isSmsCountryAllowed(country: string | null | undefined): boolean {
  return !!country && (siteConfig.phone.smsAllowedCountries as readonly string[]).includes(country);
}

export type PhoneCheck =
  | { ok: true; e164: string; country: CountryCode }
  | { ok: false; reason: "invalid" | "country_not_supported" | "not_mobile" };

/**
 * Number types that can receive a text. Landlines, premium-rate, shared-cost, VoIP, pagers and
 * "personal numbers" are refused (SMS pumping uses premium-rate and VoIP ranges; SECURITY_REPORT
 * 3.2.e). FIXED_LINE_OR_MOBILE is a country whose plans cannot tell the two apart.
 */
const SMS_NUMBER_TYPES = new Set(["MOBILE", "FIXED_LINE_OR_MOBILE"]);

/**
 * Validates an E.164 number before ANY SMS code: a real number, in an allowed country
 * (siteConfig.phone.smsAllowedCountries: Israel and Georgia), and a mobile number.
 */
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
  const type = parsed.getType();
  if (!type || !SMS_NUMBER_TYPES.has(type)) return { ok: false, reason: "not_mobile" };
  return { ok: true, e164: parsed.number, country: parsed.country };
}

/** "+995 555 12 34 56" — readable international format (falls back to the input). */
export function formatPhoneInternational(phoneNumber: string): string {
  return parsePhoneNumberFromString(phoneNumber)?.formatInternational() ?? phoneNumber;
}
