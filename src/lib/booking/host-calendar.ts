import "server-only";
import type { AppLocale } from "@/config/site";
import type { BookingMode, BookingStatus, DealType, ListingStatus } from "@/generated/prisma/enums";
import { db } from "@/lib/db";
import { icalExportUrl } from "@/lib/ical";
import type { DayRange } from "@/lib/wizard/types";
import { getCalendarBlocks } from "./availability";
import { hostBookingPath, isBookableDealType } from "./constants";
import { addDays, tbilisiToday } from "./dates";
import { getHostBookings } from "./queries";

/**
 * Everything the host's calendar page shows for one listing (/account/listings/<id>/calendar):
 * the host's own blocked days, Bayit bookings (with their codes and guest names), nights imported
 * from Airbnb / Booking.com, and the iCal links. Only for the listing's owner.
 */

export type HostCalendarBooking = {
  code: string;
  guestName: string;
  checkIn: string;
  checkOut: string;
  nights: number;
  guests: number;
  infants: number;
  status: BookingStatus;
  path: string;
};

export type HostCalendarData = {
  listing: {
    id: string;
    publicId: number;
    /** In the viewer's language when translated; render with dir="auto". */
    title: string;
    status: ListingStatus;
    dealType: DealType;
    bookingMode: BookingMode;
    /** Short stays and hotel rooms: guests book on the site, and iCal sync applies. */
    bookable: boolean;
    exportUrl: string;
    importUrls: string[];
    /** ISO time of the last import sync, or null. */
    syncedAt: string | null;
  };
  today: string;
  /** The host's own blocks from today on (inclusive ranges). */
  owner: DayRange[];
  /** Bayit bookings (end exclusive). */
  booked: { start: string; end: string; code: string }[];
  /** Imported nights (end exclusive) with the calendar's host name. */
  imported: { start: string; end: string; source: string }[];
  bookings: Record<string, HostCalendarBooking>;
  /** Imported nights per calendar host name (shown next to each import link). */
  importedNights: Record<string, number>;
};

/** Months the page can show: the current month and the next 12. */
export const HOST_CALENDAR_MONTHS = 13;

export async function getHostCalendar(userId: string, listingId: string, locale: AppLocale): Promise<HostCalendarData | null> {
  if (typeof listingId !== "string" || listingId.length === 0 || listingId.length > 64) return null;
  const listing = await db.listing.findFirst({
    where: { id: listingId, ownerId: userId, deletedAt: null, status: { not: "DELETED" } },
    select: {
      id: true,
      publicId: true,
      title: true,
      status: true,
      dealType: true,
      bookingMode: true,
      icalToken: true,
      icalImportUrls: true,
      icalSyncedAt: true,
      translations: { where: { locale }, select: { title: true } },
    },
  });
  if (!listing) return null;

  const today = tbilisiToday();
  const from = `${today.slice(0, 7)}-01`;
  const to = addDays(from, HOST_CALENDAR_MONTHS * 31 + 7);
  const [blocks, bookings] = await Promise.all([
    getCalendarBlocks(listing.id, { from, to }),
    getHostBookings(userId, locale, { listingId: listing.id, scope: "all" }),
  ]);

  const owner: DayRange[] = [];
  const booked: HostCalendarData["booked"] = [];
  const imported: HostCalendarData["imported"] = [];
  const importedNights: Record<string, number> = {};
  for (const block of blocks) {
    if (block.source === "BOOKING" && block.bookingCode) {
      booked.push({ start: block.start, end: block.end, code: block.bookingCode });
    } else if (block.source === "ICAL") {
      const source = block.note || "ical";
      imported.push({ start: block.start, end: block.end, source });
      if (block.end > today) {
        const start = block.start > today ? block.start : today;
        const nights = Math.max(0, Math.round((Date.parse(block.end) - Date.parse(start)) / 86_400_000));
        importedNights[source] = (importedNights[source] ?? 0) + nights;
      }
    } else if (block.source === "OWNER" && block.end > today) {
      // Inclusive ranges from today on (the editor never changes the past).
      owner.push({ start: block.start > today ? block.start : today, end: addDays(block.end, -1) });
    }
  }

  const byCode: Record<string, HostCalendarBooking> = {};
  for (const b of bookings) {
    byCode[b.code] = {
      code: b.code,
      guestName: b.guestName,
      checkIn: b.checkIn,
      checkOut: b.checkOut,
      nights: b.nights,
      guests: b.adults + b.children,
      infants: b.infants,
      status: b.status,
      path: hostBookingPath(b.code),
    };
  }

  return {
    listing: {
      id: listing.id,
      publicId: listing.publicId,
      title: listing.translations[0]?.title?.trim() || listing.title,
      status: listing.status,
      dealType: listing.dealType,
      bookingMode: listing.bookingMode,
      bookable: isBookableDealType(listing.dealType),
      exportUrl: icalExportUrl(listing.icalToken),
      importUrls: listing.icalImportUrls,
      syncedAt: listing.icalSyncedAt?.toISOString() ?? null,
    },
    today,
    owner,
    booked,
    imported,
    bookings: byCode,
    importedNights,
  };
}
