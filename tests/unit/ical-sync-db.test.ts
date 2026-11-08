/**
 * The hourly iCal import against the local database (DATABASE_URL in .env), with the downloads
 * stubbed (no network): the rows one sync writes for a hotel room type.
 *
 * - ical-1: a hotel that connects 3 Booking.com calendars to one room type has 3 feeds on the same
 *   host. While one of them fails, the other two must still be replaced, never kept and inserted
 *   again (each copy took another room), and the failed one's rows are kept until it recovers.
 * - ical-2: two syncs of the same room type at once (the cron, "save", "sync now") leave each
 *   event once; the same calendar pasted twice in two URL forms counts once.
 *
 * Creates its own user and DRAFT hotel with a unique prefix and removes them afterwards.
 */
import "dotenv/config";
import { EventEmitter } from "node:events";
import https from "node:https";
import { Readable } from "node:stream";
import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

const { db } = await import("@/lib/db");
const { syncListingCalendars } = await import("@/lib/ical");
const { getRoomBlocks } = await import("@/lib/booking/availability");
const { freeRoomsForStay } = await import("@/lib/booking/room-availability");
const { addDays, tbilisiToday } = await import("@/lib/booking/dates");

const prefix = `icsync${randomUUID().replace(/-/g, "").slice(0, 10)}`;
const today = tbilisiToday();
const day = (n: number) => addDays(today, n);
const ids = { user: `${prefix}-host`, listing: "", room: "" };

type Event = { uid?: string; start: string; end: string; summary?: string };
const ics = (events: readonly Event[]) =>
  [
    "BEGIN:VCALENDAR",
    "VERSION:2.0",
    "PRODID:-//test//EN",
    ...events.flatMap((e) => [
      "BEGIN:VEVENT",
      ...(e.uid ? [`UID:${e.uid}`] : []),
      `DTSTART;VALUE=DATE:${e.start.replace(/-/g, "")}`,
      `DTEND;VALUE=DATE:${e.end.replace(/-/g, "")}`,
      `SUMMARY:${e.summary ?? "CLOSED - Not available"}`,
      "END:VEVENT",
    ]),
    "END:VCALENDAR",
  ].join("\r\n");

/** What each feed path answers (a body, or an HTTP status), and a delay per request. */
const feeds = new Map<string, () => { status: number; body?: string }>();
const delays: number[] = [];

beforeAll(async () => {
  vi.spyOn(https, "get").mockImplementation(((url: URL, _options: unknown, callback: (response: unknown) => void) => {
    const request = new EventEmitter();
    const wait = delays.shift() ?? 0;
    setTimeout(() => {
      const answer = feeds.get(`${url.pathname}${url.search}`)?.() ?? { status: 404 };
      const response = Readable.from(answer.body ? [Buffer.from(answer.body)] : []) as Readable & { statusCode: number; headers: Record<string, string> };
      response.statusCode = answer.status;
      response.headers = {};
      callback(response);
    }, wait);
    return request;
  }) as unknown as typeof https.get);

  const digits = `${Date.now() % 10_000_000}`.padStart(7, "0");
  await db.user.create({
    data: { id: ids.user, name: "Host", firstName: "Host", email: `${ids.user}@example.com`, phoneNumber: `+99559${digits}`, phoneNumberVerified: true, locale: "en" },
  });
  const listing = await db.listing.create({ data: { ownerId: ids.user, dealType: "HOTEL_ROOM", status: "DRAFT", title: "iCal sync test hotel", currency: "GEL" } });
  ids.listing = listing.id;
  const room = await db.roomType.create({ data: { listingId: listing.id, names: { en: "Double" }, price: 100, currency: "GEL", pricePeriod: "NIGHT", quantity: 3 } });
  ids.room = room.id;
});

afterAll(async () => {
  vi.restoreAllMocks();
  if (ids.listing) await db.listing.delete({ where: { id: ids.listing } });
  await db.user.deleteMany({ where: { id: ids.user } });
});

async function setUrls(urls: string[]) {
  await db.roomType.update({ where: { id: ids.room }, data: { icalImportUrls: urls } });
}

const importedRows = () => db.availabilityBlock.findMany({ where: { listingId: ids.listing, source: "ICAL", roomTypeId: ids.room }, orderBy: { startDate: "asc" } });

async function freeOn(night: string) {
  const blocks = await getRoomBlocks(ids.listing, { from: day(0), to: day(400) }, db, ids.room);
  return freeRoomsForStay({ id: ids.room, quantity: 3 }, blocks, night, addDays(night, 1));
}

