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

export function mayOfferPhoneCheck(place: PhoneCheckPlace, account: { isHost: boolean }): boolean {
  if (place === "booking" || place === "post") return true;
  return account.isHost;
}

/**
 * The phone row on the account pages: "verified" (shown read-only), "offer" (a host who has not
 * verified yet: link to the check), or null (a guest without a verified phone: no row at all).
 */
export function accountPhoneRow(account: { phoneVerified: boolean; isHost: boolean }): "verified" | "offer" | null {
  if (account.phoneVerified) return "verified";
  return mayOfferPhoneCheck("account", account) ? "offer" : null;
}
