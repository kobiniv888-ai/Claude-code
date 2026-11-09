/**
 * SECURITY_REPORT 4.8.a / 4.3.a / 4.2.c against the local database: the booking endpoints hold on
 * the exact object. Another guest cannot cancel, see or download someone's booking; another host
 * cannot cancel it, report a no-show or touch the calendar, prices or calendar links of a listing
 * that is not theirs. Every refusal is "not found" (nothing tells them it exists) and nothing
 * changes. The owner then can (so the refusals are about the account, not a broken fixture).
 *
 * Creates its own users (fake @example.com addresses, +995 59… test numbers), city, listing and
 * booking, and removes them afterwards. The session is replaced; the real actions run.
 */
import "dotenv/config";
import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { sealAddress, sealPin } from "@/lib/field-crypto";

process.env.TWILIO_ACCOUNT_SID = "";
process.env.RESEND_API_KEY = "";
process.env.ADMIN_ALERT_EMAIL = "founder-alerts@example.com";
delete process.env.TELEGRAM_BOT_TOKEN;
delete process.env.VAPID_PUBLIC_KEY;

const state = vi.hoisted(() => ({ user: null as null | { id: string; twoFactorVerified: boolean } }));

vi.mock("server-only", () => ({}));
vi.mock("next/headers", () => ({ headers: async () => new Headers({ host: "localhost:3000" }), cookies: async () => ({ get: () => undefined }) }));
vi.mock("next/server", async (importOriginal) => ({ ...(await importOriginal<typeof import("next/server")>()), after: () => {} }));
vi.mock("next-intl/server", () => ({ getTranslations: async () => (key: string) => key, getLocale: async () => "he" }));
vi.mock("@/lib/request", () => ({ getIpHash: async () => "test-ip", getClientIp: async () => "203.0.113.9" }));
vi.mock("@/lib/email", async (importOriginal) => {
  const real = await importOriginal<typeof import("@/lib/email")>();
  return { ...real, sendEmail: vi.fn(async () => ({ ok: true, delivery: "logged" as const })) };
});
vi.mock("@/lib/sms", () => ({ isSmsConfigured: () => false, sendSms: vi.fn(async () => ({ ok: true, delivered: false })) }));
vi.mock("@/lib/security/events", () => ({ recordSecurityEvent: async () => true }));
vi.mock("@/lib/auth/session", async () => {
  const { AuthRequiredError } = await import("@/lib/errors");
  const current = () => (state.user ? { ...state.user, role: "USER", isDemo: false, status: "ACTIVE", locale: "he" } : null);
  return {
    getCurrentUser: async () => current(),
    requireUserForAction: async () => {
      const user = current();
      if (!user || !user.twoFactorVerified) throw new AuthRequiredError();
      return user;
    },
  };
});
vi.mock("@/lib/rate-limit", async (importOriginal) => {
  const real = await importOriginal<typeof import("@/lib/rate-limit")>();
  return { ...real, rateLimitByIp: async () => ({ ok: true, remaining: 100, resetAt: new Date() }) };
});

const { db } = await import("@/lib/db");
const service = await import("@/lib/booking/service");
const bookingActions = await import("@/lib/booking/actions");
const hostActions = await import("@/lib/booking/host-actions");
const datePriceActions = await import("@/lib/booking/date-price-actions");
const { getGuestTrip } = await import("@/lib/booking/queries");
const { addDays, tbilisiToday } = await import("@/lib/booking/dates");
const tripIcs = await import("@/app/api/ical/booking/[code]/route");

const prefix = `xac${randomUUID().replace(/-/g, "").slice(0, 10)}`;
const digits = String(Date.now() % 1_000_000).padStart(6, "0");
const ids = { city: "", host: "", otherHost: "", guest: "", otherGuest: "", listing: "", otherListing: "", booking: "", code: "" };
const users: string[] = [];
const today = tbilisiToday();
const day = (n: number) => addDays(today, n);
const as = (id: string | null) => {
  state.user = id ? { id, twoFactorVerified: true } : null;
};

async function makeUser(name: string, last: string) {
  const id = `${prefix}-${name}`;
  await db.user.create({ data: { id, name, firstName: name, email: `${id}@example.com`, phoneNumber: `+99559${digits}${last}`, phoneNumberVerified: true, locale: "he" } });
  users.push(id);
  return id;
}

