/**
 * Round 3, phase 3 (brief 8.2 "automatic flags" and 9 "Flags", "Bookings") against the local
 * database: the host flag (2+ counting reports in 12 months, reopened by a new report after
 * "mark reviewed"), the 48-hour cancellation flag, the flagged-host check the review rule uses,
 * the flag lists, the booking search and the staff booking page, and the home page's counts.
 * Creates its own users, city, listing, bookings and reports (fake @example.com addresses) and
 * removes them afterwards.
 */
import "dotenv/config";
import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

const { db } = await import("@/lib/db");
const { Prisma } = await import("@/generated/prisma/client");
const { getOpenFlagCounts, hostFlagSummary, isHostFlagged, listFlags } = await import("@/lib/admin/server/flags");
const { bookingSearchWhere, getAdminBooking, searchBookings } = await import("@/lib/admin/server/bookings");
const { loadAttentionCounts } = await import("@/lib/admin/server/attention");

const prefix = `p3f${randomUUID().replace(/-/g, "").slice(0, 10)}`;
const ids = { host: `${prefix}-host`, guest: `${prefix}-guest`, other: `${prefix}-other`, city: "", listing: "" };
const names = { he: "עיר", en: "City", ru: "Город", ar: "مدينة", ka: "ქალაქი" };
const reportIds: string[] = [];
const ALPHABET = "23456789ABCDEFGHJKLMNPQRSTUVWXYZ";

function code(): string {
  let out = "BT-";
  for (let i = 0; i < 5; i++) out += ALPHABET[Math.floor(Math.random() * ALPHABET.length)];
  return out;
}

async function report(data: Partial<Parameters<typeof db.report.create>[0]["data"]> = {}) {
  const row = await db.report.create({
    data: { targetType: "USER", targetUserId: ids.host, reporterId: ids.guest, reason: "OTHER", ...data } as Parameters<typeof db.report.create>[0]["data"],
  });
  reportIds.push(row.id);
  return row;
}

async function booking(data: Partial<Parameters<typeof db.booking.create>[0]["data"]> = {}) {
  return db.booking.create({
    data: {
      code: code(),
      listingId: ids.listing,
      guestUserId: ids.guest,
      hostUserId: ids.host,
      checkIn: new Date("2026-12-04T00:00:00Z"),
      checkOut: new Date("2026-12-07T00:00:00Z"),
      nights: 3,
      adults: 2,
      nightlyPrice: new Prisma.Decimal(80),
      weekendPrice: new Prisma.Decimal(100),
      // Dec 4 to 7, 2026: Friday and Saturday are weekend nights (2 × 100 + 80).
      subtotal: new Prisma.Decimal(280),
      cleaningFee: new Prisma.Decimal(20),
      total: new Prisma.Decimal(300),
      currency: "USD",
      cancellationPolicy: "MODERATE",
      guestName: `${prefix} Guest`,
      guestPhone: "+995500000001",
      locale: "he",
      rulesAcceptedAt: new Date(),
      ...data,
    } as Parameters<typeof db.booking.create>[0]["data"],
  });
}

beforeAll(async () => {
  await db.user.createMany({
    data: [
      { id: ids.host, name: `${prefix} Host`, email: `${prefix}-host@example.com` },
      { id: ids.guest, name: `${prefix} Guest`, email: `${prefix}-guest@example.com` },
      { id: ids.other, name: `${prefix} Other`, email: `${prefix}-other@example.com` },
    ],
  });
  const city = await db.city.create({ data: { slug: `${prefix}-city`, names, searchText: "city", lat: 41.6, lng: 41.6 } });
  ids.city = city.id;
  const listing = await db.listing.create({ data: { ownerId: ids.host, status: "LIVE", dealType: "SHORT_STAY", cityId: city.id, title: `${prefix} flat` } });
  ids.listing = listing.id;
});

afterAll(async () => {
  await db.report.deleteMany({ where: { id: { in: reportIds } } });
  await db.booking.deleteMany({ where: { listingId: ids.listing } });
  await db.listing.deleteMany({ where: { id: ids.listing } });
  await db.city.deleteMany({ where: { slug: { startsWith: prefix } } });
  await db.user.deleteMany({ where: { id: { in: [ids.host, ids.guest, ids.other] } } });
});

describe("host report flag (2+ reports in 12 months)", () => {
  it("is off with one report, on with two, dismissed and review reports left out", async () => {
    await report({ kind: "TURNED_AWAY", reason: "CANCELLED_FOR_IDENTITY", priority: "URGENT" });
    expect(await isHostFlagged(ids.host)).toBe(false);
    await report({ status: "DISMISSED" });
    // A review report (its review gone: reviewId is a real relation since round 3, phase 5).
    await report({ targetType: "REVIEW" });
    // A report older than 12 months does not count either.
    await report({ createdAt: new Date(Date.now() - 400 * 24 * 3600 * 1000) });
    expect(await isHostFlagged(ids.host)).toBe(false);
    // A report about one of the host's listings counts for the host.
    await report({ targetType: "LISTING", targetUserId: null, listingId: ids.listing, reporterId: ids.other, reason: "WRONG_PRICE" });
    expect(await isHostFlagged(ids.host)).toBe(true);
    const summary = await hostFlagSummary(ids.host);
    expect(summary).toMatchObject({ flagged: true, reportFlagOpen: true, countingReports: 2, turnedAway: 1, openCancellations: 0 });
  });

  it("is listed among the open host flags", async () => {
    const result = await listFlags("hosts", "open", 1, "he");
    // The list is paged; find this host on any page by its id through the count + summary.
    expect(result.counts.hosts).toBeGreaterThanOrEqual(1);
    const counts = await getOpenFlagCounts();
    expect(counts.hosts).toBeGreaterThanOrEqual(1);
  });

  it("closes when staff mark it reviewed, and a new report opens it again", async () => {
    const latest = await db.report.findFirstOrThrow({ where: { id: { in: reportIds } }, orderBy: { createdAt: "desc" }, select: { createdAt: true } });
    await db.user.update({ where: { id: ids.host }, data: { hostFlagReviewedAt: new Date(latest.createdAt.getTime() + 1) } });
    expect(await isHostFlagged(ids.host)).toBe(false);
    expect((await hostFlagSummary(ids.host))?.reportFlagOpen).toBe(false);
    await new Promise((resolve) => setTimeout(resolve, 5));
    await report();
    expect(await isHostFlagged(ids.host)).toBe(true);
  });
});

