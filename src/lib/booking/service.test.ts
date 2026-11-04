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
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

process.env.TWILIO_ACCOUNT_SID = "";
process.env.RESEND_API_KEY = "";
// Founder alerts go here (a made-up address; the real one is a private setting).
process.env.ADMIN_ALERT_EMAIL = "founder-alerts@example.com";
delete process.env.TELEGRAM_BOT_TOKEN;
delete process.env.VAPID_PUBLIC_KEY;

vi.mock("server-only", () => ({}));
vi.mock("next-intl/server", () => ({
  getTranslations: async ({ locale, namespace }: { locale: string; namespace: string }) => {
    // "alerts.message" → messages/<locale>/alerts.json, read at "message".
    const root = namespace.split(".")[0];
    const file = path.join(process.cwd(), "messages", locale, `${root}.json`);
    const messages = { [root]: JSON.parse(fs.readFileSync(file, "utf8")) };
    return createTranslator({ locale, messages, namespace });
  },
}));
vi.mock("@/lib/request", () => ({ getIpHash: async () => "test-ip" }));

type Sent = { to: string; template: string; locale: string; subject: string; text: string };
const sent: Sent[] = [];
/** Runs while an email is being "sent" (to act in the middle of a slow notification). */
const hooks: {
  onEmail?: () => Promise<void>;
  /** What the "send" returns (default: kept in the outbox, as without RESEND_API_KEY). */
  result?: (template: string) => { ok: boolean; delivery: "sent" | "logged" | "failed"; providerId?: string | null };
} = {};
vi.mock("@/lib/email", async (importOriginal) => {
  const real = await importOriginal<typeof import("@/lib/email")>();
  return {
    ...real,
    sendEmail: vi.fn(async (input: Parameters<typeof real.sendEmail>[0]) => {
      await hooks.onEmail?.();
      const rendered = await real.renderEmail(input.template, input.locale, input.data as never);
      sent.push({ to: input.to, template: input.template, locale: String(input.locale), subject: rendered.subject, text: rendered.text });
      return hooks.result?.(input.template) ?? { ok: true, delivery: "logged" as const };
    }),
  };
});
const texts: { to: string; body: string; logOnly?: boolean }[] = [];
vi.mock("@/lib/sms", () => ({
  isSmsConfigured: () => false,
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
const { handleEmailBounce, handleEmailDelivered, hostInstantGate } = await import("./alerts");
const { addDays, tbilisiToday } = await import("./dates");

const prefix = `bk${randomUUID().replace(/-/g, "").slice(0, 10)}`;
const ids = { city: "", listing: "", host: "", guestA: "", guestB: "", guestC: "", host2: "", listing2: "", guestD: "", users3: "", listing3: "", guestE: "", host4: "", listing4: "", guestF: "" };
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
  const users = [ids.host, ids.guestA, ids.guestB, ids.guestC, ids.host2, ids.guestD, ids.users3, ids.guestE, ids.host4, ids.guestF].filter(Boolean);
  const listings = [ids.listing, ids.listing2, ids.listing3, ids.listing4].filter(Boolean);
  await db.booking.deleteMany({ where: { listingId: { in: listings } } });
  await db.listing.deleteMany({ where: { id: { in: listings } } });
  await db.auditLog.deleteMany({ where: { actorId: { in: users } } });
  await db.auditLog.deleteMany({ where: { targetId: { in: users } } });
  await db.rateLimit.deleteMany({ where: { key: { startsWith: "booking:create:" + prefix } } });
  await db.rateLimit.deleteMany({ where: { key: { startsWith: "alert:host-unreachable:" + prefix } } });
  await db.rateLimit.deleteMany({ where: { key: { startsWith: "alert:channel-paused:" + prefix } } });
  await db.emailOutbox.deleteMany({ where: { providerId: { startsWith: prefix } } });
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

describe("hardening (round 2 review)", () => {
  const digits = () => `${(Date.now() + Math.floor(Math.random() * 1000)) % 1_000_000}`.padStart(6, "0");

  beforeAll(async () => {
    ids.host2 = await makeUser("Avi", digits() + "5");
    ids.guestD = await makeUser("Tamar", digits() + "6", "he");
    const listing = await db.listing.create({
      data: {
        ownerId: ids.host2,
        status: "LIVE",
        dealType: "SHORT_STAY",
        propertyType: "APARTMENT",
        pricePeriod: "NIGHT",
        price: 80,
        currency: "USD",
        maxGuests: 4,
        bookingMode: "INSTANT",
        cancellationPolicy: "FLEXIBLE",
        paymentMethodsAtCheckIn: ["cash"],
        cityId: ids.city,
        lat: 41.7102,
        lng: 44.7703,
        address: "2 Test Street, Tbilisi",
        contactMethods: [{ channel: "WHATSAPP", value: "+995555123457", order: 0 }],
        originalLocale: "en",
        title: "Second flat for booking tests",
        description: "A test listing.",
      },
    });
    ids.listing2 = listing.id;
  });

  it("B1: refuses a listing that is not public (owner suspended, or past its expiry date)", async () => {
    const quoteStay = { listingId: ids.listing, checkIn: day(70), checkOut: day(73), adults: 2 };
    await db.user.update({ where: { id: ids.host }, data: { status: "SUSPENDED" } });
    try {
      expect(await service.getBookingQuote(quoteStay)).toEqual({ ok: false, error: "not_bookable" });
      await expectCode(service.createBooking(stay(ids.guestA, day(70), day(73), { notify: false })), "not_bookable");
    } finally {
      await db.user.update({ where: { id: ids.host }, data: { status: "ACTIVE" } });
    }
    await db.listing.update({ where: { id: ids.listing }, data: { expiresAt: new Date(Date.now() - 60_000) } });
    try {
      await expectCode(service.createBooking(stay(ids.guestA, day(70), day(73), { notify: false })), "not_bookable");
    } finally {
      await db.listing.update({ where: { id: ids.listing }, data: { expiresAt: null } });
    }
    // A warned host's listing stays bookable (the listing page's rule).
    await db.user.update({ where: { id: ids.host }, data: { status: "WARNED" } });
    try {
      expect(await service.getBookingQuote(quoteStay)).toMatchObject({ ok: true });
    } finally {
      await db.user.update({ where: { id: ids.host }, data: { status: "ACTIVE" } });
    }
    expect(await db.booking.count({ where: { listingId: ids.listing, checkIn: dayToDateOf(day(70)) } })).toBe(0);
  });

  it("B2: refuses with terms_changed when the price, currency or policy differ from what the guest saw", async () => {
    const seen = await service.getBookingQuote({ listingId: ids.listing, checkIn: day(80), checkOut: day(83), adults: 2 });
    if (!seen.ok) throw new Error("no quote");
    const expected = { expectedTotal: seen.quote.total, expectedCurrency: seen.quote.currency, expectedPolicy: seen.cancellationPolicy };

    // The host raises the price while the guest is on the review page.
    await db.listing.update({ where: { id: ids.listing }, data: { price: 300 } });
    try {
      await expectCode(service.createBooking(stay(ids.guestA, day(80), day(83), { ...expected, notify: false })), "terms_changed");
    } finally {
      await db.listing.update({ where: { id: ids.listing }, data: { price: 100 } });
    }
    await expectCode(
      service.createBooking(stay(ids.guestA, day(80), day(83), { ...expected, expectedPolicy: "STRICT", notify: false })),
      "terms_changed",
    );
    await expectCode(
      service.createBooking(stay(ids.guestA, day(80), day(83), { ...expected, expectedCurrency: "GEL", notify: false })),
      "terms_changed",
    );
    expect(await db.booking.count({ where: { listingId: ids.listing, checkIn: dayToDateOf(day(80)) } })).toBe(0);

    const created = await service.createBooking(stay(ids.guestA, day(80), day(83), { ...expected, notify: false }));
    expect(created.total).toBe(seen.quote.total);
  });

  it("B5: a warned guest can book; a suspended one (even past suspendedUntil) cannot", async () => {
    try {
      await db.user.update({ where: { id: ids.guestD }, data: { status: "WARNED" } });
      const created = await service.createBooking(stay(ids.guestD, day(120), day(122), { notify: false }));
      expect(created.code).toMatch(/^BT-/);
      await db.user.update({ where: { id: ids.guestD }, data: { status: "SUSPENDED", suspendedUntil: new Date(Date.now() - 60_000) } });
      await expectCode(service.createBooking(stay(ids.guestD, day(124), day(126), { notify: false })), "not_allowed");
    } finally {
      await db.user.update({ where: { id: ids.guestD }, data: { status: "ACTIVE", suspendedUntil: null } });
    }
  });

  it("B6: deleting the account removes the guest's own cancellation text, not the host's", async () => {
    const own = await service.createBooking(stay(ids.guestD, day(86), day(88), { notify: false }));
    await service.guestCancel({ bookingId: own.id, guestUserId: ids.guestD, reasonCode: "OTHER", reasonText: "family emergency, call me", notify: false });
    const byHost = await service.createBooking(stay(ids.guestD, day(90), day(92), { notify: false }));
    await service.hostCancel({ bookingId: byHost.id, hostUserId: ids.host, reasonCode: "OTHER", reasonText: "Boiler broke", notify: false });
    expect((await db.booking.findUniqueOrThrow({ where: { id: own.id } })).cancelReason).toBe("family emergency, call me");

    await service.releaseBookingsOfDeletedAccount(ids.guestD);
    expect(await db.booking.findUniqueOrThrow({ where: { id: own.id } })).toMatchObject({ cancelReason: null, cancelReasonCode: "OTHER", guestName: "—" });
    expect((await db.booking.findUniqueOrThrow({ where: { id: byHost.id } })).cancelReason).toBe("Boiler broke");
  });

  it("B4: a booking made while a deleted host's bookings are being cancelled is refused", async () => {
    await service.createBooking(stay(ids.guestA, day(100), day(103), { listingId: ids.listing2, notify: false }));
    let late: unknown = null;
    hooks.onEmail = async () => {
      hooks.onEmail = undefined;
      // Another guest books while the cancellation emails are going out.
      late = await service
        .createBooking(stay(ids.guestC, day(110), day(113), { listingId: ids.listing2, notify: false }))
        .catch((error: unknown) => error);
    };
    try {
      expect((await service.releaseBookingsOfDeletedAccount(ids.host2)).cancelled).toBe(1);
    } finally {
      hooks.onEmail = undefined;
    }
    expect(late).toMatchObject({ code: "not_bookable" });
    expect(await db.booking.count({ where: { listingId: ids.listing2, status: "CONFIRMED" } })).toBe(0);
    expect((await db.listing.findUniqueOrThrow({ where: { id: ids.listing2 } })).bookingMode).toBe("CONTACT");
  });
});

describe("host alerts (round 3): a booking stands only once the host was told", () => {
  const digits = () => `${(Date.now() + Math.floor(Math.random() * 1000)) % 1_000_000}`.padStart(6, "0");
  let host3 = "";
  let listing3 = "";
  const REAL = { resend: true, outboxCounts: false, telegram: false, push: false };

  beforeAll(async () => {
    host3 = await makeUser("Gil", digits() + "7");
    ids.users3 = host3;
    ids.guestE = await makeUser("Rina", digits() + "8", "he");
    const listing = await db.listing.create({
      data: {
        ownerId: host3,
        status: "LIVE",
        dealType: "SHORT_STAY",
        propertyType: "APARTMENT",
        pricePeriod: "NIGHT",
        price: 60,
        currency: "USD",
        maxGuests: 4,
        bookingMode: "INSTANT",
        cancellationPolicy: "FLEXIBLE",
        paymentMethodsAtCheckIn: ["cash"],
        cityId: ids.city,
        lat: 41.7103,
        lng: 44.7704,
        address: "3 Test Street, Tbilisi",
        contactMethods: [{ channel: "WHATSAPP", value: "+995555123458", order: 0 }],
        originalLocale: "en",
        title: "Third flat for alert tests",
        description: "A test listing.",
      },
    });
    listing3 = listing.id;
    ids.listing3 = listing3;
  });

  afterEach(() => {
    hooks.result = undefined;
  });

  it("records when the host was told, then confirms to the guest", async () => {
    hooks.result = (template) => (template === "booking_new_host" ? { ok: true, delivery: "sent", providerId: `${prefix}-ok` } : { ok: true, delivery: "sent" });
    const created = await service.createBooking(stay(ids.guestA, day(150), day(152), { listingId: listing3, alerts: REAL }));
    const booking = await db.booking.findUniqueOrThrow({ where: { id: created.id } });
    expect(booking.hostNotifiedAt).toBeInstanceOf(Date);
    // The host's alert goes first; the guest's confirmation only after it was accepted.
    expect(sent.map((s) => s.template)).toEqual(["booking_new_host", "booking_confirmed_guest"]);
  });

  it("undoes the booking and its block when no channel accepted the alert, and tells the founder", async () => {
    hooks.result = (template) => (template === "booking_new_host" ? { ok: false, delivery: "failed" } : { ok: true, delivery: "logged" });
    await expectCode(service.createBooking(stay(ids.guestB, day(160), day(162), { listingId: listing3, alerts: REAL })), "host_unreachable");
    expect(await db.booking.count({ where: { listingId: listing3, checkIn: dayToDateOf(day(160)) } })).toBe(0);
    expect(await isRangeFree(listing3, day(160), day(162))).toBe(true);
    expect(sent.map((s) => s.template)).not.toContain("booking_confirmed_guest");
    expect(sent.map((s) => s.template)).toContain("admin_alert");
    const log = await db.auditLog.findFirstOrThrow({ where: { action: "booking.host_unreachable", actorId: ids.guestB, targetId: listing3 } });
    expect(log.details).toMatchObject({ stage: "after", reason: "failed" });
  });

  it("in development / test mode the outbox counts; on the real site without Resend instant booking is off", async () => {
    const outbox = await service.createBooking(stay(ids.guestC, day(170), day(172), { listingId: listing3, alerts: { resend: false, outboxCounts: true, telegram: false, push: false } }));
    expect((await db.booking.findUniqueOrThrow({ where: { id: outbox.id } })).hostNotifiedAt).not.toBeNull();
    sent.length = 0;
    await expectCode(
      service.createBooking(stay(ids.guestC, day(180), day(182), { listingId: listing3, alerts: { resend: false, outboxCounts: false, telegram: false, push: false } })),
      "host_unreachable",
    );
    // Refused before any nights were taken, and nothing was sent to the host.
    expect(sent.map((s) => s.template)).not.toContain("booking_new_host");
    expect(await isRangeFree(listing3, day(180), day(182))).toBe(true);
  });

  it("a host with only a phone (no real email) can't take instant bookings", async () => {
    await db.user.update({ where: { id: host3 }, data: { email: `${digits()}@phone.bayit.invalid` } });
    try {
      expect(await hostInstantGate(host3, REAL)).toEqual({ ok: false, reason: "no_email" });
      await expectCode(service.createBooking(stay(ids.guestA, day(190), day(192), { listingId: listing3, alerts: REAL })), "host_unreachable");
    } finally {
      await db.user.update({ where: { id: host3 }, data: { email: `${host3}@example.com` } });
    }
  });

  it("a bounce pauses the host's email, tells the guest and the founder; a later delivery resumes it", async () => {
    hooks.result = (template) => (template === "booking_new_host" ? { ok: true, delivery: "sent", providerId: `${prefix}-alert` } : { ok: true, delivery: "sent" });
    const created = await service.createBooking(stay(ids.guestE, day(200), day(202), { listingId: listing3, alerts: REAL }));
    const outboxRow = await db.emailOutbox.create({
      data: { to: `${host3}@example.com`, template: "booking_new_host", locale: "en", subject: "New booking", html: "", text: `Booking number: ${created.code}`, status: "SENT", provider: "resend", providerId: `${prefix}-alert`, createdAt: new Date(Date.now() - 60_000) },
    });
    sent.length = 0;
    const event = { kind: "bounced" as const, emailId: `${prefix}-alert`, to: [`${host3}@example.com`.toLowerCase()], tags: {}, detail: "Mailbox does not exist" };
    const result = await handleEmailBounce(event);
    expect(result).toMatchObject({ duplicate: false, paused: [host3], bookingCode: created.code });
    expect(sent.map((s) => s.template).sort()).toEqual(["admin_alert", "booking_host_unreached_guest"]);
    expect((await db.emailOutbox.findUniqueOrThrow({ where: { id: outboxRow.id } })).status).toBe("FAILED");
    // The same event delivered twice changes nothing more.
    sent.length = 0;
    expect((await handleEmailBounce(event)).duplicate).toBe(true);
    expect(sent).toHaveLength(0);
    // The booking stands; new instant bookings for this host are paused.
    expect((await db.booking.findUniqueOrThrow({ where: { id: created.id } })).status).toBe("CONFIRMED");
    expect(await hostInstantGate(host3, REAL)).toEqual({ ok: false, reason: "email_failing" });
    await expectCode(service.createBooking(stay(ids.guestE, day(210), day(212), { listingId: listing3, alerts: REAL })), "host_unreachable");

    // A later email to the same address arrived: the channel works again.
    await db.emailOutbox.create({
      data: { to: `${host3}@example.com`, template: "booking_reminder_host", locale: "en", subject: "Reminder", html: "", status: "SENT", provider: "resend", providerId: `${prefix}-later`, createdAt: new Date(Date.now() + 1000) },
    });
    expect(await handleEmailDelivered({ kind: "delivered", emailId: `${prefix}-later`, to: [`${host3}@example.com`.toLowerCase()], tags: {} })).toEqual({ resumed: [host3] });
    expect((await hostInstantGate(host3, REAL)).ok).toBe(true);
  });
});

describe("alert channels (round 3): Telegram, notifications, cancellations", () => {
  const digits = () => `${(Date.now() + Math.floor(Math.random() * 1000)) % 1_000_000}`.padStart(6, "0");
  const CHAT = `99${digits()}01`;
  const ENV = { resend: true, outboxCounts: false, telegram: true, push: false };
  const EMAIL_OFF = { alerts: { channels: { email: false } } };
  type TelegramReply = { status: number; body: Record<string, unknown> };
  const telegram: { calls: { chat_id: string; text: string }[]; next: TelegramReply } = { calls: [], next: { status: 200, body: { ok: true } } };
  const realFetch = globalThis.fetch;
  let host4 = "";
  let listing4 = "";
  let guest = "";

  beforeAll(async () => {
    process.env.TELEGRAM_BOT_TOKEN = "123456:test-token";
    process.env.TELEGRAM_BOT_USERNAME = "BayitTestBot";
    globalThis.fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input);
      if (!url.startsWith("https://api.telegram.org/")) return realFetch(input, init);
      const body = JSON.parse(String(init?.body ?? "{}")) as { chat_id: string; text: string };
      telegram.calls.push(body);
      return new Response(JSON.stringify(telegram.next.body), { status: telegram.next.status, headers: { "Content-Type": "application/json" } });
    }) as typeof fetch;
    host4 = await makeUser("Tal", digits() + "9");
    ids.host4 = host4;
    // Connected an hour ago.
    await db.user.update({ where: { id: host4 }, data: { telegramChatId: CHAT, telegramLinkedAt: new Date(Date.now() - 3600_000), notificationPrefs: EMAIL_OFF } });
    guest = await makeUser("Ziva", digits() + "5");
    ids.guestF = guest;
    const listing = await db.listing.create({
      data: {
        ownerId: host4,
        status: "LIVE",
        dealType: "SHORT_STAY",
        propertyType: "APARTMENT",
        pricePeriod: "NIGHT",
        price: 70,
        currency: "USD",
        maxGuests: 4,
        bookingMode: "INSTANT",
        cancellationPolicy: "FLEXIBLE",
        paymentMethodsAtCheckIn: ["cash"],
        cityId: ids.city,
        lat: 41.7104,
        lng: 44.7705,
        address: "4 Test Street, Tbilisi",
        contactMethods: [{ channel: "WHATSAPP", value: "+995555123459", order: 0 }],
        originalLocale: "en",
        title: "Fourth flat for channel tests",
        description: "A test listing.",
      },
    });
    listing4 = listing.id;
    ids.listing4 = listing4;
  });

  afterAll(async () => {
    globalThis.fetch = realFetch;
    delete process.env.TELEGRAM_BOT_TOKEN;
    delete process.env.TELEGRAM_BOT_USERNAME;
    await db.pushSubscription.deleteMany({ where: { userId: host4 } });
  });

  beforeEach(() => {
    telegram.calls.length = 0;
    telegram.next = { status: 200, body: { ok: true, result: { message_id: 7 } } };
  });

  afterEach(() => {
    hooks.result = undefined;
  });

  it("Telegram only: the bot's ok confirms the booking, and no email goes to the host", async () => {
    const created = await service.createBooking(stay(guest, day(220), day(222), { listingId: listing4, alerts: ENV }));
    const booking = await db.booking.findUniqueOrThrow({ where: { id: created.id } });
    expect(booking).toMatchObject({ hostNotifiedVia: "telegram" });
    expect(booking.hostNotifiedAt).toBeInstanceOf(Date);
    expect(telegram.calls).toHaveLength(1);
    expect(telegram.calls[0]).toMatchObject({ chat_id: CHAT });
    expect(telegram.calls[0].text).toContain(created.code);
    expect(sent.map((s) => s.template)).toEqual(["booking_confirmed_guest"]);
  });

  it("a 403 (bot blocked) undoes the booking when Telegram was the only confirming channel, pauses Telegram and tells the founder", async () => {
    telegram.next = { status: 403, body: { ok: false, error_code: 403, description: "Forbidden: bot was blocked by the user" } };
    await expectCode(service.createBooking(stay(ids.guestB, day(230), day(232), { listingId: listing4, alerts: ENV })), "host_unreachable");
    expect(await isRangeFree(listing4, day(230), day(232))).toBe(true);
    expect(sent.map((s) => s.template)).not.toContain("booking_confirmed_guest");
    const founder = sent.filter((s) => s.template === "admin_alert");
    expect(founder.map((s) => s.to)).toEqual(["founder-alerts@example.com", "founder-alerts@example.com"]);
    const user = await db.user.findUniqueOrThrow({ where: { id: host4 }, select: { notificationPrefs: true } });
    expect(user.notificationPrefs).toMatchObject({ alerts: { channels: { email: false }, telegram: { failing: { chatId: CHAT, reason: "blocked" } } } });
    expect(await hostInstantGate(host4, ENV)).toEqual({ ok: false, reason: "telegram_failing" });
    expect(await db.auditLog.count({ where: { action: "alerts.telegram_paused", targetId: host4 } })).toBe(1);
  });

  it("a re-connect from the settings link (/start <token>) clears the pause", async () => {
    const { telegramLinkToken } = await import("@/lib/alerts/telegram-token");
    const { handleTelegramCommand } = await import("@/lib/alerts/telegram-bot");
    const secret = process.env.BETTER_AUTH_SECRET ?? "";
    expect(secret.length).toBeGreaterThan(0);
    expect(await handleTelegramCommand({ kind: "start", chatId: CHAT, token: "garbage_1_xxxxxxxxxxxxxxxx", locale: "en" })).toBe("expired");
    const token = telegramLinkToken(host4, secret, new Date())!;
    expect(await handleTelegramCommand({ kind: "start", chatId: CHAT, token, locale: "en" })).toBe("linked");
    // The same link again is spent.
    expect(await handleTelegramCommand({ kind: "start", chatId: `${CHAT}9`, token, locale: "en" })).toBe("expired");
    expect(await hostInstantGate(host4, ENV)).toEqual({ ok: true, channels: ["telegram"] });
    expect(telegram.calls.map((c) => c.chat_id)).toEqual([CHAT, CHAT, `${CHAT}9`]);
  });

  it("browser notifications alone never allow instant booking", async () => {
    await db.user.update({ where: { id: host4 }, data: { telegramChatId: null } });
    await db.pushSubscription.create({
      data: { userId: host4, endpoint: `https://fcm.googleapis.com/fcm/send/${prefix}`, p256dh: "x".repeat(87), auth: "y".repeat(22) },
    });
    try {
      expect(await hostInstantGate(host4, { ...ENV, push: true })).toEqual({ ok: false, reason: "no_channel" });
      await expectCode(service.createBooking(stay(ids.guestC, day(240), day(242), { listingId: listing4, alerts: { ...ENV, push: true } })), "host_unreachable");
      expect(telegram.calls).toHaveLength(0);
      expect(await isRangeFree(listing4, day(240), day(242))).toBe(true);
    } finally {
      await db.pushSubscription.deleteMany({ where: { userId: host4 } });
      await db.user.update({ where: { id: host4 }, data: { telegramChatId: CHAT } });
    }
  });

  it("email + Telegram: both get the booking and the guest's cancellation; a later bounce doesn't alarm the guest", async () => {
    await db.user.update({ where: { id: host4 }, data: { notificationPrefs: { alerts: { channels: { email: true } } } } });
    hooks.result = (template) => (template === "booking_new_host" ? { ok: true, delivery: "sent", providerId: `${prefix}-both` } : { ok: true, delivery: "sent" });
    const created = await service.createBooking(stay(ids.guestE, day(250), day(252), { listingId: listing4, alerts: ENV }));
    expect(await db.booking.findUniqueOrThrow({ where: { id: created.id } })).toMatchObject({ hostNotifiedVia: "email,telegram" });
    expect(sent.map((s) => s.template)).toEqual(["booking_new_host", "booking_confirmed_guest"]);

    // The email bounces later: Telegram had it too, so the guest is not told; email is paused, Telegram tells the host.
    await db.emailOutbox.create({
      data: { to: `${host4}@example.com`, template: "booking_new_host", locale: "en", subject: "New booking", html: "", text: `Booking number: ${created.code}`, status: "SENT", provider: "resend", providerId: `${prefix}-both`, createdAt: new Date(Date.now() - 60_000) },
    });
    sent.length = 0;
    telegram.calls.length = 0;
    await handleEmailBounce({ kind: "bounced", emailId: `${prefix}-both`, to: [`${host4}@example.com`.toLowerCase()], tags: {}, detail: "Mailbox full" });
    expect(sent.map((s) => s.template)).toEqual(["admin_alert"]);
    expect(sent[0].subject).not.toContain(created.code);
    expect(telegram.calls).toHaveLength(1);
    expect(await hostInstantGate(host4, ENV)).toEqual({ ok: true, channels: ["telegram"] });

    // The guest cancels: the host hears about it on Telegram (email is paused).
    sent.length = 0;
    telegram.calls.length = 0;
    await service.guestCancel({ bookingId: created.id, guestUserId: ids.guestE, reasonCode: "CHANGE_OF_PLANS" });
    expect(telegram.calls).toHaveLength(1);
    expect(telegram.calls[0].text).toContain(created.code);
    expect(sent.map((s) => s.template)).not.toContain("booking_cancelled_by_guest");
  });
});

function dayToDateOf(value: string) {
  return new Date(`${value}T00:00:00Z`);
}
