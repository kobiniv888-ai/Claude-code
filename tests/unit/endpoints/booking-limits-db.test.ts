/**
 * The booking limits against the local database:
 *
 * - SECURITY_REPORT 4.5.c (D2): the review page's idempotency key. A repeat of the same attempt
 *   (a double tap, a retry after a lost answer) gets the booking already made, also when two taps
 *   arrive at the same moment, also on a hotel with free rooms left (where two taps used to make
 *   two bookings). The same key for another stay is refused.
 * - Founder's decision 8 (4.6.a): at most 2 upcoming bookings per verified phone number, across
 *   accounts, checked in the booking transaction: a third is refused, also when two arrive at once;
 *   cancelled and finished stays do not count.
 *
 * - idempotency-unalerted-1: a repeat that arrives while the first attempt is still telling the
 *   host answers "booking_in_progress" (never "booked": the booking may still be undone), and a
 *   booking cancelled since is no repeat.
 * - booking-cap-tests-1: the per-account clause (a new number does not reset the cap) and the phone
 *   lock (two accounts whose numbers are the same E.164) each have a test that fails without them.
 *
 * Creates its own users (fake @example.com addresses, +995 59… / +972 50… test numbers), city and
 * listings, and removes them afterwards. Emails and texts are not sent.
 */
import "dotenv/config";
import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { guestPhoneLookups, sealAddress, sealGuestPhone, sealPin } from "@/lib/field-crypto";

process.env.TWILIO_ACCOUNT_SID = "";
process.env.RESEND_API_KEY = "";
process.env.ADMIN_ALERT_EMAIL = "founder-alerts@example.com";
delete process.env.TELEGRAM_BOT_TOKEN;
delete process.env.VAPID_PUBLIC_KEY;

vi.mock("server-only", () => ({}));
vi.mock("next-intl/server", () => ({ getTranslations: async () => (key: string) => key }));
vi.mock("@/lib/request", () => ({ getIpHash: async () => "test-ip" }));
vi.mock("@/lib/email", async (importOriginal) => {
  const real = await importOriginal<typeof import("@/lib/email")>();
  return { ...real, sendEmail: vi.fn(async () => ({ ok: true, delivery: "logged" as const })) };
});
vi.mock("@/lib/sms", () => ({ isSmsConfigured: () => false, sendSms: vi.fn(async () => ({ ok: true, delivered: false })) }));

/** "slow_fail" / "slow_ok": the host alert takes 400 ms, then is refused (the booking is undone) or accepted. */
const alertMode = vi.hoisted(() => ({ mode: "real" as "real" | "slow_fail" | "slow_ok" }));
vi.mock("@/lib/booking/alerts", async (importOriginal) => {
  const real = await importOriginal<typeof import("@/lib/booking/alerts")>();
  const { BookingError } = await import("@/lib/booking/errors");
  return {
    ...real,
    confirmWithHostAlert: async (...args: Parameters<typeof real.confirmWithHostAlert>) => {
      if (alertMode.mode === "real") return real.confirmWithHostAlert(...args);
      await new Promise((resolve) => setTimeout(resolve, 400));
      if (alertMode.mode === "slow_ok") return real.confirmWithHostAlert(...args);
      await real.undoUnalertedBooking(args[0].id);
      throw new BookingError("host_unreachable");
    },
  };
});

const { db } = await import("@/lib/db");
const service = await import("@/lib/booking/service");
const { addDays, tbilisiToday } = await import("@/lib/booking/dates");
const { MAX_UPCOMING_BOOKINGS_PER_PHONE } = await import("@/lib/booking/guest-flags");

const prefix = `lim${randomUUID().replace(/-/g, "").slice(0, 10)}`;
const digits = String(Date.now() % 1_000_000).padStart(6, "0");
const users: string[] = [];
const listings: string[] = [];
const ids = { city: "", host: "", flat: "", flat2: "", flat3: "", hotel: "", room: "" };
const today = tbilisiToday();
const day = (n: number) => addDays(today, n);
const key = () => randomUUID().replace(/-/g, "");

async function makeUser(name: string, last: string) {
  const id = `${prefix}-${name}`;
  await db.user.create({
    data: { id, name, firstName: name, email: `${id}@example.com`, phoneNumber: `+99559${digits}${last}`, phoneNumberVerified: true, locale: "he" },
  });
  users.push(id);
  return id;
}

