/**
 * The booking engine against the local database (DATABASE_URL in .env): the no-overlap rule under
 * concurrency, cancellations, no-shows, completion and reminders. Creates its own users, city and
 * listing with a unique prefix and removes them afterwards. Emails and texts are rendered with the
 * real templates but not sent.
 */
import "dotenv/config";
import fs from "node:fs";
import path from "node:path";
import { randomUUID } from "node:crypto";
import { createTranslator } from "use-intl/core";
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

process.env.TWILIO_ACCOUNT_SID = "";
process.env.RESEND_API_KEY = "";

vi.mock("server-only", () => ({}));
vi.mock("next-intl/server", () => ({
  getTranslations: async ({ locale, namespace }: { locale: string; namespace: string }) => {
    const file = path.join(process.cwd(), "messages", locale, `${namespace}.json`);
    const messages = { [namespace]: JSON.parse(fs.readFileSync(file, "utf8")) };
    return createTranslator({ locale, messages, namespace });
  },
}));
vi.mock("@/lib/request", () => ({ getIpHash: async () => "test-ip" }));

type Sent = { to: string; template: string; locale: string; subject: string; text: string };
const sent: Sent[] = [];
vi.mock("@/lib/email", async (importOriginal) => {
  const real = await importOriginal<typeof import("@/lib/email")>();
  return {
    ...real,
    sendEmail: vi.fn(async (input: Parameters<typeof real.sendEmail>[0]) => {
      const rendered = await real.renderEmail(input.template, input.locale, input.data as never);
      sent.push({ to: input.to, template: input.template, locale: String(input.locale), subject: rendered.subject, text: rendered.text });
      return { ok: true };
    }),
  };
});
const texts: { to: string; body: string; logOnly?: boolean }[] = [];
vi.mock("@/lib/sms", () => ({
  sendSms: vi.fn(async (input: { to: string; body: string; logOnly?: boolean }) => {
    texts.push(input);
    return { ok: true, delivered: false };
  }),
}));

const { db } = await import("@/lib/db");
const service = await import("./service");
const { getUnavailableDates, isRangeFree } = await import("./availability");
const { getGuestTrip, getGuestTrips, getHostBooking } = await import("./queries");
const { BookingError } = await import("./errors");
const { addDays, tbilisiToday } = await import("./dates");

const prefix = `bk${randomUUID().replace(/-/g, "").slice(0, 10)}`;
const ids = { city: "", listing: "", host: "", guestA: "", guestB: "", guestC: "" };
const today = tbilisiToday();
const day = (n: number) => addDays(today, n);

async function makeUser(name: string, digits: string, locale: "he" | "en" | "ru" = "en") {
  const id = `${prefix}-${name}`;
  await db.user.create({
    data: {
      id,
      name,
      firstName: name,
      email: `${id}@example.com`,
      phoneNumber: `+99559${digits}`,
      phoneNumberVerified: true,
      locale,
    },
  });
  return id;
}

function stay(guestUserId: string, checkIn: string, checkOut: string, extra: Partial<Parameters<typeof service.createBooking>[0]> = {}) {
  return {
    listingId: ids.listing,
    guestUserId,
    checkIn,
    checkOut,
    adults: 2,
    children: 0,
    infants: 0,
    guestName: "Noa",
    rulesAccepted: true,
    locale: "he" as const,
    ...extra,
  };
}

async function expectCode(promise: Promise<unknown>, code: string) {
  await expect(promise).rejects.toMatchObject({ code });
}

