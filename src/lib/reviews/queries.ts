import "server-only";
import type { Prisma } from "@/generated/prisma/client";
import { type AppLocale } from "@/config/site";
import { isAppLocale, pickLocalized } from "@/i18n/locale";
import { BOOKABLE_DEAL_TYPES } from "@/lib/booking/constants";
import { addDays, dateToDay, dayToDate, tbilisiToday } from "@/lib/booking/dates";
import { db } from "@/lib/db";
import { listingPath } from "@/lib/listing/urls";
import {
  QUICK_RATING_KEYS,
  REVIEW_WINDOW_DAYS,
  canReply,
  parseHiddenReason,
  pickReviewText,
  quickRatingAverages,
  reviewDaysLeft,
  reviewMonth,
  reviewWindow,
  reviewerFirstName,
  type QuickRatingKey,
  type ReviewHideReason,
  type ShownText,
} from "./rules";
import { blockFor, findGuestBooking } from "./service";

/**
 * What the pages show about reviews (server-only). Public lists hold VISIBLE reviews only, with
 * the guest's first name and the month, never the full name, the booking or the dates.
 */

export type ReviewView = {
  id: string;
  rating: number;
  quick: { key: QuickRatingKey; value: number }[];
  body: ShownText;
  /** "2026-10" (Georgia): shown as "אוקטובר 2026". */
  month: string;
  /** The guest's first name, or null ("אורח"). */
  author: string | null;
  reply: { body: ShownText; month: string } | null;
};

const viewSelect = {
  id: true,
  rating: true,
  cleanliness: true,
  accuracy: true,
  checkIn: true,
  communication: true,
  location: true,
  value: true,
  text: true,
  language: true,
  translations: true,
  hostReply: true,
  hostReplyLanguage: true,
  hostReplyTranslations: true,
  hostReplyAt: true,
  createdAt: true,
  guest: { select: { firstName: true, name: true, status: true } },
} satisfies Prisma.ReviewSelect;

type ViewRow = Prisma.ReviewGetPayload<{ select: typeof viewSelect }>;

function lang(value: string | null | undefined): AppLocale {
  return isAppLocale(value) ? value : "he";
}

export function toReviewView(row: ViewRow, reader: AppLocale): ReviewView {
  return {
    id: row.id,
    rating: row.rating,
    quick: QUICK_RATING_KEYS.flatMap((key) => (typeof row[key] === "number" ? [{ key, value: row[key] as number }] : [])),
    body: pickReviewText(row.text, lang(row.language), row.translations, reader),
    month: reviewMonth(row.createdAt),
    author: reviewerFirstName(row.guest),
    reply:
      row.hostReply && row.hostReplyAt
        ? { body: pickReviewText(row.hostReply, lang(row.hostReplyLanguage), row.hostReplyTranslations, reader), month: reviewMonth(row.hostReplyAt) }
        : null,
  };
}

/** The listing page: the newest visible reviews and the quick-rating averages (each from 3 ratings on). */
export async function getListingReviews(listingId: string, reader: AppLocale, take = 20) {
  const where = { listingId, hidden: false } satisfies Prisma.ReviewWhereInput;
  const [rows, aggregate] = await Promise.all([
    db.review.findMany({ where, orderBy: { createdAt: "desc" }, take, select: viewSelect }),
    db.review.aggregate({
      where,
      _count: { _all: true, cleanliness: true, accuracy: true, checkIn: true, communication: true, location: true, value: true },
      _avg: { cleanliness: true, accuracy: true, checkIn: true, communication: true, location: true, value: true },
    }),
  ]);
  return {
    reviews: rows.map((row) => toReviewView(row, reader)),
    total: aggregate._count._all,
    quick: quickRatingAverages(QUICK_RATING_KEYS.map((key) => ({ key, average: aggregate._avg[key], count: aggregate._count[key] }))),
  };
}

function titleIn(listing: { title: string; translations: { locale: string; title: string }[] }, locale: AppLocale): string {
  return listing.translations.find((t) => t.locale === locale)?.title?.trim() || listing.title;
}

