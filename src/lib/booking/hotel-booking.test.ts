/**
 * Hotel booking by room type (round 3, founder's answer 3) against the local database
 * (DATABASE_URL in .env): free rooms per room type, several rooms in one booking, blocks with and
 * without a room type, cancelling, and concurrency (two guests for the last room). Creates its own
 * users, city and hotel with a unique prefix and removes them afterwards. Nothing is sent.
 */
import "dotenv/config";
import fs from "node:fs";
import path from "node:path";
import { randomUUID } from "node:crypto";
import { createTranslator } from "use-intl/core";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { sealAddress, sealPin } from "@/lib/field-crypto";

process.env.TWILIO_ACCOUNT_SID = "";
process.env.RESEND_API_KEY = "";
process.env.ADMIN_ALERT_EMAIL = "founder-alerts@example.com";
delete process.env.TELEGRAM_BOT_TOKEN;
delete process.env.VAPID_PUBLIC_KEY;

vi.mock("server-only", () => ({}));
vi.mock("next-intl/server", () => ({
  getTranslations: async ({ locale, namespace }: { locale: string; namespace: string }) => {
    const root = namespace.split(".")[0];
    const file = path.join(process.cwd(), "messages", locale, `${root}.json`);
    const messages = { [root]: JSON.parse(fs.readFileSync(file, "utf8")) };
    return createTranslator({ locale, messages, namespace });
  },
}));
vi.mock("@/lib/request", () => ({ getIpHash: async () => "test-ip" }));
vi.mock("@/lib/email", async (importOriginal) => {
  const real = await importOriginal<typeof import("@/lib/email")>();
  return { ...real, sendEmail: vi.fn(async () => ({ ok: true, delivery: "logged" as const })) };
});
vi.mock("@/lib/sms", () => ({ isSmsConfigured: () => false, sendSms: vi.fn(async () => ({ ok: true, delivered: false })) }));

const { db } = await import("@/lib/db");
const service = await import("./service");
const { freeRoomsOfType, getHotelAvailability } = await import("./availability");
const { addDays, dayToDate, tbilisiToday } = await import("./dates");

const prefix = `ht${randomUUID().replace(/-/g, "").slice(0, 10)}`;
const today = tbilisiToday();
const day = (n: number) => addDays(today, n);
const ids = { city: "", host: "", hotel: "", double: "", suite: "", off: "", empty: "", guests: [] as string[] };

async function makeUser(name: string, n: number) {
  const id = `${prefix}-${name}`;
  const digits = `${(Date.now() + n * 7919) % 10_000_000}`.padStart(7, "0");
  await db.user.create({
    data: { id, name, firstName: name, email: `${id}@example.com`, phoneNumber: `+99559${digits}`, phoneNumberVerified: true, locale: "en" },
  });
  return id;
}

function stay(guest: number, checkIn: string, checkOut: string, extra: Partial<Parameters<typeof service.createBooking>[0]> = {}) {
  return {
    listingId: ids.hotel,
    guestUserId: ids.guests[guest],
    checkIn,
    checkOut,
    adults: 2,
    guestName: "Noa",
    rulesAccepted: true,
    locale: "en" as const,
    roomTypeId: ids.double,
    notify: false,
    ...extra,
  };
}

async function expectCode(promise: Promise<unknown>, code: string, details?: Record<string, number>) {
  await expect(promise).rejects.toMatchObject(details ? { code, details } : { code });
}

const room = (id: string, quantity: number) => ({ id, quantity });

beforeAll(async () => {
  const city = await db.city.create({
    data: { slug: `${prefix}-city`, names: { he: "עיר", en: "City", ru: "Город", ar: "مدينة", ka: "ქალაქი" }, searchText: "city", lat: 41.6, lng: 41.6 },
  });
  ids.city = city.id;
  ids.host = await makeUser("host", 1);
  for (let i = 0; i < 8; i++) ids.guests.push(await makeUser(`guest${i}`, i + 2));
  const hotel = await db.listing.create({
    data: {
      ownerId: ids.host,
      status: "LIVE",
      dealType: "HOTEL_ROOM",
      propertyType: "HOTEL",
      pricePeriod: "NIGHT",
      price: null,
      cleaningFee: 15,
      currency: "GEL",
      minStayNights: 1,
      bookingMode: "INSTANT",
      cancellationPolicy: "FLEXIBLE",
      paymentMethodsAtCheckIn: ["cash"],
      cityId: ids.city,
      pinEnc: sealPin({ lat: 41.64, lng: 41.63 }),
      addressEnc: sealAddress("1 Test Boulevard, Batumi"),
      contactMethods: [{ channel: "WHATSAPP", value: "+995555123499", order: 0 }],
      originalLocale: "en",
      title: "Test hotel for room-type bookings",
      description: "A test listing.",
    },
  });
  ids.hotel = hotel.id;
  const make = async (name: string, data: { price: number; quantity: number; maxGuests: number; active?: boolean; weekendPrice?: number }, sortOrder: number) =>
    (
      await db.roomType.create({
        data: { listingId: hotel.id, names: { en: name, he: name }, currency: "GEL", pricePeriod: "NIGHT", sortOrder, ...data },
      })
    ).id;
  ids.double = await make("Double", { price: 100, quantity: 3, maxGuests: 2 }, 0);
  ids.suite = await make("Suite", { price: 250, quantity: 1, maxGuests: 4 }, 1);
  ids.off = await make("Switched off", { price: 80, quantity: 5, maxGuests: 2, active: false }, 2);
});

