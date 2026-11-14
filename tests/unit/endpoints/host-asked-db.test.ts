/**
 * Founder's answer (4), 9 Nov 2026 (SECURITY_REPORT 4.6.c, C22) against the local database:
 * "the host asked me to cancel".
 *
 * - The guest's cancellation with HOST_ASKED is not flagged yet; it waits for the host's answer.
 * - The host confirms → HOST_ASKED_CONFIRMED: it does not count against the guest, it counts
 *   against the host (hostFlagSummary.hostCancellations), and Admin → Flags lists it.
 * - The host says no → HOST_ASKED_DENIED: admin review queue (flaggedForReview), counts as a
 *   guest cancellation for the review-only guest flag.
 * - No answer within 72 hours → the timeout job (expireHostAskedAnswers, run by
 *   /api/cron/complete-bookings) writes HOST_ASKED_EXPIRED and queues it for review.
 * - Only the booking's host may answer, once, and only within the 72 hours.
 *
 * Creates its own users (@example.com, +995 59… test numbers), city, listing and bookings, and
 * removes them afterwards.
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

const staffState = vi.hoisted(() => ({ staff: { id: "", role: "MODERATOR" as string } }));

vi.mock("server-only", () => ({}));
vi.mock("next-intl/server", () => ({ getTranslations: async () => (key: string) => key }));
vi.mock("@/lib/request", () => ({ getIpHash: async () => "test-ip" }));
vi.mock("@/lib/email", async (importOriginal) => {
  const real = await importOriginal<typeof import("@/lib/email")>();
  return { ...real, sendEmail: vi.fn(async () => ({ ok: true, delivery: "logged" as const })) };
});
vi.mock("@/lib/sms", () => ({ isSmsConfigured: () => false, sendSms: vi.fn(async () => ({ ok: true, delivered: false })) }));
vi.mock("@/lib/auth/session", () => ({ requireStaffForAction: async () => staffState.staff }));

const { db } = await import("@/lib/db");
const service = await import("@/lib/booking/service");
const { addDays, dayToDate, tbilisiToday } = await import("@/lib/booking/dates");
const guestFlags = await import("@/lib/admin/server/guest-flags");
const { hostFlagSummary } = await import("@/lib/listing/host-flags-server");
const hostAsked = await import("@/lib/booking/host-asked");

const prefix = `hak${randomUUID().replace(/-/g, "").slice(0, 10)}`;
const digits = String(Date.now() % 1_000_000).padStart(6, "0");
const users: string[] = [];
const listings: string[] = [];
const ids = { city: "", host: "", staff: "", flat: "" };
const today = tbilisiToday();
const day = (n: number) => addDays(today, n);
const ago = (days: number) => new Date(Date.now() - days * 24 * 3600 * 1000);
let codeSeq = 0;

async function makeUser(name: string, last: string, role: "USER" | "MODERATOR" = "USER") {
  const id = `${prefix}-${name}`;
  await db.user.create({
    data: { id, name, firstName: name, role, email: `${id}@example.com`, phoneNumber: `+99559${digits}${last}`, phoneNumberVerified: true, locale: "he" },
  });
  users.push(id);
  return id;
}

/** A booking row written directly (the states the flags read), never through the guest flow. */
async function booking(guestUserId: string, data: { status: "CONFIRMED" | "CANCELLED_BY_GUEST" | "CANCELLED_BY_HOST" | "NO_SHOW"; from: number; nights: number; cancelledAt?: Date; reason?: string | null; noShowAt?: Date }) {
  codeSeq += 1;
  const row = await db.booking.create({
    data: {
      code: `T-${prefix}-${codeSeq}`,
      listingId: ids.flat,
      guestUserId,
      hostUserId: ids.host,
      status: data.status,
      checkIn: dayToDate(day(data.from)),
      checkOut: dayToDate(day(data.from + data.nights)),
      nights: data.nights,
      adults: 1,
      nightlyPrice: 100,
      subtotal: 100 * data.nights,
      total: 100 * data.nights,
      currency: "USD",
      cancellationPolicy: "MODERATE",
      guestName: guestUserId.split("-").pop() ?? "Guest",
      locale: "he",
      rulesAcceptedAt: new Date(),
      cancelledAt: data.cancelledAt ?? null,
      cancelReasonCode: data.reason ?? null,
      noShowReportedAt: data.noShowAt ?? null,
    },
  });
  return row.id;
}

