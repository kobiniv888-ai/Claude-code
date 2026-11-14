import "server-only";
import type { AppLocale, CurrencyCode } from "@/config/site";
import type { BookingMode, BookingStatus, DealType, ListingStatus } from "@/generated/prisma/enums";
import { groupHolidayPeriods, isPeakHoliday, type CalendarHoliday, type HolidayPeriod } from "@/components/host-calendar/model";
import { pickLocalized } from "@/i18n/locale";
import { newIcalToken } from "@/lib/listing/ical-token";
import { db } from "@/lib/db";
import { getHolidaysInRange, holidayName } from "@/lib/hebcal";
import { icalExportUrl } from "@/lib/ical";
import type { DayRange } from "@/lib/wizard/types";
import { getCalendarBlocks } from "./availability";
import { hostBookingPath, isBookableDealType, usesRoomInventory } from "./constants";
import type { HostDatePrice } from "./date-prices";
import { listHostDatePrices } from "./date-prices-server";
import { addDays, tbilisiToday } from "./dates";
import { getHostBookings } from "./queries";
import { roomQuantity } from "./room-availability";
import { daysToRoomRanges, roomRangesToDays, type RoomBlockRange } from "./room-blocks";
import { toNumber } from "./terms";

/**
 * Everything the host's calendar page shows for one listing (/account/listings/<id>/calendar):
 * the host's own blocked days, Bayit bookings (with their codes and guest names), nights imported
 * from Airbnb / Booking.com, and the iCal links. Only for the listing's owner.
 *
 * Round 3 (brief 6.3): the listing's holiday prices ("מחיר לתאריכים") and the Jewish holidays of the
 * 13 months shown (Israel schedule, from @hebcal/core), when demand from Israel peaks.
 *
 * Hotels (round 3, founder's answer 3): the main calendar holds the whole-hotel blocks (a block
 * without a room type closes every room); `rooms` gives each room type its own calendar — the
 * rooms booked, the rooms the host closed, the nights imported from other sites (one room each),
 * and its own iCal links (the export token is made here the first time the host opens the page).
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
  /** Hotels: the room type's name and the rooms this booking holds. */
  roomTypeName: string | null;
  rooms: number;
};

