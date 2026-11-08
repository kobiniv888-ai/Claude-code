/**
 * Privacy and location against the local database (DATABASE_URL in .env):
 * - security checklist 6.f: the exact address, pin and host contacts reach the guest only until a
 *   week after check-out (getGuestTrip, getTripExtras; the .ics route uses getGuestTrip's reveal);
 * - founder's decision 9 + checklist 15.9: the daily retention jobs (src/lib/admin/maintenance/retention.ts)
 *   blank guest contact details 3 months after check-out and keep the anonymous numbers, and the
 *   other jobs delete or anonymize only what is past its time. Every job is idempotent.
 * Creates its own users, city, listing and rows with a unique prefix (fake data, @example.com,
 * +995 59… test numbers) and removes them afterwards. Every job runs scoped to these rows, so the
 * shared database (demo data, other tests) is never touched.
 */
import "dotenv/config";
import { randomInt, randomUUID } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

const { db } = await import("@/lib/db");
const { addDays, dayToDate, tbilisiToday } = await import("@/lib/booking/dates");
const { getGuestTrip } = await import("@/lib/booking/queries");
const { getTripExtras } = await import("@/lib/trip/server");
const retention = await import("@/lib/admin/maintenance/retention");
const { BOOKING_CODE_ALPHABET, BOOKING_CODE_LENGTH, BOOKING_CODE_PREFIX } = await import("@/lib/booking/constants");
const { VISIT_SET_ACTION } = await import("@/lib/admin/badges/server");
const { LONG_STAY_REVIEWED_ACTION } = await import("@/lib/admin/server/guest-flags");

const prefix = `pr${randomUUID().replace(/-/g, "").slice(0, 10)}`;
const now = new Date();
const today = tbilisiToday(now);
const day = (n: number) => addDays(today, n);
const ids = { city: "", listing: "", host: "", guest: "" };
const bookingIds: string[] = [];
const DAY_MS = 24 * 3600 * 1000;

async function makeUser(name: string, digits: string) {
  const id = `${prefix}-${name}`;
  await db.user.create({
    data: { id, name, firstName: name, email: `${id}@example.com`, phoneNumber: `+99559${digits}`, phoneNumberVerified: true, locale: "en" },
  });
  return id;
}

/** A random, valid booking number ("BT-7K3Q9"): 32^5 codes, so a clash within this test is negligible. */
const newCode = () => BOOKING_CODE_PREFIX + Array.from({ length: BOOKING_CODE_LENGTH }, () => BOOKING_CODE_ALPHABET[randomInt(BOOKING_CODE_ALPHABET.length)]).join("");

async function makeBooking(
  checkIn: string,
  checkOut: string,
  extra: { status?: "CONFIRMED" | "COMPLETED" | "CANCELLED_BY_GUEST" | "CANCELLED_BY_HOST"; cancelReason?: string; cancelledAt?: Date } = {},
) {
  const nights = Math.round((dayToDate(checkOut).getTime() - dayToDate(checkIn).getTime()) / DAY_MS);
  const booking = await db.booking.create({
    data: {
      code: newCode(),
      listingId: ids.listing,
      guestUserId: ids.guest,
      hostUserId: ids.host,
      checkIn: dayToDate(checkIn),
      checkOut: dayToDate(checkOut),
      nights,
      adults: 2,
      nightlyPrice: 100,
      subtotal: 100 * nights,
      total: 100 * nights,
      currency: "USD",
      cancellationPolicy: "MODERATE",
      status: extra.status ?? "COMPLETED",
      ...(extra.cancelReason ? { cancelReason: extra.cancelReason, cancelReasonCode: "OTHER", cancelledAt: extra.cancelledAt ?? dayToDate(checkIn) } : {}),
      messageToHost: "We arrive late, please leave the key with the neighbour.",
      guestName: "Noa Test",
      guestPhone: "+995590000077",
      locale: "en",
      rulesAcceptedAt: new Date(),
    },
  });
  bookingIds.push(booking.id);
  return booking;
}

