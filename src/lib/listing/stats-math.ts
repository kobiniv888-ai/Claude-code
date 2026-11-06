/**
 * The numbers of a listing's stats (round 3, brief 6.2): periods, booked nights and occupancy.
 * Pure and client-safe (no server imports), so every rule is unit-tested.
 *
 * - Periods are the last N Georgian calendar days, today included (src/lib/booking/dates.ts).
 * - Bookings and booked nights come from Booking rows that stand: CONFIRMED or COMPLETED.
 *   Cancelled bookings and no-shows never count.
 * - "Bookings" in a period = bookings MADE on those days. "Booked nights" = the nights of those
 *   days that guests booked (a stay counts for every night it has inside the period, whenever
 *   it was booked). Hotels count room-nights: 2 rooms for 3 nights = 6.
 * - Occupancy (short stays and hotels only) = booked nights / nights offered:
 *     short stay: nights offered = the days of the period (one place);
 *     hotel:      rooms offered × days, rooms offered = the room types' "כמה חדרים כאלה להציע"
 *                 (RoomType.quantity), and the same per room type.
 *   Never above 100%; null when nothing was offered.
 */
import { addDays, daysBetween } from "@/lib/booking/dates";

export const BOOKED_STATUSES = ["CONFIRMED", "COMPLETED"] as const;

/** The periods the stats page offers (brief 6.2: the last 7 and 30 days). */
export const STATS_RANGES = [7, 30] as const;
export type StatsRange = (typeof STATS_RANGES)[number];
export const DEFAULT_STATS_RANGE: StatsRange = 30;
/** The small numbers on each card in "הנכסים שלי". */
export const CARD_STATS_DAYS: StatsRange = 30;

/** "?days=7" → 7; anything else → 30. */
export function parseStatsRange(value: unknown): StatsRange {
  const raw = Array.isArray(value) ? value[0] : value;
  const n = Number(raw);
  return (STATS_RANGES as readonly number[]).includes(n) ? (n as StatsRange) : DEFAULT_STATS_RANGE;
}

/** Deal types guests book on Bayit: only these show bookings, booked nights and occupancy. */
export function isBookableDeal(dealType: string): boolean {
  return dealType === "SHORT_STAY" || dealType === "HOTEL_ROOM";
}

/** The days of the last `length` days up to `lastDay` (both included), oldest first. */
export function periodDays(lastDay: string, length: number): string[] {
  const span = Math.min(366, Math.max(1, Math.floor(length)));
  return Array.from({ length: span }, (_, i) => addDays(lastDay, i - span + 1));
}

export type StatsStay = {
  /** "YYYY-MM-DD", the first night. */
  checkIn: string;
  /** "YYYY-MM-DD", exclusive. */
  checkOut: string;
  /** Rooms held (1 for everything but hotels). */
  rooms: number;
  roomTypeId: string | null;
  /** The Georgian day the booking was made. */
  bookedOn: string;
};

/** Room-nights of a stay inside [first, last] (both days included). */
export function nightsInPeriod(stay: Pick<StatsStay, "checkIn" | "checkOut" | "rooms">, first: string, last: string): number {
  const start = stay.checkIn > first ? stay.checkIn : first;
  const endExclusive = stay.checkOut < addDays(last, 1) ? stay.checkOut : addDays(last, 1);
  const nights = Math.max(0, daysBetween(start, endExclusive));
  return nights * Math.max(1, Math.floor(stay.rooms || 1));
}

/** Per day: bookings made that day and room-nights booked for that night. */
export function bookingSeries(stays: readonly StatsStay[], days: readonly string[]): Map<string, { bookings: number; bookedNights: number }> {
  const series = new Map(days.map((day) => [day, { bookings: 0, bookedNights: 0 }]));
  for (const stay of stays) {
    const made = series.get(stay.bookedOn);
    if (made) made.bookings += 1;
    const rooms = Math.max(1, Math.floor(stay.rooms || 1));
    for (const day of days) {
      if (day >= stay.checkIn && day < stay.checkOut) series.get(day)!.bookedNights += rooms;
    }
  }
  return series;
}

