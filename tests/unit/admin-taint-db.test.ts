/**
 * taint-1 (SECURITY_REPORT 5.k, 5.a): the admin loaders that read guest phones, account emails and
 * phones, reporter identity, the exact address or verification documents taint their RAW rows, so a
 * future refactor that hands such a row to a Client Component (on a MODERATOR's page, say) makes
 * React throw instead of sending the phone to the browser. The pages get DTOs built from the rows,
 * never the rows themselves.
 *
 * Runs against the local database with its own fake rows (cleaned up) and a recording taint API
 * (setTaintApiForTests); React's real taint behaviour is tested in src/lib/security/taint.test.ts.
 */
import "dotenv/config";
import { randomInt, randomUUID } from "node:crypto";
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import { sealAddress, sealGuestPhone, sealPin } from "@/lib/field-crypto";

vi.mock("server-only", () => ({}));
vi.mock("next/cache", () => ({ revalidatePath: () => {}, revalidateTag: () => {}, unstable_cache: (fn: unknown) => fn, updateTag: () => {} }));

const { db } = await import("@/lib/db");
const taint = await import("@/lib/security/taint");
const { getAdminBooking } = await import("@/lib/admin/server/bookings");
const { getUserDetail, searchUsers } = await import("@/lib/admin/server/users");
const { getReportDetail } = await import("@/lib/admin/server/reports");
const { getListingForReview } = await import("@/lib/admin/server/moderation");
const { getVerificationDetail } = await import("@/lib/admin/server/verifications");

const prefix = `tnt${randomUUID().replace(/-/g, "").slice(0, 10)}`;
const ids = { admin: `${prefix}-admin`, host: `${prefix}-host`, guest: `${prefix}-guest`, listing: "", booking: "", report: "", verification: "" };
const admin = { id: ids.admin, role: "ADMIN" };
const moderator = { id: `${prefix}-mod`, role: "MODERATOR" };

/** Every object the loaders tainted in this test, with the message. */
const tainted: { message: string; object: object }[] = [];

beforeAll(async () => {
  const stamp = `${Date.now() % 100_000}`.padStart(5, "0");
  await db.user.create({ data: { id: ids.admin, name: "Admin", email: `${ids.admin}@example.com`, role: "ADMIN", twoFactorEnabled: true } });
  await db.user.create({ data: { id: ids.host, name: "Host Test", email: `${ids.host}@example.com`, phoneNumber: `+99559${stamp}1`, phoneNumberVerified: true } });
  await db.user.create({ data: { id: ids.guest, name: "Guest Test", email: `${ids.guest}@example.com`, phoneNumber: `+99559${stamp}2`, phoneNumberVerified: true } });
  const listing = await db.listing.create({
    data: {
      ownerId: ids.host,
      status: "IN_REVIEW",
      dealType: "SHORT_STAY",
      propertyType: "APARTMENT",
      pricePeriod: "NIGHT",
      price: 100,
      currency: "USD",
      pinEnc: sealPin({ lat: 41.7101, lng: 44.7702 }),
      addressEnc: sealAddress("1 Taint Test Street"),
      contactMethods: [{ channel: "WHATSAPP", value: `+99559${stamp}3`, order: 0 }],
      originalLocale: "en",
      title: "Taint test flat",
      description: "A test listing.",
    },
  });
  ids.listing = listing.id;
  const booking = await db.booking.create({
    data: {
      code: `BT-${Array.from({ length: 5 }, () => "23456789ABCDEFGHJKLMNPQRSTUVWXYZ"[randomInt(32)]).join("")}`,
      listingId: ids.listing,
      guestUserId: ids.guest,
      hostUserId: ids.host,
      checkIn: new Date(Date.UTC(2027, 0, 10)),
      checkOut: new Date(Date.UTC(2027, 0, 12)),
      nights: 2,
      adults: 2,
      nightlyPrice: 100,
      subtotal: 200,
      total: 200,
      currency: "USD",
      cancellationPolicy: "MODERATE",
      status: "CONFIRMED",
      guestName: "Guest Test",
      ...sealGuestPhone(`+99559${stamp}2`),
      messageToHost: "We arrive late.",
      locale: "en",
      rulesAcceptedAt: new Date(),
    },
  });
  ids.booking = booking.id;
  const report = await db.report.create({ data: { targetType: "LISTING", reason: "OTHER", details: "taint test", listingId: ids.listing, reporterId: ids.guest } });
  ids.report = report.id;
  const verification = await db.verificationRequest.create({ data: { userId: ids.host, type: "ID", documents: [] } });
  ids.verification = verification.id;
});

