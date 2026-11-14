/**
 * Trust and scams against the local database (DATABASE_URL in .env; SECURITY_REPORT 14.2.a,
 * 14.5.b, 14.5.e): the payment-details guard refuses, records one security event and one automatic
 * report per account (or listing) and surface; the risk engine blocks payment details stored in a
 * listing and sends exclusionary text to a person; a review burst flags the listing once.
 * Creates its own users (fake @example.com addresses), city, listing, bookings and reviews with
 * a unique prefix and removes them afterwards.
 */
import "dotenv/config";
import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { sealGuestPhone } from "@/lib/field-crypto";

process.env.HASH_SALT ||= "test-salt-trust";
vi.mock("server-only", () => ({}));
vi.mock("@/lib/request", () => ({ getIpHash: async () => "test-ip", getClientIp: async () => "203.0.113.7" }));

const { db } = await import("@/lib/db");
const { Prisma } = await import("@/generated/prisma/client");
const { refusePaymentDetails, refusePaymentFields } = await import("@/lib/risk/text-guard");
const { checkReviewBurst } = await import("@/lib/reviews/burst-server");
const { REVIEW_BURST_COUNT } = await import("@/lib/reviews/burst");
const { assessListing } = await import("@/lib/risk");

const prefix = `trs${randomUUID().replace(/-/g, "").slice(0, 10)}`;
const ids = { host: `${prefix}-host`, guest: `${prefix}-guest`, city: "", listing: "" };
const names = { he: "עיר", en: "City", ru: "Город", ar: "مدينة", ka: "ქალაქი" };
const PAY_TEXT = "Please send the deposit to paypal.me/demo-host before you come.";

beforeAll(async () => {
  for (const [n, id] of [ids.host, ids.guest].entries()) {
    // A verified phone (the risk engine blocks an unverified owner); fake numbers of the test range.
    await db.user.create({
      data: { id, name: `Dana ${id.slice(-5)} Levi`, firstName: "Dana", email: `${id}@example.com`, locale: "en", phoneNumber: `+99555599${String(Date.now()).slice(-4)}${n}`, phoneNumberVerified: true },
    });
  }
  const city = await db.city.create({ data: { slug: `${prefix}-city`, names, searchText: "city", lat: 41.64, lng: 41.63 } });
  ids.city = city.id;
  const listing = await db.listing.create({
    data: { ownerId: ids.host, status: "LIVE", dealType: "SHORT_STAY", cityId: city.id, title: "Test flat", currency: "GEL", price: new Prisma.Decimal(55) },
  });
  ids.listing = listing.id;
});

afterAll(async () => {
  await db.report.deleteMany({ where: { OR: [{ listingId: ids.listing }, { targetUserId: { startsWith: prefix } }] } });
  await db.securityEvent.deleteMany({ where: { userId: { startsWith: prefix } } });
  await db.review.deleteMany({ where: { hostUserId: ids.host } });
  await db.booking.deleteMany({ where: { hostUserId: ids.host } });
  await db.listing.deleteMany({ where: { ownerId: ids.host } });
  await db.city.deleteMany({ where: { slug: { startsWith: prefix } } });
  await db.user.deleteMany({ where: { id: { startsWith: prefix } } });
});

