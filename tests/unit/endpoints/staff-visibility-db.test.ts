/**
 * Founder's decision Q12 (SECURITY_REPORT 4.3.a, 4.3.d, 4.3.h) against the local database: who
 * sent a report and the guest's phone on a booking are ADMIN only. For MODERATOR and SUPPORT the
 * admin queries never return them (not on the report queue, the report page, the user page, the
 * booking page, or through a booking search by phone); moderators keep everything else.
 *
 * Creates its own users, city, listing, booking and reports (fake @example.com addresses and a fake
 * +995 test number) and removes them afterwards.
 */
import "dotenv/config";
import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

const { db } = await import("@/lib/db");
const { Prisma } = await import("@/generated/prisma/client");
const { getReportDetail, listReports } = await import("@/lib/admin/server/reports");
const { getUserDetail, searchUsers } = await import("@/lib/admin/server/users");
const { getAdminBooking, searchBookings } = await import("@/lib/admin/server/bookings");
const { getListingForReview } = await import("@/lib/admin/server/moderation");

const prefix = `q12${randomUUID().replace(/-/g, "").slice(0, 10)}`;
const REPORTER_NAME = `${prefix} Reporter-Secret`;
const GUEST_PHONE = `+99559${String(Date.now() % 1_000_000).padStart(6, "0")}7`;
const ids = { host: `${prefix}-host`, reporter: `${prefix}-reporter`, guest: `${prefix}-guest`, city: "", listing: "", report: "", booking: "" };
const VIEWERS = {
  ADMIN: { id: `${prefix}-admin`, role: "ADMIN" },
  MODERATOR: { id: `${prefix}-mod`, role: "MODERATOR" },
  SUPPORT: { id: `${prefix}-support`, role: "SUPPORT" },
} as const;

beforeAll(async () => {
  await db.user.createMany({
    data: [
      { id: ids.host, name: `${prefix} Host`, email: `${prefix}-host@example.com` },
      { id: ids.reporter, name: REPORTER_NAME, firstName: "Reporter", email: `${prefix}-reporter@example.com` },
      { id: ids.guest, name: `${prefix} Guest`, email: `${prefix}-guest@example.com`, phoneNumber: GUEST_PHONE, phoneNumberVerified: true },
    ],
  });
  const city = await db.city.create({ data: { slug: `${prefix}-city`, names: { he: "עיר", en: "City", ru: "Город", ar: "مدينة", ka: "ქალაქი" }, searchText: "city", lat: 41.6, lng: 41.6 } });
  ids.city = city.id;
  const listing = await db.listing.create({ data: { ownerId: ids.host, status: "LIVE", dealType: "SHORT_STAY", cityId: city.id, title: `${prefix} flat` } });
  ids.listing = listing.id;
  const booking = await db.booking.create({
    data: {
      code: `BT-${Array.from({ length: 5 }, () => "23456789ABCDEFGHJKLMNPQRSTUVWXYZ"[Math.floor(Math.random() * 32)]).join("")}`,
      listingId: ids.listing,
      guestUserId: ids.guest,
      hostUserId: ids.host,
      checkIn: new Date("2026-12-04T00:00:00Z"),
      checkOut: new Date("2026-12-07T00:00:00Z"),
      nights: 3,
      adults: 2,
      nightlyPrice: new Prisma.Decimal(80),
      subtotal: new Prisma.Decimal(240),
      total: new Prisma.Decimal(240),
      currency: "USD",
      cancellationPolicy: "MODERATE",
      guestName: `${prefix} Guest`,
      guestPhone: GUEST_PHONE,
      locale: "he",
      rulesAcceptedAt: new Date(),
    },
  });
  ids.booking = booking.id;
  const report = await db.report.create({
    data: { kind: "TURNED_AWAY", targetType: "USER", targetUserId: ids.host, reporterId: ids.reporter, reason: "CANCELLED_FOR_IDENTITY", priority: "URGENT", bookingId: booking.id },
  });
  ids.report = report.id;
  // A second report about the same host, from the same reporter ("other reports" on the page).
  await db.report.create({ data: { targetType: "LISTING", listingId: ids.listing, reporterId: ids.reporter, reason: "WRONG_PRICE" } });
});

