import "server-only";
import { siteConfig, type AppLocale } from "@/config/site";
import { isAppLocale } from "@/i18n/locale";
import { parseNotificationPrefs } from "@/lib/account/settings-schema";
import { unsubscribePath, unsubscribeToken } from "@/lib/alerts/unsubscribe-token";
import { firstNameOf } from "@/lib/auth/first-name";
import { tripPath } from "@/lib/booking/constants";
import { dateToDay, tbilisiToday } from "@/lib/booking/dates";
import { db } from "@/lib/db";
import { notificationEmailFor, sendEmail } from "@/lib/email";
import { listingPath } from "@/lib/listing/urls";
import { siteUrl } from "@/lib/site-url";
import { accountReviewPath, LISTING_REVIEWS_ANCHOR, REVIEWS_PATH, writeReviewPath } from "./paths";
import { parseHiddenReason, reviewWindow, reviewerFirstName } from "./rules";
import { blockFor } from "./service";

/**
 * The review emails (round 3, brief 8.1), each in its recipient's language, through @/lib/email
 * (the admin outbox until Resend is connected). None of them throws.
 *
 * - sendReviewRequest: called once per booking by the daily job, right after the booking became
 *   COMPLETED (src/lib/booking/service.ts completeFinishedBookings). When the stay can be reviewed
 *   (short stay or hotel, not a demo, the window still open, no review yet) and the guest didn't
 *   turn review requests off, the guest gets "how was it?" with a link to the form INSTEAD of the
 *   plain thank-you (one email after a stay, not two). Returns false otherwise, and the job sends
 *   the thank-you. Once: the CONFIRMED → COMPLETED change happens once per booking.
 * - notifyHostOfReview: a guest reviewed the host's place.
 * - notifyGuestOfReply: the host replied.
 * - notifyReviewVisibility: staff hid a review (the reason's name, never the note) or showed it
 *   again — to the guest who wrote it and to the host.
 */

function localeOf(value: string | null | undefined): AppLocale {
  return isAppLocale(value) ? value : siteConfig.i18n.fallbackLocale;
}

type TitledListing = { title: string; publicId: number; translations: { locale: string; title: string }[] };

function titleIn(listing: TitledListing, locale: AppLocale): string {
  return listing.translations.find((t) => t.locale === locale)?.title?.trim() || listing.title;
}

function listingReviewsPath(listing: TitledListing, locale: AppLocale): string {
  return `${listingPath(listing.publicId, titleIn(listing, locale))}#${LISTING_REVIEWS_ANCHOR}`;
}

const listingSelect = { title: true, publicId: true, translations: { select: { locale: true, title: true } } } as const;
const personSelect = { id: true, email: true, contactEmail: true, firstName: true, name: true, locale: true, isDemo: true, status: true } as const;

/** RFC 8058 one-click unsubscribe headers (the POST lands on /api/unsubscribe). */
function unsubscribeHeaders(userId: string): Record<string, string> {
  const url = `${siteUrl()}/api/unsubscribe?t=${encodeURIComponent(unsubscribeToken(userId, "review_request"))}`;
  return { "List-Unsubscribe": `<${url}>`, "List-Unsubscribe-Post": "List-Unsubscribe=One-Click" };
}

