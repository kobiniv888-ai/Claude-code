/**
 * Real reviews (round 3, brief 8.1) against the local database (DATABASE_URL in .env): the window
 * and "once per booking", final reviews and replies, the host's report (never about a listing or
 * a user), hide / show again with the listing's counters in the same transaction, the review
 * request after a stay (instead of the thank-you, once, never for demo stays or after the guest
 * turned it off) and the translations. Phase-5 hardening: "didn't arrive" vs reviews (reviews-1),
 * guest reports of a reply and staff hiding any review (reviews-2), the translation catch-up
 * (reviews-3), all reviews in pages (reviews-7, ux-2), a report racing a hide (reviews-9) and
 * filler text (reviews-10). Creates its own users (fake @example.com addresses), city,
 * listings and bookings with a unique prefix and removes them afterwards. Emails are recorded, not
 * sent.
 */
import "dotenv/config";
import fs from "node:fs";
import path from "node:path";
import { randomUUID } from "node:crypto";
import { createTranslator } from "use-intl/core";
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import type { Prisma as PrismaTypes } from "@/generated/prisma/client";

process.env.TWILIO_ACCOUNT_SID = "";
process.env.RESEND_API_KEY = "";
process.env.ADMIN_ALERT_EMAIL = "founder-alerts@example.com";
process.env.HASH_SALT ||= "test-salt-reviews";
delete process.env.TELEGRAM_BOT_TOKEN;

vi.mock("server-only", () => ({}));
vi.mock("next-intl/server", () => ({
  getTranslations: async ({ locale, namespace }: { locale: string; namespace: string }) => {
    const root = namespace.split(".")[0];
    const file = path.join(process.cwd(), "messages", locale, `${root}.json`);
    return createTranslator({ locale, messages: { [root]: JSON.parse(fs.readFileSync(file, "utf8")) }, namespace });
  },
}));
vi.mock("@/lib/request", () => ({ getIpHash: async () => "test-ip" }));
type Sent = { to: string; template: string; data: Record<string, unknown>; headers?: Record<string, string> };
const sent: Sent[] = [];
vi.mock("@/lib/email", async (importOriginal) => {
  const real = await importOriginal<typeof import("@/lib/email")>();
  return {
    ...real,
    sendEmail: vi.fn(async (input: { to: string; template: string; data: Record<string, unknown>; headers?: Record<string, string> }) => {
      sent.push({ to: input.to, template: input.template, data: input.data, headers: input.headers });
      return { ok: true, delivery: "logged" as const };
    }),
  };
});
vi.mock("@/lib/sms", () => ({ isSmsConfigured: () => false, sendSms: vi.fn(async () => ({ ok: true, delivered: false })) }));
// Staff actions (hide without a report, clear a no-show) run as this staff member.
const staffSession = vi.hoisted(() => ({ user: null as null | { id: string; role: string } }));
vi.mock("@/lib/auth/session", () => {
  const staff = async () => {
    if (!staffSession.user) throw Object.assign(new Error("no staff session in this test"), { code: "forbidden", status: 403 });
    return staffSession.user;
  };
  return { requireStaffForAction: vi.fn(staff), requireUserForAction: vi.fn(staff), getCurrentUser: vi.fn(async () => staffSession.user) };
});
vi.mock("next/server", async (importOriginal) => {
  const real = await importOriginal<typeof import("next/server")>();
  return { ...real, after: (fn: () => unknown) => void Promise.resolve().then(fn).catch(() => undefined) };
});
const translation = vi.hoisted(() => ({ enabled: false, calls: 0 }));
vi.mock("@/lib/translate", () => ({
  isTranslationEnabled: () => translation.enabled,
  translateTextInto: vi.fn(async (text: string, _from: string, targets: string[]) => {
    translation.calls += 1;
    return Object.fromEntries(targets.map((locale) => [locale, `[${locale}] ${text}`]));
  }),
}));

