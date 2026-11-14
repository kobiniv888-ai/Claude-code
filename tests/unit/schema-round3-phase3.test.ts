/**
 * Round 3, phase 3 database changes against the local database (DATABASE_URL in .env, pushed
 * with prisma/sql/before-push.sql + prisma db push): defaults, the new enum values, date-only
 * columns, what happens to reports and reference prices when a booking, neighborhood or city is
 * deleted, and the new indexes. Creates its own users, city, listing and booking (fake addresses)
 * and removes them afterwards.
 */
import "dotenv/config";
import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { sealGuestPhone } from "@/lib/field-crypto";

vi.mock("server-only", () => ({}));

const { db } = await import("@/lib/db");
const { Prisma } = await import("@/generated/prisma/client");
const { ReportKind, ReportReason, ReportTarget } = await import("@/generated/prisma/enums");

const prefix = `p3s${randomUUID().replace(/-/g, "").slice(0, 10)}`;
const ids = { host: `${prefix}-host`, guest: `${prefix}-guest`, city: "", hood: "", listing: "" };
const names = { he: "עיר", en: "City", ru: "Город", ar: "مدينة", ka: "ქალაქი" };
/** Every report the tests create (some outlive their users: the reporter link is SetNull). */
const reportIds: string[] = [];

async function createReport(data: Parameters<typeof db.report.create>[0]["data"]) {
  const report = await db.report.create({ data });
  reportIds.push(report.id);
  return report;
}

async function createBooking(suffix: string) {
  return db.booking.create({
    data: {
      code: `${prefix}-${suffix}`.toUpperCase(),
      listingId: ids.listing,
      guestUserId: ids.guest,
      hostUserId: ids.host,
      checkIn: new Date("2026-12-01T00:00:00Z"),
      checkOut: new Date("2026-12-03T00:00:00Z"),
      nights: 2,
      adults: 2,
      nightlyPrice: new Prisma.Decimal(50),
      subtotal: new Prisma.Decimal(100),
      total: new Prisma.Decimal(100),
      currency: "USD",
      cancellationPolicy: "MODERATE",
      guestName: "Guest",
      ...sealGuestPhone("+995500000000"),
      locale: "he",
      rulesAcceptedAt: new Date(),
    },
  });
}

async function createCity(suffix: string) {
  return db.city.create({ data: { slug: `${prefix}-${suffix}`, names, searchText: "city", lat: 41.6, lng: 41.6 } });
}

function referencePrice(cityId: string, neighborhoodId: string | null = null) {
  return db.referencePrice.create({
    data: {
      cityId,
      neighborhoodId,
      dealType: "MONTHLY_RENT",
      unit: "MONTH",
      low: new Prisma.Decimal("450.5"),
      high: new Prisma.Decimal("900"),
      currency: "USD",
      sourceName: "Test report",
      sourceMonth: new Date("2026-10-01T00:00:00Z"),
    },
  });
}

beforeAll(async () => {
  await db.user.createMany({
    data: [
      { id: ids.host, name: "Host", email: `${prefix}-host@example.com` },
      { id: ids.guest, name: "Guest", email: `${prefix}-guest@example.com` },
    ],
  });
  const city = await createCity("city");
  ids.city = city.id;
  const hood = await db.neighborhood.create({
    data: { cityId: city.id, slug: `${prefix}-hood`, names, searchText: "hood", lat: 41.6, lng: 41.6 },
  });
  ids.hood = hood.id;
  const listing = await db.listing.create({
    data: { ownerId: ids.host, status: "LIVE", dealType: "SHORT_STAY", cityId: city.id, title: "Test" },
  });
  ids.listing = listing.id;
});

afterAll(async () => {
  await db.report.deleteMany({ where: { id: { in: reportIds } } });
  await db.booking.deleteMany({ where: { listingId: ids.listing } });
  await db.listing.deleteMany({ where: { id: ids.listing } });
  await db.city.deleteMany({ where: { slug: { startsWith: prefix } } });
  await db.user.deleteMany({ where: { id: { in: [ids.host, ids.guest] } } });
});

