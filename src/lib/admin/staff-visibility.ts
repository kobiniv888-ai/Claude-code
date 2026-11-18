import { can } from "@/lib/auth/permissions";

/**
 * What a staff member may see about other people (founder's decision Q12, SECURITY_REPORT
 * 4.3.a/d; pure). Two things are ADMIN only:
 *
 * - who sent a report (`reports.reporter`): the reporter's name and account, the reports a user
 *   sent (their user page), and the sender of every other report on a report page;
 * - phone numbers (`bookings.guest_phone`): a guest's phone on a booking, an account's phone (it is
 *   the guest phone of its bookings) and the phone numbers a listing gives guests, and searching
 *   by any of them. Founder's answer (c), 8 November 2026: where SUPPORT or MODERATOR need to
 *   match a person they get the LAST 2 DIGITS only (`staffPhone`, shown "••• ••• ••45"), never
 *   the number.
 *
 * Who sent a turned-away report also follows from its booking (the reporter is that booking's
 * guest), so for other staff the booking's code and id are left out of the report, and the guest
 * of a booking with a turned-away report is withheld wherever the booking is listed
 * (`guestWithheldFor`, src/lib/admin/server/bookings.ts, users.ts, flags.ts, guest-flags.ts).
 *
 * Moderators and support keep everything else. The admin queries read these values only for a
 * viewer who may see them (src/lib/admin/server/reports.ts, bookings.ts, users.ts, moderation.ts,
 * verifications.ts, tickets.ts), so they never reach the page, its data or the browser for anyone
 * else; hiding them in the page is not the rule.
 */

export type StaffViewer = { id: string; role: string };

export function canSeeReporter(viewer: Pick<StaffViewer, "role">): boolean {
  return can(viewer.role, "reports.reporter");
}

export function canSeeGuestPhone(viewer: Pick<StaffViewer, "role">): boolean {
  return can(viewer.role, "bookings.guest_phone");
}

/** Phone numbers (any account's, a guest's, a listing's contact numbers): ADMIN only (Q12, (c)). */
export function canSeePhone(viewer: Pick<StaffViewer, "role">): boolean {
  return canSeeGuestPhone(viewer);
}

/** The last two digits of a phone number (null without two digits). */
export function phoneLast2(phone: string | null | undefined): string | null {
  const digits = (phone ?? "").replace(/\D/g, "");
  return digits.length >= 2 ? digits.slice(-2) : null;
}

/** "••• ••• ••45": all that staff other than an ADMIN see of a phone number (founder's answer (c)). */
export function maskPhoneLast2(phone: string | null | undefined): string | null {
  const last = phoneLast2(phone);
  return last ? `\u2022\u2022\u2022 \u2022\u2022\u2022 \u2022\u2022${last}` : null;
}

/** A phone number as one viewer may see it: the number for an ADMIN, the masked last 2 digits otherwise. */
export type StaffPhone = {
  /** The full number: ADMIN only, null for everyone else. */
  phoneNumber: string | null;
  /** "••• ••• ••45", for a viewer who may not see the number (null for an ADMIN or without a number). */
  phoneMasked: string | null;
  /** There is a number the viewer may not see. */
  phoneWithheld: boolean;
};

export function staffPhone(viewer: Pick<StaffViewer, "role">, phone: string | null | undefined): StaffPhone {
  const value = phone?.trim() || null;
  if (!value) return { phoneNumber: null, phoneMasked: null, phoneWithheld: false };
  if (canSeePhone(viewer)) return { phoneNumber: value, phoneMasked: null, phoneWithheld: false };
  return { phoneNumber: null, phoneMasked: maskPhoneLast2(value), phoneWithheld: true };
}

/** Listing contact channels whose value is a phone number (Telegram too when the value is a number). */
const PHONE_CHANNELS = new Set(["WHATSAPP", "VIBER", "PHONE", "SMS"]);

/** A value that is a phone number rather than a user name or an email (digits, spaces, + ( ) - . only). */
export function looksLikePhone(value: string): boolean {
  return /^\+?[\d\s().-]{6,}$/.test(value.trim()) && phoneLast2(value) !== null;
}

/** A listing's contact value as one viewer may see it (phone numbers masked for other staff). */
export function staffContactValue(
  viewer: Pick<StaffViewer, "role">,
  channel: string,
  value: string,
): { value: string; withheld: boolean } {
  if (canSeePhone(viewer) || !(PHONE_CHANNELS.has(channel) || looksLikePhone(value))) return { value, withheld: false };
  return { value: maskPhoneLast2(value) ?? "\u2022\u2022\u2022", withheld: true };
}

/**
 * The guest of a booking with a turned-away report is that report's sender: withheld from staff
 * who may not see who sent a report (Q12, 4.3.d). True when the viewer may NOT see that guest.
 */
export function guestWithheldFor(viewer: Pick<StaffViewer, "role">, hasTurnedAwayReport: boolean): boolean {
  return hasTurnedAwayReport && !canSeeReporter(viewer);
}