describe("iCal import of a hotel room type", () => {
  it("keeps a failing feed's rows by feed, not by host: the other feeds of the same host are replaced, never copied again", async () => {
    let feed3Fails = false;
    let feed3Uid = "c1@booking";
    feeds.set("/hotel/1.ics", () => ({ status: 200, body: ics([{ uid: "a1@booking", start: day(60), end: day(62) }]) }));
    feeds.set("/hotel/2.ics", () => ({ status: 200, body: ics([{ uid: "b1@booking", start: day(60), end: day(61) }]) }));
    feeds.set("/hotel/3.ics", () => (feed3Fails ? { status: 404 } : { status: 200, body: ics([{ uid: feed3Uid, start: day(90), end: day(91) }]) }));
    await setUrls(["https://admin.booking.com/hotel/1.ics", "https://admin.booking.com/hotel/2.ics", "https://admin.booking.com/hotel/3.ics"]);

    await syncListingCalendars(ids.listing, ids.room);
    expect((await importedRows()).map((r) => r.icalUid)).toEqual(["a1@booking", "b1@booking", "c1@booking"]);
    expect(await freeOn(day(60))).toBe(1);

    feed3Fails = true;
    for (let sync = 2; sync <= 4; sync++) {
      const result = await syncListingCalendars(ids.listing, ids.room);
      expect(result.feeds.map((f) => f.error)).toEqual([null, null, "feed_missing"]);
      const rows = await importedRows();
      expect(rows).toHaveLength(3);
      expect(rows.map((r) => r.icalUid).sort()).toEqual(["a1@booking", "b1@booking", "c1@booking"]);
      expect(await freeOn(day(60))).toBe(1);
    }

    // The feed recovers with another event: its old row is replaced, not kept next to the new one.
    feed3Fails = false;
    feed3Uid = "c2@booking";
    await syncListingCalendars(ids.listing, ids.room);
    const rows = await importedRows();
    expect(rows.map((r) => r.icalUid).sort()).toEqual(["a1@booking", "b1@booking", "c2@booking"]);
    expect(rows.every((r) => r.note === "admin.booking.com")).toBe(true);
  });

  it("counts the same calendar pasted twice (two URL forms) once, but two rooms closed on the same dates without UIDs twice", async () => {
    feeds.clear();
    feeds.set("/room/1.ics", () => ({ status: 200, body: ics([{ uid: "same@airbnb", start: day(70), end: day(72) }]) }));
    feeds.set("/room/1.ics?s=1", () => ({ status: 200, body: ics([{ uid: "same@airbnb", start: day(70), end: day(72) }]) }));
    feeds.set("/plain/a.ics", () => ({ status: 200, body: ics([{ start: day(80), end: day(81) }]) }));
    feeds.set("/plain/b.ics", () => ({ status: 200, body: ics([{ start: day(80), end: day(81) }]) }));
    await setUrls(["https://www.airbnb.com/room/1.ics", "https://www.airbnb.com/room/1.ics?s=1", "https://calendar.google.com/plain/a.ics", "https://calendar.google.com/plain/b.ics"]);

    await syncListingCalendars(ids.listing, ids.room);
    const rows = await importedRows();
    expect(rows.filter((r) => r.icalUid === "same@airbnb")).toHaveLength(1);
    expect(await freeOn(day(70))).toBe(2);
    // No UID in the feed: each closed room still takes a room.
    expect(rows.filter((r) => r.startDate.toISOString().startsWith(day(80)))).toHaveLength(2);
    expect(await freeOn(day(80))).toBe(1);
  });

  it("two syncs of the same room type at once leave each event once", async () => {
    const N = 1500;
    const many = ics(Array.from({ length: N }, (_, i) => ({ uid: `e${i}@x`, start: day(10 + (i % 600)), end: day(11 + (i % 600)) })));
    feeds.clear();
    feeds.set("/many.ics", () => ({ status: 200, body: many }));
    await setUrls(["https://admin.booking.com/many.ics"]);
    for (const gap of [0, 10, 40]) {
      await syncListingCalendars(ids.listing, ids.room);
      delays.push(0, gap);
      await Promise.all([syncListingCalendars(ids.listing, ids.room), syncListingCalendars(ids.listing, ids.room)]);
      expect(await db.availabilityBlock.count({ where: { listingId: ids.listing, source: "ICAL", roomTypeId: ids.room } })).toBe(N);
    }
  }, 60_000);

  it("removes every imported row once the room type's links are all removed", async () => {
    await setUrls([]);
    await syncListingCalendars(ids.listing, ids.room);
    expect(await importedRows()).toHaveLength(0);
  });
});
