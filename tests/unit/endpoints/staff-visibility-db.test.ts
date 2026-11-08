/**
 * Founder's decision Q12 (SECURITY_REPORT 4.3.a, 4.3.d, 4.3.h) against the local database: who
 * sent a report and the guest's phone on a booking are ADMIN only. For MODERATOR and SUPPORT the
 * admin queries never return them (not on the report queue, the report page, the user page, the
 * booking page, or through a booking search by phone); moderators keep everything else.
 *
 * Founder's answer (c), 8 November 2026: every phone number (an account's, a guest's, a listing's
 * contact numbers) is ADMIN only; other staff get the last 2 digits ("••• ••• ••45") where they
 * match a person, on the user, ticket, booking, report, listing-review and verification pages.
 * And the guest of a booking with a turned-away report sent that report: for other staff the
 * report comes without its booking's code and id, and that guest is withheld wherever the booking
 * is listed (q12-reporter-1).
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
const { getVerificationDetail } = await import("@/lib/admin/server/verifications");
const { getUserBookings } = await import("@/lib/admin/server/users");
const { ticketContext } = await import("@/lib/admin/server/tickets");
const { ownerBadgeSelect } = await import("@/lib/admin/server/shared");
const { listFlags } = await import("@/lib/admin/server/flags");

const prefix = `q12${randomUUID().replace(/-/g, "").slice(0, 10)}`;
const REPORTER_NAME = `${prefix} Reporter-Secret`;
const GUEST_PHONE = `+99559${String(Date.now() % 1_000_000).padStart(6, "0")}7`;
const HOST_PHONE = `+99559${String((Date.now() + 7) % 1_000_000).padStart(6, "0")}3`;
const CONTACT_PHONE = `+99559${String((Date.now() + 13) % 1_000_000).padStart(6, "0")}8`;
/** The number without the country code (how a page could also print it). */
const national = (e164: string) => e164.replace(/^\+995/, "");
const ids = { host: `${prefix}-host`, reporter: `${prefix}-reporter`, guest: `${prefix}-guest`, city: "", listing: "", report: "", booking: "", plainBooking: "", userReport: "", verification: "" };
const GUEST_NAME = `${prefix} Guest`;
const VIEWERS = {
  ADMIN: { id: `${prefix}-admin`, role: "ADMIN" },
  MODERATOR: { id: `${prefix}-mod`, role: "MODERATOR" },
  SUPPORT: { id: `${prefix}-support`, role: "SUPPORT" },
} as const;