const { db } = await import("@/lib/db");
const { Prisma } = await import("@/generated/prisma/client");
const { addDays, tbilisiToday } = await import("@/lib/booking/dates");
const service = await import("@/lib/reviews/service");
const { sendReviewRequest } = await import("@/lib/reviews/notify");
const { translateMissingReviews, translateReply, translateReview } = await import("@/lib/reviews/translate");
const { getRatingSummary } = await import("@/lib/reviews/rules");
const { createReviewSchema, replySchema } = await import("@/lib/reviews/schemas");
const { getGuestReviews, getListingReviews, getListingReviewsPage, getReviewPrompt, getReviewReports } = await import("@/lib/reviews/queries");
const { hideReviewAction } = await import("@/lib/reviews/admin-actions");
const { clearNoShowAction } = await import("@/lib/admin/actions/flags");
const bookingService = await import("@/lib/booking/service");

const prefix = `rvw${randomUUID().replace(/-/g, "").slice(0, 10)}`;
const ids = { host: `${prefix}-host`, guest: `${prefix}-guest`, other: `${prefix}-other`, staff: `${prefix}-staff`, city: "", listing: "", monthly: "", demo: "" };
const names = { he: "עיר", en: "City", ru: "Город", ar: "مدينة", ka: "ქალაქი" };
const today = tbilisiToday();
const dayDate = (iso: string) => new Date(`${iso}T00:00:00.000Z`);
const TEXT = "A quiet, clean flat. The host met us at the door with a map of the area.";
let seq = 0;

async function createUser(id: string, data: Partial<PrismaTypes.UserUncheckedCreateInput> = {}) {
  return db.user.create({ data: { id, name: `Dana ${id.slice(-5)} Levi`, firstName: "Dana", email: `${id}@example.com`, locale: "en", ...data } });
}

/** A booking that checked out `daysAgo` days ago (Georgia days). */
function createBooking(data: Partial<PrismaTypes.BookingUncheckedCreateInput> & { daysAgo?: number } = {}) {
  const { daysAgo = 2, ...rest } = data;
  seq += 1;
  const checkOut = addDays(today, -daysAgo);
  return db.booking.create({
    data: {
      code: `${prefix}-${seq}`.toUpperCase(),
      listingId: ids.listing,
      guestUserId: ids.guest,
      hostUserId: ids.host,
      checkIn: dayDate(addDays(checkOut, -3)),
      checkOut: dayDate(checkOut),
      nights: 3,
      adults: 2,
      nightlyPrice: new Prisma.Decimal(55),
      subtotal: new Prisma.Decimal(165),
      total: new Prisma.Decimal(165),
      currency: "GEL",
      cancellationPolicy: "MODERATE",
      status: "COMPLETED",
      guestName: "Dana",
      guestPhone: "+995555990701",
      locale: "en",
      rulesAcceptedAt: new Date(),
      ...rest,
    },
  });
}

const quick = { cleanliness: 5, accuracy: null, checkIn: 4, communication: null, location: null, value: null };

function post(code: string, rating = 5, text = TEXT, guestId = ids.guest) {
  return service.createReviewForBooking({ guestId, bookingCode: code, rating, quick, text, pageLocale: "en" });
}

async function counters(listingId = ids.listing) {
  return db.listing.findUniqueOrThrow({ where: { id: listingId }, select: { reviewCount: true, ratingSum: true } });
}

async function expectCode(promise: Promise<unknown>, code: string) {
  await expect(promise).rejects.toMatchObject({ code });
}

beforeAll(async () => {
  await createUser(ids.host);
  await createUser(ids.guest);
  await createUser(ids.other);
  await createUser(ids.staff, { role: "MODERATOR" });
  const city = await db.city.create({ data: { slug: `${prefix}-city`, names, searchText: "city", lat: 41.64, lng: 41.63 } });
  ids.city = city.id;
  const listing = (data: Partial<PrismaTypes.ListingUncheckedCreateInput>) =>
    db.listing.create({ data: { ownerId: ids.host, status: "LIVE", dealType: "SHORT_STAY", cityId: city.id, title: "Test flat", currency: "GEL", price: new Prisma.Decimal(55), ...data } });
  ids.listing = (await listing({})).id;
  ids.monthly = (await listing({ dealType: "MONTHLY_RENT", title: "Monthly flat" })).id;
  ids.demo = (await listing({ isDemo: true, title: "Demo flat" })).id;
});

beforeEach(() => {
  sent.length = 0;
  translation.enabled = false;
  translation.calls = 0;
});

