/**
 * Host stats against the local database (DATABASE_URL in .env): counting (each visitor once a day;
 * never the host, staff, bots, prefetches or demo listings) and reading (bookings, booked nights,
 * occupancy, hotels per room type). Creates its own users, city and listings with a unique prefix
 * and removes them afterwards.
 */
import "dotenv/config";
import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));
const request = vi.hoisted(() => ({
  ip: "203.0.113.10" as string | null,
  userAgent: "Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 Version/18.0 Mobile/15E148 Safari/604.1",
  device: null as string | null,
  headers: {} as Record<string, string>,
}));
vi.mock("next/headers", () => ({ headers: async () => new Headers(request.headers) }));
vi.mock("@/lib/request", () => ({
  getClientIp: async () => request.ip,
  getUserAgent: async () => request.userAgent,
  getDeviceHash: async () => request.device,
  getIpHash: async () => (request.ip ? `ip-${request.ip}` : null),
}));

const { db } = await import("@/lib/db");
const stats = await import("./stats");
const { tbilisiToday, addDays, dayToDate } = await import("@/lib/booking/dates");

const prefix = `st${randomUUID().replace(/-/g, "").slice(0, 10)}`;
const ids = { city: "", users: [] as string[], listings: [] as string[] };
const BROWSER = request.userAgent;

async function createUser(name: string, role: "USER" | "MODERATOR" | "EDITOR" = "USER") {
  const id = `${prefix}${name}`;
  await db.user.create({
    data: {
      id,
      name: `Test ${name}`,
      email: `${id}@example.com`,
      phoneNumber: `+99559${String(Math.floor(Math.random() * 1e7)).padStart(7, "0")}`,
      phoneNumberVerified: true,
      locale: "en",
      role,
    },
  });
  ids.users.push(id);
  return id;
}

async function createListing(ownerId: string, opts: { status?: "LIVE" | "PAUSED"; isDemo?: boolean; dealType?: "SHORT_STAY" | "HOTEL_ROOM" | "MONTHLY_RENT" } = {}) {
  const listing = await db.listing.create({
    data: {
      ownerId,
      status: opts.status ?? "LIVE",
      isDemo: opts.isDemo ?? false,
      dealType: opts.dealType ?? "SHORT_STAY",
      propertyType: opts.dealType === "HOTEL_ROOM" ? "HOTEL" : "APARTMENT",
      pricePeriod: opts.dealType === "MONTHLY_RENT" ? "MONTH" : "NIGHT",
      cityId: ids.city,
      lat: 41.7,
      lng: 44.8,
      originalLocale: "en",
      title: `${prefix} stats listing`,
      description: "A test listing for the stats tests.",
      price: 50,
      currency: "GEL",
      contactMethods: [{ channel: "WHATSAPP", value: "+995555000111", order: 0 }],
    },
  });
  ids.listings.push(listing.id);
  return listing;
}

let bookingSeq = 0;
async function createBooking(listingId: string, hostUserId: string, guestUserId: string, checkIn: string, checkOut: string, extra: Partial<{ status: "CONFIRMED" | "COMPLETED" | "CANCELLED_BY_GUEST" | "NO_SHOW"; rooms: number; roomTypeId: string; createdAt: Date }> = {}) {
  bookingSeq += 1;
  const nights = Math.round((Date.parse(checkOut) - Date.parse(checkIn)) / 86_400_000);
  return db.booking.create({
    data: {
      code: `ST-${prefix.slice(2, 7).toUpperCase()}${bookingSeq}`,
      listingId,
      hostUserId,
      guestUserId,
      checkIn: dayToDate(checkIn),
      checkOut: dayToDate(checkOut),
      nights,
      adults: 2,
      nightlyPrice: 50,
      subtotal: 50 * nights,
      total: 50 * nights,
      currency: "GEL",
      cancellationPolicy: "FLEXIBLE",
      guestName: "Test guest",
      guestPhone: "+995555000222",
      locale: "en",
      rulesAcceptedAt: new Date(),
      status: extra.status ?? "CONFIRMED",
      rooms: extra.rooms ?? 1,
      roomTypeId: extra.roomTypeId ?? null,
      createdAt: extra.createdAt ?? new Date(),
    },
  });
}