async function makeListing(title: string, dealType: "SHORT_STAY" | "HOTEL_ROOM") {
  const listing = await db.listing.create({
    data: {
      ownerId: ids.host,
      status: "LIVE",
      dealType,
      propertyType: dealType === "HOTEL_ROOM" ? "HOTEL" : "APARTMENT",
      pricePeriod: "NIGHT",
      price: 100,
      currency: "USD",
      minStayNights: 1,
      maxGuests: 4,
      bookingMode: "INSTANT",
      cancellationPolicy: "MODERATE",
      paymentMethodsAtCheckIn: ["cash"],
      cityId: ids.city,
      pinEnc: sealPin({ lat: 41.71, lng: 44.77 }),
      addressEnc: sealAddress("1 Test Street, Tbilisi"),
      contactMethods: [{ channel: "WHATSAPP", value: "+995555000001", order: 0 }],
      originalLocale: "en",
      title: `${prefix} ${title}`,
      description: "A test listing.",
    },
  });
  listings.push(listing.id);
  return listing.id;
}

function stay(guestUserId: string, listingId: string, checkIn: string, checkOut: string, extra: Partial<Parameters<typeof service.createBooking>[0]> = {}) {
  return { listingId, guestUserId, checkIn, checkOut, adults: 2, children: 0, infants: 0, guestName: "Noa", rulesAccepted: true, locale: "he" as const, notify: false, ...extra };
}

beforeAll(async () => {
  const city = await db.city.create({ data: { slug: `${prefix}-city`, names: { he: "עיר", en: "City", ru: "Город", ar: "مدينة", ka: "ქალაქი" }, searchText: "city", lat: 41.7, lng: 44.8 } });
  ids.city = city.id;
  ids.host = await makeUser("Host", "0");
  ids.flat = await makeListing("flat", "SHORT_STAY");
  ids.flat2 = await makeListing("flat 2", "SHORT_STAY");
  ids.flat3 = await makeListing("flat 3", "SHORT_STAY");
  ids.hotel = await makeListing("hotel", "HOTEL_ROOM");
  const room = await db.roomType.create({
    data: { listingId: ids.hotel, names: { he: "חדר", en: "Room", ru: "Номер", ar: "غرفة", ka: "ოთახი" }, price: 80, currency: "USD", pricePeriod: "NIGHT", maxGuests: 2, quantity: 3 },
  });
  ids.room = room.id;
});

afterAll(async () => {
  await db.booking.deleteMany({ where: { listingId: { in: listings } } });
  await db.listing.deleteMany({ where: { id: { in: listings } } });
  await db.auditLog.deleteMany({ where: { actorId: { in: users } } });
  await db.rateLimit.deleteMany({ where: { key: { contains: prefix } } });
  await db.user.deleteMany({ where: { id: { in: users } } });
  await db.city.deleteMany({ where: { id: ids.city } });
});

describe("idempotency key: a double tap never books twice (4.5.c)", () => {
  it("a repeat of the same attempt returns the booking already made", async () => {
    const guest = await makeUser("Repeat", "1");
    const attempt = key();
    const first = await service.createBooking(stay(guest, ids.flat, day(5), day(7), { idempotencyKey: attempt }));
    expect(first.repeated).toBeUndefined();
    const again = await service.createBooking(stay(guest, ids.flat, day(5), day(7), { idempotencyKey: attempt }));
    expect(again).toMatchObject({ id: first.id, code: first.code, repeated: true });
    expect(await db.booking.count({ where: { guestUserId: guest } })).toBe(1);
  });

  it("two taps at the same moment on a hotel with free rooms make ONE booking", async () => {
    const guest = await makeUser("DoubleTap", "2");
    const attempt = key();
    const tap = () => service.createBooking(stay(guest, ids.hotel, day(20), day(22), { roomTypeId: ids.room, rooms: 1, adults: 1, idempotencyKey: attempt }));
    const results = await Promise.allSettled([tap(), tap()]);
    // One tap makes the booking. The other meets it either while the host is still being told
    // ("booking_in_progress": the browser asks again) or after (the same booking, repeated).
    const made = results.filter((r): r is PromiseFulfilledResult<Awaited<ReturnType<typeof tap>>> => r.status === "fulfilled");
    expect(made.filter((r) => !r.value.repeated)).toHaveLength(1);
    for (const r of results) if (r.status === "rejected") expect(r.reason).toMatchObject({ code: "booking_in_progress" });
    if (made.length === 2) expect(made[0]!.value.id).toBe(made[1]!.value.id);
    expect(await db.booking.count({ where: { guestUserId: guest } })).toBe(1);
    // The rooms left are right: one room taken, two free.
    const free = await service.getStayAvailability({ listingId: ids.hotel, checkIn: day(20), checkOut: day(22), adults: 1, roomTypeId: ids.room, rooms: 1 });
    expect(free.rooms?.find((r) => r.id === ids.room)?.free).toBe(2);
  });

  it("refuses the same key for another stay", async () => {
    const guest = await makeUser("Reused", "3");
    const attempt = key();
    await service.createBooking(stay(guest, ids.flat, day(40), day(41), { idempotencyKey: attempt }));
    await expect(service.createBooking(stay(guest, ids.flat, day(42), day(43), { idempotencyKey: attempt }))).rejects.toMatchObject({ code: "request_reused" });
    expect(await db.booking.count({ where: { guestUserId: guest } })).toBe(1);
  });
});