afterAll(async () => {
  const reviews = await db.review.findMany({ where: { hostUserId: ids.host }, select: { id: true } });
  await db.report.deleteMany({ where: { reviewId: { in: reviews.map((r) => r.id) } } });
  await db.report.deleteMany({ where: { reporterId: { startsWith: prefix } } });
  await db.auditLog.deleteMany({ where: { actorId: { startsWith: prefix } } });
  await db.auditLog.deleteMany({ where: { targetType: "Review", targetId: { in: reviews.map((r) => r.id) } } });
  await db.rateLimit.deleteMany({ where: { key: { contains: prefix } } });
  await db.booking.deleteMany({ where: { hostUserId: ids.host } });
  await db.listing.deleteMany({ where: { ownerId: ids.host } });
  await db.city.deleteMany({ where: { slug: { startsWith: prefix } } });
  await db.user.deleteMany({ where: { id: { startsWith: prefix } } });
});

describe("posting a review", () => {
  it("counts it in the listing's counters in the same transaction, once per booking", async () => {
    const before = await counters();
    const booking = await createBooking();
    const review = await post(booking.code, 4);
    expect(await counters()).toEqual({ reviewCount: before.reviewCount + 1, ratingSum: before.ratingSum + 4 });
    const row = await db.review.findUniqueOrThrow({ where: { id: review.id } });
    expect(row).toMatchObject({ rating: 4, cleanliness: 5, checkIn: 4, accuracy: null, language: "en", hidden: false, hostReply: null, guestUserId: ids.guest, hostUserId: ids.host });
    await expectCode(post(booking.code, 1), "already_reviewed");
    expect(await counters()).toEqual({ reviewCount: before.reviewCount + 1, ratingSum: before.ratingSum + 4 });
  });

  it("lets two submits at the same moment make one review and one count", async () => {
    const before = await counters();
    const booking = await createBooking();
    const results = await Promise.allSettled([post(booking.code, 5), post(booking.code, 5), post(booking.code, 5)]);
    expect(results.filter((r) => r.status === "fulfilled")).toHaveLength(1);
    for (const r of results.filter((r) => r.status === "rejected")) expect((r as PromiseRejectedResult).reason).toMatchObject({ code: "already_reviewed" });
    expect(await db.review.count({ where: { bookingId: booking.id } })).toBe(1);
    expect(await counters()).toEqual({ reviewCount: before.reviewCount + 1, ratingSum: before.ratingSum + 5 });
  });

  it("is only for the guest of the booking", async () => {
    const booking = await createBooking();
    await expectCode(post(booking.code, 5, TEXT, ids.other), "not_found");
    await expectCode(post(booking.code, 5, TEXT, ids.host), "not_found");
  });

  it("opens the day after check-out and closes 14 days after it", async () => {
    await expectCode(post((await createBooking({ daysAgo: 0, status: "CONFIRMED" })).code), "too_early");
    await expectCode(post((await createBooking({ daysAgo: 15 })).code), "too_late");
    // The last day, and a CONFIRMED stay the daily job hasn't completed yet.
    await post((await createBooking({ daysAgo: 14 })).code);
    await post((await createBooking({ daysAgo: 1, status: "CONFIRMED" })).code);
  });

  it("refuses cancelled and no-show stays, demo listings and contact details", async () => {
    await expectCode(post((await createBooking({ status: "NO_SHOW" })).code), "not_stayed");
    await expectCode(post((await createBooking({ status: "CANCELLED_BY_HOST" })).code), "not_stayed");
    // reviews-4: a booking was made as a stay (only bookable types take bookings); a listing that
    // is a monthly rental NOW (switched after the stay) does not take the guest's review away.
    await post((await createBooking({ listingId: ids.monthly })).code);
    await expectCode(post((await createBooking({ listingId: ids.demo })).code), "demo");
    const booking = await createBooking();
    await expectCode(post(booking.code, 5, "Lovely flat, call me on +995 555 12 34 56 for a discount next time"), "contact_in_text");
    await expectCode(post(booking.code, 5, "Lovely flat, write to dana.levi@example.com if you want more photos"), "contact_in_text");
    expect(await db.review.count({ where: { bookingId: booking.id } })).toBe(0);
  });

  it("records the language of the text from its alphabet", async () => {
    const review = await post((await createBooking()).code, 5, "דירה נקייה ושקטה, המארח קיבל אותנו בחום רב");
    expect((await db.review.findUniqueOrThrow({ where: { id: review.id } })).language).toBe("he");
  });
});