let host = "";
let guest = "";
let guest2 = "";
let moderator = "";

beforeAll(async () => {
  const city = await db.city.create({
    data: {
      slug: `${prefix}-city`,
      names: { he: "עיר בדיקה", en: "Test City", ru: "Тест", ar: "اختبار", ka: "ტესტი" },
      searchText: "test city",
      lat: 41.7,
      lng: 44.8,
    },
  });
  ids.city = city.id;
  host = await createUser("host");
  guest = await createUser("guest");
  guest2 = await createUser("guest2");
  moderator = await createUser("mod", "MODERATOR");
});

afterAll(async () => {
  await db.rateLimit.deleteMany({ where: { OR: ids.listings.map((id) => ({ key: { contains: id } })) } });
  await db.user.deleteMany({ where: { id: { in: ids.users } } });
  await db.city.deleteMany({ where: { id: ids.city } });
  await db.$disconnect();
});

beforeEach(() => {
  request.ip = `203.0.113.${Math.floor(Math.random() * 200) + 20}`;
  request.userAgent = BROWSER;
  request.device = null;
  request.headers = {};
});

async function dayRow(listingId: string) {
  return db.listingStatDaily.findUnique({ where: { listingId_date: { listingId, date: dayToDate(tbilisiToday()) } } });
}

describe("counting views", () => {
  it("counts a visitor once a day, and two visitors twice", async () => {
    const listing = await createListing(host);
    expect(await stats.recordListingView(listing.id, null)).toBe(true);
    expect(await stats.recordListingView(listing.id, null)).toBe(false); // same visitor, same day
    expect(await stats.recordListingView(listing.id, { id: guest })).toBe(false); // signing in changes nothing
    request.ip = "198.51.100.1"; // another visitor
    expect(await stats.recordListingView(listing.id, null)).toBe(true);
    expect((await dayRow(listing.id))?.views).toBe(2);
    expect((await db.listing.findUnique({ where: { id: listing.id } }))?.viewCount).toBe(2);
  });

  it("stores neither the IP, the browser nor the account in the dedupe key", async () => {
    const listing = await createListing(host);
    request.ip = "198.51.100.77";
    await stats.recordListingView(listing.id, { id: guest });
    const keys = await db.rateLimit.findMany({ where: { key: { contains: listing.id } }, select: { key: true, resetAt: true } });
    expect(keys).toHaveLength(1);
    expect(keys[0].key).toMatch(new RegExp(`^stats:view:\\d{4}-\\d{2}-\\d{2}:${listing.id}:[0-9a-f]{32}$`));
    expect(keys[0].key).not.toContain("198.51.100.77");
    expect(keys[0].key).not.toContain(guest);
    // Gone after the Georgian day (the daily clean-up deletes ended keys).
    expect(keys[0].resetAt.getTime()).toBeLessThanOrEqual(Date.now() + 25 * 3600_000);
  });

  it("never counts the host, staff, a device the host signed in on, bots, prefetches or demo listings", async () => {
    const listing = await createListing(host);
    expect(await stats.recordListingView(listing.id, { id: host })).toBe(false);
    expect(await stats.recordListingView(listing.id, { id: moderator, isStaff: true })).toBe(false);

    request.device = `${prefix}-host-device`;
    await db.deviceLink.create({ data: { userId: host, deviceHash: request.device } });
    expect(await stats.recordListingView(listing.id, null)).toBe(false); // signed out, on the host's phone
    request.device = `${prefix}-mod-device`;
    await db.deviceLink.create({ data: { userId: moderator, deviceHash: request.device } });
    expect(await stats.recordListingView(listing.id, null)).toBe(false);
    request.device = null;

    request.userAgent = "Mozilla/5.0 (compatible; Googlebot/2.1; +http://www.google.com/bot.html)";
    expect(await stats.recordListingView(listing.id, null)).toBe(false);
    request.userAgent = BROWSER;
    request.headers = { "sec-purpose": "prefetch;prerender" };
    expect(await stats.recordListingView(listing.id, null)).toBe(false);
    request.headers = {};

    // None of these used up the visitor's one view of the day.
    expect(await stats.recordListingView(listing.id, null)).toBe(true);
    expect((await dayRow(listing.id))?.views).toBe(1);

    const demo = await createListing(host, { isDemo: true });
    expect(await stats.recordListingView(demo.id, null)).toBe(false);
    const paused = await createListing(host, { status: "PAUSED" });
    expect(await stats.recordListingView(paused.id, null)).toBe(false);
    expect(await dayRow(demo.id)).toBeNull();
  });
});

