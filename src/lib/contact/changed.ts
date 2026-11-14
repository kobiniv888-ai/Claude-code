/**
 * "פרטי הקשר של המארח שונו לאחרונה" (SECURITY_REPORT 14.3.c, the checklist's 14.3): after a host
 * changes the contact details of a live listing (Listing.contactChangedAt, written with a fresh
 * code: src/lib/wizard/actions.ts), every guest with an upcoming booking of it sees the notice on
 * the trip page for CONTACT_CHANGED_NOTICE_DAYS days, with the reminder never to pay by link, and
 * gets one email (./changed-server.ts). Pure, unit-tested.
 */

/** How long the trip page shows the notice after the change. */
export const CONTACT_CHANGED_NOTICE_DAYS = 7;

const DAY_MS = 24 * 3600 * 1000;

/** Booking statuses that are still to come (or under way). */
const UPCOMING_STATUSES = new Set(["CONFIRMED"]);

/** True when the trip page shows the notice for this booking at `now`. */
export function showContactChangedNotice(input: {
  contactChangedAt: Date | null;
  status: string;
  /** "YYYY-MM-DD" (Georgia): the notice stops once the stay is over. */
  checkOut: string;
  /** Today in Georgia, "YYYY-MM-DD". */
  today: string;
  now: Date;
}): boolean {
  if (!input.contactChangedAt || !UPCOMING_STATUSES.has(input.status)) return false;
  if (input.checkOut < input.today) return false;
  const age = input.now.getTime() - input.contactChangedAt.getTime();
  return age >= 0 && age <= CONTACT_CHANGED_NOTICE_DAYS * DAY_MS;
}

/** The bookings that get the email: upcoming (not over, not cancelled) at the time of the change. */
export function isUpcomingForNotice(booking: { status: string; checkOut: string }, today: string): boolean {
  return UPCOMING_STATUSES.has(booking.status) && booking.checkOut >= today;
}