describe("the host's reply and report", () => {
  it("allows ONE reply, by the host only, final", async () => {
    const review = await post((await createBooking()).code);
    await expectCode(service.postHostReply({ hostId: ids.other, reviewId: review.id, text: "Thank you!" }), "not_found");
    await service.postHostReply({ hostId: ids.host, reviewId: review.id, text: "Thank you, come back soon!", pageLocale: "en" });
    await expectCode(service.postHostReply({ hostId: ids.host, reviewId: review.id, text: "Changed my mind" }), "already_replied");
    expect(await db.review.findUniqueOrThrow({ where: { id: review.id } })).toMatchObject({ hostReply: "Thank you, come back soon!", hostReplyLanguage: "en" });
    await expectCode(service.postHostReply({ hostId: ids.host, reviewId: (await post((await createBooking()).code)).id, text: "Call +995 555 12 34 56" }), "contact_in_text");
  });

  it("files a REVIEW report about no listing and no user (never a host flag), one open report at a time", async () => {
    const review = await post((await createBooking()).code, 1);
    await expectCode(service.reportReview({ reporterId: ids.host, reviewId: review.id, reason: "OTHER", details: "no" }), "details_required");
    await expectCode(service.reportReview({ reporterId: ids.other, reviewId: review.id, reason: "OFFENSIVE", details: "" }), "not_found");
    const report = await service.reportReview({ reporterId: ids.host, reviewId: review.id, reason: "OFFENSIVE", details: "" });
    expect(await db.report.findUniqueOrThrow({ where: { id: report.id } })).toMatchObject({
      kind: "GENERAL",
      targetType: "REVIEW",
      reviewId: review.id,
      listingId: null,
      targetUserId: null,
      bookingId: null,
      reporterId: ids.host,
      status: "OPEN",
    });
    await expectCode(service.reportReview({ reporterId: ids.host, reviewId: review.id, reason: "OTHER", details: "The guest never stayed here." }), "already_reported");
  });
});

describe("staff hide and show again", () => {
  it("drop and restore the counters, close the review's open reports, and never change the text", async () => {
    const before = await counters();
    const review = await post((await createBooking()).code, 2);
    const report = await service.reportReview({ reporterId: ids.host, reviewId: review.id, reason: "OFFENSIVE", details: "" });
    const hidden = await service.hideReview({ staffId: ids.staff, reviewId: review.id, reason: "offensive", note: "Insults the host" });
    expect(hidden).toEqual({ listingId: ids.listing, closedReports: [report.id] });
    expect(await counters()).toEqual(before);
    expect(await db.review.findUniqueOrThrow({ where: { id: review.id } })).toMatchObject({ hidden: true, hiddenReason: "offensive\nInsults the host", hiddenById: ids.staff, text: TEXT, rating: 2 });
    expect(await db.report.findUniqueOrThrow({ where: { id: report.id } })).toMatchObject({ status: "RESOLVED", actionTaken: "review_hidden", handledById: ids.staff });
    await expectCode(service.hideReview({ staffId: ids.staff, reviewId: review.id, reason: "other", note: "again" }), "already_hidden");
    expect(await counters()).toEqual(before);
    // Hidden reviews are not public and take no reply.
    expect((await getListingReviews(ids.listing, "en", 200)).reviews.some((r) => r.id === review.id)).toBe(false);
    await expectCode(service.postHostReply({ hostId: ids.host, reviewId: review.id, text: "Thanks!" }), "review_hidden");

    await service.showReview({ reviewId: review.id });
    expect(await counters()).toEqual({ reviewCount: before.reviewCount + 1, ratingSum: before.ratingSum + 2 });
    await expectCode(service.showReview({ reviewId: review.id }), "not_hidden");
    expect(await service.recountListingReviews(ids.listing)).toEqual(await counters());
  });

  it("shows the average only while 3 reviews are visible", async () => {
    const city = await db.listing.create({ data: { ownerId: ids.host, status: "LIVE", dealType: "HOTEL_ROOM", cityId: ids.city, title: "Hotel", currency: "GEL" } });
    const reviews = [];
    for (const rating of [5, 4, 4]) reviews.push(await post((await createBooking({ listingId: city.id })).code, rating));
    expect(getRatingSummary(await counters(city.id))).toEqual({ count: 3, average: 4.3 });
    await service.hideReview({ staffId: ids.staff, reviewId: reviews[0].id, reason: "not_genuine", note: "Not a real stay" });
    expect(getRatingSummary(await counters(city.id))).toEqual({ count: 2, average: null });
    const page = await getListingReviews(city.id, "en");
    expect(page.total).toBe(2);
    expect(page.reviews.every((r) => r.author === "Dana")).toBe(true);
  });
});