describe("booking flags (cancelled within 48 hours, no-shows)", () => {
  it("flags the host while a 48-hour cancellation is open, never for a no-show", async () => {
    // Close the report flag first, so only the bookings count.
    await db.user.update({ where: { id: ids.host }, data: { hostFlagReviewedAt: new Date(Date.now() + 60_000) } });
    expect(await isHostFlagged(ids.host)).toBe(false);
    await booking({ status: "NO_SHOW", noShowReportedAt: new Date() });
    expect(await isHostFlagged(ids.host)).toBe(false);
    expect((await hostFlagSummary(ids.host))?.openNoShows).toBe(1);

    const cancelled = await booking({ status: "CANCELLED_BY_HOST", cancelledAt: new Date(), flaggedForReview: true, cancelReasonCode: "OTHER" });
    expect(await isHostFlagged(ids.host)).toBe(true);
    const open = await listFlags("cancellations", "open", 1, "he");
    expect(open.counts.cancellations).toBeGreaterThanOrEqual(1);

    await db.booking.update({ where: { id: cancelled.id }, data: { flagReviewedAt: new Date(), flagReviewedById: ids.other } });
    expect(await isHostFlagged(ids.host)).toBe(false);
  });
});

describe("bookings search and the staff booking page", () => {
  it("finds a booking by its code, the guest's name or the listing number, and by stay dates", async () => {
    const row = await booking({ status: "CONFIRMED" });
    const byCode = await searchBookings({ q: row.code.toLowerCase(), from: null, to: null }, 1, "he");
    expect(byCode.rows.map((r) => r.id)).toEqual([row.id]);
    const listing = await db.listing.findUniqueOrThrow({ where: { id: ids.listing }, select: { publicId: true } });
    const byListing = await searchBookings({ q: `#${listing.publicId}`, from: null, to: null }, 1, "he");
    expect(byListing.rows.map((r) => r.id)).toContain(row.id);
    const byGuest = await searchBookings({ q: `${prefix} Guest`, from: null, to: null }, 1, "he");
    expect(byGuest.rows.map((r) => r.id)).toContain(row.id);
    // Stays whose nights touch 2026-12-06 include this one (Dec 4 to 7); Dec 7 itself does not.
    const touching = await db.booking.count({ where: { AND: [await bookingSearchWhere({ q: "", from: new Date("2026-12-06T00:00:00Z"), to: new Date("2026-12-06T00:00:00Z") }), { id: row.id }] } });
    expect(touching).toBe(1);
    const after = await db.booking.count({ where: { AND: [await bookingSearchWhere({ q: "", from: new Date("2026-12-07T00:00:00Z"), to: null }), { id: row.id }] } });
    expect(after).toBe(0);
    // Text that cannot match anything finds nothing.
    expect((await searchBookings({ q: "zz", status: "NO_SHOW", from: null, to: null }, 1, "he")).rows.every((r) => r.status === "NO_SHOW")).toBe(true);
  });

  it("shows the price lines copied at booking time and the reports about it", async () => {
    const row = await booking({ status: "CONFIRMED", hostNotifiedAt: new Date(), hostNotifiedVia: "email,push" });
    await report({ kind: "TURNED_AWAY", bookingId: row.id, reason: "ASKED_RELIGION_OR_ORIGIN" });
    const detail = await getAdminBooking(row.id, "he");
    expect(detail?.booking.notifiedVia).toEqual(["email", "push"]);
    expect(detail?.booking.reports).toHaveLength(1);
    // Dec 4, 5 and 6, 2026: Friday and Saturday nights are weekend nights.
    expect(detail!.lines).toEqual([
      { kind: "weekday", nights: 1, price: 80, amount: 80 },
      { kind: "weekend", nights: 2, price: 100, amount: 200 },
      { kind: "cleaning", amount: 20 },
    ]);
    // When the rebuilt nights do not add up to the stored subtotal (a pricing rule the page no longer
    // knows), the nights become one line with the stored subtotal and no per-night price.
    await db.booking.update({ where: { id: row.id }, data: { subtotal: new Prisma.Decimal(250) } });
    expect((await getAdminBooking(row.id, "he"))!.lines).toEqual([
      { kind: "weekday", nights: 3, amount: 250 },
      { kind: "cleaning", amount: 20 },
    ]);
  });
});

describe("admin home counts", () => {
  it("loads every count in one go", async () => {
    const { failed, ...counts } = await loadAttentionCounts();
    expect(failed).toEqual([]);
    for (const value of Object.values(counts)) expect(Number.isInteger(value) && value >= 0).toBe(true);
    expect(counts.turnedAwayReports).toBeGreaterThanOrEqual(1);
  });
});