afterAll(async () => {
  await db.report.deleteMany({ where: { reporterId: ids.reporter } });
  await db.booking.deleteMany({ where: { listingId: ids.listing } });
  await db.listing.deleteMany({ where: { id: ids.listing } });
  await db.city.deleteMany({ where: { slug: { startsWith: prefix } } });
  await db.user.deleteMany({ where: { id: { in: [ids.host, ids.reporter, ids.guest] } } });
});

const json = (value: unknown) => JSON.stringify(value);

describe("who sent a report: ADMIN only (Q12)", () => {
  it("the report queue names the sender for an ADMIN only", async () => {
    const filters = { tab: "turnedAway" as const, status: "OPEN" as const };
    for (const role of ["MODERATOR", "SUPPORT"] as const) {
      const list = await listReports(filters, 1, "he", VIEWERS[role]);
      const row = list.rows.find((r) => r.id === ids.report);
      expect(row, role).toBeDefined();
      expect(row!.reporter, role).toBeNull();
      expect(row!.reporterWithheld, role).toBe(true);
      expect(json(row), role).not.toContain(REPORTER_NAME);
      expect(json(row), role).not.toContain(ids.reporter);
    }
    const admin = (await listReports(filters, 1, "he", VIEWERS.ADMIN)).rows.find((r) => r.id === ids.report);
    expect(admin?.reporter).toEqual({ id: ids.reporter, name: REPORTER_NAME });
    expect(admin?.reporterWithheld).toBe(false);
  });

  it("the report page leaves the sender out for other staff, everywhere on it", async () => {
    for (const role of ["MODERATOR", "SUPPORT"] as const) {
      const detail = await getReportDetail(ids.report, "he", VIEWERS[role]);
      expect(detail, role).not.toBeNull();
      expect(detail!.report.reporter, role).toBeNull();
      expect(detail!.report.reporterWithheld, role).toBe(true);
      expect(detail!.report.reporterIsViewer, role).toBe(false);
      // Whether the host could be told stays known (the ADMIN's reveal step), the name does not.
      expect(detail!.report.reporterRevealable, role).toBe(true);
      expect(detail!.otherReports.length, role).toBeGreaterThanOrEqual(1);
      expect(json(detail), role).not.toContain(REPORTER_NAME);
      expect(json(detail), role).not.toContain(ids.reporter);
      // The rest stays: the booking, the reported host.
      expect(detail!.report.booking?.id, role).toBe(ids.booking);
      expect(detail!.account?.id, role).toBe(ids.host);
    }
    const admin = await getReportDetail(ids.report, "he", VIEWERS.ADMIN);
    expect(admin!.report.reporter).toMatchObject({ id: ids.reporter, name: REPORTER_NAME, _count: { reportsMade: 2 } });
    expect(admin!.otherReports.every((r) => r.reporter?.name === REPORTER_NAME)).toBe(true);
  });

  it("a staff member who sent the report is told it is their own, without their id on the page", async () => {
    const detail = await getReportDetail(ids.report, "he", { id: ids.reporter, role: "MODERATOR" });
    expect(detail!.report.reporterIsViewer).toBe(true);
    expect(detail!.report.reporter).toBeNull();
  });

  it("the user page: the reports a user sent, and the senders of reports against them, for an ADMIN only", async () => {
    for (const role of ["MODERATOR", "SUPPORT"] as const) {
      const reporter = await getUserDetail(ids.reporter, VIEWERS[role]);
      expect(reporter!.reportsMade, role).toBeNull();
      const host = await getUserDetail(ids.host, VIEWERS[role]);
      expect(host!.reportsAgainst.length, role).toBeGreaterThanOrEqual(2);
      expect(host!.reportsAgainst.every((r) => r.reporter === null), role).toBe(true);
      expect(json(host!.reportsAgainst), role).not.toContain(REPORTER_NAME);
    }
    const asAdmin = await getUserDetail(ids.reporter, VIEWERS.ADMIN);
    expect(asAdmin!.reportsMade?.length).toBe(2);
    const hostAsAdmin = await getUserDetail(ids.host, VIEWERS.ADMIN);
    expect(hostAsAdmin!.reportsAgainst.some((r) => r.reporter?.name === REPORTER_NAME)).toBe(true);
  });
});