beforeAll(async () => {
  const city = await db.city.create({
    data: {
      slug: `${prefix}-city`,
      names: { he: "עיר", en: "City", ru: "Город", ar: "مدينة", ka: "ქალაქი" },
      searchText: "city",
      lat: 41.7,
      lng: 44.8,
    },
  });
  ids.city = city.id;
  ids.host = await makeUser("Yossi", `${Date.now() % 1_000_000}`.padStart(6, "0") + "1", "ru");
  ids.guestA = await makeUser("Noa", `${Date.now() % 1_000_000}`.padStart(6, "0") + "2", "he");
  ids.guestB = await makeUser("Dan", `${Date.now() % 1_000_000}`.padStart(6, "0") + "3");
  ids.guestC = await makeUser("Eli", `${Date.now() % 1_000_000}`.padStart(6, "0") + "4");
  const listing = await db.listing.create({
    data: {
      ownerId: ids.host,
      status: "LIVE",
      dealType: "SHORT_STAY",
      propertyType: "APARTMENT",
      pricePeriod: "NIGHT",
      price: 100,
      weekendPrice: 120,
      cleaningFee: 30,
      currency: "USD",
      minStayNights: 2,
      maxGuests: 4,
      bookingMode: "INSTANT",
      cancellationPolicy: "MODERATE",
      paymentMethodsAtCheckIn: ["cash", "card"],
      checkInFrom: "15:00",
      checkOutUntil: "11:00",
      cityId: ids.city,
      lat: 41.7101,
      lng: 44.7702,
      address: "1 Test Street, Tbilisi",
      contactMethods: [{ channel: "WHATSAPP", value: "+995555123456", order: 0 }],
      originalLocale: "en",
      title: "Quiet flat for booking tests",
      description: "A test listing.",
    },
  });
  ids.listing = listing.id;
});

beforeEach(() => {
  sent.length = 0;
  texts.length = 0;
});

afterAll(async () => {
  const users = [ids.host, ids.guestA, ids.guestB, ids.guestC].filter(Boolean);
  await db.booking.deleteMany({ where: { listingId: ids.listing } });
  await db.listing.deleteMany({ where: { id: ids.listing } });
  await db.auditLog.deleteMany({ where: { actorId: { in: users } } });
  await db.rateLimit.deleteMany({ where: { key: { startsWith: "booking:create:" + prefix } } });
  await db.user.deleteMany({ where: { id: { in: users } } });
  await db.city.deleteMany({ where: { id: ids.city } });
});