describe("at most 2 upcoming bookings per verified phone (decision 8)", () => {
  it("refuses a third upcoming booking; cancelled and finished stays do not count", async () => {
    expect(MAX_UPCOMING_BOOKINGS_PER_PHONE).toBe(2);
    const guest = await makeUser("Cap", "4");
    const one = await service.createBooking(stay(guest, ids.flat2, day(3), day(4)));
    await service.createBooking(stay(guest, ids.flat2, day(6), day(7)));
    await expect(service.createBooking(stay(guest, ids.flat2, day(9), day(10)))).rejects.toMatchObject({ code: "too_many_upcoming", details: { count: 2 } });
    // A cancelled one frees a place.
    await service.guestCancel({ bookingId: one.id, guestUserId: guest, reasonCode: "CHANGE_OF_PLANS", notify: false });
    const third = await service.createBooking(stay(guest, ids.flat2, day(9), day(10)));
    expect(third.code).toMatch(/^BT-/);
    // A stay that already ended does not count either (moved into the past).
    await db.booking.update({ where: { id: third.id }, data: { checkIn: new Date(`${day(-5)}T00:00:00Z`), checkOut: new Date(`${day(-3)}T00:00:00Z`) } });
    await db.availabilityBlock.deleteMany({ where: { bookingId: third.id } });
    expect(await service.countUpcomingBookings(db, guest, `+99559${digits}4`)).toBe(1);
  });

  it("counts the phone number across accounts", async () => {
    const guest = await makeUser("Shared", "5");
    const phone = `+99559${digits}5`;
    // Another account booked earlier with this number (it later moved to this account).
    const other = await makeUser("Earlier", "6");
    await db.booking.create({
      data: {
        code: `BT-${"23456789ABCDEFGHJKLMNPQRSTUVWXYZ"[Number(digits[0])]}${"23456789ABCDEFGHJKLMNPQRSTUVWXYZ"[Number(digits[1]) + 9]}Q7K`,
        listingId: ids.flat3,
        guestUserId: other,
        hostUserId: ids.host,
        checkIn: new Date(`${day(50)}T00:00:00Z`),
        checkOut: new Date(`${day(52)}T00:00:00Z`),
        nights: 2,
        adults: 1,
        nightlyPrice: 100,
        subtotal: 200,
        total: 200,
        currency: "USD",
        cancellationPolicy: "MODERATE",
        guestName: "Earlier",
        ...sealGuestPhone(phone),
        locale: "he",
        rulesAcceptedAt: new Date(),
      },
    });
    await service.createBooking(stay(guest, ids.flat3, day(3), day(4)));
    await expect(service.createBooking(stay(guest, ids.flat3, day(6), day(7)))).rejects.toMatchObject({ code: "too_many_upcoming" });
  });

  it("two bookings at the same moment from one number cannot both pass the cap", async () => {
    const guest = await makeUser("Race", "7");
    await service.createBooking(stay(guest, ids.flat, day(60), day(61)));
    const results = await Promise.allSettled([
      service.createBooking(stay(guest, ids.flat2, day(60), day(61))),
      service.createBooking(stay(guest, ids.flat3, day(60), day(61))),
    ]);
    expect(results.filter((r) => r.status === "fulfilled")).toHaveLength(1);
    const refused = results.find((r): r is PromiseRejectedResult => r.status === "rejected");
    expect(refused?.reason).toMatchObject({ code: "too_many_upcoming" });
    expect(await service.countUpcomingBookings(db, guest, `+99559${digits}7`)).toBe(2);
  });
});

/** Waits until the attempt's booking row exists (its transaction committed). */
async function committed(guestUserId: string, idempotencyKey: string) {
  for (let i = 0; i < 100; i++) {
    if (await db.booking.findUnique({ where: { guestUserId_idempotencyKey: { guestUserId, idempotencyKey } }, select: { id: true } })) return;
    await new Promise((resolve) => setTimeout(resolve, 20));
  }
  throw new Error("the first attempt never committed");
}

