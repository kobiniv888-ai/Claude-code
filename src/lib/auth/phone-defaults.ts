import { siteConfig } from "@/config/site";

/**
 * Which country code a phone field starts with. Pure and client-safe.
 * - Guest login / verify-phone: by interface language (siteConfig.phone.defaultCountryByLocale).
 * - The listing contact phone: Georgia, unless the owner's verified phone is from elsewhere.
 * - Either way the visitor's last pick wins (remembered in localStorage per purpose).
 */

export type PhoneCountryPurpose = "login" | "listing-contact";

export function defaultPhoneCountryForLocale(locale: string): string {
  const byLocale = siteConfig.phone.defaultCountryByLocale as Record<string, string>;
  return byLocale[locale] ?? siteConfig.phone.defaultCountry;
}

/** The listing contact default: the owner's verified phone country, else Georgia. */
export function listingContactDefaultCountry(ownerPhoneCountry?: string | null): string {
  return ownerPhoneCountry || siteConfig.phone.listingContactDefaultCountry;
}

const STORAGE_PREFIX = "bayit:phone-country:";
const COUNTRY_PATTERN = /^[A-Z]{2}$/;

/** The country the visitor last picked for this purpose, or null (also when storage is blocked). */
export function readRememberedPhoneCountry(purpose: PhoneCountryPurpose): string | null {
  try {
    const value = window.localStorage.getItem(STORAGE_PREFIX + purpose);
    return value && COUNTRY_PATTERN.test(value) ? value : null;
  } catch {
    return null;
  }
}

export function rememberPhoneCountry(purpose: PhoneCountryPurpose, country: string): void {
  if (!COUNTRY_PATTERN.test(country)) return;
  try {
    window.localStorage.setItem(STORAGE_PREFIX + purpose, country);
  } catch {
    // Private mode or blocked storage: nothing to remember.
  }
}