describe("asking for a review", () => {
  it("prompts on the trip page only while the booking can be reviewed", async () => {
    const booking = await createBooking();
    expect(await getReviewPrompt(ids.guest, booking.code, "en")).toMatchObject({ code: booking.code, closes: addDays(addDays(today, -2), 14), daysLeft: 13 });
    expect(await getReviewPrompt(ids.other, booking.code, "en")).toBeNull();
    await post(booking.code);
    expect(await getReviewPrompt(ids.guest, booking.code, "en")).toBeNull();
    expect(await getReviewPrompt(ids.guest, (await createBooking({ listingId: ids.demo })).code, "en")).toBeNull();
  });

  it("sends the review request instead of the thank-you when the daily job completes a stay, once", async () => {
    const booking = await createBooking({ daysAgo: 1, status: "CONFIRMED" });
    expect((await bookingService.completeFinishedBookings(new Date(), { listingId: ids.listing })).completed).toBeGreaterThanOrEqual(1);
    const mine = sent.filter((s) => s.data.writeUrl === `/account/reviews/write/${encodeURIComponent(booking.code)}`);
    expect(mine.map((s) => s.template)).toEqual(["review_request"]);
    expect(mine[0]).toMatchObject({ to: `${ids.guest}@example.com` });
    expect(String(mine[0].data.unsubscribeUrl)).toMatch(/^\/unsubscribe\?t=1\.review_request\./);
    expect(mine[0].headers?.["List-Unsubscribe-Post"]).toBe("List-Unsubscribe=One-Click");
    expect(sent.some((s) => s.template === "booking_completed" && s.data.code === booking.code)).toBe(false);
    // The job never completes it again, so it never asks twice.
    sent.length = 0;
    await bookingService.completeFinishedBookings(new Date(), { listingId: ids.listing });
    expect(sent.some((s) => s.data.writeUrl === `/account/reviews/write/${encodeURIComponent(booking.code)}`)).toBe(false);
  });

  it("sends the plain thank-you for demo stays and when the guest turned review requests off", async () => {
    const demo = await createBooking({ daysAgo: 1, status: "CONFIRMED", listingId: ids.demo });
    await bookingService.completeFinishedBookings(new Date(), { listingId: ids.demo });
    expect(sent.filter((s) => s.data.code === demo.code).map((s) => s.template)).toEqual(["booking_completed"]);

    await db.user.update({ where: { id: ids.guest }, data: { notificationPrefs: { email: { reviewRequests: false } } } });
    try {
      const booking = await createBooking();
      expect(await sendReviewRequest(booking.id)).toBe(false);
    } finally {
      await db.user.update({ where: { id: ids.guest }, data: { notificationPrefs: Prisma.DbNull } });
    }
    expect(await sendReviewRequest((await createBooking({ daysAgo: 20 })).id)).toBe(false);
  });
});

describe("translations", () => {
  it("are stored once for the other four languages when a key is set, and never without one", async () => {
    const review = await post((await createBooking()).code);
    expect(await translateReview(review.id)).toBe(false);
    expect((await db.review.findUniqueOrThrow({ where: { id: review.id } })).translations).toBeNull();
    translation.enabled = true;
    expect(await translateReview(review.id)).toBe(true);
    expect(await translateReview(review.id)).toBe(false);
    const row = await db.review.findUniqueOrThrow({ where: { id: review.id } });
    expect(Object.keys(row.translations as object).sort()).toEqual(["ar", "he", "ka", "ru"]);
    expect(row.text).toBe(TEXT);
    const he = (await getListingReviews(ids.listing, "he", 200)).reviews.find((r) => r.id === review.id);
    expect(he?.body).toMatchObject({ shown: `[he] ${TEXT}`, original: TEXT, translated: true });
    await service.postHostReply({ hostId: ids.host, reviewId: review.id, text: "Thanks a lot, Dana!", pageLocale: "en" });
    expect(await translateReply(review.id)).toBe(true);
    expect(translation.calls).toBe(2);
  });
});