describe("counting saves and contact taps", () => {
  it("counts each account's save once a day; never the host's or staff's; the counter follows un-saves", async () => {
    const listing = await createListing(host);
    await stats.recordSave(listing.id, 1, { id: guest });
    await stats.recordSave(listing.id, -1, { id: guest });
    await stats.recordSave(listing.id, 1, { id: guest }); // saved again the same day
    await stats.recordSave(listing.id, 1, { id: guest2 });
    await stats.recordSave(listing.id, 1, { id: host });
    await stats.recordSave(listing.id, 1, { id: moderator, isStaff: true });
    expect((await dayRow(listing.id))?.saves).toBe(2);
    expect((await db.listing.findUnique({ where: { id: listing.id } }))?.saveCount).toBe(2);

    const demo = await createListing(host, { isDemo: true });
    await stats.recordSave(demo.id, 1, { id: guest });
    expect(await dayRow(demo.id)).toBeNull();
    expect((await db.listing.findUnique({ where: { id: demo.id } }))?.saveCount).toBe(0);
  });

  it("counts a contact tap once a day per method, without who tapped", async () => {
    const listing = await createListing(host);
    expect(await stats.recordContactClick(listing.id, "WHATSAPP", { id: guest })).toBe(true);
    expect(await stats.recordContactClick(listing.id, "WHATSAPP", { id: guest })).toBe(false);
    expect(await stats.recordContactClick(listing.id, "PHONE", { id: guest })).toBe(true);
    expect(await stats.recordContactClick(listing.id, "WHATSAPP", { id: guest2 })).toBe(true);
    expect(await stats.recordContactClick(listing.id, "WHATSAPP", { id: host })).toBe(false);
    expect(await stats.recordContactClick(listing.id, "PHONE", { id: moderator, isStaff: true })).toBe(false);
    const row = await dayRow(listing.id);
    expect(row?.contacts).toBe(3);
    expect(row?.contactsByChannel).toEqual({ WHATSAPP: 2, PHONE: 1 });
    const clicks = await db.contactClick.findMany({ where: { listingId: listing.id } });
    expect(clicks).toHaveLength(3);
    expect(clicks.every((click) => click.userId === null)).toBe(true);

    const demo = await createListing(host, { isDemo: true });
    expect(await stats.recordContactClick(demo.id, "WHATSAPP", { id: guest })).toBe(false);
  });
});