beforeAll(async () => {
  await db.user.createMany({
    data: [
      { id: ids.host, name: `${prefix} Host`, email: `${prefix}-host@example.com`, phoneNumber: HOST_PHONE, phoneNumberVerified: true },
      { id: ids.reporter, name: REPORTER_NAME, firstName: "Reporter", email: `${prefix}-reporter@example.com` },
      { id: ids.guest, name: `${prefix} Guest`, email: `${prefix}-guest@example.com`, phoneNumber: GUEST_PHONE, phoneNumberVerified: true },
    ],
  });
  const city = await db.city.create({ data: { slug: `${prefix}-city`, names: { he: "עיר", en: "City", ru: "Город", ar: "مدينة", ka: "ქალაქი" }, searchText: "city", lat: 41.6, lng: 41.6 } });
  ids.city = city.id;
  const listing = await db.listing.create({
    data: {
      ownerId: ids.host,
      status: "LIVE",
      dealType: "SHORT_STAY",
      cityId: city.id,
      title: `${prefix} flat`,
      contactMethods: [
        { channel: "WHATSAPP", value: CONTACT_PHONE, order: 0 },
        { channel: "TELEGRAM", value: `@${prefix}`, order: 1 },
      ],
    },
  });
  ids.listing = listing.id;
  const bookingData = (checkIn: string, checkOut: string) => ({
    code: `BT-${Array.from({ length: 5 }, () => "23456789ABCDEFGHJKLMNPQRSTUVWXYZ"[Math.floor(Math.random() * 32)]).join("")}`,
    listingId: ids.listing,
    guestUserId: ids.guest,
    hostUserId: ids.host,
    checkIn: new Date(`${checkIn}T00:00:00Z`),
    checkOut: new Date(`${checkOut}T00:00:00Z`),
    nights: 3,
    adults: 2,
    nightlyPrice: new Prisma.Decimal(80),
    subtotal: new Prisma.Decimal(240),
    total: new Prisma.Decimal(240),
    currency: "USD" as const,
    cancellationPolicy: "MODERATE" as const,
    guestName: GUEST_NAME,
    guestPhone: GUEST_PHONE,
    locale: "he" as const,
    rulesAcceptedAt: new Date(),
  });
  // The booking the turned-away report is about (its guest sent the report), and one without a report.
  const booking = await db.booking.create({ data: bookingData("2026-12-04", "2026-12-07") });
  ids.booking = booking.id;
  ids.plainBooking = (await db.booking.create({ data: bookingData("2027-01-04", "2027-01-07") })).id;
  const report = await db.report.create({
    data: { kind: "TURNED_AWAY", targetType: "USER", targetUserId: ids.host, reporterId: ids.reporter, reason: "CANCELLED_FOR_IDENTITY", priority: "URGENT", bookingId: booking.id },
  });
  ids.report = report.id;
  // A second report about the same host, from the same reporter ("other reports" on the page).
  await db.report.create({ data: { targetType: "LISTING", listingId: ids.listing, reporterId: ids.reporter, reason: "WRONG_PRICE" } });
  // The host reports the guest's profile (the reported account's phone is the guest phone).
  ids.userReport = (await db.report.create({ data: { targetType: "USER", targetUserId: ids.guest, reporterId: ids.host, reason: "OTHER" } })).id;
  ids.verification = (await db.verificationRequest.create({ data: { userId: ids.host, type: "ID" } })).id;
});

afterAll(async () => {
  await db.report.deleteMany({ where: { reporterId: { in: [ids.reporter, ids.host] } } });
  await db.verificationRequest.deleteMany({ where: { userId: ids.host } });
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
      // The rest stays: the booking's dates and status (without its code or id), the reported host.
      expect(detail!.report.booking?.withheld, role).toBe(true);
      expect(detail!.report.booking?.nights, role).toBe(3);
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
  it("the booking page reads the phone for an ADMIN only; moderators get its last 2 digits", async () => {
    const mod = await getAdminBooking(ids.plainBooking, "he", VIEWERS.MODERATOR);
    expect(mod!.booking.guestPhone).toBeNull();
    expect(mod!.booking.guestPhoneWithheld).toBe(true);
    expect(mod!.booking.guestPhoneMasked).toBe(`••• ••• ••${GUEST_PHONE.slice(-2)}`);
    expect(json(mod)).not.toContain(GUEST_PHONE);
    expect(json(mod)).not.toContain(national(GUEST_PHONE));
    // Moderators keep the rest of the booking.
    expect(mod!.booking.guestName).toBe(GUEST_NAME);
    expect(mod!.booking.guestWithheld).toBe(false);
    expect(mod!.lines.length).toBeGreaterThan(0);

    const admin = await getAdminBooking(ids.plainBooking, "he", VIEWERS.ADMIN);
    expect(admin!.booking.guestPhone).toBe(GUEST_PHONE);
    expect(admin!.booking.guestPhoneMasked).toBeNull();
    expect(admin!.booking.guestPhoneWithheld).toBe(false);
  });

  it("a booking search by phone finds the booking for an ADMIN only (a search result is an answer too)", async () => {
    const filters = { q: GUEST_PHONE, from: null, to: null };
    const mod = await searchBookings(filters, 1, "he", VIEWERS.MODERATOR);
    expect(mod.rows.map((r) => r.id)).not.toContain(ids.booking);
    const admin = await searchBookings(filters, 1, "he", VIEWERS.ADMIN);
    expect(admin.rows.map((r) => r.id)).toContain(ids.booking);
    // Searching by the booking code still works for moderators.
    const byCode = await searchBookings({ q: (await db.booking.findUniqueOrThrow({ where: { id: ids.plainBooking }, select: { code: true } })).code, from: null, to: null }, 1, "he", VIEWERS.MODERATOR);
    expect(byCode.rows.map((r) => r.id)).toEqual([ids.plainBooking]);
  });
});