afterAll(async () => {
  const users = [ids.host, ...ids.guests];
  const listings = [ids.hotel, ids.empty].filter(Boolean);
  await db.booking.deleteMany({ where: { listingId: { in: listings } } });
  await db.listing.deleteMany({ where: { id: { in: listings } } });
  await db.auditLog.deleteMany({ where: { OR: [{ actorId: { in: users } }, { targetId: { in: users } }] } });
  await db.rateLimit.deleteMany({ where: { key: { contains: prefix } } });
  await db.user.deleteMany({ where: { id: { in: users } } });
  await db.city.deleteMany({ where: { id: ids.city } });
});

describe("hotel booking by room type", () => {
  it("two guests for the last room at the same moment: exactly one gets it (locked transaction)", async () => {
    // Two of the three double rooms are taken already (another guest's booking of 2 rooms).
    await service.createBooking(stay(0, day(10), day(13), { rooms: 2 }));
    expect(await freeRoomsOfType(ids.hotel, room(ids.double, 3), day(10), day(13))).toBe(1);

    const results = await Promise.allSettled([
      service.createBooking(stay(1, day(11), day(12))),
      service.createBooking(stay(2, day(11), day(14))),
    ]);
    const fulfilled = results.filter((r) => r.status === "fulfilled");
    const rejected = results.filter((r): r is PromiseRejectedResult => r.status === "rejected");
    expect(fulfilled).toHaveLength(1);
    expect(rejected).toHaveLength(1);
    expect(rejected[0].reason.code).toBe("dates_unavailable");
    expect(await freeRoomsOfType(ids.hotel, room(ids.double, 3), day(11), day(12))).toBe(0);
  });

  it("two parallel bookings of 2 rooms when 3 are free: one stands, the other is told how many are left", async () => {
    const results = await Promise.allSettled([
      service.createBooking(stay(3, day(30), day(32), { rooms: 2, adults: 4 })),
      service.createBooking(stay(4, day(31), day(33), { rooms: 2, adults: 3 })),
    ]);
    expect(results.filter((r) => r.status === "fulfilled")).toHaveLength(1);
    const refused = results.find((r): r is PromiseRejectedResult => r.status === "rejected");
    expect(refused?.reason).toMatchObject({ code: "rooms_unavailable", details: { count: 1 } });
  });

  it("one booking never blocks the whole hotel: other room types and other rooms stay free", async () => {
    const booked = await service.createBooking(stay(5, day(50), day(52), { roomTypeId: ids.suite, adults: 3 }));
    const block = await db.availabilityBlock.findFirstOrThrow({ where: { bookingId: booked.id } });
    expect(block).toMatchObject({ roomTypeId: ids.suite, rooms: 1, source: "BOOKING" });
    // The suite is full on those nights; every double is still free.
    expect(await freeRoomsOfType(ids.hotel, room(ids.suite, 1), day(50), day(52))).toBe(0);
    expect(await freeRoomsOfType(ids.hotel, room(ids.double, 3), day(50), day(52))).toBe(3);
    await expectCode(service.createBooking(stay(6, day(51), day(53), { roomTypeId: ids.suite })), "dates_unavailable");
    const doubles = await service.createBooking(stay(6, day(50), day(52)));
    expect(doubles.nights).toBe(2);

    const calendar = await getHotelAvailability(ids.hotel, [room(ids.double, 3), room(ids.suite, 1)], { from: day(0), to: day(60) });
    // The hotel is never closed by these bookings; the suite's nights show 0 free.
    expect(calendar.closed.filter((r) => r.start >= day(50) && r.end <= day(52))).toEqual([]);
    expect(calendar.rooms[ids.suite].segments).toContainEqual({ start: day(50), end: day(52), free: 0 });
  });

  it("books 2 rooms in one booking: rooms copied, every night and the cleaning fee per room, guests up to max × rooms", async () => {
    await expectCode(service.createBooking(stay(7, day(70), day(72), { adults: 5, rooms: 2 })), "too_many_guests", { count: 4 });
    const created = await service.createBooking(stay(7, day(70), day(72), { adults: 3, children: 1, rooms: 2 }));
    const booking = await db.booking.findUniqueOrThrow({ where: { id: created.id }, include: { block: true } });
    expect(booking.rooms).toBe(2);
    expect(booking.roomTypeId).toBe(ids.double);
    expect(booking.roomTypeName).toMatchObject({ en: "Double" });
    expect(booking.block).toMatchObject({ roomTypeId: ids.double, rooms: 2 });
    // 2 nights × ₾100 × 2 rooms + ₾15 cleaning × 2 rooms.
    expect(Number(booking.total)).toBe(430);
    expect(booking.priceLines).toEqual([
      { kind: "weekday", nights: 2, price: 100, amount: 400, rooms: 2 },
      { kind: "cleaning", price: 15, amount: 30, rooms: 2 },
    ]);
    expect(await freeRoomsOfType(ids.hotel, room(ids.double, 3), day(70), day(72))).toBe(1);
  });

  it("refuses more rooms than are left, with the number still free", async () => {
    await expectCode(service.createBooking(stay(0, day(71), day(73), { rooms: 2 })), "rooms_unavailable", { count: 1 });
  });

  it("counts the host's blocked rooms; a block without a room type closes the whole hotel", async () => {
    await db.availabilityBlock.create({
      data: { listingId: ids.hotel, roomTypeId: ids.double, rooms: 2, source: "OWNER", startDate: dayToDate(day(90)), endDate: dayToDate(day(92)) },
    });
    await expectCode(service.createBooking(stay(1, day(90), day(91), { rooms: 2 })), "rooms_unavailable", { count: 1 });
    // An imported event of the room type takes one room.
    await db.availabilityBlock.create({
      data: { listingId: ids.hotel, roomTypeId: ids.double, rooms: 1, source: "ICAL", sourceRef: `${prefix}-uid`, startDate: dayToDate(day(91)), endDate: dayToDate(day(92)) },
    });
    await expectCode(service.createBooking(stay(1, day(91), day(92))), "dates_unavailable");
    await db.availabilityBlock.create({
      data: { listingId: ids.hotel, roomTypeId: null, source: "OWNER", startDate: dayToDate(day(95)), endDate: dayToDate(day(96)) },
    });
    await expectCode(service.createBooking(stay(1, day(95), day(97), { roomTypeId: ids.suite })), "dates_unavailable");
    const availability = await service.getStayAvailability({ listingId: ids.hotel, checkIn: day(95), checkOut: day(96), adults: 1, roomTypeId: ids.double });
    expect(availability).toEqual({ available: false, rooms: [{ id: ids.double, free: 0 }, { id: ids.suite, free: 0 }] });
  });

  it("cancelling frees the rooms", async () => {
    const created = await service.createBooking(stay(2, day(110), day(112), { rooms: 3, adults: 6 }));
    expect(await freeRoomsOfType(ids.hotel, room(ids.double, 3), day(110), day(112))).toBe(0);
    await service.guestCancel({ bookingId: created.id, guestUserId: ids.guests[2], reasonCode: "CHANGE_OF_PLANS", notify: false });
    expect(await freeRoomsOfType(ids.hotel, room(ids.double, 3), day(110), day(112))).toBe(3);
    const availability = await service.getStayAvailability({ listingId: ids.hotel, checkIn: day(110), checkOut: day(112), adults: 1, roomTypeId: ids.double, rooms: 3 });
    expect(availability.available).toBe(true);
  });

  it("a hotel is booked by room type only: no room type, a switched-off one or one of another listing is refused", async () => {
    await expectCode(service.createBooking(stay(3, day(130), day(131), { roomTypeId: null })), "room_type_required");
    await expectCode(service.createBooking(stay(3, day(130), day(131), { roomTypeId: ids.off })), "room_type_required");
    await expectCode(service.createBooking(stay(3, day(130), day(131), { roomTypeId: "not-a-room" })), "room_type_required");
  });

  it("a hotel without an active room type stays contact-only (not bookable)", async () => {
    const empty = await db.listing.create({
      data: {
        ownerId: ids.host,
        status: "LIVE",
        dealType: "HOTEL_ROOM",
        propertyType: "HOTEL",
        pricePeriod: "NIGHT",
        price: 90,
        currency: "GEL",
        bookingMode: "INSTANT",
        cancellationPolicy: "FLEXIBLE",
        paymentMethodsAtCheckIn: ["cash"],
        cityId: ids.city,
        pinEnc: sealPin({ lat: 41.641, lng: 41.631 }),
        addressEnc: sealAddress("2 Test Boulevard, Batumi"),
        contactMethods: [{ channel: "WHATSAPP", value: "+995555123498", order: 0 }],
        originalLocale: "en",
        title: "Test hotel without room types",
        description: "A test listing.",
        roomTypes: { create: [{ names: { en: "Off" }, price: 50, currency: "GEL", quantity: 2, active: false }] },
      },
    });
    ids.empty = empty.id;
    await expectCode(service.createBooking(stay(4, day(140), day(141), { listingId: empty.id, roomTypeId: null })), "not_bookable");
    const quote = await service.getBookingQuote({ listingId: empty.id, checkIn: day(140), checkOut: day(141), adults: 1 });
    expect(quote).toMatchObject({ ok: false, error: "not_bookable" });
  });
});