describe("createBooking", () => {
  it("gives the same nights to exactly one of two concurrent guests", async () => {
    const results = await Promise.allSettled([
      service.createBooking(stay(ids.guestA, day(10), day(13), { notify: false })),
      service.createBooking(stay(ids.guestB, day(11), day(14), { notify: false })),
    ]);
    const fulfilled = results.filter((r) => r.status === "fulfilled");
    const rejected = results.filter((r): r is PromiseRejectedResult => r.status === "rejected");
    expect(fulfilled).toHaveLength(1);
    expect(rejected).toHaveLength(1);
    expect(rejected[0].reason).toBeInstanceOf(BookingError);
    expect(rejected[0].reason.code).toBe("dates_unavailable");

    const bookings = await db.booking.findMany({ where: { listingId: ids.listing }, include: { block: true } });
    expect(bookings).toHaveLength(1);
    expect(bookings[0].block).toMatchObject({ source: "BOOKING", sourceRef: bookings[0].id });
    expect(bookings[0].code).toMatch(/^BT-[2-9A-HJ-NP-Z]{5}$/);
    expect(await isRangeFree(ids.listing, day(11), day(12))).toBe(false);
  });

  it("copies prices, policy and payment methods, and checks the dates against every block", async () => {
    await db.availabilityBlock.create({
      data: { listingId: ids.listing, startDate: new Date(`${day(30)}T00:00:00Z`), endDate: new Date(`${day(32)}T00:00:00Z`), source: "ICAL", sourceRef: "uid-1" },
    });
    await expectCode(service.createBooking(stay(ids.guestC, day(29), day(31), { notify: false })), "dates_unavailable");

    const created = await service.createBooking(stay(ids.guestC, day(32), day(35), { messageToHost: "Hi!" }));
    const booking = await db.booking.findUniqueOrThrow({ where: { id: created.id } });
    expect(booking).toMatchObject({
      status: "CONFIRMED",
      nights: 3,
      currency: "USD",
      cancellationPolicy: "MODERATE",
      paymentMethods: ["cash", "card"],
      guestPhone: expect.stringMatching(/^\+99559/),
      messageToHost: "Hi!",
      locale: "he",
    });
    expect(Number(booking.cleaningFee)).toBe(30);
    expect(Number(booking.total)).toBe(Number(booking.subtotal) + 30);

    // Notifications: the guest in Hebrew (booking locale), the host in Russian (account locale).
    expect(sent.map((s) => [s.template, s.locale]).sort()).toEqual([
      ["booking_confirmed_guest", "he"],
      ["booking_new_host", "ru"],
    ]);
    expect(sent.find((s) => s.template === "booking_confirmed_guest")?.text).toContain("1 Test Street, Tbilisi");
    expect(texts).toHaveLength(2);
    expect(texts.every((t) => t.body.includes(created.code))).toBe(true);

    const merged = await getUnavailableDates(ids.listing, { from: day(0), to: day(60) });
    expect(merged).toContainEqual({ start: day(30), end: day(35) });
  });

  it("refuses the host's own listing, unverified phones, missing rules and the host's rules", async () => {
    await expectCode(service.createBooking(stay(ids.host, day(50), day(53))), "own_listing");
    await expectCode(service.createBooking(stay(ids.guestB, day(50), day(53), { rulesAccepted: false })), "rules_not_accepted");
    await expectCode(service.createBooking(stay(ids.guestB, day(50), day(51))), "min_stay");
    await expectCode(service.createBooking(stay(ids.guestB, day(50), day(53), { adults: 5 })), "too_many_guests");
    await db.user.update({ where: { id: ids.guestB }, data: { phoneNumberVerified: false } });
    await expectCode(service.createBooking(stay(ids.guestB, day(50), day(53))), "phone_not_verified");
    await db.user.update({ where: { id: ids.guestB }, data: { phoneNumberVerified: true } });
    await db.listing.update({ where: { id: ids.listing }, data: { bookingMode: "CONTACT" } });
    await expectCode(service.createBooking(stay(ids.guestB, day(50), day(53))), "not_bookable");
    await db.listing.update({ where: { id: ids.listing }, data: { bookingMode: "INSTANT" } });
  });
});

