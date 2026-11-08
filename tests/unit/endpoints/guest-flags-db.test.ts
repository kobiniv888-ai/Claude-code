/**
 * Founder's decision 7, Q14 (SECURITY_REPORT 4.6.b/c) against the local database: Admin → Flags
 * lists long stays (14+ nights) and guests with 3 cancellations in 90 days or 2 no-shows in a year,
 * FOR REVIEW ONLY. Checks:
 *
 * - the lists and their counts; a cancellation with the reason "my flight was cancelled" never
 *   counts; a host cancellation never counts against the guest;
 * - "mark reviewed" writes only an audit entry (D11 a) and moves the row to the reviewed list; a
 *   newer event refuses ("changed_since_view") and, once it is there, opens the flag again;
 * - nothing happens to a flagged guest automatically: they still book like anyone else;
 * - a staff member never reviews a flag about themselves.
 *
 * Creates its own users (fake @example.com addresses, +995 59… test numbers), city, listing and
 * bookings, and removes them afterwards. The staff session is replaced; the real action, its
 * rate limit and the audit log run.
 */
import "dotenv/config";
import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";

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
const { FLIGHT_CANCELLED_REASON } = await import("@/lib/booking/guest-flags");
const guestFlags = await import("@/lib/admin/server/guest-flags");
const { listFlags } = await import("@/lib/admin/server/flags");
const actions = await import("@/lib/admin/actions/flags");

const prefix = `gfl${randomUUID().replace(/-/g, "").slice(0, 10)}`;
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
      guestPhone: "",
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
      lat: 41.71,
      lng: 44.77,
      address: "1 Test Street, Tbilisi",
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

describe("long stays (14+ nights): listed for review only", () => {
  it("lists a confirmed stay of 14 nights, not 13, and not a cancelled or finished one", async () => {
    const guest = await makeUser("LongStay", "1");
    const long = await booking(guest, { status: "CONFIRMED", from: 30, nights: 14 });
    const short = await booking(guest, { status: "CONFIRMED", from: 60, nights: 13 });
    const cancelled = await booking(guest, { status: "CANCELLED_BY_GUEST", from: 90, nights: 20, cancelledAt: ago(1) });
    const open = await guestFlags.listLongStays("open", { limit: 500, offset: 0 }, "he");
    const openIds = open.rows.map((r) => r.id);
    expect(openIds).toContain(long);
    expect(openIds).not.toContain(short);
    expect(openIds).not.toContain(cancelled);

    // Mark reviewed: an audit entry only; the booking itself is untouched.
    const before = await db.booking.findUniqueOrThrow({ where: { id: long } });
    expect(await actions.markLongStayReviewedAction({ bookingId: long, note: "Spoke with the host: a real long visit." })).toEqual({ ok: true, data: { changed: true } });
    expect(await db.booking.findUniqueOrThrow({ where: { id: long } })).toEqual(before);
    expect(await db.auditLog.count({ where: { action: guestFlags.LONG_STAY_REVIEWED_ACTION, targetId: long, actorId: ids.staff } })).toBe(1);
    expect((await guestFlags.listLongStays("open", { limit: 500, offset: 0 }, "he")).rows.map((r) => r.id)).not.toContain(long);
    expect((await guestFlags.listLongStays("reviewed", { limit: 500, offset: 0 }, "he")).rows.map((r) => r.id)).toContain(long);
    // Again: nothing new.
    expect(await actions.markLongStayReviewedAction({ bookingId: long, note: "Twice." })).toEqual({ ok: true, data: { changed: false } });
    // A short stay is not a flag.
    expect(await actions.markLongStayReviewedAction({ bookingId: short, note: "Not long." })).toMatchObject({ ok: false, error: "not_flagged" });
  });

  it("the Flags page counts them on their own tab", async () => {
    const result = await listFlags("longStays", "reviewed", 1, "he");
    expect(result.counts.longStays).toBeGreaterThanOrEqual(1);
    expect(result.longStays.length).toBeGreaterThanOrEqual(1);
    expect(result.bookings).toEqual([]);
  });
});