afterEach(() => {
  taint.setTaintApiForTests(null);
  tainted.length = 0;
});

afterAll(async () => {
  await db.verificationRequest.deleteMany({ where: { id: ids.verification } });
  await db.report.deleteMany({ where: { id: ids.report } });
  await db.booking.deleteMany({ where: { id: ids.booking } });
  await db.auditLog.deleteMany({ where: { OR: [{ actorId: { in: [ids.admin, moderator.id] } }, { targetId: { in: [ids.booking, ids.listing, ids.report] } }] } });
  await db.listing.deleteMany({ where: { id: ids.listing } });
  await db.user.deleteMany({ where: { id: { in: [ids.admin, ids.host, ids.guest] } } });
});

function recordTaints() {
  taint.setTaintApiForTests({
    experimental_taintObjectReference: (message, object) => void tainted.push({ message, object }),
    experimental_taintUniqueValue: () => {},
  });
}

/** The tainted raw row with this id (by reference: the DTO the loader returns is another object). */
function taintedRow(id: string) {
  return tainted.find((t) => (t.object as { id?: unknown }).id === id);
}

describe("admin loaders taint their raw rows (taint-1)", () => {
  it("the booking detail (guest phone, message): the row is tainted, the page gets another object", async () => {
    recordTaints();
    const detail = await getAdminBooking(ids.booking, "en", moderator);
    expect(detail).not.toBeNull();
    const row = taintedRow(ids.booking);
    expect(row?.message).toMatch(/raw admin booking row/);
    expect(Object.values(detail!)).not.toContain(row!.object);
    expect(detail).not.toBe(row!.object);
  });

  it("the user detail and the user list (email, phone)", async () => {
    recordTaints();
    const detail = await getUserDetail(ids.host, moderator);
    const row = taintedRow(ids.host);
    expect(row?.message).toMatch(/raw admin user row/);
    expect(detail!.user).not.toBe(row!.object);

    tainted.length = 0;
    const list = await searchUsers({ q: prefix }, 1, moderator);
    const listed = taintedRow(ids.host);
    expect(listed?.message).toMatch(/raw admin user list row/);
    expect(list.rows.find((r) => r.id === ids.host)).not.toBe(listed!.object);
  });

  it("the report detail (details, the reporter)", async () => {
    recordTaints();
    const detail = await getReportDetail(ids.report, "en", admin);
    const row = taintedRow(ids.report);
    expect(row?.message).toMatch(/raw admin report row/);
    expect(detail!.report).not.toBe(row!.object);
    // The reporter's account row read to decide is tainted too (it is never returned).
    expect(tainted.some((t) => /raw reporter account row/.test(t.message))).toBe(true);
  });

  it("the listing under review (exact address, contact values), for ADMIN and MODERATOR", async () => {
    for (const viewer of [admin, moderator]) {
      recordTaints();
      const review = await getListingForReview(ids.listing, viewer);
      const row = taintedRow(ids.listing);
      expect(row?.message).toMatch(/raw listing row under review/);
      // Even for an ADMIN (who sees the contact values) the page gets a copy, never the row.
      expect(review!.listing).not.toBe(row!.object);
      tainted.length = 0;
    }
  });

  it("the verification request (documents, the account)", async () => {
    recordTaints();
    const detail = await getVerificationDetail(ids.verification, moderator);
    const row = taintedRow(ids.verification);
    expect(row?.message).toMatch(/raw verification request row/);
    expect(detail!.request).not.toBe(row!.object);
  });
});