describe("cancel, no-show, complete, remind", () => {
  it("lets the guest cancel: the nights are freed and the host is told", async () => {
    const created = await service.createBooking(stay(ids.guestB, day(40), day(43), { notify: false }));
    sent.length = 0;
    const result = await service.guestCancel({ bookingId: created.id, guestUserId: ids.guestB, reasonCode: "CHANGE_OF_PLANS" });
    expect(result).toMatchObject({ late: false, flagged: false });
    expect(await db.availabilityBlock.count({ where: { bookingId: created.id } })).toBe(0);
    expect(await isRangeFree(ids.listing, day(40), day(43))).toBe(true);
    expect(sent.map((s) => s.template)).toEqual(["booking_cancelled_by_guest"]);
    await expectCode(service.guestCancel({ bookingId: created.id, guestUserId: ids.guestB, reasonCode: "OTHER" }), "not_cancellable");
    // Someone else's booking is not found.
    await expect(service.guestCancel({ bookingId: created.id, guestUserId: ids.guestA, reasonCode: "OTHER" })).rejects.toMatchObject({ code: "not_found" });
  });

  it("logs host cancellations and flags them within 48 hours of the booking", async () => {
    const created = await service.createBooking(stay(ids.guestB, day(44), day(47), { notify: false }));
    sent.length = 0;
    await expect(
      service.hostCancel({ bookingId: created.id, hostUserId: ids.guestA, reasonCode: "DOUBLE_BOOKING" }),
    ).rejects.toMatchObject({ code: "not_found" });
    const result = await service.hostCancel({ bookingId: created.id, hostUserId: ids.host, reasonCode: "PROPERTY_ISSUE" });
    expect(result.flagged).toBe(true);
    const booking = await db.booking.findUniqueOrThrow({ where: { id: created.id } });
    expect(booking).toMatchObject({ status: "CANCELLED_BY_HOST", flaggedForReview: true, cancelReasonCode: "PROPERTY_ISSUE", cancelledById: ids.host });
    const log = await db.auditLog.findFirst({ where: { action: "booking.cancel_by_host", targetId: created.id } });
    expect(log?.details).toMatchObject({ reasonCode: "PROPERTY_ISSUE", flagged: true });
    expect(sent.map((s) => [s.template, s.locale])).toEqual([["booking_cancelled_by_host", "he"]]);
  });

  it("reveals the address only to the guest of a confirmed booking, and the guest's phone to the host", async () => {
    const booking = await db.booking.findFirstOrThrow({ where: { listingId: ids.listing, status: "CONFIRMED", guestUserId: ids.guestC } });
    const trip = await getGuestTrip(ids.guestC, booking.code.toLowerCase(), "en");
    expect(trip?.reveal?.address).toBe("1 Test Street, Tbilisi");
    expect(trip?.reveal?.contact.whatsapp).toBe("+995555123456");
    expect(trip?.canCancel).toBe(true);
    expect(await getGuestTrip(ids.guestA, booking.code, "en")).toBeNull();
    const cancelled = await db.booking.findFirstOrThrow({ where: { listingId: ids.listing, status: "CANCELLED_BY_HOST" } });
    expect((await getGuestTrip(ids.guestB, cancelled.code, "en"))?.reveal).toBeNull();
    const hostView = await getHostBooking(ids.host, booking.code, "en");
    expect(hostView?.guestPhone).toBe(booking.guestPhone);
    expect(hostView?.canReportNoShow).toBe(false);
    const trips = await getGuestTrips(ids.guestB, "en");
    // Guest B may also hold the nights won in the concurrency test.
    expect(trips.upcoming.every((t) => t.status === "CONFIRMED" && t.upcoming)).toBe(true);
    expect(trips.past.map((t) => t.status).sort()).toEqual(["CANCELLED_BY_GUEST", "CANCELLED_BY_HOST"]);
  });

  it("sends each reminder once, completes past stays and accepts a no-show report", async () => {
    const created = await service.createBooking(stay(ids.guestA, day(60), day(63), { notify: false }));
    // Three days before arrival.
    const before = new Date(Date.now() + 57 * 24 * 3600 * 1000);
    sent.length = 0;
    expect((await service.sendBookingReminders(before, { listingId: ids.listing })).reminded).toBe(1);
    expect(sent.filter((s) => s.template.startsWith("booking_reminder")).map((s) => s.template).sort()).toEqual(["booking_reminder_guest", "booking_reminder_host"]);
    const again = await service.sendBookingReminders(before, { listingId: ids.listing });
    expect(again.reminded).toBe(0);

    // The day after check-out.
    const after = new Date(Date.now() + 64 * 24 * 3600 * 1000);
    await expectCode(service.markNoShow({ bookingId: created.id, hostUserId: ids.host, now: before }), "no_show_not_allowed");
    expect((await service.completeFinishedBookings(after, { listingId: ids.listing })).completed).toBeGreaterThanOrEqual(1);
    expect((await db.booking.findUniqueOrThrow({ where: { id: created.id } })).status).toBe("COMPLETED");
    expect(sent.some((s) => s.template === "booking_completed")).toBe(true);

    await service.markNoShow({ bookingId: created.id, hostUserId: ids.host, now: after });
    expect(await db.booking.findUniqueOrThrow({ where: { id: created.id } })).toMatchObject({ status: "NO_SHOW" });
    expect(await db.auditLog.count({ where: { action: "booking.no_show", targetId: created.id } })).toBe(1);
  });
});