/** booked / offered, between 0 and 1; null when nothing was offered. */
export function occupancyRate(bookedNights: number, offeredNights: number): number | null {
  if (!(offeredNights > 0)) return null;
  return Math.min(1, Math.max(0, bookedNights / offeredNights));
}

export type Occupancy = { bookedNights: number; offeredNights: number; rate: number | null };

/** A short stay: one place, offered every day of the period. */
export function stayOccupancy(stays: readonly StatsStay[], days: readonly string[]): Occupancy {
  if (days.length === 0) return { bookedNights: 0, offeredNights: 0, rate: null };
  const first = days[0];
  const last = days[days.length - 1];
  const bookedNights = stays.reduce((sum, stay) => sum + nightsInPeriod({ ...stay, rooms: 1 }, first, last), 0);
  return { bookedNights, offeredNights: days.length, rate: occupancyRate(bookedNights, days.length) };
}

export type StatsRoomType = { id: string; quantity: number; active: boolean };
export type RoomTypeOccupancy = Occupancy & { id: string; quantity: number };

/**
 * A hotel: per room type (active ones, plus inactive ones that had guests in the period) and in
 * all. Bookings without a room type (made before hotels were booked per room type) count as one
 * room in the total only.
 */
export function hotelOccupancy(
  stays: readonly StatsStay[],
  roomTypes: readonly StatsRoomType[],
  days: readonly string[],
): { total: Occupancy; byRoomType: RoomTypeOccupancy[] } {
  if (days.length === 0) return { total: { bookedNights: 0, offeredNights: 0, rate: null }, byRoomType: [] };
  const first = days[0];
  const last = days[days.length - 1];
  const booked = new Map<string | null, number>();
  for (const stay of stays) {
    const key = stay.roomTypeId && roomTypes.some((r) => r.id === stay.roomTypeId) ? stay.roomTypeId : null;
    booked.set(key, (booked.get(key) ?? 0) + nightsInPeriod(stay, first, last));
  }
  const byRoomType = roomTypes
    .filter((room) => room.active || (booked.get(room.id) ?? 0) > 0)
    .map((room) => {
      const quantity = Math.max(1, Math.floor(room.quantity || 1));
      const bookedNights = booked.get(room.id) ?? 0;
      const offeredNights = quantity * days.length;
      return { id: room.id, quantity, bookedNights, offeredNights, rate: occupancyRate(bookedNights, offeredNights) };
    });
  const bookedNights = [...booked.values()].reduce((a, b) => a + b, 0);
  const offeredNights = byRoomType.reduce((sum, room) => sum + room.offeredNights, 0);
  return { total: { bookedNights, offeredNights, rate: occupancyRate(bookedNights, offeredNights) }, byRoomType };
}

export type StatsTotals = { views: number; saves: number; contacts: number; bookings: number; bookedNights: number };

export function emptyTotals(): StatsTotals {
  return { views: 0, saves: 0, contacts: 0, bookings: 0, bookedNights: 0 };
}

export function addTotals(a: StatsTotals, b: Partial<StatsTotals>): StatsTotals {
  return {
    views: a.views + (b.views ?? 0),
    saves: a.saves + (b.saves ?? 0),
    contacts: a.contacts + (b.contacts ?? 0),
    bookings: a.bookings + (b.bookings ?? 0),
    bookedNights: a.bookedNights + (b.bookedNights ?? 0),
  };
}

/** Nothing happened: no weekly email for such a week (round 3, conservative). */
export function isQuietPeriod(totals: StatsTotals): boolean {
  return totals.views === 0 && totals.saves === 0 && totals.contacts === 0 && totals.bookings === 0 && totals.bookedNights === 0;
}

/** 0.4567 → 46 (whole percent, for "46%"). */
export function percent(rate: number): number {
  return Math.round(Math.min(1, Math.max(0, rate)) * 100);
}