describe("refusePaymentDetails (14.2.a)", () => {
  it("lets clean text through and writes nothing", async () => {
    expect(await refusePaymentDetails({ surface: "review", userId: ids.guest, listingId: ids.listing, texts: ["A quiet, clean flat near the park."] })).toBe(false);
    expect(await db.securityEvent.count({ where: { userId: ids.guest } })).toBe(0);
  });

  it("refuses a payment link, records one event and one urgent automatic report", async () => {
    expect(await refusePaymentDetails({ surface: "review", userId: ids.guest, listingId: ids.listing, texts: [PAY_TEXT] })).toBe(true);
    // Auto-save sends the same text again: still refused, nothing written twice.
    expect(await refusePaymentDetails({ surface: "review", userId: ids.guest, listingId: ids.listing, texts: [PAY_TEXT] })).toBe(true);

    const events = await db.securityEvent.findMany({ where: { userId: ids.guest, type: "payment_details_blocked" } });
    expect(events).toHaveLength(1);
    expect(events[0].meta).toMatchObject({ surface: "review", kinds: "payment_link" });
    expect(JSON.stringify(events[0].meta)).not.toContain("paypal");

    const reports = await db.report.findMany({ where: { listingId: ids.listing, reporterId: null, details: { contains: "surface=review " } } });
    expect(reports).toHaveLength(1);
    expect(reports[0]).toMatchObject({ targetType: "LISTING", reason: "ASKED_MONEY_UPFRONT", priority: "URGENT", status: "OPEN" });
    // The staff note holds the masked sample, never the full link.
    expect(reports[0].details).not.toContain("demo-host");
  });

  it("flags the account when there is no listing, per field for forms", async () => {
    const errors = await refusePaymentFields({ surface: "profile", userId: ids.host, fields: { bio: "Pay with USDT TRC20 only", name: "Dana" } });
    expect(errors).toEqual({ bio: ["paymentInText"] });
    const report = await db.report.findFirst({ where: { targetUserId: ids.host, reporterId: null } });
    expect(report).toMatchObject({ targetType: "USER", reason: "ASKED_MONEY_UPFRONT", priority: "URGENT" });
  });
});

describe("assessListing (14.2.a, 14.5.e)", () => {
  it("blocks payment details stored in the listing text", async () => {
    await db.listing.update({ where: { id: ids.listing }, data: { description: "A bright flat. IBAN GE29NB0000000101904917 for the deposit." } });
    const result = await assessListing(ids.listing);
    expect(result.blocked).toBe(true);
    expect(result.reasons.map((r) => r.code)).toContain("payment_details");
  });

  it("sends exclusionary text to review without blocking", async () => {
    await db.listing.update({ where: { id: ids.listing }, data: { description: "A bright flat near the park. No Arabs." } });
    const result = await assessListing(ids.listing);
    expect(result.reasons.map((r) => r.code)).not.toContain("payment_details");
    expect(result.blocked).toBe(false);
    expect(result.requiresReview).toBe(true);
    expect(result.reasons.map((r) => r.code)).toContain("exclusionary_text");
    await db.listing.update({ where: { id: ids.listing }, data: { description: "A bright flat near the park." } });
  });
});

describe("checkReviewBurst (14.5.b)", () => {
  async function addReview(n: number) {
    const booking = await db.booking.create({
      data: {
        code: `${prefix}-${n}`.toUpperCase(),
        listingId: ids.listing,
        guestUserId: ids.guest,
        hostUserId: ids.host,
        checkIn: new Date("2026-10-01T00:00:00.000Z"),
        checkOut: new Date("2026-10-04T00:00:00.000Z"),
        nights: 3,
        adults: 2,
        nightlyPrice: new Prisma.Decimal(55),
        subtotal: new Prisma.Decimal(165),
        total: new Prisma.Decimal(165),
        currency: "GEL",
        cancellationPolicy: "MODERATE",
        status: "COMPLETED",
        guestName: "Dana",
        ...sealGuestPhone("+995555990702"),
        locale: "en",
        rulesAcceptedAt: new Date(),
      },
    });
    await db.review.create({
      data: { bookingId: booking.id, listingId: ids.listing, guestUserId: ids.guest, hostUserId: ids.host, rating: 5, text: "A quiet, clean flat.", language: "en" },
    });
  }

  it("flags the listing once when it gets REVIEW_BURST_COUNT reviews in a day", async () => {
    for (let n = 1; n < REVIEW_BURST_COUNT; n++) await addReview(n);
    expect(await checkReviewBurst(ids.listing)).toBe(false);

    await addReview(REVIEW_BURST_COUNT);
    expect(await checkReviewBurst(ids.listing)).toBe(true);
    expect(await checkReviewBurst(ids.listing)).toBe(false);

    const reports = await db.report.findMany({ where: { listingId: ids.listing, reporterId: null, details: { startsWith: "auto · review_burst" } } });
    expect(reports).toHaveLength(1);
    expect(reports[0]).toMatchObject({ reason: "OTHER", status: "OPEN" });
    expect(await db.securityEvent.count({ where: { userId: ids.host, type: "review_burst" } })).toBe(1);
  });
});