beforeAll(async () => {
  const city = await db.city.create({
    data: { slug: `${prefix}-city`, names: { he: "עיר", en: "City", ru: "Город", ar: "مدينة", ka: "ქალაქი" }, searchText: "city", lat: 41.7, lng: 44.8 },
  });
  ids.city = city.id;
  const stamp = `${Date.now() % 100_000}`.padStart(5, "0");
  ids.host = await makeUser("Host", `${stamp}1`);
  ids.guest = await makeUser("Guest", `${stamp}2`);
  const listing = await db.listing.create({
    data: {
      ownerId: ids.host,
      status: "LIVE",
      dealType: "SHORT_STAY",
      propertyType: "APARTMENT",
      pricePeriod: "NIGHT",
      price: 100,
      currency: "USD",
      cityId: ids.city,
      lat: 41.7101,
      lng: 44.7702,
      address: "1 Privacy Test Street, Tbilisi",
      contactMethods: [{ channel: "WHATSAPP", value: "+995590000088", order: 0 }],
      originalLocale: "en",
      title: "Privacy test flat",
      description: "A test listing.",
    },
  });
  ids.listing = listing.id;
});

afterAll(async () => {
  const users = [ids.host, ids.guest].filter(Boolean);
  await db.booking.deleteMany({ where: { listingId: ids.listing } });
  await db.contactClick.deleteMany({ where: { listingId: ids.listing } });
  await db.listing.deleteMany({ where: { id: ids.listing } });
  await db.auditLog.deleteMany({ where: { targetId: { startsWith: prefix } } });
  await db.emailOutbox.deleteMany({ where: { to: { startsWith: prefix } } });
  await db.deviceLink.deleteMany({ where: { userId: { in: users } } });
  await db.user.deleteMany({ where: { id: { in: users } } });
  await db.city.deleteMany({ where: { id: ids.city } });
});

describe("6.f: the exact address only until a week after check-out", () => {
  it("reveals the address, pin and host contacts during the stay and up to check-out + 7", async () => {
    const recent = await makeBooking(day(-10), day(-7));
    const trip = await getGuestTrip(ids.guest, recent.code, "en", now);
    expect(trip?.reveal?.address).toBe("1 Privacy Test Street, Tbilisi");
    expect(trip?.reveal?.lat).toBe(41.7101);
    const extras = await getTripExtras(ids.guest, { id: recent.id, status: recent.status, checkIn: day(-10), checkOut: day(-7), revealed: true }, "en", { message: "", now });
    expect(extras?.point).toEqual({ lat: 41.7101, lng: 44.7702 });
    expect(extras?.contactButtons.length).toBeGreaterThan(0);
  });

  it("hides them again from the 8th day after check-out, even when the caller says revealed", async () => {
    const past = await makeBooking(day(-12), day(-8));
    const trip = await getGuestTrip(ids.guest, past.code, "en", now);
    expect(trip).not.toBeNull();
    expect(trip?.reveal).toBeNull();
    expect(JSON.stringify(trip)).not.toContain("Privacy Test Street");
    expect(JSON.stringify(trip)).not.toContain("41.7101");
    // getTripExtras re-checks on the database row whatever the page passed.
    const extras = await getTripExtras(ids.guest, { id: past.id, status: past.status, checkIn: day(-12), checkOut: day(-8), revealed: true }, "en", { message: "", now });
    expect(extras?.point).toBeNull();
    expect(extras?.contactButtons).toEqual([]);
    expect(extras?.contactHours).toBeNull();
    expect(JSON.stringify(extras)).not.toContain("+995590000088");
  });

  it("never reveals to another account", async () => {
    const recent = await makeBooking(day(-3), day(-1));
    expect(await getGuestTrip(ids.host, recent.code, "en", now)).toBeNull();
  });
});