const listingBits = { publicId: true, title: true, translations: { select: { locale: true, title: true } } } as const;

/** The trip page prompt (contract 3): the guest's booking that can be reviewed TODAY, else null. */
export async function getReviewPrompt(guestId: string, code: string, locale: AppLocale, now: Date = new Date()) {
  const booking = await findGuestBooking(guestId, code);
  const today = tbilisiToday(now);
  if (!booking || blockFor(booking, today)) return null;
  const listing = await db.listing.findUnique({ where: { id: booking.listingId }, select: listingBits });
  if (!listing) return null;
  const checkOut = dateToDay(booking.checkOut);
  return { code: booking.code, listingTitle: titleIn(listing, locale), closes: reviewWindow(checkOut).closes, daysLeft: reviewDaysLeft(checkOut, today) };
}

/** The write page: the booking (if it is the guest's), whether it can be reviewed, and its review if posted. */
export async function getReviewFormContext(guestId: string, code: string, locale: AppLocale, now: Date = new Date()) {
  const booking = await findGuestBooking(guestId, code);
  if (!booking) return null;
  const today = tbilisiToday(now);
  const [listing, review] = await Promise.all([
    db.listing.findUnique({ where: { id: booking.listingId }, select: { ...listingBits, photos: { orderBy: [{ isCover: "desc" }, { sortOrder: "asc" }], take: 1, select: { url: true } } } }),
    booking.review ? db.review.findUnique({ where: { id: booking.review.id }, select: { ...viewSelect, hidden: true } }) : Promise.resolve(null),
  ]);
  if (!listing) return null;
  const checkOut = dateToDay(booking.checkOut);
  const title = titleIn(listing, locale);
  return {
    code: booking.code,
    checkOut,
    listingTitle: title,
    listingPath: listingPath(listing.publicId, title),
    block: blockFor(booking, today),
    closes: reviewWindow(checkOut).closes,
    daysLeft: reviewDaysLeft(checkOut, today),
    review: review ? { ...toReviewView(review, locale), hidden: review.hidden } : null,
  };
}

const ownSelect = {
  ...viewSelect,
  hidden: true,
  hiddenReason: true,
  bookingId: true,
  booking: { select: { code: true } },
  listing: { select: listingBits },
} satisfies Prisma.ReviewSelect;

type OwnRow = Prisma.ReviewGetPayload<{ select: typeof ownSelect }>;

function ownView(row: OwnRow, reader: AppLocale) {
  const title = titleIn(row.listing, reader);
  return {
    ...toReviewView(row, reader),
    hidden: row.hidden,
    /** The reason's code only (the staff note stays staff-only). */
    hiddenReason: row.hidden ? ((parseHiddenReason(row.hiddenReason)?.code ?? "other") as ReviewHideReason) : null,
    bookingCode: row.booking.code,
    listingTitle: title,
    listingPath: listingPath(row.listing.publicId, title),
    canReply: canReply(row),
  };
}

export type OwnReviewView = ReturnType<typeof ownView>;
export type HostReviewView = OwnReviewView & { reportedAt: Date | null };

/** "ביקורות" for a host: reviews of their places (hidden ones too, marked), newest first, with their own open report. */
export async function getHostReviews(hostId: string, reader: AppLocale, take = 100): Promise<HostReviewView[]> {
  const rows = await db.review.findMany({ where: { hostUserId: hostId }, orderBy: { createdAt: "desc" }, take, select: ownSelect });
  const reports = rows.length
    ? await db.report.findMany({
        where: { reporterId: hostId, targetType: "REVIEW", reviewId: { in: rows.map((r) => r.id) } },
        orderBy: { createdAt: "desc" },
        select: { reviewId: true, createdAt: true, status: true },
      })
    : [];
  return rows.map((row) => {
    const report = reports.find((r) => r.reviewId === row.id && r.status === "OPEN") ?? null;
    return { ...ownView(row, reader), reportedAt: report?.createdAt ?? null };
  });
}