describe("the account's phone on the user pages: ADMIN only (Q12, it is the guest phone of its bookings)", () => {
  it("the user page leaves the number out for moderators and support", async () => {
    for (const role of ["MODERATOR", "SUPPORT"] as const) {
      const page = await getUserDetail(ids.guest, VIEWERS[role]);
      expect(page!.user.phoneNumber, role).toBeNull();
      expect(page!.phoneWithheld, role).toBe(true);
      expect(page!.phoneMasked, role).toBe(`••• ••• ••${GUEST_PHONE.slice(-2)}`);
      expect(json(page), role).not.toContain(GUEST_PHONE);
      expect(json(page), role).not.toContain(national(GUEST_PHONE));
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

describe("founder's answer (c): phone numbers ADMIN only, the last 2 digits for other staff", () => {
  it("the shared owner select carries no phone number", () => {
    expect(Object.keys(ownerBadgeSelect)).not.toContain("phoneNumber");
  });

  it("the report page about an account: the account's phone in full for an ADMIN only", async () => {
    for (const role of ["MODERATOR", "SUPPORT"] as const) {
      const detail = await getReportDetail(ids.userReport, "he", VIEWERS[role]);
      expect(detail!.account?.id, role).toBe(ids.guest);
      expect(detail!.accountPhone, role).toEqual({ phoneNumber: null, phoneMasked: `••• ••• ••${GUEST_PHONE.slice(-2)}`, phoneWithheld: true });
      expect(json(detail), role).not.toContain(GUEST_PHONE);
      expect(json(detail), role).not.toContain(national(GUEST_PHONE));
    }
    const admin = await getReportDetail(ids.userReport, "he", VIEWERS.ADMIN);
    expect(admin!.accountPhone.phoneNumber).toBe(GUEST_PHONE);
  });

  it("the listing review page: the owner's phone and the contact numbers masked for a MODERATOR", async () => {
    const mod = await getListingForReview(ids.listing, VIEWERS.MODERATOR);
    expect(mod!.ownerPhone).toEqual({ phoneNumber: null, phoneMasked: `••• ••• ••${HOST_PHONE.slice(-2)}`, phoneWithheld: true });
    const whatsapp = mod!.contacts.find((c) => c.channel === "WHATSAPP");
    expect(whatsapp).toMatchObject({ value: `••• ••• ••${CONTACT_PHONE.slice(-2)}`, withheld: true });
    // A user name is not a phone number: it stays.
    expect(mod!.contacts.find((c) => c.channel === "TELEGRAM")).toMatchObject({ value: `@${prefix}`, withheld: false });
    expect(mod!.listing.contactMethods).toBeNull();
    for (const phone of [HOST_PHONE, CONTACT_PHONE]) {
      expect(json(mod)).not.toContain(phone);
      expect(json(mod)).not.toContain(national(phone));
    }
    const admin = await getListingForReview(ids.listing, VIEWERS.ADMIN);
    expect(admin!.ownerPhone.phoneNumber).toBe(HOST_PHONE);
    expect(admin!.contacts.find((c) => c.channel === "WHATSAPP")).toMatchObject({ value: CONTACT_PHONE, withheld: false });
  });

  it("the verification page: the applicant's phone masked for a MODERATOR", async () => {
    const mod = await getVerificationDetail(ids.verification, VIEWERS.MODERATOR);
    expect(mod!.userPhone).toEqual({ phoneNumber: null, phoneMasked: `••• ••• ••${HOST_PHONE.slice(-2)}`, phoneWithheld: true });
    expect(json(mod)).not.toContain(HOST_PHONE);
    expect(json(mod)).not.toContain(national(HOST_PHONE));
    const admin = await getVerificationDetail(ids.verification, VIEWERS.ADMIN);
    expect(admin!.userPhone.phoneNumber).toBe(HOST_PHONE);
  });

  it("the ticket page: the requester's phone masked for SUPPORT", async () => {
    const ctx = await ticketContext({ userId: ids.guest, listing: null }, "he", VIEWERS.SUPPORT);
    expect(ctx.requester).toMatchObject({ phoneNumber: null, phoneMasked: `••• ••• ••${GUEST_PHONE.slice(-2)}`, phoneWithheld: true });
    expect(json(ctx)).not.toContain(GUEST_PHONE);
    const admin = await ticketContext({ userId: ids.guest, listing: null }, "he", VIEWERS.ADMIN);
    expect(admin.requester?.phoneNumber).toBe(GUEST_PHONE);
  });

  it("the user list: the last 2 digits for other staff", async () => {
    for (const role of ["MODERATOR", "SUPPORT"] as const) {
      const found = await searchUsers({ q: GUEST_NAME }, 1, VIEWERS[role]);
      const row = found.rows.find((r) => r.id === ids.guest);
      expect(row?.phoneMasked, role).toBe(`••• ••• ••${GUEST_PHONE.slice(-2)}`);
      expect(json(found), role).not.toContain(national(GUEST_PHONE));
    }
  });
});

describe("a turned-away report's sender through its booking (Q12, q12-reporter-1)", () => {
  it("the report queue and page leave out the booking's code and id for other staff", async () => {
    const code = (await db.booking.findUniqueOrThrow({ where: { id: ids.booking }, select: { code: true } })).code;
    for (const role of ["MODERATOR", "SUPPORT"] as const) {
      const row = (await listReports({ tab: "turnedAway", status: "OPEN" }, 1, "he", VIEWERS[role])).rows.find((r) => r.id === ids.report);
      expect(row?.booking, role).toEqual({ code: null, status: "CONFIRMED", withheld: true });
      const detail = await getReportDetail(ids.report, "he", VIEWERS[role]);
      expect(detail!.report.booking?.id, role).toBeNull();
      expect(detail!.report.booking?.code, role).toBeNull();
      expect(detail!.report.screenshotsWithheld, role).toBe(true);
      expect(json(row), role).not.toContain(code);
      expect(json(detail), role).not.toContain(code);
      expect(json(detail), role).not.toContain(ids.booking);
      expect(json(detail), role).not.toContain(ids.guest);
    }
    const admin = await getReportDetail(ids.report, "he", VIEWERS.ADMIN);
    expect(admin!.report.booking).toMatchObject({ id: ids.booking, code, withheld: false });
    expect(admin!.report.screenshotsWithheld).toBe(false);
  });

  it("the booking page and the booking search leave out that booking's guest for a MODERATOR", async () => {
    const mod = await getAdminBooking(ids.booking, "he", VIEWERS.MODERATOR);
    expect(mod!.booking.guest).toBeNull();
    expect(mod!.booking.guestName).toBeNull();
    expect(mod!.booking.guestWithheld).toBe(true);
    expect(mod!.booking.guestPhoneMasked).toBeNull();
    for (const secret of [GUEST_NAME, ids.guest, GUEST_PHONE.slice(-4)]) expect(json(mod)).not.toContain(secret);
    // By host: listed, without the guest.
    const byHost = await searchBookings({ q: `${prefix} Host`, from: null, to: null }, 1, "he", VIEWERS.MODERATOR);
    expect(byHost.rows.find((r) => r.id === ids.booking)?.guest).toBeNull();
    expect(byHost.rows.find((r) => r.id === ids.plainBooking)?.guest?.name).toBe(GUEST_NAME);
    // By guest: that booking is not found at all ("the guest booked it" would name the sender).
    const byGuest = await searchBookings({ q: GUEST_NAME, from: null, to: null }, 1, "he", VIEWERS.MODERATOR);
    expect(byGuest.rows.map((r) => r.id)).toEqual([ids.plainBooking]);

    const admin = await getAdminBooking(ids.booking, "he", VIEWERS.ADMIN);
    expect(admin!.booking.guest?.id).toBe(ids.guest);
    expect(admin!.booking.guestName).toBe(GUEST_NAME);
    const adminByGuest = await searchBookings({ q: GUEST_NAME, from: null, to: null }, 1, "he", VIEWERS.ADMIN);
    expect(adminByGuest.rows.map((r) => r.id).sort()).toEqual([ids.booking, ids.plainBooking].sort());
  });

  it("the user page: the host's row loses the guest, the guest's row loses the booking", async () => {
    for (const role of ["MODERATOR", "SUPPORT"] as const) {
      const host = await getUserBookings(ids.host, VIEWERS[role]);
      const reported = host.asHost.find((r) => r.id === ids.booking);
      expect(reported, role).toMatchObject({ withheld: false, guestWithheld: true, guestName: "" });
      expect(host.asHost.find((r) => r.id === ids.plainBooking), role).toMatchObject({ guestWithheld: false, guestName: GUEST_NAME });
      const guest = await getUserBookings(ids.guest, VIEWERS[role]);
      expect(guest.asGuest.find((r) => r.id === ids.booking), role).toEqual({ id: ids.booking, withheld: true });
    }
    const admin = await getUserBookings(ids.host, VIEWERS.ADMIN);
    expect(admin.asHost.find((r) => r.id === ids.booking)).toMatchObject({ guestWithheld: false, guestName: GUEST_NAME });
  });

  it("the flags lists leave out the guest of a reported booking", async () => {
    await db.booking.update({ where: { id: ids.booking }, data: { status: "CANCELLED_BY_HOST", cancelledAt: new Date(), flaggedForReview: true } });
    try {
      const mod = await listFlags("cancellations", "open", 1, "he", VIEWERS.MODERATOR);
      const row = mod.bookings.find((r) => r.id === ids.booking);
      expect(row?.guest).toBeNull();
      expect(json(row)).not.toContain(GUEST_NAME);
      const admin = await listFlags("cancellations", "open", 1, "he", VIEWERS.ADMIN);
      expect(admin.bookings.find((r) => r.id === ids.booking)?.guest?.name).toBe(GUEST_NAME);
    } finally {
      await db.booking.update({ where: { id: ids.booking }, data: { status: "CONFIRMED", cancelledAt: null, flaggedForReview: false } });
    }
  });
});

describe("the user page counts guest cancellations with the guest-flag rule (flags-exclusions-1, decision 7)", () => {
  it("a cancellation with the reason 'my flight was cancelled' never counts", async () => {
    const { FLIGHT_CANCELLED_REASON } = await import("@/lib/booking/guest-flags");
    const before = (await getUserBookings(ids.guest, VIEWERS.ADMIN)).guestCancelled;
    const extra: string[] = [];
    try {
      for (const [n, reason] of [[1, FLIGHT_CANCELLED_REASON], [2, "CHANGE_OF_PLANS"]] as const) {
        const row = await db.booking.create({
          data: {
            code: `BT-${Array.from({ length: 5 }, () => "23456789ABCDEFGHJKLMNPQRSTUVWXYZ"[Math.floor(Math.random() * 32)]).join("")}`,
            listingId: ids.listing,
            guestUserId: ids.guest,
            hostUserId: ids.host,
            checkIn: new Date(`2027-0${n + 2}-04T00:00:00Z`),
            checkOut: new Date(`2027-0${n + 2}-06T00:00:00Z`),
            nights: 2,
            adults: 1,
            nightlyPrice: new Prisma.Decimal(80),
            subtotal: new Prisma.Decimal(160),
            total: new Prisma.Decimal(160),
            currency: "USD",
            cancellationPolicy: "MODERATE",
            guestName: GUEST_NAME,
            guestPhone: GUEST_PHONE,
            locale: "he",
            rulesAcceptedAt: new Date(),
            status: "CANCELLED_BY_GUEST",
            cancelledAt: new Date(),
            cancelReasonCode: reason,
          },
        });
        extra.push(row.id);
      }
      // Only the ordinary cancellation counts.
      expect((await getUserBookings(ids.guest, VIEWERS.ADMIN)).guestCancelled).toBe(before + 1);
    } finally {
      await db.booking.deleteMany({ where: { id: { in: extra } } });
    }
  });
});