async function makeListing(ownerId: string, title: string) {
  const listing = await db.listing.create({
    data: {
      ownerId,
      status: "LIVE",
      dealType: "SHORT_STAY",
      propertyType: "APARTMENT",
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
  return listing.id;
}

const snapshot = async () => {
  const booking = await db.booking.findUniqueOrThrow({ where: { id: ids.booking }, select: { status: true, cancelledAt: true, noShowReportedAt: true } });
  const listing = await db.listing.findUniqueOrThrow({ where: { id: ids.listing }, select: { icalToken: true, icalImportUrls: true } });
  const blocks = await db.availabilityBlock.count({ where: { listingId: ids.listing } });
  const prices = await db.datePrice.count({ where: { listingId: ids.listing } });
  return { booking, listing, blocks, prices };
};

beforeAll(async () => {
  const city = await db.city.create({ data: { slug: `${prefix}-city`, names: { he: "עיר", en: "City", ru: "Город", ar: "مدينة", ka: "ქალაქი" }, searchText: "city", lat: 41.7, lng: 44.8 } });
  ids.city = city.id;
  ids.host = await makeUser("Host", "0");
  ids.otherHost = await makeUser("OtherHost", "1");
  ids.guest = await makeUser("Guest", "2");
  ids.otherGuest = await makeUser("OtherGuest", "3");
  ids.listing = await makeListing(ids.host, "flat");
  ids.otherListing = await makeListing(ids.otherHost, "other flat");
  const booked = await service.createBooking({
    listingId: ids.listing,
    guestUserId: ids.guest,
    checkIn: day(10),
    checkOut: day(12),
    adults: 2,
    children: 0,
    infants: 0,
    guestName: "Guest",
    rulesAccepted: true,
    locale: "he",
    notify: false,
  });
  ids.booking = booked.id;
  ids.code = booked.code;
});

afterAll(async () => {
  const listings = [ids.listing, ids.otherListing].filter(Boolean);
  await db.booking.deleteMany({ where: { listingId: { in: listings } } });
  await db.listing.deleteMany({ where: { id: { in: listings } } });
  await db.auditLog.deleteMany({ where: { OR: [{ actorId: { in: users } }, { targetId: { in: [ids.booking, ...listings] } }] } });
  await db.rateLimit.deleteMany({ where: { key: { contains: prefix } } });
  await db.user.deleteMany({ where: { id: { in: users } } });
  await db.city.deleteMany({ where: { id: ids.city } });
});

describe("booking endpoints hold on the exact object (4.8.a)", () => {
  it("another guest: cannot cancel, read or download the booking", async () => {
    const before = await snapshot();
    as(ids.otherGuest);
    expect(await bookingActions.cancelBookingAsGuestAction({ bookingId: ids.booking, reasonCode: "CHANGE_OF_PLANS" })).toMatchObject({ ok: false, error: "not_found" });
    expect(await getGuestTrip(ids.otherGuest, ids.code, "he")).toBeNull();
    const res = await tripIcs.GET(new Request(`http://localhost/api/ical/booking/${ids.code}.ics`), { params: Promise.resolve({ code: `${ids.code}.ics` }) });
    expect(res.status).toBe(404);
    expect(await res.text()).not.toContain("Test Street");
    expect(await snapshot()).toEqual(before);
  });

  it("the guest's own host side does not exist for them: a guest cannot act as the host", async () => {
    as(ids.guest);
    expect(await bookingActions.cancelBookingAsHostAction({ bookingId: ids.booking, reasonCode: "DOUBLE_BOOKING" })).toMatchObject({ ok: false, error: "not_found" });
    expect(await bookingActions.reportNoShowAction({ bookingId: ids.booking })).toMatchObject({ ok: false });
  });

  it("another host: cannot cancel, report a no-show, or change the calendar, prices or links of this listing", async () => {
    const before = await snapshot();
    as(ids.otherHost);
    expect(await bookingActions.cancelBookingAsHostAction({ bookingId: ids.booking, reasonCode: "DOUBLE_BOOKING" })).toMatchObject({ ok: false, error: "not_found" });
    expect(await bookingActions.reportNoShowAction({ bookingId: ids.booking })).toMatchObject({ ok: false, error: "not_found" });
    expect(await hostActions.saveHostBlocksAction({ listingId: ids.listing, blocked: [{ start: day(30), end: day(31) }] })).toMatchObject({ ok: false, error: "not_found" });
    expect(await hostActions.saveIcalImportsAction({ listingId: ids.listing, urls: [] })).toMatchObject({ ok: false, error: "not_found" });
    expect(await hostActions.syncIcalNowAction({ listingId: ids.listing })).toMatchObject({ ok: false, error: "not_found" });
    expect(await hostActions.replaceCalendarLinkAction({ listingId: ids.listing })).toMatchObject({ ok: false, error: "not_found" });
    expect(await datePriceActions.saveDatePriceAction({ listingId: ids.listing, start: day(40), last: day(42), price: 150 })).toMatchObject({ ok: false, error: "not_found" });
    expect(await snapshot()).toEqual(before);
  });

  it("signed out or with the 2-step code pending: refused before anything is read", async () => {
    as(null);
    expect(await bookingActions.cancelBookingAsGuestAction({ bookingId: ids.booking, reasonCode: "CHANGE_OF_PLANS" })).toMatchObject({ ok: false, error: "auth_required" });
    state.user = { id: ids.guest, twoFactorVerified: false };
    expect(await bookingActions.cancelBookingAsGuestAction({ bookingId: ids.booking, reasonCode: "CHANGE_OF_PLANS" })).toMatchObject({ ok: false, error: "auth_required" });
    expect(await hostActions.saveHostBlocksAction({ listingId: ids.listing, blocked: [] })).toMatchObject({ ok: false, error: "auth_required" });
  });

  it("the owners can (the refusals above are about the account)", async () => {
    as(ids.host);
    expect(await hostActions.saveHostBlocksAction({ listingId: ids.listing, blocked: [{ start: day(30), end: day(31) }] })).toMatchObject({ ok: true });
    as(ids.guest);
    expect(await getGuestTrip(ids.guest, ids.code, "he")).not.toBeNull();
    expect(await bookingActions.cancelBookingAsGuestAction({ bookingId: ids.booking, reasonCode: "CHANGE_OF_PLANS" })).toMatchObject({ ok: true });
  });
});