describe("Report (round 3: turned-away and review reports)", () => {
  it("has the new kinds, reasons and target", () => {
    expect(Object.values(ReportKind)).toEqual(["GENERAL", "TURNED_AWAY"]);
    expect(Object.values(ReportReason)).toEqual(
      expect.arrayContaining(["CANCELLED_FOR_IDENTITY", "ASKED_RELIGION_OR_ORIGIN", "REFUSED_OR_IGNORED", "OTHER"]),
    );
    expect(Object.values(ReportTarget)).toContain("REVIEW");
  });

  it("an ordinary report is GENERAL and NORMAL, with nothing revealed or attached", async () => {
    const report = await createReport({ targetType: "LISTING", listingId: ids.listing, reporterId: ids.guest, reason: "WRONG_PRICE" });
    expect(report).toMatchObject({
      kind: "GENERAL",
      priority: "NORMAL",
      bookingId: null,
      reviewId: null,
      happenedOn: null,
      attachments: null,
      attachmentsDeletedAt: null,
      adminNote: null,
      actionTaken: null,
      reporterRevealedAt: null,
    });
  });

  it("stores a turned-away report with its booking, day, attachments and priority", async () => {
    const booking = await createBooking("ta1");
    const attachments = [{ key: "private/reports/x.webp", contentType: "image/webp", bytes: 1234 }];
    const report = await createReport({
      kind: "TURNED_AWAY",
      targetType: "USER",
      targetUserId: ids.host,
      listingId: ids.listing,
      bookingId: booking.id,
      reporterId: ids.guest,
      reason: "ASKED_RELIGION_OR_ORIGIN",
      priority: "URGENT",
      happenedOn: new Date("2026-11-02T21:30:00Z"),
      attachments,
    });
    expect(report).toMatchObject({ kind: "TURNED_AWAY", reason: "ASKED_RELIGION_OR_ORIGIN", priority: "URGENT", attachments });
    // @db.Date keeps the calendar day only.
    expect(report.happenedOn?.toISOString()).toBe("2026-11-02T00:00:00.000Z");
    const viaBooking = await db.booking.findUniqueOrThrow({ where: { id: booking.id }, select: { reports: { select: { id: true } } } });
    expect(viaBooking.reports.map((r) => r.id)).toEqual([report.id]);
  });

  it("keeps the report when its booking is deleted (bookingId becomes null)", async () => {
    const booking = await createBooking("ta2");
    const report = await createReport({ kind: "TURNED_AWAY", targetType: "USER", targetUserId: ids.host, bookingId: booking.id, reason: "CANCELLED_FOR_IDENTITY" });
    await db.booking.delete({ where: { id: booking.id } });
    const after = await db.report.findUnique({ where: { id: report.id } });
    expect(after).toMatchObject({ id: report.id, bookingId: null, kind: "TURNED_AWAY" });
  });

  it("refuses a review report whose reviewId points to no review (a relation since round 3, phase 5)", async () => {
    await expect(
      createReport({ targetType: "REVIEW", reviewId: "review-that-does-not-exist", reason: "OFFENSIVE", reporterId: ids.host }),
    ).rejects.toMatchObject({ code: "P2003" });
    const report = await createReport({ targetType: "REVIEW", reason: "OFFENSIVE", reporterId: ids.host });
    expect(report).toMatchObject({ targetType: "REVIEW", reviewId: null, kind: "GENERAL" });
  });
});

describe("flag reviewed and visited fields", () => {
  it("are empty by default and round-trip", async () => {
    const booking = await createBooking("fl1");
    expect(booking).toMatchObject({ flagReviewedAt: null, flagReviewedById: null });
    const reviewedAt = new Date("2026-11-04T10:00:00Z");
    const updated = await db.booking.update({
      where: { id: booking.id },
      data: { flagReviewedAt: reviewedAt, flagReviewedById: "staff-x" },
    });
    expect(updated).toMatchObject({ flagReviewedAt: reviewedAt, flagReviewedById: "staff-x" });

    const host = await db.user.update({ where: { id: ids.host }, data: { hostFlagReviewedAt: reviewedAt } });
    expect(host.hostFlagReviewedAt).toEqual(reviewedAt);

    const before = await db.listing.findUniqueOrThrow({ where: { id: ids.listing } });
    expect(before).toMatchObject({ visitedAt: null, visitedNote: null, visitedById: null });
    const visited = await db.listing.update({
      where: { id: ids.listing },
      data: { visitedAt: new Date("2026-11-03T18:45:00Z"), visitedNote: "Staff note", visitedById: "staff-x" },
    });
    expect(visited.visitedAt?.toISOString()).toBe("2026-11-03T00:00:00.000Z");
    expect(visited).toMatchObject({ visitedNote: "Staff note", visitedById: "staff-x" });
  });
});

describe("ReferencePrice", () => {
  it("has the defaults, keeps the decimals and stores the month as a date", async () => {
    const row = await referencePrice(ids.city, ids.hood);
    expect(row).toMatchObject({ countryCode: "GE", active: true, perSqm: false, propertyType: null, bedrooms: null, unit: "MONTH" });
    expect(row.low.toString()).toBe("450.5");
    expect(row.high.toString()).toBe("900");
    expect(row.sourceMonth.toISOString()).toBe("2026-10-01T00:00:00.000Z");
    const city = await db.city.findUniqueOrThrow({ where: { id: ids.city }, select: { referencePrices: { select: { id: true } } } });
    expect(city.referencePrices.map((r) => r.id)).toContain(row.id);
  });

  it("is removed with its neighborhood, and with its city", async () => {
    const city = await createCity("gone");
    const hood = await db.neighborhood.create({
      data: { cityId: city.id, slug: `${prefix}-gone-hood`, names, searchText: "hood", lat: 41.6, lng: 41.6 },
    });
    const inHood = await referencePrice(city.id, hood.id);
    const cityWide = await referencePrice(city.id);
    await db.neighborhood.delete({ where: { id: hood.id } });
    expect(await db.referencePrice.findUnique({ where: { id: inHood.id } })).toBeNull();
    expect(await db.referencePrice.findUnique({ where: { id: cityWide.id } })).not.toBeNull();
    await db.city.delete({ where: { id: city.id } });
    expect(await db.referencePrice.findUnique({ where: { id: cityWide.id } })).toBeNull();
  });
});

describe("indexes", () => {
  it("exist in the database", async () => {
    const rows = await db.$queryRaw<{ indexname: string }[]>`
      SELECT indexname FROM pg_indexes
      WHERE schemaname = current_schema()
        AND indexname IN ('Report_kind_status_createdAt_idx', 'Report_targetUserId_idx', 'ReferencePrice_cityId_dealType_active_idx')`;
    expect(rows.map((r) => r.indexname).sort()).toEqual([
      "ReferencePrice_cityId_dealType_active_idx",
      "Report_kind_status_createdAt_idx",
      "Report_targetUserId_idx",
    ]);
  });
});