/** One booking's review for its host (the host booking page), or null. */
export async function getHostBookingReview(hostId: string, bookingId: string, reader: AppLocale): Promise<HostReviewView | null> {
  const row = await db.review.findFirst({ where: { bookingId, hostUserId: hostId }, select: ownSelect });
  if (!row) return null;
  const report = await db.report.findFirst({ where: { reporterId: hostId, targetType: "REVIEW", reviewId: row.id, status: "OPEN" }, select: { createdAt: true } });
  return { ...ownView(row, reader), reportedAt: report?.createdAt ?? null };
}

/** "ביקורות" for a guest: what they wrote, and the stays they can still review (newest first). */
export async function getGuestReviews(guestId: string, reader: AppLocale, now: Date = new Date()) {
  const today = tbilisiToday(now);
  const [rows, candidates] = await Promise.all([
    db.review.findMany({ where: { guestUserId: guestId }, orderBy: { createdAt: "desc" }, take: 100, select: ownSelect }),
    // Stays whose window may be open: checked out in the last REVIEW_WINDOW_DAYS days, no review yet.
    db.booking.findMany({
      where: {
        guestUserId: guestId,
        status: { in: ["COMPLETED", "CONFIRMED"] },
        review: null,
        checkOut: { gte: dayToDate(addDays(today, -REVIEW_WINDOW_DAYS)), lt: dayToDate(today) },
        listing: { dealType: { in: [...BOOKABLE_DEAL_TYPES] } },
      },
      orderBy: { checkOut: "desc" },
      take: 20,
      select: { code: true },
    }),
  ]);
  const pending = (
    await Promise.all(candidates.map((c) => getReviewPrompt(guestId, c.code, reader, now)))
  ).filter((p): p is NonNullable<typeof p> => p !== null);
  return { written: rows.map((row) => ownView(row, reader)), pending };
}

/** Staff: everything about one review (Admin → Reports, the "ביקורות" tab). */
export async function getAdminReview(reviewId: string, reader: AppLocale) {
  const row = await db.review.findUnique({
    where: { id: reviewId },
    select: {
      ...viewSelect,
      hidden: true,
      hiddenReason: true,
      hiddenAt: true,
      hiddenById: true,
      roomTypeId: true,
      guestUserId: true,
      hostUserId: true,
      booking: { select: { id: true, code: true, checkIn: true, checkOut: true, status: true, roomTypeName: true } },
      guest: { select: { id: true, name: true, firstName: true, status: true } },
      host: { select: { id: true, name: true, businessName: true, status: true } },
      listing: { select: { id: true, publicId: true, title: true, status: true, translations: { select: { locale: true, title: true } } } },
    },
  });
  if (!row) return null;
  const [hiddenBy, timeline] = await Promise.all([
    row.hiddenById ? db.user.findUnique({ where: { id: row.hiddenById }, select: { name: true } }) : Promise.resolve(null),
    db.auditLog.findMany({
      where: { targetType: "Review", targetId: row.id },
      orderBy: { createdAt: "asc" },
      take: 50,
      select: { id: true, action: true, createdAt: true, details: true, actor: { select: { name: true } } },
    }),
  ]);
  const title = titleIn(row.listing, reader);
  return {
    view: toReviewView(row, reader),
    /** Staff read the guest's words as written. */
    originalText: row.text,
    language: lang(row.language),
    originalReply: row.hostReply,
    hidden: row.hidden,
    hiddenReason: parseHiddenReason(row.hiddenReason),
    hiddenAt: row.hiddenAt,
    hiddenBy: hiddenBy?.name ?? null,
    guest: row.guest,
    host: row.host,
    booking: { ...row.booking, checkIn: dateToDay(row.booking.checkIn), checkOut: dateToDay(row.booking.checkOut), roomTypeName: row.booking.roomTypeName ? pickLocalized(row.booking.roomTypeName, reader) || null : null },
    listing: { id: row.listing.id, publicId: row.listing.publicId, status: row.listing.status, title, path: listingPath(row.listing.publicId, title) },
    timeline,
  };
}

export type AdminReview = NonNullable<Awaited<ReturnType<typeof getAdminReview>>>;