describe("decision 9: guest contact details are blanked 3 months after check-out", () => {
  it("blanks name, phone, message and the free-text reason; keeps the anonymous numbers; runs once", async () => {
    const cutoff = retention.guestContactCutoffDay(now);
    const old = await makeBooking(addDays(cutoff, -5), addDays(cutoff, -1));
    const onCutoff = await makeBooking(addDays(cutoff, -3), cutoff);
    const cancelled = await makeBooking(addDays(cutoff, -40), addDays(cutoff, -36), { status: "CANCELLED_BY_GUEST", cancelReason: "My mother is ill" });
    const keep = await makeBooking(addDays(cutoff, 1), addDays(cutoff, 4));
    const scope = { listingId: ids.listing };

    expect(await retention.eraseOldGuestContacts(now, scope)).toBe(3);
    for (const id of [old.id, onCutoff.id, cancelled.id]) {
      const row = await db.booking.findUniqueOrThrow({ where: { id } });
      expect(row).toMatchObject({ guestName: retention.ERASED_GUEST_NAME, guestPhone: "", messageToHost: null, cancelReason: null });
      // Anonymous stats stay: dates, nights, price, listing, status, reason code, the account link.
      expect(row.nights).toBeGreaterThan(0);
      expect(Number(row.total)).toBeGreaterThan(0);
      expect(row.listingId).toBe(ids.listing);
      expect(row.guestUserId).toBe(ids.guest);
    }
    expect((await db.booking.findUniqueOrThrow({ where: { id: cancelled.id } })).cancelReasonCode).toBe("OTHER");
    expect((await db.booking.findUniqueOrThrow({ where: { id: cancelled.id } })).status).toBe("CANCELLED_BY_GUEST");
    const kept = await db.booking.findUniqueOrThrow({ where: { id: keep.id } });
    expect(kept).toMatchObject({ guestName: "Noa Test", guestPhone: "+995590000077" });
    expect(kept.messageToHost).not.toBeNull();

    // Idempotent: nothing left to change.
    expect(await retention.eraseOldGuestContacts(now, scope)).toBe(0);
  });

  // retention-cancelled-1: a cancelled booking was finished when it was cancelled.
  it("blanks a booking cancelled more than 3 months ago even when its planned check-out is ahead", async () => {
    const cutoff = retention.guestContactCutoffDay(now);
    const monthsAgo = (months: number) => dayToDate(retention.monthsBefore(today, months));
    const cancelledLongAgo = await makeBooking(day(240), day(245), { status: "CANCELLED_BY_GUEST", cancelReason: "Plans changed", cancelledAt: monthsAgo(4) });
    const cancelledByHost = await makeBooking(day(200), day(203), { status: "CANCELLED_BY_HOST", cancelReason: "Repairs", cancelledAt: monthsAgo(5) });
    const cancelledRecently = await makeBooking(day(240), day(245), { status: "CANCELLED_BY_GUEST", cancelReason: "Plans changed", cancelledAt: monthsAgo(2) });
    // A confirmed future stay is never blanked, whatever its dates.
    const upcoming = await makeBooking(day(30), day(33), { status: "CONFIRMED" });
    expect(dayToDate(cutoff).getTime()).toBeGreaterThan(monthsAgo(4).getTime());
    const scope = { id: { in: [cancelledLongAgo.id, cancelledByHost.id, cancelledRecently.id, upcoming.id] } };

    expect(await retention.eraseOldGuestContacts(now, scope)).toBe(2);
    for (const id of [cancelledLongAgo.id, cancelledByHost.id]) {
      const row = await db.booking.findUniqueOrThrow({ where: { id } });
      expect(row).toMatchObject({ guestName: retention.ERASED_GUEST_NAME, guestPhone: "", messageToHost: null, cancelReason: null });
      expect(row.cancelReasonCode).toBe("OTHER");
    }
    for (const id of [cancelledRecently.id, upcoming.id]) {
      expect(await db.booking.findUniqueOrThrow({ where: { id } })).toMatchObject({ guestName: "Noa Test", guestPhone: "+995590000077" });
    }
    expect(await retention.eraseOldGuestContacts(now, scope)).toBe(0);
  });

  it("computes the cutoff in calendar months, clamped to the month's end", () => {
    expect(retention.monthsBefore("2026-11-08", 3)).toBe("2026-08-08");
    expect(retention.monthsBefore("2026-05-31", 3)).toBe("2026-02-28");
    expect(retention.monthsBefore("2028-05-31", 3)).toBe("2028-02-29");
    expect(retention.monthsBefore("2027-02-15", 3)).toBe("2026-11-15");
    expect(() => retention.monthsBefore("soon", 3)).toThrow();
  });
});