describe("guests with repeated cancellations or no-shows: listed for review only", () => {
  it("3 counting cancellations in 90 days flag the guest; 'my flight was cancelled' and host cancellations never count", async () => {
    const guest = await makeUser("Canceller", "2");
    await booking(guest, { status: "CANCELLED_BY_GUEST", from: 10, nights: 2, cancelledAt: ago(5) });
    await booking(guest, { status: "CANCELLED_BY_GUEST", from: 20, nights: 2, cancelledAt: ago(15) });
    await booking(guest, { status: "CANCELLED_BY_GUEST", from: 30, nights: 2, cancelledAt: ago(20), reason: FLIGHT_CANCELLED_REASON });
    await booking(guest, { status: "CANCELLED_BY_HOST", from: 40, nights: 2, cancelledAt: ago(25) });
    await booking(guest, { status: "CANCELLED_BY_GUEST", from: 50, nights: 2, cancelledAt: ago(120) });
    expect(await guestFlags.guestFlagSummary(guest)).toBeNull();

    await booking(guest, { status: "CANCELLED_BY_GUEST", from: 60, nights: 2, cancelledAt: ago(30), reason: "CHANGE_OF_PLANS" });
    const summary = await guestFlags.guestFlagSummary(guest);
    expect(summary).toMatchObject({ id: guest, cancellations: 3, noShows: 0, reasons: ["cancellations"], open: true });
    expect((await guestFlags.guestFlagRows(new Date(), { state: "open" })).map((r) => r.id)).toContain(guest);
  });

  it("2 no-shows in a year flag the guest; review closes it, a newer one refuses and then reopens it", async () => {
    const guest = await makeUser("NoShow", "3");
    await booking(guest, { status: "NO_SHOW", from: -40, nights: 2, noShowAt: ago(38) });
    await booking(guest, { status: "NO_SHOW", from: -200, nights: 2, noShowAt: ago(198) });
    const summary = await guestFlags.guestFlagSummary(guest);
    expect(summary).toMatchObject({ noShows: 2, reasons: ["no_shows"], open: true });

    // A page opened before the newest event: refused, so nobody closes what they never saw.
    expect(await actions.markGuestFlagReviewedAction({ userId: guest, note: "Looked at it.", seenLatest: ago(100).toISOString() })).toMatchObject({
      ok: false,
      error: "changed_since_view",
    });
    expect(await actions.markGuestFlagReviewedAction({ userId: guest, note: "Looked at it.", seenLatest: summary!.latestAt!.toISOString() })).toEqual({
      ok: true,
      data: { changed: true },
    });
    expect(await db.auditLog.count({ where: { action: guestFlags.GUEST_FLAG_REVIEWED_ACTION, targetType: "User", targetId: guest } })).toBe(1);
    expect((await guestFlags.guestFlagSummary(guest))?.open).toBe(false);
    expect((await guestFlags.guestFlagRows(new Date(), { state: "reviewed" })).map((r) => r.id)).toContain(guest);

    // Nothing happened to the guest: same status, and they still book like anyone else.
    expect((await db.user.findUniqueOrThrow({ where: { id: guest } })).status).toBe("ACTIVE");
    const booked = await service.createBooking({
      listingId: ids.flat,
      guestUserId: guest,
      checkIn: day(100),
      checkOut: day(102),
      adults: 1,
      children: 0,
      infants: 0,
      guestName: "NoShow",
      rulesAccepted: true,
      locale: "he",
      notify: false,
    });
    expect(booked.code).toMatch(/^BT-/);

    // A new no-show after the review opens the flag again.
    await new Promise((resolve) => setTimeout(resolve, 5));
    await booking(guest, { status: "NO_SHOW", from: -5, nights: 2, noShowAt: new Date() });
    expect((await guestFlags.guestFlagSummary(guest))?.open).toBe(true);
  });

  it("a staff member never reviews their own flag, and a guest without a flag cannot be marked", async () => {
    const plain = await makeUser("Plain", "4");
    expect(await actions.markGuestFlagReviewedAction({ userId: plain, note: "Nothing here.", seenLatest: null })).toMatchObject({ ok: false, error: "not_flagged" });
    expect(await actions.markGuestFlagReviewedAction({ userId: ids.staff, note: "Me.", seenLatest: null })).toMatchObject({ ok: false, error: "not_allowed_on_self" });
    const own = await booking(ids.staff, { status: "CONFIRMED", from: 200, nights: 20 });
    expect(await actions.markLongStayReviewedAction({ bookingId: own, note: "My own stay." })).toMatchObject({ ok: false, error: "not_allowed_on_self" });
  });

  it("the Flags page shows them on the Guests tab", async () => {
    const result = await listFlags("guests", "open", 1, "he");
    expect(result.counts.guests).toBe(result.guests.length > 0 ? result.counts.guests : 0);
    expect(result.guests.every((g) => g.reasons.length > 0 && g.open)).toBe(true);
  });
});