// ─── Phase-5 hardening ────────────────────────────────────────

describe("\"didn't arrive\" and reviews (reviews-1)", () => {
  it("refuses a no-show report once the guest reviewed the stay; the review and the counters stay", async () => {
    const before = await counters();
    const booking = await createBooking({ daysAgo: 2 });
    const review = await post(booking.code, 1);
    await expectCode(bookingService.markNoShow({ bookingId: booking.id, hostUserId: ids.host }), "no_show_reviewed");
    expect((await db.booking.findUniqueOrThrow({ where: { id: booking.id } })).status).toBe("COMPLETED");
    expect(await counters()).toEqual({ reviewCount: before.reviewCount + 1, ratingSum: before.ratingSum + 1 });
    expect((await getListingReviews(ids.listing, "en", 200)).reviews.some((r) => r.id === review.id)).toBe(true);
  });

  it("never lets a review and a no-show report at the same moment both succeed", async () => {
    for (let round = 0; round < 10; round++) {
      const booking = await createBooking({ daysAgo: 2 });
      const [review, noShow] = await Promise.allSettled([post(booking.code, 3), bookingService.markNoShow({ bookingId: booking.id, hostUserId: ids.host })]);
      expect([review.status, noShow.status].filter((s) => s === "fulfilled")).toHaveLength(1);
      const row = await db.booking.findUniqueOrThrow({ where: { id: booking.id }, select: { status: true, review: { select: { id: true } } } });
      if (review.status === "fulfilled") {
        expect(row.status).toBe("COMPLETED");
        expect((noShow as PromiseRejectedResult).reason).toMatchObject({ code: "no_show_reviewed" });
      } else {
        expect(row).toMatchObject({ status: "NO_SHOW", review: null });
        expect((review as PromiseRejectedResult).reason).toMatchObject({ code: "not_stayed" });
      }
    }
  });

  it("tells the guest, and staff can clear a wrong report so the guest can review", async () => {
    // Still staying: from the day after check-in, the host can report (the guest can't review yet).
    const booking = await createBooking({ daysAgo: -2, status: "CONFIRMED" });
    await bookingService.markNoShow({ bookingId: booking.id, hostUserId: ids.host });
    expect(sent.filter((s) => s.template === "review_no_show_guest" && s.data.code === booking.code)).toHaveLength(1);
    expect(sent.find((s) => s.template === "review_no_show_guest")).toMatchObject({ to: `${ids.guest}@example.com`, data: { contactUrl: "/contact" } });
    const afterStay = new Date(Date.now() + 4 * 86_400_000);
    await expectCode(service.createReviewForBooking({ guestId: ids.guest, bookingCode: booking.code, rating: 5, quick, text: TEXT, now: afterStay }), "not_stayed");

    // Nobody clears their own booking's report; a non-staff call is refused.
    staffSession.user = null;
    expect(await clearNoShowAction({ bookingId: booking.id, note: "The guest sent the host's receipt" })).toMatchObject({ ok: false });
    staffSession.user = { id: ids.staff, role: "MODERATOR" };
    try {
      expect(await clearNoShowAction({ bookingId: booking.id, note: "The guest sent the host's receipt" })).toEqual({ ok: true, data: { status: "CONFIRMED" } });
      expect(await clearNoShowAction({ bookingId: booking.id, note: "again" })).toMatchObject({ ok: false });
    } finally {
      staffSession.user = null;
    }
    expect(await db.booking.findUniqueOrThrow({ where: { id: booking.id } })).toMatchObject({ status: "CONFIRMED", noShowReportedAt: null, flagReviewedById: ids.staff });
    expect(await db.auditLog.count({ where: { action: "booking.no_show_cleared", targetId: booking.id, actorId: ids.staff } })).toBe(1);
    // After check-out the guest can review again.
    await service.createReviewForBooking({ guestId: ids.guest, bookingCode: booking.code, rating: 5, quick, text: TEXT, now: afterStay });
  });

  it("clears to COMPLETED after the check-out day, and hides the host's button once reviewed", async () => {
    // Real-looking codes: the host's booking page looks bookings up by "BT-XXXXX".
    const realCode = () => `BT-${Array.from({ length: 5 }, () => "23456789ABCDEFGHJKLMNPQRSTUVWXYZ"[Math.floor(Math.random() * 32)]).join("")}`;
    const booking = await createBooking({ daysAgo: 3, code: realCode() });
    await bookingService.markNoShow({ bookingId: booking.id, hostUserId: ids.host });
    expect((await bookingService.clearNoShow({ bookingId: booking.id, staffId: ids.staff })).status).toBe("COMPLETED");
    await post(booking.code, 4);
    const { getHostBooking } = await import("@/lib/booking/queries");
    expect((await getHostBooking(ids.host, booking.code, "en"))?.canReportNoShow).toBe(false);
    expect((await getHostBooking(ids.host, (await createBooking({ daysAgo: 3, code: realCode() })).code, "en"))?.canReportNoShow).toBe(true);
  });
});

