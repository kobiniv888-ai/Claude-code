/**
 * SECURITY_REPORT 4.8.a, the two cases still open after S2 (S2 review, fixer B), against the local
 * database with the REAL session code (src/lib/auth/session.ts) and the real actions; only Better
 * Auth's cookie check is replaced (its answer names a real Session row of ours):
 *
 * 1. A review reply by another host (or by the guest who wrote it) is "not found" and changes
 *    nothing; the listing's own host can reply (so the refusals are about the account).
 * 2. A demo account acting on real data: on the real site (SITE_ENV=production) a demo account's
 *    session counts as signed out, so it cannot reply, report, cancel or book ("auth_required");
 *    on a test site it is an ordinary other account and gets "not found" on real objects.
 *
 * Creates its own users (fake @example.com addresses, +995 59… test numbers), city, listing,
 * booking, review and sessions, and removes them afterwards.
 */
import "dotenv/config";
import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { sealAddress, sealPin } from "@/lib/field-crypto";

const state = vi.hoisted(() => ({ session: null as null | { id: string; userId: string } }));

vi.mock("server-only", () => ({}));
vi.mock("next/headers", () => ({ headers: async () => new Headers({ host: "localhost:3000" }), cookies: async () => ({ get: () => undefined }) }));
vi.mock("next/server", async (importOriginal) => ({ ...(await importOriginal<typeof import("next/server")>()), after: () => {} }));
vi.mock("@/i18n/navigation", () => ({ redirect: () => { throw new Error("NEXT_REDIRECT"); } }));
vi.mock("next/cache", () => ({ revalidatePath: () => {}, revalidateTag: () => {}, updateTag: () => {}, unstable_cache: (fn: unknown) => fn }));
vi.mock("next-intl/server", async (importOriginal) => ({
  ...(await importOriginal<typeof import("next-intl/server")>()),
  getLocale: async () => "he",
  getTranslations: async () => (key: string) => key,
}));
vi.mock("@/lib/request", () => ({ getIpHash: async () => "test-ip", getClientIp: async () => "203.0.113.9", getDeviceHash: async () => null }));
vi.mock("@/lib/security/events", () => ({ recordSecurityEvent: async () => true }));
vi.mock("@/lib/settings", async (importOriginal) => ({ ...(await importOriginal<typeof import("@/lib/settings")>()), assertNotShabbatMode: async () => undefined }));
// Better Auth's cookie check only: the session it "found" is a real row (getCurrentUser reads it).
vi.mock("@/lib/auth/server", () => ({
  auth: {
    api: {
      getSession: async () =>
        state.session ? { session: { id: state.session.id, token: `${state.session.id}-token`, userId: state.session.userId }, user: { id: state.session.userId } } : null,
    },
  },
}));

const { db } = await import("@/lib/db");
const reviews = await import("@/lib/reviews/actions");
const bookings = await import("@/lib/booking/actions");
const { addDays, dayToDate, tbilisiToday } = await import("@/lib/booking/dates");

const { TERMS_VERSION } = await import("@/lib/legal/terms");
const prefix = `xrd${randomUUID().replace(/-/g, "").slice(0, 10)}`;
const digits = String(Date.now() % 1_000_000).padStart(6, "0");
const users: string[] = [];
const ids = { city: "", host: "", otherHost: "", guest: "", demo: "", listing: "", booking: "", upcoming: "", review: "" };
const today = tbilisiToday();

async function makeUser(name: string, last: string, isDemo = false) {
  const id = `${prefix}-${name}`;
  await db.user.create({
    data: { id, name, firstName: name, email: `${id}@example.com`, phoneNumber: `+99559${digits}${last}`, phoneNumberVerified: true, locale: "he", isDemo },
  });
  await db.session.create({ data: { id: `${id}-session`, token: `${id}-token`, userId: id, expiresAt: new Date(Date.now() + 3600_000) } });
  // Accepted the Terms in force at sign-up (every signed-in action checks it: S2 review LP-1).
  await db.termsAcceptance.create({ data: { userId: id, version: TERMS_VERSION, ageConfirmed: true } });
  users.push(id);
  return id;
}
const as = (id: string | null) => {
  state.session = id ? { id: `${id}-session`, userId: id } : null;
};
const reviewNow = () => db.review.findUniqueOrThrow({ where: { id: ids.review }, select: { hostReply: true, hostReplyAt: true, hidden: true } });
const reply = (text = "Thank you for staying with us!") => reviews.replyToReview({ reviewId: ids.review, text, confirmFinal: true });