describe("a repeat while the host is still being told is never 'booked' (idempotency-unalerted-1)", () => {
  it("the host is never reached: the retry is not told 'booked' and no booking is left", async () => {
    const guest = await makeUser("SlowFail", "8");
    const attempt = key();
    alertMode.mode = "slow_fail";
    try {
      const first = service.createBooking(stay(guest, ids.flat, day(90), day(92), { idempotencyKey: attempt }));
      await committed(guest, attempt);
      const retry = service.createBooking(stay(guest, ids.flat, day(90), day(92), { idempotencyKey: attempt }));
      const [a, b] = await Promise.allSettled([first, retry]);
      expect(a.status).toBe("rejected");
      expect((a as PromiseRejectedResult).reason).toMatchObject({ code: "host_unreachable" });
      expect(b.status).toBe("rejected");
      expect(["booking_in_progress", "host_unreachable"]).toContain((b as PromiseRejectedResult).reason?.code);
      expect(await db.booking.count({ where: { guestUserId: guest } })).toBe(0);
    } finally {
      alertMode.mode = "real";
    }
  });

  it("the host is reached: the retry during the alert waits, the one after it gets the same booking", async () => {
    const guest = await makeUser("SlowOk", "9");
    const attempt = key();
    alertMode.mode = "slow_ok";
    try {
      const first = service.createBooking(stay(guest, ids.flat, day(95), day(97), { idempotencyKey: attempt }));
      await committed(guest, attempt);
      await expect(service.createBooking(stay(guest, ids.flat, day(95), day(97), { idempotencyKey: attempt }))).rejects.toMatchObject({ code: "booking_in_progress" });
      const made = await first;
      const after = await service.createBooking(stay(guest, ids.flat, day(95), day(97), { idempotencyKey: attempt }));
      expect(after).toMatchObject({ id: made.id, code: made.code, repeated: true });
    } finally {
      alertMode.mode = "real";
    }
  });

  it("a booking cancelled since is no repeat: request_reused", async () => {
    const guest = await makeUser("Cancelled", "a");
    const attempt = key();
    const made = await service.createBooking(stay(guest, ids.flat3, day(100), day(101), { idempotencyKey: attempt }));
    await service.guestCancel({ bookingId: made.id, guestUserId: guest, reasonCode: "CHANGE_OF_PLANS", notify: false });
    await expect(service.createBooking(stay(guest, ids.flat3, day(100), day(101), { idempotencyKey: attempt }))).rejects.toMatchObject({ code: "request_reused" });
  });
});

describe("the cap's two halves each have a test (booking-cap-tests-1)", () => {
  it("per account: a new verified number does not reset the cap (the guestUserId clause)", async () => {
    const guest = await makeUser("NewNumber", "b");
    await service.createBooking(stay(guest, ids.flat2, day(110), day(111)));
    await service.createBooking(stay(guest, ids.flat2, day(112), day(113)));
    // The account moves to another verified number (in real life: a fresh code, then an SMS code).
    await db.user.update({ where: { id: guest }, data: { phoneNumber: `+99559${digits}c` } });
    await expect(service.createBooking(stay(guest, ids.flat2, day(114), day(115)))).rejects.toMatchObject({ code: "too_many_upcoming" });
  });

  it("per number: two accounts whose numbers are the same E.164 book at once, at most one passes (the phone lock)", async () => {
    // A number saved in a legacy spelling (+972 0…) and its E.164 form: two User rows, one number.
    const national = `50${digits}9`;
    const a = await makeUser("SpellingA", "d");
    const b = await makeUser("SpellingB", "e");
    await db.user.update({ where: { id: a }, data: { phoneNumber: `+972${national}` } });
    await db.user.update({ where: { id: b }, data: { phoneNumber: `+9720${national}` } });
    await service.createBooking(stay(a, ids.flat, day(120), day(121)));
    const results = await Promise.allSettled([
      service.createBooking(stay(a, ids.flat2, day(120), day(121))),
      service.createBooking(stay(b, ids.flat3, day(120), day(121))),
    ]);
    expect(results.filter((r) => r.status === "fulfilled")).toHaveLength(1);
    expect((results.find((r) => r.status === "rejected") as PromiseRejectedResult | undefined)?.reason).toMatchObject({ code: "too_many_upcoming" });
    expect(await db.booking.count({ where: { guestPhoneLookup: { in: guestPhoneLookups([`+972${national}`]) }, status: "CONFIRMED" } })).toBe(2);
  });
});
