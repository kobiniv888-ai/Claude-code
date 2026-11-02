import "server-only";
import type { Prisma } from "@/generated/prisma/client";
import type { AvailabilitySource } from "@/generated/prisma/enums";
import { db } from "@/lib/db";
import { addDays, dateToDay, dayToDate, tbilisiToday } from "./dates";
import { clipRanges, type DayRange } from "./overlap";

/**
 * A listing's unavailable nights, from every source: the host's own blocks (OWNER), imported
 * calendars (ICAL) and bookings made on Bayit (BOOKING). AvailabilityBlock.endDate is exclusive.
 */

type Client = Prisma.TransactionClient | typeof db;

export type DateWindow = { from?: string; to?: string };

function window({ from, to }: DateWindow = {}): { from: string; to: string } {
  const start = from ?? tbilisiToday();
  return { from: start, to: to ?? addDays(start, 400) };
}

/** Merged unavailable ranges [start, end) inside the window (default: today + 400 days). */
export async function getUnavailableDates(listingId: string, range?: DateWindow, client: Client = db): Promise<DayRange[]> {
  const { from, to } = window(range);
  const blocks = await client.availabilityBlock.findMany({
    where: { listingId, startDate: { lt: dayToDate(to) }, endDate: { gt: dayToDate(from) } },
    select: { startDate: true, endDate: true },
    orderBy: { startDate: "asc" },
    take: 2000,
  });
  return clipRanges(
    blocks.map((b) => ({ start: dateToDay(b.startDate), end: dateToDay(b.endDate) })),
    from,
    to,
  );
}

export type CalendarBlock = DayRange & {
  id: string;
  source: AvailabilitySource;
  /** Source BOOKING: the booking's code (link it for the host). */
  bookingCode: string | null;
  /** Source ICAL: the calendar's host name ("airbnb.com"). */
  note: string | null;
};

/** Every block with its source, for the host's calendar page ("see bookings"). */
export async function getCalendarBlocks(listingId: string, range?: DateWindow): Promise<CalendarBlock[]> {
  const { from, to } = window(range);
  const blocks = await db.availabilityBlock.findMany({
    where: { listingId, startDate: { lt: dayToDate(to) }, endDate: { gt: dayToDate(from) } },
    select: { id: true, startDate: true, endDate: true, source: true, note: true, booking: { select: { code: true } } },
    orderBy: { startDate: "asc" },
    take: 2000,
  });
  return blocks.map((b) => ({
    id: b.id,
    start: dateToDay(b.startDate),
    end: dateToDay(b.endDate),
    source: b.source,
    bookingCode: b.booking?.code ?? null,
    note: b.source === "ICAL" ? b.note : null,
  }));
}

/** The first block sharing a night with [checkIn, checkOut), or null when every night is free. */
export async function findBlockingRange(
  listingId: string,
  checkIn: string,
  checkOut: string,
  client: Client = db,
): Promise<{ id: string; source: AvailabilitySource } | null> {
  return client.availabilityBlock.findFirst({
    where: { listingId, startDate: { lt: dayToDate(checkOut) }, endDate: { gt: dayToDate(checkIn) } },
    select: { id: true, source: true },
  });
}

export async function isRangeFree(listingId: string, checkIn: string, checkOut: string, client: Client = db): Promise<boolean> {
  return checkIn < checkOut && (await findBlockingRange(listingId, checkIn, checkOut, client)) === null;
}