describe("the listing review page (moderation): report senders ADMIN only (Q12)", () => {
  it("lists the reports about the listing without their senders for a MODERATOR", async () => {
    const mod = await getListingForReview(ids.listing, VIEWERS.MODERATOR);
    expect(mod!.reports.length).toBeGreaterThanOrEqual(1);
    expect(mod!.reports.every((r) => r.reporter === null)).toBe(true);
    expect(mod!.reporterWithheld).toBe(true);
    expect(json(mod!.reports)).not.toContain(REPORTER_NAME);
    const admin = await getListingForReview(ids.listing, VIEWERS.ADMIN);
    expect(admin!.reports.some((r) => r.reporter?.name === REPORTER_NAME)).toBe(true);
  });
});

describe("the guest's phone on a booking: ADMIN only (Q12)", () => {
  it("the booking page reads the phone for an ADMIN only", async () => {
    const mod = await getAdminBooking(ids.booking, "he", VIEWERS.MODERATOR);
    expect(mod!.booking.guestPhone).toBeNull();
    expect(mod!.booking.guestPhoneWithheld).toBe(true);
    expect(json(mod)).not.toContain(GUEST_PHONE);
    // Moderators keep the rest of the booking.
    expect(mod!.booking.guestName).toBe(`${prefix} Guest`);
    expect(mod!.lines.length).toBeGreaterThan(0);

    const admin = await getAdminBooking(ids.booking, "he", VIEWERS.ADMIN);
    expect(admin!.booking.guestPhone).toBe(GUEST_PHONE);
    expect(admin!.booking.guestPhoneWithheld).toBe(false);
  });

  it("a booking search by phone finds the booking for an ADMIN only (a search result is an answer too)", async () => {
    const filters = { q: GUEST_PHONE, from: null, to: null };
    const mod = await searchBookings(filters, 1, "he", VIEWERS.MODERATOR);
    expect(mod.rows.map((r) => r.id)).not.toContain(ids.booking);
    const admin = await searchBookings(filters, 1, "he", VIEWERS.ADMIN);
    expect(admin.rows.map((r) => r.id)).toContain(ids.booking);
    // Searching by the booking code still works for moderators.
    const byCode = await searchBookings({ q: (await db.booking.findUniqueOrThrow({ where: { id: ids.booking }, select: { code: true } })).code, from: null, to: null }, 1, "he", VIEWERS.MODERATOR);
    expect(byCode.rows.map((r) => r.id)).toEqual([ids.booking]);
  });
});

describe("the account's phone on the user pages: ADMIN only (Q12, it is the guest phone of its bookings)", () => {
  it("the user page leaves the number out for moderators and support", async () => {
    for (const role of ["MODERATOR", "SUPPORT"] as const) {
      const page = await getUserDetail(ids.guest, VIEWERS[role]);
      expect(page!.user.phoneNumber, role).toBeNull();
      expect(page!.phoneWithheld, role).toBe(true);
      expect(json(page), role).not.toContain(GUEST_PHONE);
    }
    const admin = await getUserDetail(ids.guest, VIEWERS.ADMIN);
    expect(admin!.user.phoneNumber).toBe(GUEST_PHONE);
    expect(admin!.phoneWithheld).toBe(false);
  });

  it("the user list neither shows nor searches by phone for moderators and support", async () => {
    const filters = { q: GUEST_PHONE };
    for (const role of ["MODERATOR", "SUPPORT"] as const) {
      const found = await searchUsers(filters, 1, VIEWERS[role]);
      expect(found.rows.map((r) => r.id), role).not.toContain(ids.guest);
      const byName = await searchUsers({ ...filters, q: `${prefix} Guest` }, 1, VIEWERS[role]);
      expect(byName.rows.map((r) => r.id), role).toContain(ids.guest);
      expect(json(byName), role).not.toContain(GUEST_PHONE);
    }
    const admin = await searchUsers(filters, 1, VIEWERS.ADMIN);
    expect(admin.rows.find((r) => r.id === ids.guest)?.phoneNumber).toBe(GUEST_PHONE);
  });
});