beforeAll(async () => {
  const city = await db.city.create({ data: { slug: `${prefix}-city`, names: { he: "עיר", en: "City", ru: "Город", ar: "مدينة", ka: "ქალაქი" }, searchText: "city", lat: 41.7, lng: 44.8 } });
  ids.city = city.id;
  ids.host = await makeUser("Host", "0");
  ids.staff = await makeUser("Mod", "9", "MODERATOR");
  staffState.staff = { id: ids.staff, role: "MODERATOR" };
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
    },
  });
  ids.flat = listing.id;
  listings.push(listing.id);
});

afterAll(async () => {
  const bookingIds = (await db.booking.findMany({ where: { listingId: { in: listings } }, select: { id: true } })).map((b) => b.id);
  await db.auditLog.deleteMany({ where: { OR: [{ actorId: { in: users } }, { targetId: { in: [...users, ...bookingIds] } }] } });
  await db.booking.deleteMany({ where: { listingId: { in: listings } } });
  await db.listing.deleteMany({ where: { id: { in: listings } } });
  await db.rateLimit.deleteMany({ where: { key: { contains: prefix } } });
  await db.user.deleteMany({ where: { id: { in: users } } });
  await db.city.deleteMany({ where: { id: ids.city } });
});

const hoursAgo = (h: number) => new Date(Date.now() - h * 3600 * 1000);

async function stateOf(id: string) {
  return db.booking.findUniqueOrThrow({ where: { id }, select: { status: true, cancelReasonCode: true, flaggedForReview: true } });
}

describe("the guest's cancellation waits for the host", () => {
  it("guestCancel with HOST_ASKED is not flagged and stays pending", async () => {
    const guest = await makeUser("Pending", "1");
    const id = await booking(guest, { status: "CONFIRMED", from: 20, nights: 2 });
    const result = await service.guestCancel({ bookingId: id, guestUserId: guest, reasonCode: "HOST_ASKED", notify: false });
    expect(result.flagged).toBe(false);
    expect(await stateOf(id)).toEqual({ status: "CANCELLED_BY_GUEST", cancelReasonCode: "HOST_ASKED", flaggedForReview: false });
  });
});

