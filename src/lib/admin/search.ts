import { parsePhoneNumberFromString, type CountryCode } from "libphonenumber-js";
import { siteConfig } from "@/config/site";

/**
 * Understands what staff typed into the user search (pure, client-safe):
 * a name, an email, a phone number in international (+995…, 00995…) or local form
 * (555 12 34 56, 052-123-4567), a user id, or a listing ID ("#1234", "ID 1234", "1234").
 * The server ORs every term that applies.
 */

export type UserSearchTerms = {
  /** Free text for name / business name / email (case-insensitive "contains"). */
  text: string | null;
  /** The query is an email address (exact match, case-insensitive). */
  email: string | null;
  /** E.164 candidates for an exact phone match. */
  phones: string[];
  /** At least 5 digits: "phone number contains" for partial numbers. */
  phoneDigits: string | null;
  /** A listing's public number (ID 1234). */
  listingPublicId: number | null;
  /** Could be a user id (Better Auth ids are 32 letters/digits; seeded ids may differ). */
  userId: string | null;
};

const EMPTY: UserSearchTerms = {
  text: null,
  email: null,
  phones: [],
  phoneDigits: null,
  listingPublicId: null,
  userId: null,
};

/** Countries tried for numbers typed without a country code: Georgia first, then Israel. */
const LOCAL_COUNTRIES: CountryCode[] = [siteConfig.phone.defaultCountry as CountryCode, "IL"];
const MAX_PUBLIC_ID = 2_147_483_647;

export function normalizePhoneCandidates(input: string): string[] {
  const raw = input.replace(/[\s().-]/g, "");
  if (!/^\+?\d{5,16}$/.test(raw) && !/^00\d{5,16}$/.test(raw)) return [];
  const international = raw.startsWith("+") ? raw : raw.startsWith("00") ? `+${raw.slice(2)}` : null;
  const out = new Set<string>();
  if (international) {
    const parsed = parsePhoneNumberFromString(international);
    out.add(parsed?.isPossible() ? parsed.number : international);
  } else {
    for (const country of LOCAL_COUNTRIES) {
      const parsed = parsePhoneNumberFromString(raw, country);
      if (parsed?.isPossible()) out.add(parsed.number);
    }
    // "995555123456" typed without the plus.
    const withPlus = parsePhoneNumberFromString(`+${raw}`);
    if (withPlus?.isValid()) out.add(withPlus.number);
  }
  return [...out];
}

export function parseUserSearch(input: string | null | undefined): UserSearchTerms {
  const query = (input ?? "").trim().slice(0, 120);
  if (!query) return EMPTY;

  const listingMatch = /^(?:#|id[\s:#-]*|listing[\s:#-]*)(\d{1,10})$/i.exec(query);
  if (listingMatch) {
    const id = Number(listingMatch[1]);
    return { ...EMPTY, listingPublicId: id >= 1 && id <= MAX_PUBLIC_ID ? id : null };
  }

  if (/^[^\s@]+@[^\s@]+$/.test(query)) {
    return { ...EMPTY, email: query.toLowerCase(), text: query };
  }

  const digits = query.replace(/\D/g, "");
  if (/^[+\d\s().-]+$/.test(query) && digits.length > 0) {
    const terms: UserSearchTerms = { ...EMPTY };
    terms.phones = normalizePhoneCandidates(query);
    terms.phoneDigits = digits.length >= 5 ? digits : null;
    // Short plain numbers are listing IDs too ("1234").
    if (/^\d{1,7}$/.test(query)) {
      const id = Number(query);
      terms.listingPublicId = id >= 1 ? id : null;
    }
    return terms;
  }

  return {
    ...EMPTY,
    text: query,
    userId: /^[A-Za-z0-9_-]{8,64}$/.test(query) ? query : null,
  };
}

/** True when nothing was typed. */
export function isEmptySearch(terms: UserSearchTerms): boolean {
  return (
    !terms.text && !terms.email && terms.phones.length === 0 && !terms.phoneDigits && !terms.listingPublicId && !terms.userId
  );
}
