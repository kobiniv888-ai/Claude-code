/**
 * Where the paid SMS phone check may be offered (pure, client-safe). The founder allowed exactly
 * two places (round 3 brief, section 1): a guest making a booking (the booking review) and a host
 * verifying their phone (the post form, or a host's account pages). Everywhere else the phone is
 * shown only once it is verified, read-only, so a guest never pays an SMS just by browsing their
 * account.
 */

export type PhoneCheckPlace =
  /** The booking review ("אישור הזמנה"): the guest verifies before the booking is sent. */
  | "booking"
  /** The post form and /verify-phone from it: a host before publishing. */
  | "post"
  /** The account overview and the verification page. */
  | "account";

/** A host: has at least one listing that is not deleted (drafts count: they are in the post form). */
export function isHostAccount(listingCount: number): boolean {
  return Number.isFinite(listingCount) && listingCount > 0;
}

export const PHONE_CHECK_PLACES = ["booking", "post", "account"] as const satisfies readonly PhoneCheckPlace[];

export function mayOfferPhoneCheck(place: PhoneCheckPlace, account: { isHost: boolean }): boolean {
  if (place === "booking" || place === "post") return true;
  return account.isHost;
}

/**
 * The SERVER's rule before it sends a paid SMS (SECURITY_REPORT 3.2.f): the place the request
 * says it comes from, checked against what the server knows.
 * - "booking": a listing that can be booked on the site right now, not the account's own.
 * - "post": an account that is really starting a listing: it has one (a draft counts), or it
 *   opened the post form's phone step (`postStep`: a signed, short-lived token from /verify-phone,
 *   ./phone-check-token.ts). The post form asks for the phone before the first draft exists; such
 *   an account without any listing gets its own tight daily limit (./phone-check-actions.ts).
 * - "account": a host (at least one listing).
 */
export function phoneCheckAllowedAt(
  place: PhoneCheckPlace,
  facts: { isHost: boolean; bookableListing: { ownListing: boolean } | null; postStep?: boolean },
): boolean {
  if (place === "booking") return !!facts.bookableListing && !facts.bookableListing.ownListing;
  if (place === "post") return facts.isHost || facts.postStep === true;
  return facts.isHost;
}

/** A "next" address of the post form ("/post", "/post/<id>…", or a listing's edit page). */
export function isPostFormPath(next: string | null | undefined): boolean {
  return /^\/(post|account\/listings\/[^/?#]+\/edit)(?:[/?#]|$)/.test(next ?? "");
}

/**
 * The phone row on the account pages: "verified" (shown read-only), "offer" (a host who has not
 * verified yet: link to the check), or null (a guest without a verified phone: no row at all).
 */
export function accountPhoneRow(account: { phoneVerified: boolean; isHost: boolean }): "verified" | "offer" | null {
  if (account.phoneVerified) return "verified";
  return mayOfferPhoneCheck("account", account) ? "offer" : null;
}

// ── A phone-check code belongs to the session that asked for it (SECURITY_REPORT 3.6.a, 3.5.e) ──

/** The Verification row that ties a sent phone-check code to one session (./phone-check-actions.ts). */
export const phoneCheckBindingKey = (sessionId: string, e164: string) => `phone-check:${sessionId}:${e164}`;

/** "first": the account had no verified number; "replace": a verified number, fresh proof given at send time. */
export type PhoneCheckBinding = { userId: string; mode: "first" | "replace" };

export function encodePhoneCheckBinding(binding: PhoneCheckBinding): string {
  return `${binding.mode}:${binding.userId}`;
}

export function decodePhoneCheckBinding(value: string | null | undefined): PhoneCheckBinding | null {
  const match = /^(first|replace):(.+)$/.exec(value ?? "");
  return match ? { mode: match[1] as PhoneCheckBinding["mode"], userId: match[2]! } : null;
}