export async function sendReviewRequest(bookingId: string, now: Date = new Date()): Promise<boolean> {
  try {
    const booking = await db.booking.findUnique({
      where: { id: bookingId },
      select: {
        id: true,
        code: true,
        status: true,
        checkIn: true,
        checkOut: true,
        locale: true,
        guestUserId: true,
        hostUserId: true,
        listingId: true,
        roomTypeId: true,
        guestName: true,
        guest: { select: { ...personSelect, notificationPrefs: true } },
        host: { select: { isDemo: true } },
        listing: { select: { ...listingSelect, dealType: true, isDemo: true, deletedAt: true, status: true } },
        review: { select: { id: true } },
      },
    });
    if (!booking || booking.status !== "COMPLETED") return false;
    if (blockFor(booking, tbilisiToday(now))) return false;
    if (booking.guest.status === "DELETED" || booking.guest.status === "BANNED") return false;
    if (!parseNotificationPrefs(booking.guest.notificationPrefs).email.reviewRequests) return false;
    const to = notificationEmailFor(booking.guest);
    if (!to) return false;
    const locale = localeOf(booking.locale);
    const checkOut = dateToDay(booking.checkOut);
    const result = await sendEmail({
      to,
      locale,
      template: "review_request",
      data: {
        name: firstNameOf(booking.guest) ?? booking.guestName,
        listingTitle: titleIn(booking.listing, locale),
        checkIn: dateToDay(booking.checkIn),
        checkOut,
        closesOn: reviewWindow(checkOut).closes,
        writeUrl: writeReviewPath(booking.code),
        tripUrl: tripPath(booking.code),
        unsubscribeUrl: unsubscribePath(booking.guest.id, "review_request"),
      },
      headers: unsubscribeHeaders(booking.guest.id),
    });
    // Whatever the delivery, this was the stay's one email (a failure is in the outbox).
    if (!result.ok) console.warn(`[reviews] the review request for ${booking.code} was not delivered (${result.delivery})`);
    return true;
  } catch (error) {
    console.error(`[reviews] the review request for booking ${bookingId} failed:`, error);
    return false;
  }
}

const reviewSelect = {
  id: true,
  rating: true,
  text: true,
  hostReply: true,
  hiddenReason: true,
  guest: { select: personSelect },
  host: { select: personSelect },
  listing: { select: listingSelect },
} as const;

export async function notifyHostOfReview(reviewId: string): Promise<void> {
  try {
    const review = await db.review.findUnique({ where: { id: reviewId }, select: reviewSelect });
    if (!review || review.host.isDemo) return;
    const to = notificationEmailFor(review.host);
    if (!to) return;
    const locale = localeOf(review.host.locale);
    await sendEmail({
      to,
      locale,
      template: "review_posted_host",
      data: {
        name: firstNameOf(review.host),
        listingTitle: titleIn(review.listing, locale),
        rating: review.rating,
        guestName: reviewerFirstName(review.guest),
        text: review.text,
        reviewsUrl: accountReviewPath(review.id),
      },
    });
  } catch (error) {
    console.error(`[reviews] the host email for review ${reviewId} failed:`, error);
  }
}

export async function notifyGuestOfReply(reviewId: string): Promise<void> {
  try {
    const review = await db.review.findUnique({ where: { id: reviewId }, select: reviewSelect });
    if (!review?.hostReply || review.guest.isDemo || review.guest.status === "DELETED") return;
    const to = notificationEmailFor(review.guest);
    if (!to) return;
    const locale = localeOf(review.guest.locale);
    await sendEmail({
      to,
      locale,
      template: "review_reply_guest",
      data: {
        name: firstNameOf(review.guest),
        listingTitle: titleIn(review.listing, locale),
        replyText: review.hostReply,
        listingUrl: listingReviewsPath(review.listing, locale),
      },
    });
  } catch (error) {
    console.error(`[reviews] the reply email for review ${reviewId} failed:`, error);
  }
}

/** After staff hid a review (or showed it again): the guest and the host are told, without the staff note. */
export async function notifyReviewVisibility(reviewId: string, change: "hidden" | "shown"): Promise<void> {
  try {
    const review = await db.review.findUnique({ where: { id: reviewId }, select: reviewSelect });
    if (!review) return;
    const reasonCode = parseHiddenReason(review.hiddenReason)?.code ?? "other";
    const people = [
      { role: "guest" as const, person: review.guest },
      { role: "host" as const, person: review.host },
    ];
    await Promise.all(
      people.map(async ({ role, person }) => {
        if (person.isDemo || person.status === "DELETED") return;
        const to = notificationEmailFor(person);
        if (!to) return;
        const locale = localeOf(person.locale);
        const listingTitle = titleIn(review.listing, locale);
        if (change === "hidden") {
          await sendEmail({ to, locale, template: "review_hidden", data: { name: firstNameOf(person), role, listingTitle, reasonCode, reviewsUrl: REVIEWS_PATH } });
        } else {
          await sendEmail({ to, locale, template: "review_shown", data: { name: firstNameOf(person), role, listingTitle, listingUrl: listingReviewsPath(review.listing, locale) } });
        }
      }),
    );
  } catch (error) {
    console.error(`[reviews] the ${change} email for review ${reviewId} failed:`, error);
  }
}