describe("reporting a reply, and staff hiding any review (reviews-2)", () => {
  it("lets the guest report the host's reply (only once there is one); anyone else gets not found", async () => {
    const review = await post((await createBooking()).code);
    await expectCode(service.reportReview({ reporterId: ids.guest, reviewId: review.id, reason: "OFFENSIVE", details: "" }), "not_found");
    await service.postHostReply({ hostId: ids.host, reviewId: review.id, text: "You were rude to my neighbours, never again.", pageLocale: "en" });
    await expectCode(service.reportReview({ reporterId: ids.other, reviewId: review.id, reason: "OFFENSIVE", details: "" }), "not_found");
    const report = await service.reportReview({ reporterId: ids.guest, reviewId: review.id, reason: "OFFENSIVE", details: "Insulting" });
    expect(report.part).toBe("reply");
    expect(await db.report.findUniqueOrThrow({ where: { id: report.id } })).toMatchObject({ targetType: "REVIEW", reviewId: review.id, reporterId: ids.guest, status: "OPEN", listingId: null, targetUserId: null });
    await expectCode(service.reportReview({ reporterId: ids.guest, reviewId: review.id, reason: "OFFENSIVE", details: "" }), "already_reported");
    // The host's own report is about the review; both show on the staff page with their part.
    await service.reportReview({ reporterId: ids.host, reviewId: review.id, reason: "OFFENSIVE", details: "" });
    expect((await getReviewReports(review.id, { role: "ADMIN" })).map((r) => r.part).sort()).toEqual(["reply", "review"]);
    // Q12: who sent them is ADMIN only.
    expect((await getReviewReports(review.id, { role: "MODERATOR" })).every((r) => r.reporter === null && r.reporterWithheld)).toBe(true);
    // The guest's page shows their open report of the reply.
    const mine = (await getGuestReviews(ids.guest, "en")).written.find((r) => r.id === review.id);
    expect(mine?.reportedAt).toBeInstanceOf(Date);
  });

  it("lets staff hide a review nobody reported, logged", async () => {
    const before = await counters();
    const review = await post((await createBooking()).code, 5);
    staffSession.user = { id: ids.staff, role: "MODERATOR" };
    try {
      expect(await hideReviewAction({ reviewId: review.id, reason: "personal_info", note: "Names the neighbour" })).toEqual({ ok: true, data: { hidden: true } });
    } finally {
      staffSession.user = null;
    }
    expect(await db.review.findUniqueOrThrow({ where: { id: review.id } })).toMatchObject({ hidden: true, hiddenById: ids.staff });
    expect(await counters()).toEqual(before);
    expect(await db.auditLog.count({ where: { action: "review.hide", targetType: "Review", targetId: review.id, actorId: ids.staff } })).toBe(1);
  });
});

