import "server-only";
import { Prisma } from "@/generated/prisma/client";
import type { ReportReason } from "@/generated/prisma/enums";
import { isAppLocale } from "@/i18n/locale";
import { siteConfig, type AppLocale } from "@/config/site";
import { dateToDay, tbilisiToday } from "@/lib/booking/dates";
import { db } from "@/lib/db";
import { NotFoundError } from "@/lib/errors";
import { dominantScript } from "@/lib/listing/text-checks";
import { detectContactInfo, hasContactInfo } from "@/lib/risk/contact-info";
import { ReviewError } from "./errors";
import {
  REVIEW_REPORT_DETAILS_MIN,
  formatHiddenReason,
  reviewBlock,
  type QuickRatingKey,
  type ReviewBlock,
  type ReviewHideReason,
  type ReviewReportReason,
} from "./rules";

/**
 * Review mutations (server-only, round 3 brief 8.1). No session checks here: the callers
 * (./actions.ts, ./admin-actions.ts, tests) pass who acts, and every function checks that this
 * person may do it. FINAL: there is no function that edits a review's stars or text, or deletes a
 * review; the reply is written once (a conditional update on hostReply IS NULL).
 *
 * Listing.reviewCount / ratingSum (the VISIBLE reviews) change in the same transaction as the
 * review, with raw SQL so the listing's updatedAt stays as it is:
 * - a new review: +1 / +rating, after the booking row is locked (FOR UPDATE) and the rules are
 *   checked again inside the transaction; one review per booking is also a unique index, so a
 *   second submit fails and its transaction (with its +1) rolls back;
 * - hide: −1 / −rating only when the review was visible (conditional update), floored at 0;
 * - show again: +1 / +rating only when it was hidden.
 */

const bookingSelect = {
  id: true,
  code: true,
  status: true,
  checkOut: true,
  locale: true,
  guestUserId: true,
  hostUserId: true,
  listingId: true,
  roomTypeId: true,
  guest: { select: { isDemo: true } },
  host: { select: { isDemo: true } },
  listing: { select: { dealType: true, isDemo: true, deletedAt: true, status: true } },
  review: { select: { id: true } },
} satisfies Prisma.BookingSelect;

export type ReviewableBooking = Prisma.BookingGetPayload<{ select: typeof bookingSelect }>;

/** Why this booking can't be reviewed today (null = it can). */
export function blockFor(booking: ReviewableBooking, today: string): ReviewBlock | null {
  return reviewBlock({
    status: booking.status,
    checkOut: dateToDay(booking.checkOut),
    dealType: booking.listing.dealType,
    demo: booking.listing.isDemo || booking.guest.isDemo || booking.host.isDemo,
    listingDeleted: booking.listing.deletedAt !== null || booking.listing.status === "DELETED",
    hasReview: booking.review !== null,
    today,
  });
}

/** The guest's own booking by its code, with what the review rules need (null for anyone else's). */
export async function findGuestBooking(guestId: string, code: string): Promise<ReviewableBooking | null> {
  return db.booking.findFirst({ where: { code, guestUserId: guestId }, select: bookingSelect });
}

/** The language a text is written in: its alphabet, else the page's language, else Hebrew. */
export function textLanguage(text: string, fallback: string | null | undefined): AppLocale {
  return dominantScript(text) ?? (isAppLocale(fallback) ? fallback : siteConfig.i18n.primaryLocale);
}

function assertNoContactInfo(text: string) {
  if (hasContactInfo(detectContactInfo(text))) throw new ReviewError("contact_in_text", 400);
}

function isUniqueViolation(error: unknown): boolean {
  return error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002";
}

export type NewReview = {
  guestId: string;
  bookingCode: string;
  rating: number;
  quick: Record<QuickRatingKey, number | null>;
  /** Already tidied and length-checked (./schemas.ts). */
  text: string;
  pageLocale?: string | null;
  now?: Date;
};

