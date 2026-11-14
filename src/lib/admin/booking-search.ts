import { normalizeBookingCode } from "@/lib/booking/code";
import { stripInvisible } from "@/lib/phone";
import { parseUserSearch, type UserSearchTerms } from "./search";

/**
 * Admin → Bookings search (pure, client-safe). One box understands a booking code ("BT-7K3Q9",
 * "7k3q9"), a listing number ("#1234", "ID 1234", "1234"), and the guest or host by name, email
 * or phone. The server ORs every reading that applies ("SARAH" is both a possible code and a name).
 */

export const ADMIN_BOOKING_STATUSES = ["CONFIRMED", "COMPLETED", "CANCELLED_BY_GUEST", "CANCELLED_BY_HOST", "NO_SHOW"] as const;
export type AdminBookingStatus = (typeof ADMIN_BOOKING_STATUSES)[number];

export type BookingSearchTerms = {
  /** "BT-XXXXX" when the text can be a booking code. */
  code: string | null;
  /** The same parse as the user search (name, email, phones, listing number). */
  people: UserSearchTerms;
};

export function parseBookingSearch(input: string | null | undefined): BookingSearchTerms {
  // A code or number pasted from RTL text often carries an invisible direction mark.
  const query = stripInvisible(input ?? "").trim().slice(0, 120);
  return { code: query ? normalizeBookingCode(query) : null, people: parseUserSearch(query) };
}

/** "2026-11-01" → the same day as a Date at 00:00 UTC (booking days are @db.Date). Null when invalid. */
export function parseDay(value: string | null | undefined): Date | null {
  const raw = (value ?? "").trim();
  if (!/^\d{4}-\d{2}-\d{2}$/.test(raw)) return null;
  const date = new Date(`${raw}T00:00:00.000Z`);
  return Number.isNaN(date.getTime()) || date.toISOString().slice(0, 10) !== raw ? null : date;
}

/**
 * The stay-dates filter: bookings whose nights touch [from, to] (both days included). Either end
 * may be missing. Returns null when the range is empty (to before from).
 */
export function stayOverlap(from: Date | null, to: Date | null): { checkInBefore: Date | null; checkOutAfter: Date | null } | null {
  if (from && to && to < from) return null;
  const dayAfterTo = to ? new Date(to.getTime() + 24 * 3600 * 1000) : null;
  return { checkInBefore: dayAfterTo, checkOutAfter: from };
}