describe("the host's answer", () => {
  it("confirm: not against the guest, against the host, listed for review", async () => {
    const guest = await makeUser("Confirm", "2");
    const ids3 = [] as string[];
    for (const n of [0, 1, 2]) ids3.push(await booking(guest, { status: "CANCELLED_BY_GUEST", from: 30 + n * 5, nights: 2, cancelledAt: hoursAgo(5 + n), reason: "HOST_ASKED" }));
    for (const id of ids3) await service.answerHostAsked({ bookingId: id, hostUserId: ids.host, answer: "confirm" });
    for (const id of ids3) expect(await stateOf(id)).toEqual({ status: "CANCELLED_BY_GUEST", cancelReasonCode: "HOST_ASKED_CONFIRMED", flaggedForReview: true });
    // Three cancellations the host confirmed: no guest flag at all.
    const rows = await db.booking.findMany({
      where: { guestUserId: guest },
      select: { listingId: true, status: true, checkIn: true, checkOut: true, cancelledAt: true, cancelReasonCode: true, noShowReportedAt: true },
    });
    const summary = (await import("@/lib/booking/guest-flags")).summarizeGuestFlag(
      rows.map((b) => ({ ...b, checkIn: "2026-01-01", checkOut: "2026-01-02" })),
      null,
      new Date(),
    );
    expect(summary.cancellations).toBe(0);
    expect(summary.open).toBe(false);
    // They count against the host instead (review only).
    const host = await hostFlagSummary(ids.host);
    expect(host?.hostCancellations).toBeGreaterThanOrEqual(3);
    expect(host?.repeatCancellations).toBe(true);
    // An audit entry per answer, by the host.
    expect(await db.auditLog.count({ where: { action: "booking.host_asked_confirmed", actorId: ids.host, targetId: { in: ids3 } } })).toBe(3);
  });

  it("deny: the admin review queue; it counts as the guest's own cancellation", async () => {
    const guest = await makeUser("Deny", "3");
    const id = await booking(guest, { status: "CANCELLED_BY_GUEST", from: 50, nights: 2, cancelledAt: hoursAgo(2), reason: "HOST_ASKED" });
    const answer = await service.answerHostAsked({ bookingId: id, hostUserId: ids.host, answer: "deny" });
    expect(answer.state).toBe("denied");
    expect(await stateOf(id)).toEqual({ status: "CANCELLED_BY_GUEST", cancelReasonCode: "HOST_ASKED_DENIED", flaggedForReview: true });
    const { countsAsGuestCancellation } = await import("@/lib/booking/guest-flags");
    expect(countsAsGuestCancellation({ listingId: ids.flat, status: "CANCELLED_BY_GUEST", cancelReasonCode: "HOST_ASKED_DENIED", cancelledAt: hoursAgo(2), checkIn: day(50), checkOut: day(52) })).toBe(true);
  });

  it("only the booking's host, only once, only within 72 hours", async () => {
    const guest = await makeUser("Rules", "4");
    const other = await makeUser("OtherHost", "5");
    const id = await booking(guest, { status: "CANCELLED_BY_GUEST", from: 60, nights: 2, cancelledAt: hoursAgo(1), reason: "HOST_ASKED" });
    // Another account (even the guest) cannot answer: not found, nothing changes.
    await expect(service.answerHostAsked({ bookingId: id, hostUserId: other, answer: "confirm" })).rejects.toMatchObject({ status: 404 });
    await expect(service.answerHostAsked({ bookingId: id, hostUserId: guest, answer: "confirm" })).rejects.toMatchObject({ status: 404 });
    expect((await stateOf(id)).cancelReasonCode).toBe("HOST_ASKED");
    // Two answers at once: exactly one wins.
    const both = await Promise.allSettled([
      service.answerHostAsked({ bookingId: id, hostUserId: ids.host, answer: "confirm" }),
      service.answerHostAsked({ bookingId: id, hostUserId: ids.host, answer: "deny" }),
    ]);
    expect(both.filter((r) => r.status === "fulfilled")).toHaveLength(1);
    await expect(service.answerHostAsked({ bookingId: id, hostUserId: ids.host, answer: "deny" })).rejects.toMatchObject({ code: "not_answerable" });
    // Past the deadline: refused, even before the job ran.
    const late = await booking(guest, { status: "CANCELLED_BY_GUEST", from: 70, nights: 2, cancelledAt: hoursAgo(hostAsked.HOST_ASKED_ANSWER_HOURS + 1), reason: "HOST_ASKED" });
    await expect(service.answerHostAsked({ bookingId: late, hostUserId: ids.host, answer: "confirm" })).rejects.toMatchObject({ code: "not_answerable" });
    expect((await stateOf(late)).cancelReasonCode).toBe("HOST_ASKED");
    // A cancellation with another reason cannot be "answered".
    const plain = await booking(guest, { status: "CANCELLED_BY_GUEST", from: 80, nights: 2, cancelledAt: hoursAgo(1), reason: "CHANGE_OF_PLANS" });
    await expect(service.answerHostAsked({ bookingId: plain, hostUserId: ids.host, answer: "confirm" })).rejects.toMatchObject({ code: "not_answerable" });
  });
});

describe("the timeout job (expireHostAskedAnswers)", () => {
  it("sends unanswered ones to review after 72 hours, leaves the rest, and is idempotent", async () => {
    const guest = await makeUser("Timeout", "6");
    const old = await booking(guest, { status: "CANCELLED_BY_GUEST", from: 90, nights: 2, cancelledAt: hoursAgo(73), reason: "HOST_ASKED" });
    const fresh = await booking(guest, { status: "CANCELLED_BY_GUEST", from: 95, nights: 2, cancelledAt: hoursAgo(71), reason: "HOST_ASKED" });
    const first = await service.expireHostAskedAnswers();
    expect(first.expired).toBeGreaterThanOrEqual(1);
    expect(await stateOf(old)).toEqual({ status: "CANCELLED_BY_GUEST", cancelReasonCode: "HOST_ASKED_EXPIRED", flaggedForReview: true });
    expect(await stateOf(fresh)).toEqual({ status: "CANCELLED_BY_GUEST", cancelReasonCode: "HOST_ASKED", flaggedForReview: false });
    expect(await db.auditLog.count({ where: { action: "booking.host_asked_expired", targetId: old } })).toBe(1);
    // Again: nothing new for these two.
    await service.expireHostAskedAnswers();
    expect(await db.auditLog.count({ where: { action: "booking.host_asked_expired", targetId: old } })).toBe(1);
    // Three hours later the fresh one is due too.
    await service.expireHostAskedAnswers(new Date(Date.now() + 3 * 3600 * 1000));
    expect((await stateOf(fresh)).cancelReasonCode).toBe("HOST_ASKED_EXPIRED");
    // Admin → Flags reads the queue from flaggedForReview: both are there now.
    expect(await db.booking.count({ where: { id: { in: [old, fresh] }, flaggedForReview: true, flagReviewedAt: null } })).toBe(2);
    void guestFlags;
  });
});