describe("reading", () => {
  it("short stay: views, saves, taps per method, bookings, booked nights and occupancy for 7 and 30 days", async () => {
    const listing = await createListing(host);
    const today = tbilisiToday();
    await db.listingStatDaily.createMany({
      data: [
        { listingId: listing.id, date: dayToDate(today), views: 5, saves: 1, contacts: 2, contactsByChannel: { WHATSAPP: 2 } },
        { listingId: listing.id, date: dayToDate(addDays(today, -3)), views: 4, saves: 0, contacts: 1, contactsByChannel: { PHONE: 1 } },
        { listingId: listing.id, date: dayToDate(addDays(today, -20)), views: 10, saves: 2, contacts: 0 },
        { listingId: listing.id, date: dayToDate(addDays(today, -40)), views: 99, saves: 9, contacts: 9 },
      ],
    });
    // 3 nights inside the last 7 days, made today; a cancelled one and a no-show never count.
    await createBooking(listing.id, host, guest, addDays(today, -4), addDays(today, -1));
    await createBooking(listing.id, host, guest, addDays(today, -6), addDays(today, -5), { status: "CANCELLED_BY_GUEST" });
    await createBooking(listing.id, host, guest, addDays(today, -2), today, { status: "NO_SHOW" });
    // 2 nights 25 days ago, made then, completed.
    await createBooking(listing.id, host, guest, addDays(today, -25), addDays(today, -23), {
      status: "COMPLETED",
      createdAt: new Date(Date.now() - 27 * 86_400_000),
    });

    const week = await stats.getListingStats({ id: listing.id, dealType: "SHORT_STAY" }, 7, "en");
    expect(week.days).toHaveLength(7);
    expect(week.days[6].date).toBe(today);
    expect(week.totals).toEqual({ views: 9, saves: 1, contacts: 3, bookings: 1, bookedNights: 3 });
    expect(week.byChannel).toEqual({ WHATSAPP: 2, PHONE: 1 });
    expect(week.bookable).toBe(true);
    expect(week.occupancy).toEqual({ bookedNights: 3, offeredNights: 7, rate: 3 / 7 });

    const month = await stats.getListingStats({ id: listing.id, dealType: "SHORT_STAY" }, 30, "en");
    expect(month.totals).toEqual({ views: 19, saves: 3, contacts: 3, bookings: 2, bookedNights: 5 });
    expect(month.occupancy?.offeredNights).toBe(30);

    const totals = await stats.getStatsTotals([{ id: listing.id, dealType: "SHORT_STAY" }], 7);
    expect(totals.get(listing.id)).toEqual(week.totals);
  });

  it("hotel: occupancy = booked room-nights / (rooms offered × nights), and per room type", async () => {
    const hotel = await createListing(host, { dealType: "HOTEL_ROOM" });
    const double = await db.roomType.create({
      data: { listingId: hotel.id, names: { en: "Double room", he: "חדר זוגי" }, price: 80, currency: "GEL", quantity: 4, sortOrder: 0 },
    });
    const family = await db.roomType.create({
      data: { listingId: hotel.id, names: { en: "Family room", he: "חדר משפחה" }, price: 120, currency: "GEL", quantity: 1, sortOrder: 1 },
    });
    const today = tbilisiToday();
    await createBooking(hotel.id, host, guest, addDays(today, -3), addDays(today, -1), { roomTypeId: double.id, rooms: 2 }); // 4
    await createBooking(hotel.id, host, guest2, addDays(today, -6), addDays(today, -3), { roomTypeId: family.id }); // 3

    const week = await stats.getListingStats({ id: hotel.id, dealType: "HOTEL_ROOM" }, 7, "he");
    expect(week.totals.bookedNights).toBe(7);
    expect(week.occupancy).toEqual({ bookedNights: 7, offeredNights: 35, rate: 7 / 35 });
    expect(week.roomTypes).toEqual([
      { id: double.id, name: "חדר זוגי", quantity: 4, bookedNights: 4, offeredNights: 28, rate: 4 / 28 },
      { id: family.id, name: "חדר משפחה", quantity: 1, bookedNights: 3, offeredNights: 7, rate: 3 / 7 },
    ]);
  });

  it("monthly rentals and sales show no bookings", async () => {
    const monthly = await createListing(host, { dealType: "MONTHLY_RENT" });
    const result = await stats.getListingStats({ id: monthly.id, dealType: "MONTHLY_RENT" }, 30, "en");
    expect(result.bookable).toBe(false);
    expect(result.occupancy).toBeNull();
    expect(result.totals.bookings).toBe(0);
  });
});