/** Posts the guest's review of one booking. Returns its id and listing; throws ReviewError / NotFoundError. */
export async function createReviewForBooking(input: NewReview): Promise<{ id: string; listingId: string; hostUserId: string }> {
  const now = input.now ?? new Date();
  const today = tbilisiToday(now);
  const booking = await findGuestBooking(input.guestId, input.bookingCode);
  if (!booking) throw new NotFoundError();
  const before = blockFor(booking, today);
  if (before) throw new ReviewError(before);
  assertNoContactInfo(input.text);
  const language = textLanguage(input.text, input.pageLocale ?? booking.locale);

  try {
    return await db.$transaction(async (tx) => {
      // A "didn't arrive" report or a cancellation at the same moment waits for this lock.
      await tx.$queryRaw`SELECT "id" FROM "Booking" WHERE "id" = ${booking.id} FOR UPDATE`;
      const fresh = await tx.booking.findUnique({ where: { id: booking.id }, select: bookingSelect });
      if (!fresh) throw new NotFoundError();
      const block = blockFor(fresh, today);
      if (block) throw new ReviewError(block);
      const review = await tx.review.create({
        data: {
          bookingId: fresh.id,
          listingId: fresh.listingId,
          roomTypeId: fresh.roomTypeId,
          guestUserId: fresh.guestUserId,
          hostUserId: fresh.hostUserId,
          rating: input.rating,
          ...input.quick,
          text: input.text,
          language,
          createdAt: now,
        },
        select: { id: true, listingId: true, hostUserId: true },
      });
      await tx.$executeRaw`UPDATE "Listing" SET "reviewCount" = "reviewCount" + 1, "ratingSum" = "ratingSum" + ${input.rating} WHERE "id" = ${fresh.listingId}`;
      return review;
    });
  } catch (error) {
    if (isUniqueViolation(error)) throw new ReviewError("already_reviewed");
    throw error;
  }
}

/** The host's one public reply. Final: refused when there already is one, or the review is hidden. */
export async function postHostReply(input: { hostId: string; reviewId: string; text: string; pageLocale?: string | null; now?: Date }): Promise<void> {
  const now = input.now ?? new Date();
  assertNoContactInfo(input.text);
  const language = textLanguage(input.text, input.pageLocale);
  const { count } = await db.review.updateMany({
    where: { id: input.reviewId, hostUserId: input.hostId, hostReply: null, hidden: false },
    data: { hostReply: input.text, hostReplyLanguage: language, hostReplyAt: now, hostReplyTranslations: Prisma.DbNull },
  });
  if (count === 1) return;
  const review = await db.review.findFirst({ where: { id: input.reviewId, hostUserId: input.hostId }, select: { hidden: true } });
  if (!review) throw new NotFoundError();
  throw new ReviewError(review.hidden ? "review_hidden" : "already_replied");
}

/**
 * The host reports a review of their place to the admin: a Report with target REVIEW (the
 * "ביקורות" tab of Admin → Reports). It names no listing and no user, so it never counts toward
 * the listing's automatic hiding or the host's flags (src/lib/listing/host-flags.ts leaves REVIEW
 * reports out too). One open report per host and review.
 */
export async function reportReviewByHost(input: { hostId: string; reviewId: string; reason: ReviewReportReason; details: string }): Promise<{ id: string }> {
  const review = await db.review.findFirst({ where: { id: input.reviewId, hostUserId: input.hostId }, select: { id: true, hidden: true } });
  if (!review) throw new NotFoundError();
  if (review.hidden) throw new ReviewError("already_hidden");
  if (input.reason === "OTHER" && input.details.length < REVIEW_REPORT_DETAILS_MIN) throw new ReviewError("details_required", 400);
  return db.$transaction(async (tx) => {
    // One report at a time per host: the check and the insert never interleave.
    await tx.$queryRaw`SELECT "id" FROM "User" WHERE "id" = ${input.hostId} FOR NO KEY UPDATE`;
    const open = await tx.report.findFirst({
      where: { reviewId: review.id, reporterId: input.hostId, status: "OPEN", targetType: "REVIEW" },
      select: { id: true },
    });
    if (open) throw new ReviewError("already_reported");
    return tx.report.create({
      data: {
        kind: "GENERAL",
        targetType: "REVIEW",
        reviewId: review.id,
        reporterId: input.hostId,
        reason: input.reason as ReportReason,
        details: input.details || null,
        priority: "NORMAL",
      },
      select: { id: true },
    });
  });
}