beforeAll(async () => {
  const city = await db.city.create({ data: { slug: `${prefix}-city`, names: { he: "עיר", en: "City", ru: "Город", ar: "مدينة", ka: "ქალაქი" }, searchText: "city", lat: 41.7, lng: 44.8 } });
  ids.city = city.id;
  ids.host = await makeUser("host", "01");
  ids.otherHost = await makeUser("other", "02");
  ids.guest = await makeUser("guest", "03");
  ids.demo = await makeUser("demo", "04", true);
  await db.listing.create({ data: { ownerId: ids.otherHost, dealType: "SHORT_STAY", title: `${prefix} other flat`, status: "LIVE" } });
  const listing = await db.listing.create({
    data: {
      ownerId: ids.host,
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
      title: `${prefix} flat`,
      description: "A test listing.",
      isDemo: false,
    },
  });
  ids.listing = listing.id;
  const base = {
    listingId: listing.id,
    guestUserId: ids.guest,
    hostUserId: ids.host,
    nights: 2,
    adults: 1,
    nightlyPrice: 100,
    subtotal: 200,
    total: 200,
    currency: "USD" as const,
    cancellationPolicy: "MODERATE" as const,
    guestName: "Guest",
    locale: "he" as const,
    rulesAcceptedAt: new Date(),
  };
  const past = await db.booking.create({
    data: { ...base, code: `T-${prefix}-1`, status: "COMPLETED", checkIn: dayToDate(addDays(today, -10)), checkOut: dayToDate(addDays(today, -8)) },
  });
  ids.booking = past.id;
  ids.upcoming = (
    await db.booking.create({ data: { ...base, code: `T-${prefix}-2`, status: "CONFIRMED", checkIn: dayToDate(addDays(today, 30)), checkOut: dayToDate(addDays(today, 32)) } })
  ).id;
  ids.review = (
    await db.review.create({
      data: { bookingId: past.id, listingId: listing.id, guestUserId: ids.guest, hostUserId: ids.host, rating: 5, text: "A quiet, clean flat near the park.", language: "en" },
    })
  ).id;
});

afterAll(async () => {
  await db.review.deleteMany({ where: { hostUserId: { in: users } } });
  await db.report.deleteMany({ where: { OR: [{ reporterId: { in: users } }, { targetUserId: { in: users } }] } });
  await db.booking.deleteMany({ where: { hostUserId: { in: users } } });
  await db.listing.deleteMany({ where: { ownerId: { in: users } } });
  await db.auditLog.deleteMany({ where: { actorId: { in: users } } });
  await db.rateLimit.deleteMany({ where: { key: { contains: prefix } } });
  await db.session.deleteMany({ where: { userId: { in: users } } });
  await db.user.deleteMany({ where: { id: { in: users } } });
  await db.city.deleteMany({ where: { id: ids.city } });
});

describe("review replies hold on the exact review (4.8.a)", () => {
  it("another host, the guest who wrote it, and a demo account: not found, nothing changes", async () => {
    const before = await reviewNow();
    for (const id of [ids.otherHost, ids.guest, ids.demo]) {
      as(id);
      expect(await reply(), id).toMatchObject({ ok: false, error: "not_found" });
    }
    expect(await reviewNow()).toEqual(before);
  });

  it("signed out: refused before anything is read", async () => {
    as(null);
    expect(await reply()).toMatchObject({ ok: false, error: "auth_required" });
  });
});

describe("a demo account acting on real data (4.8.a)", () => {
  it("on the real site a demo account's session is signed out: no reply, no cancel, no booking", async () => {
    const previous = process.env.SITE_ENV;
    process.env.SITE_ENV = "production";
    try {
      as(ids.demo);
      expect(await reply()).toMatchObject({ ok: false, error: "auth_required" });
      expect(await bookings.cancelBookingAsGuestAction({ bookingId: ids.upcoming, reasonCode: "CHANGE_OF_PLANS" })).toMatchObject({ ok: false, error: "auth_required" });
      expect(
        await bookings.createBookingAction({ listingId: ids.listing, checkIn: addDays(today, 40), checkOut: addDays(today, 42), adults: 1, guestName: "Demo", rulesAccepted: true }),
      ).toMatchObject({ ok: false, error: "auth_required" });
    } finally {
      process.env.SITE_ENV = previous;
    }
    expect(await db.booking.count({ where: { guestUserId: ids.demo } })).toBe(0);
    expect((await db.booking.findUniqueOrThrow({ where: { id: ids.upcoming } })).status).toBe("CONFIRMED");
  });

  it("on a test site a demo account is just another account: a real guest's booking is not found", async () => {
    as(ids.demo);
    expect(await bookings.cancelBookingAsGuestAction({ bookingId: ids.upcoming, reasonCode: "CHANGE_OF_PLANS" })).toMatchObject({ ok: false, error: "not_found" });
    expect(await bookings.cancelBookingAsHostAction({ bookingId: ids.upcoming, reasonCode: "OTHER", reasonText: "Taking it over" })).toMatchObject({ ok: false, error: "not_found" });
    expect((await db.booking.findUniqueOrThrow({ where: { id: ids.upcoming } })).status).toBe("CONFIRMED");
  });

  it("the listing's own host can reply (the refusals above are about the account)", async () => {
    as(ids.host);
    expect(await reply()).toMatchObject({ ok: true });
    expect((await reviewNow()).hostReply).toBe("Thank you for staying with us!");
  });
});