/** One hotel room type's calendar (round 3). */
export type HostRoomCalendar = {
  id: string;
  /** In the viewer's language when translated (host-written: dir="auto"). */
  name: string;
  /** "כמה חדרים כאלה להציע בבית". */
  quantity: number;
  active: boolean;
  /** Its prices, for "מחיר לתאריכים" of this room type. */
  currency: CurrencyCode;
  nightlyPrice: number | null;
  weekendPrice: number | null;
  exportUrl: string;
  importUrls: string[];
  syncedAt: string | null;
  /** The rooms the host closed, from today on (inclusive days). */
  owner: RoomBlockRange[];
  /** Bayit bookings of this room type (end exclusive) and their rooms. */
  booked: { start: string; end: string; code: string; rooms: number }[];
  /** Imported nights (end exclusive), one room each, with the calendar's host name. */
  imported: { start: string; end: string; source: string }[];
  importedNights: Record<string, number>;
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
  /** Holiday prices from today on (end exclusive). Empty for listings that are not booked on the site. */
  datePrices: HostDatePrice[];
  /** The prices a holiday price replaces (shown in its form); null for listings that are not booked here. */
  pricing: { currency: CurrencyCode; nightlyPrice: number | null; weekendPrice: number | null } | null;
  /**
   * Hotels: each room type's calendar (all of them, switched off ones too). Empty for other
   * listings. The main calendar's owner/booked/imported are then the whole hotel's own blocks.
   */
  rooms: HostRoomCalendar[];
  /** Hotels: nights the whole hotel is closed (its own blocks and imports, end exclusive). */
  closed: { start: string; end: string }[];
  /** Jewish holidays (and their eves) when Israelis travel most, day by day, in the months shown. */
  holidays: CalendarHoliday[];
  /** The same holidays as periods ("פסח" from its eve to its last day), to select them in one tap. */
  holidayPeriods: HolidayPeriod[];
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
      currency: true,
      price: true,
      pricePeriod: true,
      weekendPrice: true,
      translations: { where: { locale }, select: { title: true } },
      roomTypes: {
        orderBy: [{ sortOrder: "asc" }, { createdAt: "asc" }],
        select: {
          id: true,
          names: true,
          quantity: true,
          active: true,
          currency: true,
          price: true,
          pricePeriod: true,
          weekendPrice: true,
          icalToken: true,
          icalImportUrls: true,
          icalSyncedAt: true,
        },
      },
    },
  });
  if (!listing) return null;
  const hotel = usesRoomInventory(listing.dealType);
  // Each room type's own export link (made once, the first time the host opens the calendar).
  const roomTypes = hotel
    ? await Promise.all(
        listing.roomTypes.map(async (room) => {
          if (room.icalToken) return { ...room, icalToken: room.icalToken };
          const token = newIcalToken();
          const { count } = await db.roomType.updateMany({ where: { id: room.id, icalToken: null }, data: { icalToken: token } });
          if (count === 1) return { ...room, icalToken: token };
          const saved = await db.roomType.findUnique({ where: { id: room.id }, select: { icalToken: true } });
          return { ...room, icalToken: saved?.icalToken ?? token };
        }),
      )
    : [];

  const today = tbilisiToday();
  const from = `${today.slice(0, 7)}-01`;
  const to = addDays(from, HOST_CALENDAR_MONTHS * 31 + 7);
  const priced = isBookableDealType(listing.dealType);
  const [blocks, bookings, datePrices, holidays] = await Promise.all([
    getCalendarBlocks(listing.id, { from, to }),
    getHostBookings(userId, locale, { listingId: listing.id, scope: "all" }),
    priced ? listHostDatePrices(listing.id, locale, { today }) : Promise.resolve([]),
    peakHolidays(from, to, locale),
  ]);

  const owner: DayRange[] = [];
  const booked: HostCalendarData["booked"] = [];
  const imported: HostCalendarData["imported"] = [];
  const importedNights: Record<string, number> = {};
  const closed: HostCalendarData["closed"] = [];
  const perRoom = new Map(
    roomTypes.map((room) => [
      room.id,
      { owner: new Map<string, number>(), booked: [] as HostRoomCalendar["booked"], imported: [] as HostRoomCalendar["imported"], importedNights: {} as Record<string, number> },
    ]),
  );
  const futureNights = (start: string, end: string) => {
    if (end <= today) return 0;
    const from = start > today ? start : today;
    return Math.max(0, Math.round((Date.parse(end) - Date.parse(from)) / 86_400_000));
  };
  for (const block of blocks) {
    const room = block.roomTypeId ? perRoom.get(block.roomTypeId) : undefined;
    if (block.roomTypeId) {
      // A hotel room type's own nights (round 3).
      if (!room) continue;
      if (block.source === "BOOKING" && block.bookingCode) {
        room.booked.push({ start: block.start, end: block.end, code: block.bookingCode, rooms: block.rooms ?? 1 });
      } else if (block.source === "ICAL") {
        const source = block.note || "ical";
        room.imported.push({ start: block.start, end: block.end, source });
        room.importedNights[source] = (room.importedNights[source] ?? 0) + futureNights(block.start, block.end);
      } else if (block.source === "OWNER" && block.end > today) {
        const days = roomRangesToDays([{ start: block.start > today ? block.start : today, end: addDays(block.end, -1), rooms: block.rooms ?? 1 }]);
        for (const [day, rooms] of days) room.owner.set(day, (room.owner.get(day) ?? 0) + rooms);
      }
      continue;
    }
    if (hotel && block.source !== "BOOKING") closed.push({ start: block.start, end: block.end });
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
      roomTypeName: b.roomTypeName,
      rooms: b.rooms,
    };
  }
  const rooms: HostRoomCalendar[] = roomTypes.map((room) => {
    const data = perRoom.get(room.id)!;
    const quantity = roomQuantity(room);
    return {
      id: room.id,
      name: pickLocalized(room.names, locale) || "",
      quantity,
      active: room.active,
      currency: room.currency,
      nightlyPrice: room.pricePeriod === "NIGHT" ? toNumber(room.price) : null,
      weekendPrice: toNumber(room.weekendPrice),
      exportUrl: icalExportUrl(room.icalToken),
      importUrls: room.icalImportUrls,
      syncedAt: room.icalSyncedAt?.toISOString() ?? null,
      owner: daysToRoomRanges(new Map([...data.owner].map(([day, n]) => [day, Math.min(quantity, n)]))),
      booked: data.booked,
      imported: data.imported,
      importedNights: data.importedNights,
    };
  });

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
    datePrices,
    pricing: priced
      ? {
          currency: listing.currency,
          nightlyPrice: listing.pricePeriod === "NIGHT" ? toNumber(listing.price) : null,
          weekendPrice: toNumber(listing.weekendPrice),
        }
      : null,
    rooms,
    closed,
    holidays: holidays.days,
    holidayPeriods: holidays.periods,
  };
}

/**
 * The Jewish holidays Israelis travel on (Rosh Hashana, Yom Kippur, Sukkot, Pesach, Shavuot with
 * their eves and Chol HaMoed, Chanukah, Purim), on the Israel schedule, between two days. A
 * failure of the holiday calendar never breaks the host's calendar (it then shows none).
 */
async function peakHolidays(from: string, to: string, locale: AppLocale): Promise<{ days: CalendarHoliday[]; periods: HolidayPeriod[] }> {
  try {
    const list = (await getHolidaysInRange(from, to, locale, { il: true })).filter((h) => isPeakHoliday(h.key));
    const days: CalendarHoliday[] = list.map((h) => ({ date: h.date, key: h.key, name: h.name }));
    const names = new Map<string, string>();
    for (const key of new Set(days.map((d) => d.key))) names.set(key, await holidayName(key, locale));
    return { days, periods: groupHolidayPeriods(days, (key) => names.get(key) ?? key) };
  } catch (error) {
    console.error("[host-calendar] holidays failed:", error);
    return { days: [], periods: [] };
  }
}