/** A review is about to be hidden or shown again by staff: who wrote it and about whom (own-item rule). */
export async function reviewParties(reviewId: string): Promise<{ guestUserId: string; hostUserId: string; hidden: boolean } | null> {
  return db.review.findUnique({ where: { id: reviewId }, select: { guestUserId: true, hostUserId: true, hidden: true } });
}

/**
 * Staff hide a review that breaks the rules (never edit it): the reason code and note are kept
 * (Review.hiddenReason, staff-only), the listing's counters drop by this review, and the review's
 * open reports are closed as "review_hidden". Returns those reports (for their audit entries).
 */
export async function hideReview(input: { staffId: string; reviewId: string; reason: ReviewHideReason; note: string; now?: Date }): Promise<{ listingId: string; closedReports: string[] }> {
  const now = input.now ?? new Date();
  return db.$transaction(async (tx) => {
    const { count } = await tx.review.updateMany({
      where: { id: input.reviewId, hidden: false },
      data: { hidden: true, hiddenReason: formatHiddenReason(input.reason, input.note), hiddenAt: now, hiddenById: input.staffId },
    });
    const review = await tx.review.findUnique({ where: { id: input.reviewId }, select: { listingId: true, rating: true } });
    if (!review) throw new NotFoundError();
    if (count !== 1) throw new ReviewError("already_hidden");
    await tx.$executeRaw`UPDATE "Listing" SET "reviewCount" = GREATEST(0, "reviewCount" - 1), "ratingSum" = GREATEST(0, "ratingSum" - ${review.rating}) WHERE "id" = ${review.listingId}`;
    const open = await tx.report.findMany({ where: { reviewId: input.reviewId, targetType: "REVIEW", status: "OPEN" }, select: { id: true } });
    const ids = open.map((r) => r.id);
    if (ids.length) {
      await tx.report.updateMany({
        where: { id: { in: ids }, status: "OPEN" },
        data: { status: "RESOLVED", actionTaken: "review_hidden", resolution: input.note, handledById: input.staffId, handledAt: now },
      });
    }
    return { listingId: review.listingId, closedReports: ids };
  });
}

/** Staff show a hidden review again (logged by the caller); it counts again. */
export async function showReview(input: { reviewId: string }): Promise<{ listingId: string }> {
  return db.$transaction(async (tx) => {
    const { count } = await tx.review.updateMany({
      where: { id: input.reviewId, hidden: true },
      data: { hidden: false, hiddenReason: null, hiddenAt: null, hiddenById: null },
    });
    const review = await tx.review.findUnique({ where: { id: input.reviewId }, select: { listingId: true, rating: true } });
    if (!review) throw new NotFoundError();
    if (count !== 1) throw new ReviewError("not_hidden");
    await tx.$executeRaw`UPDATE "Listing" SET "reviewCount" = "reviewCount" + 1, "ratingSum" = "ratingSum" + ${review.rating} WHERE "id" = ${review.listingId}`;
    return { listingId: review.listingId };
  });
}

/** Rebuilds a listing's counters from its visible reviews (a repair; the counters normally never drift). */
export async function recountListingReviews(listingId: string): Promise<{ reviewCount: number; ratingSum: number }> {
  return db.$transaction(async (tx) => {
    await tx.$queryRaw`SELECT "id" FROM "Listing" WHERE "id" = ${listingId} FOR UPDATE`;
    const agg = await tx.review.aggregate({ where: { listingId, hidden: false }, _count: { _all: true }, _sum: { rating: true } });
    const counters = { reviewCount: agg._count._all, ratingSum: agg._sum.rating ?? 0 };
    await tx.$executeRaw`UPDATE "Listing" SET "reviewCount" = ${counters.reviewCount}, "ratingSum" = ${counters.ratingSum} WHERE "id" = ${listingId}`;
    return counters;
  });
}