describe("a report racing a hide (reviews-9)", () => {
  it("never leaves an OPEN report on a hidden review", async () => {
    let open = 0;
    for (let round = 0; round < 25; round++) {
      const review = await post((await createBooking()).code, 2);
      await Promise.allSettled([
        service.reportReview({ reporterId: ids.host, reviewId: review.id, reason: "OFFENSIVE", details: "" }),
        service.hideReview({ staffId: ids.staff, reviewId: review.id, reason: "offensive", note: "Race" }),
      ]);
      open += await db.report.count({ where: { reviewId: review.id, status: "OPEN", review: { hidden: true } } });
    }
    expect(open).toBe(0);
  });
});

describe("translations that were missed (reviews-3)", () => {
  it("are caught up later, once", async () => {
    const listing = await db.listing.create({ data: { ownerId: ids.host, status: "LIVE", dealType: "SHORT_STAY", cityId: ids.city, title: "Catch-up flat", currency: "GEL" } });
    const review = await post((await createBooking({ listingId: listing.id })).code);
    await service.postHostReply({ hostId: ids.host, reviewId: review.id, text: "Thanks a lot, Dana!", pageLocale: "en" });
    // No key when it was posted: nothing stored, and a catch-up without a key does nothing.
    expect(await translateMissingReviews({ listingId: listing.id })).toEqual({ reviews: 0, replies: 0 });
    translation.enabled = true;
    expect(await translateMissingReviews({ listingId: listing.id })).toEqual({ reviews: 1, replies: 1 });
    const row = await db.review.findUniqueOrThrow({ where: { id: review.id } });
    expect(Object.keys(row.translations as object).sort()).toEqual(["ar", "he", "ka", "ru"]);
    expect(Object.keys(row.hostReplyTranslations as object).sort()).toEqual(["ar", "he", "ka", "ru"]);
    const calls = translation.calls;
    expect(await translateMissingReviews({ listingId: listing.id })).toEqual({ reviews: 0, replies: 0 });
    expect(translation.calls).toBe(calls);
  });
});

describe("every review can be read (reviews-7, ux-2)", () => {
  it("pages through all visible reviews, newest first, without gaps", async () => {
    const listing = await db.listing.create({ data: { ownerId: ids.host, status: "LIVE", dealType: "SHORT_STAY", cityId: ids.city, title: "Busy flat", currency: "GEL" } });
    const posted: string[] = [];
    for (let i = 0; i < 35; i++) {
      const booking = await createBooking({ listingId: listing.id, daysAgo: 2 });
      posted.push((await service.createReviewForBooking({ guestId: ids.guest, bookingCode: booking.code, rating: 4, quick, text: TEXT, now: new Date(Date.now() - (35 - i) * 60_000) })).id);
    }
    const newest = await getListingReviews(listing.id, "en", 30);
    expect(newest.total).toBe(35);
    expect(newest.reviews).toHaveLength(30);
    const page2 = await getListingReviewsPage(listing.id, "en", 2, 30);
    expect(page2).toMatchObject({ page: 2, pages: 2, total: 35 });
    expect(page2.reviews.map((r) => r.id)).toEqual(posted.slice(0, 5).reverse());
    // Past the end: the last page.
    expect((await getListingReviewsPage(listing.id, "en", 9, 30)).page).toBe(2);
  });
});

describe("filler text (reviews-10)", () => {
  it("is refused by the schemas and by the service", async () => {
    const base = { bookingCode: "BT-22222", rating: 5, confirmFinal: true as const };
    for (const filler of [".".repeat(20), "!".repeat(20), "😀".repeat(20), "- ".repeat(15)]) {
      const parsed = createReviewSchema.safeParse({ ...base, text: filler });
      expect(parsed.success, filler).toBe(false);
      expect(parsed.error?.issues.find((i) => i.path[0] === "text")?.message).toBe("too_short");
    }
    expect(createReviewSchema.safeParse({ ...base, text: "א".repeat(20) }).success).toBe(true);
    expect(createReviewSchema.safeParse({ ...base, text: "מקום מעולה, מומלץ בחום!" }).success).toBe(true);
    expect(replySchema.safeParse({ reviewId: "r1", text: "!!!!!", confirmFinal: true }).success).toBe(false);
    expect(replySchema.safeParse({ reviewId: "r1", text: "תודה!", confirmFinal: true }).success).toBe(true);
    await expectCode(post((await createBooking()).code, 5, "...................."), "too_short");
  });
});