describe("15.9: the other retention jobs", () => {
  it("deletes audit entries after a year, but keeps the 'we visited' snapshots", async () => {
    const old = new Date(now.getTime() - (retention.AUDIT_LOG_RETENTION_DAYS + 2) * DAY_MS);
    const fresh = new Date(now.getTime() - 10 * DAY_MS);
    await db.auditLog.createMany({
      data: [
        { action: "user.ban", targetType: "User", targetId: `${prefix}-a1`, createdAt: old },
        { action: VISIT_SET_ACTION, targetType: "Listing", targetId: `${prefix}-a2`, createdAt: old },
        { action: "user.ban", targetType: "User", targetId: `${prefix}-a3`, createdAt: fresh },
      ],
    });
    const scope = { targetId: { startsWith: prefix } };
    expect(await retention.purgeOldAuditLogs(now, scope)).toBe(1);
    expect((await db.auditLog.findMany({ where: scope, select: { targetId: true } })).map((r) => r.targetId).sort()).toEqual([`${prefix}-a2`, `${prefix}-a3`]);
    expect(await retention.purgeOldAuditLogs(now, scope)).toBe(0);
  });

  // longstay-marker-retention-1: bookings can be made up to two years ahead.
  it("keeps a year-old 'long stay reviewed' mark while its stay has not ended, and deletes it once it has", async () => {
    const future = await makeBooking(day(20), day(45), { status: "CONFIRMED" });
    const ended = await makeBooking(day(-40), day(-10), { status: "COMPLETED" });
    const old = new Date(now.getTime() - (retention.AUDIT_LOG_RETENTION_DAYS + 30) * DAY_MS);
    await db.auditLog.createMany({
      data: [
        { action: LONG_STAY_REVIEWED_ACTION, targetType: "Booking", targetId: future.id, createdAt: old, details: { marker: prefix } },
        { action: LONG_STAY_REVIEWED_ACTION, targetType: "Booking", targetId: ended.id, createdAt: old, details: { marker: prefix } },
        { action: "user.ban", targetType: "User", targetId: `${prefix}-ls1`, createdAt: old },
      ],
    });
    const scope = { targetId: { in: [future.id, ended.id, `${prefix}-ls1`] } };
    try {
      expect(await retention.purgeOldAuditLogs(now, scope)).toBe(2);
      const left = await db.auditLog.findMany({ where: scope, select: { action: true, targetId: true } });
      expect(left).toEqual([{ action: LONG_STAY_REVIEWED_ACTION, targetId: future.id }]);
      expect(await retention.purgeOldAuditLogs(now, scope)).toBe(0);
      // Once that stay has ended too, its mark goes like the rest.
      const later = new Date(dayToDate(day(46)).getTime() + 12 * 3600 * 1000);
      expect(await retention.purgeOldAuditLogs(later, scope)).toBe(1);
    } finally {
      await db.auditLog.deleteMany({ where: scope });
    }
  });

  it("deletes outbox rows after 90 days", async () => {
    const old = new Date(now.getTime() - (retention.EMAIL_OUTBOX_RETENTION_DAYS + 1) * DAY_MS);
    await db.emailOutbox.createMany({
      data: [
        { to: `${prefix}-old@example.com`, template: "test", locale: "en", subject: "s", html: "<p>h</p>", createdAt: old },
        { to: `${prefix}-new@example.com`, template: "test", locale: "en", subject: "s", html: "<p>h</p>" },
      ],
    });
    const scope = { to: { startsWith: prefix } };
    expect(await retention.purgeOldEmailOutbox(now, scope)).toBe(1);
    expect((await db.emailOutbox.findMany({ where: scope, select: { to: true } })).map((r) => r.to)).toEqual([`${prefix}-new@example.com`]);
    expect(await retention.purgeOldEmailOutbox(now, scope)).toBe(0);
  });

  it("drops the account from 'show contact' taps after 90 days and keeps the count", async () => {
    const old = new Date(now.getTime() - (retention.CONTACT_CLICK_USER_RETENTION_DAYS + 1) * DAY_MS);
    await db.contactClick.createMany({
      data: [
        { listingId: ids.listing, userId: ids.guest, channel: "WHATSAPP", createdAt: old },
        { listingId: ids.listing, userId: ids.guest, channel: "PHONE" },
      ],
    });
    const scope = { listingId: ids.listing };
    expect(await retention.anonymizeOldContactClicks(now, scope)).toBe(1);
    expect(await db.contactClick.count({ where: scope })).toBe(2);
    expect(await db.contactClick.count({ where: { ...scope, userId: null } })).toBe(1);
    expect(await retention.anonymizeOldContactClicks(now, scope)).toBe(0);
  });

  it("forgets devices not seen for a year", async () => {
    const old = new Date(now.getTime() - (retention.DEVICE_LINK_RETENTION_DAYS + 1) * DAY_MS);
    await db.deviceLink.createMany({
      data: [
        { deviceHash: `${prefix}-d1`, userId: ids.guest, firstSeenAt: old, lastSeenAt: old },
        { deviceHash: `${prefix}-d2`, userId: ids.guest },
      ],
    });
    const scope = { userId: ids.guest };
    expect(await retention.purgeStaleDeviceLinks(now, scope)).toBe(1);
    expect((await db.deviceLink.findMany({ where: scope, select: { deviceHash: true } })).map((r) => r.deviceHash)).toEqual([`${prefix}-d2`]);
    expect(await retention.purgeStaleDeviceLinks(now, scope)).toBe(0);
  });
});
