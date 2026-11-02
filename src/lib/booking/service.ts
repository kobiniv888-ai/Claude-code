import "server-only";
import type { CurrencyCode, AppLocale } from "@/config/site";
import { Prisma } from "@/generated/prisma/client";
import { isAccountInGoodStanding } from "@/lib/auth/account-status";
import { verifiedPhoneOf } from "@/lib/auth/phone-once";
import { audit } from "@/lib/audit";
import { getRates } from "@/lib/currency";
import { db } from "@/lib/db";
import { NotFoundError } from "@/lib/errors";
import { previewReason } from "@/lib/listing-page/access";
import { assertRateLimit } from "@/lib/rate-limit";
import { generateBookingCode } from "./code";
import { cleanPaymentMethods, REMINDER_DAYS_BEFORE, type GuestCancelReason, type HostCancelReason } from "./constants";
import { addDays, dateToDay, dayToDate, daysBetween, tbilisiToday } from "./dates";
import { BookingError } from "./errors";
import { findBlockingRange } from "./availability";
import { notifyBookingCancelled, notifyBookingCompleted, notifyBookingCreated, notifyBookingReminder } from "./notify";
import {
  canGuestCancel,
  canHostCancel,
  canReportNoShow,
  isGuestCancellationFlagged,
  isHostCancellationFlagged,
  isLateCancellation,
} from "./policy";
import { quoteStay, type Quote, type QuoteResult } from "./pricing";
import { isInstantBookable, resolveTerms, toNumber, type BookableRoomType } from "./terms";

/**
 * The booking engine (server-only). No session checks here — callers (./actions.ts, cron routes,
 * tests) pass the acting user's id, and every function checks that this user may act on the
 * booking. Bayit takes no payments: guests pay the host at check-in.
 *
 * The no-overlap rule: createBooking runs in ONE transaction that locks the listing row
 * (SELECT … FOR UPDATE), re-reads the listing, checks every block (OWNER, ICAL, BOOKING) and then
 * creates the booking and its BOOKING block. A second booking for the same nights waits for the
 * lock, then sees the first one's block and fails with "dates_unavailable".
 */

const listingSelect = {
  id: true,
  publicId: true,
  title: true,
  ownerId: true,
  status: true,
  deletedAt: true,
  dealType: true,
  bookingMode: true,
  price: true,
  pricePeriod: true,
  currency: true,
  weekendPrice: true,
  cleaningFee: true,
  minStayNights: true,
  maxGuests: true,
  cancellationPolicy: true,
  paymentMethodsAtCheckIn: true,
  checkInFrom: true,
  isDemo: true,
  expiresAt: true,
  owner: { select: { status: true, deletedAt: true } },
  roomTypes: {
    select: {
      id: true,
      names: true,
      price: true,
      currency: true,
      pricePeriod: true,
      maxGuests: true,
    },
    orderBy: { sortOrder: "asc" },
  },
} satisfies Prisma.ListingSelect;

type Client = Prisma.TransactionClient | typeof db;

async function loadListing(listingId: string, client: Client = db) {
  return client.listing.findUnique({
    where: { id: listingId },
    select: listingSelect,
  });
}

type LoadedListing = NonNullable<Awaited<ReturnType<typeof loadListing>>>;

// ─── Quote ────────────────────────────────────────────────────

export type StayParams = {
  listingId: string;
  checkIn: string;
  checkOut: string;
  adults: number;
  children?: number;
  infants?: number;
  roomTypeId?: string | null;
};

/** The chosen hotel room type, as plain values (safe to send to the browser). */
export type QuotedRoomType = { id: string; names: unknown; price: number; currency: CurrencyCode; maxGuests: number | null };

export type BookingQuote = {
  quote: Quote;
  roomType: QuotedRoomType | null;
  cancellationPolicy: LoadedListing["cancellationPolicy"];
  paymentMethods: string[];
};

export type BookingQuoteResult =
  | ({ ok: true } & BookingQuote)
  | {
      ok: false;
      error: Exclude<QuoteResult, { ok: true }>["error"] | "not_bookable" | "room_type_required" | "not_found";
      minNights?: number;
      maxNights?: number;
      maxGuests?: number;
    };

function plainRoomType(room: BookableRoomType | null): QuotedRoomType | null {
  if (!room) return null;
  return { id: room.id, names: room.names, price: toNumber(room.price) ?? 0, currency: room.currency, maxGuests: room.maxGuests };
}

function quoteFor(
  listing: LoadedListing,
  stay: StayParams,
  options: {
    displayCurrency?: CurrencyCode | null;
    rates?: Awaited<ReturnType<typeof getRates>> | null;
    now?: Date;
  },
): BookingQuoteResult {
  if (!isInstantBookable(listing)) return { ok: false, error: "not_bookable" };
  // The same rule as the listing page (expiry date, owner's account): a hidden listing is not
  // bookable, even from a review page opened before it was hidden (hardening B1). The demo rule is
  // applied by createBooking itself.
  if (previewReason(listing, { demoVisible: true, now: options.now }) !== null) return { ok: false, error: "not_bookable" };
  const resolved = resolveTerms(listing, stay.roomTypeId);
  if (!resolved.ok)
    return {
      ok: false,
      error: resolved.error === "room_type_required" ? "room_type_required" : "no_price",
    };
  const result = quoteStay(resolved.terms, stay, {
    today: tbilisiToday(options.now),
    displayCurrency: options.displayCurrency ?? null,
    rates: options.rates ?? null,
  });
  if (!result.ok) return result;
  return {
    ok: true,
    quote: result.quote,
    roomType: plainRoomType(resolved.roomType),
    cancellationPolicy: listing.cancellationPolicy,
    paymentMethods: cleanPaymentMethods(listing.paymentMethodsAtCheckIn),
  };
}

/**
 * The price of a stay for the review page (does not check availability: call isRangeFree or
 * getUnavailableDates for that). `displayCurrency` adds an estimate in the guest's currency.
 */
export async function getBookingQuote(
  stay: StayParams,
  options: { displayCurrency?: CurrencyCode | null; now?: Date } = {},
): Promise<BookingQuoteResult> {
  const listing = await loadListing(stay.listingId);
  if (!listing) return { ok: false, error: "not_found" };
  const rates = options.displayCurrency ? await getRates() : null;
  return quoteFor(listing, stay, { ...options, rates });
}

// ─── Create ───────────────────────────────────────────────────

export type CreateBookingParams = StayParams & {
  guestUserId: string;
  guestName: string;
  /** Must be the guest account's verified number (E.164) when given; the verified number is used. */
  guestPhone?: string | null;
  messageToHost?: string | null;
  rulesAccepted: boolean;
  /** The guest's language for messages about this booking. */
  locale: AppLocale;
  displayCurrency?: CurrencyCode | null;
  /**
   * Demo listings are made up: they can be booked only in development / test mode (or by demo
   * accounts), never by a real guest on the real site.
   */
  allowDemoListing?: boolean;
  /** false: the caller sends the notifications itself (e.g. with after()). Default true. */
  notify?: boolean;
  now?: Date;
  /**
   * What the review page showed the guest. When given and the listing's terms have changed since,
   * the booking is refused with "terms_changed" so the guest sees the new terms first.
   */
  expectedTotal?: number | null;
  expectedCurrency?: CurrencyCode | null;
  expectedPolicy?: LoadedListing["cancellationPolicy"] | null;
};

export type CreatedBooking = {
  id: string;
  code: string;
  listingId: string;
  checkIn: string;
  checkOut: string;
  nights: number;
  total: number;
  currency: CurrencyCode;
};

const CREATE_LIMIT = { limit: 8, windowSeconds: 3600 };
const CODE_ATTEMPTS = 5;
const TRANSACTION_ATTEMPTS = 3;

function isUniqueViolation(error: unknown, field?: string): boolean {
  if (!(error instanceof Prisma.PrismaClientKnownRequestError) || error.code !== "P2002") return false;
  if (!field) return true;
  return JSON.stringify(error.meta ?? {}).includes(field);
}

/** Two bookings drew the same code at the same moment (after the check in freshCode): try again. */
async function retryOnCodeCollision<T>(run: () => Promise<T>): Promise<T> {
  for (let attempt = 1; ; attempt++) {
    try {
      return await run();
    } catch (error) {
      if (attempt < TRANSACTION_ATTEMPTS && isUniqueViolation(error, "code")) continue;
      throw error;
    }
  }
}

async function freshCode(tx: Prisma.TransactionClient): Promise<string> {
  for (let i = 0; i < CODE_ATTEMPTS; i++) {
    const code = generateBookingCode();
    const taken = await tx.booking.findUnique({
      where: { code },
      select: { id: true },
    });
    if (!taken) return code;
  }
  throw new Error("Could not find a free booking code");
}

/** The price or cancellation policy differs from what the review page showed (hardening B2). */
function termsChanged(params: CreateBookingParams, quote: Quote, policy: LoadedListing["cancellationPolicy"]): boolean {
  if (params.expectedCurrency && params.expectedCurrency !== quote.currency) return true;
  if (params.expectedTotal != null && Math.abs(params.expectedTotal - quote.total) > 0.005) return true;
  return !!params.expectedPolicy && params.expectedPolicy !== policy;
}

function failQuote(result: Exclude<BookingQuoteResult, { ok: true }>): never {
  if (result.error === "not_found") throw new BookingError("not_bookable");
  const details: Record<string, number> = {};
  if (result.minNights) details.count = result.minNights;
  if (result.maxNights) details.count = result.maxNights;
  if (result.maxGuests) details.count = result.maxGuests;
  throw new BookingError(result.error, Object.keys(details).length ? details : undefined);
}

/**
 * Books a stay (instant booking). Throws BookingError (a code from BOOKING_ERROR_CODES),
 * RateLimitError or NotFoundError. Requires: listing LIVE with bookingMode INSTANT, a guest
 * account that is active and has a verified phone, accepted house rules, not the guest's own
 * listing, no block between guest and host, and free dates.
 */
export async function createBooking(params: CreateBookingParams): Promise<CreatedBooking> {
  const now = params.now ?? new Date();
  if (!params.rulesAccepted) throw new BookingError("rules_not_accepted");

  const guest = await db.user.findUnique({
    where: { id: params.guestUserId },
    select: {
      id: true,
      status: true,
      isDemo: true,
      phoneNumber: true,
      phoneNumberVerified: true,
      deletedAt: true,
    },
  });
  if (!guest || guest.deletedAt) throw new NotFoundError();
  // WARNED accounts book like active ones (the same rule as for hosts' listings); SUSPENDED stays
  // refused until staff lift it, even after suspendedUntil (hardening B5).
  if (!isAccountInGoodStanding(guest.status)) throw new BookingError("not_allowed");
  const verifiedPhone = verifiedPhoneOf(guest);
  if (!verifiedPhone || (params.guestPhone && params.guestPhone !== verifiedPhone)) throw new BookingError("phone_not_verified");

  const listing = await loadListing(params.listingId);
  if (!listing || listing.deletedAt) throw new BookingError("not_bookable");
  if (listing.ownerId === guest.id) throw new BookingError("own_listing");
  if (listing.isDemo && !params.allowDemoListing && !guest.isDemo) throw new BookingError("not_bookable");
  const block = await db.userBlock.findFirst({
    where: {
      OR: [
        { blockerId: guest.id, blockedId: listing.ownerId },
        { blockerId: listing.ownerId, blockedId: guest.id },
      ],
    },
    select: { blockerId: true },
  });
  if (block) {
    // Hosts may not choose their guests (the pledge): staff can see refusals caused by a block.
    await audit({
      actorId: guest.id,
      action: "booking.refused_blocked",
      targetType: "Listing",
      targetId: listing.id,
      details: { blockedByHost: block.blockerId === listing.ownerId },
    });
    throw new BookingError("not_allowed");
  }

  const rates = params.displayCurrency ? await getRates() : null;
  const first = quoteFor(listing, params, {
    displayCurrency: params.displayCurrency,
    rates,
    now,
  });
  if (!first.ok) failQuote(first);

  await assertRateLimit(`booking:create:${guest.id}`, CREATE_LIMIT);

  const checkInDay = params.checkIn;
  const remindNow = daysBetween(tbilisiToday(now), checkInDay) <= REMINDER_DAYS_BEFORE;

  const created = await retryOnCodeCollision(() =>
    db.$transaction(
      async (tx) => {
        // Serialises bookings of this listing: a concurrent booking waits here until we commit.
        await tx.$queryRaw`SELECT "id" FROM "Listing" WHERE "id" = ${listing.id} FOR UPDATE`;
        const locked = await loadListing(listing.id, tx);
        if (!locked) throw new BookingError("not_bookable");
        const priced = quoteFor(locked, params, {
          displayCurrency: params.displayCurrency,
          rates,
          now,
        });
        if (!priced.ok) failQuote(priced);
        const { quote, roomType } = priced;
        if (termsChanged(params, quote, locked.cancellationPolicy)) throw new BookingError("terms_changed");

        if (await findBlockingRange(locked.id, quote.checkIn, quote.checkOut, tx)) throw new BookingError("dates_unavailable");

        const booking = await tx.booking.create({
          data: {
            code: await freshCode(tx),
            listingId: locked.id,
            guestUserId: guest.id,
            hostUserId: locked.ownerId,
            roomTypeId: roomType?.id ?? null,
            roomTypeName: roomType ? (roomType.names as Prisma.InputJsonValue) : Prisma.DbNull,
            checkIn: dayToDate(quote.checkIn),
            checkOut: dayToDate(quote.checkOut),
            nights: quote.nights,
            adults: quote.adults,
            children: quote.children,
            infants: quote.infants,
            nightlyPrice: quote.nightlyPrice,
            weekendPrice: quote.weekendPrice,
            subtotal: quote.subtotal,
            cleaningFee: quote.cleaningFee,
            total: quote.total,
            currency: quote.currency,
            displayCurrency: quote.display?.currency ?? null,
            displayTotal: quote.display?.total ?? null,
            cancellationPolicy: locked.cancellationPolicy,
            paymentMethods: cleanPaymentMethods(locked.paymentMethodsAtCheckIn),
            status: "CONFIRMED",
            messageToHost: params.messageToHost?.trim() || null,
            guestName: params.guestName.trim(),
            guestPhone: verifiedPhone,
            locale: params.locale,
            rulesAcceptedAt: now,
            // Booked 3 days or less before arrival: the confirmation is the reminder.
            reminderSentAt: remindNow ? now : null,
          },
          select: { id: true, code: true },
        });
        await tx.availabilityBlock.create({
          data: {
            listingId: locked.id,
            startDate: dayToDate(quote.checkIn),
            endDate: dayToDate(quote.checkOut),
            source: "BOOKING",
            bookingId: booking.id,
            sourceRef: booking.id,
          },
        });
        return {
          id: booking.id,
          code: booking.code,
          listingId: locked.id,
          checkIn: quote.checkIn,
          checkOut: quote.checkOut,
          nights: quote.nights,
          total: quote.total,
          currency: quote.currency,
        };
      },
      { maxWait: 10_000, timeout: 15_000 },
    ),
  );

  if (params.notify !== false) await notifyBookingCreated(created.id, now);
  return created;
}

// ─── Cancel, no-show, complete ────────────────────────────────

const bookingStateSelect = {
  id: true,
  code: true,
  status: true,
  checkIn: true,
  checkOut: true,
  createdAt: true,
  guestUserId: true,
  hostUserId: true,
  listingId: true,
  cancellationPolicy: true,
  listing: { select: { checkInFrom: true } },
} satisfies Prisma.BookingSelect;

type BookingState = Prisma.BookingGetPayload<{
  select: typeof bookingStateSelect;
}>;

function stateOf(booking: BookingState) {
  return {
    status: booking.status,
    checkIn: dateToDay(booking.checkIn),
    checkOut: dateToDay(booking.checkOut),
  };
}

/** Sets the cancelled status (only if still CONFIRMED) and frees the nights, in one transaction. */
async function cancelInTransaction(bookingId: string, data: Prisma.BookingUncheckedUpdateManyInput): Promise<void> {
  await db.$transaction(async (tx) => {
    const updated = await tx.booking.updateMany({
      where: { id: bookingId, status: "CONFIRMED" },
      data,
    });
    if (updated.count !== 1) throw new BookingError("not_cancellable");
    await tx.availabilityBlock.deleteMany({ where: { bookingId } });
  });
}

export type CancelResult = { code: string; late: boolean; flagged: boolean };

/**
 * The guest cancels (any time until the check-in day; after the free period it is recorded as
 * late — nothing is charged). Frees the nights and tells the host.
 */
export async function guestCancel(params: {
  bookingId: string;
  guestUserId: string;
  reasonCode: GuestCancelReason;
  reasonText?: string | null;
  notify?: boolean;
  now?: Date;
}): Promise<CancelResult> {
  const now = params.now ?? new Date();
  const booking = await db.booking.findFirst({
    where: { id: params.bookingId, guestUserId: params.guestUserId },
    select: bookingStateSelect,
  });
  if (!booking) throw new NotFoundError();
  if (!canGuestCancel(stateOf(booking), now)) throw new BookingError("not_cancellable");

  const late = isLateCancellation(booking.cancellationPolicy, dateToDay(booking.checkIn), now, booking.listing.checkInFrom);
  const flagged = isGuestCancellationFlagged(params.reasonCode);
  await cancelInTransaction(booking.id, {
    status: "CANCELLED_BY_GUEST",
    cancelReasonCode: params.reasonCode,
    cancelReason: params.reasonText?.trim() || null,
    cancelledAt: now,
    cancelledById: params.guestUserId,
    ...(flagged ? { flaggedForReview: true } : {}),
  });
  await audit({
    actorId: params.guestUserId,
    action: "booking.cancel_by_guest",
    targetType: "Booking",
    targetId: booking.id,
    details: {
      code: booking.code,
      reasonCode: params.reasonCode,
      late,
      flagged,
    },
  });
  if (params.notify !== false) await notifyBookingCancelled(booking.id);
  return { code: booking.code, late, flagged };
}

/**
 * The host cancels, only with a reason (DOUBLE_BOOKING | PROPERTY_ISSUE | OTHER + text). Logged;
 * cancellations within 48 hours of the booking are flagged for review. Frees the nights and tells
 * the guest.
 */
export async function hostCancel(params: {
  bookingId: string;
  hostUserId: string;
  reasonCode: HostCancelReason;
  reasonText?: string | null;
  notify?: boolean;
  now?: Date;
}): Promise<CancelResult> {
  const now = params.now ?? new Date();
  const booking = await db.booking.findFirst({
    where: { id: params.bookingId, hostUserId: params.hostUserId },
    select: bookingStateSelect,
  });
  if (!booking) throw new NotFoundError();
  if (!canHostCancel(stateOf(booking), now)) throw new BookingError("not_cancellable");

  const flagged = isHostCancellationFlagged(booking.createdAt, now);
  const late = isLateCancellation(booking.cancellationPolicy, dateToDay(booking.checkIn), now, booking.listing.checkInFrom);
  await cancelInTransaction(booking.id, {
    status: "CANCELLED_BY_HOST",
    cancelReasonCode: params.reasonCode,
    cancelReason: params.reasonText?.trim() || null,
    cancelledAt: now,
    cancelledById: params.hostUserId,
    flaggedForReview: flagged,
  });
  await audit({
    actorId: params.hostUserId,
    action: "booking.cancel_by_host",
    targetType: "Booking",
    targetId: booking.id,
    details: {
      code: booking.code,
      reasonCode: params.reasonCode,
      reasonText: params.reasonText?.trim() || null,
      flagged,
      hoursSinceBooking: Math.round((now.getTime() - booking.createdAt.getTime()) / 3_600_000),
      daysBeforeCheckIn: daysBetween(tbilisiToday(now), dateToDay(booking.checkIn)),
    },
  });
  if (params.notify !== false) await notifyBookingCancelled(booking.id);
  return { code: booking.code, late, flagged };
}

/** "Didn't arrive" (host): from the day after check-in until a week after check-out. Logged; rules come later. */
export async function markNoShow(params: { bookingId: string; hostUserId: string; now?: Date }): Promise<{ code: string }> {
  const now = params.now ?? new Date();
  const booking = await db.booking.findFirst({
    where: { id: params.bookingId, hostUserId: params.hostUserId },
    select: bookingStateSelect,
  });
  if (!booking) throw new NotFoundError();
  if (!canReportNoShow(stateOf(booking), now)) throw new BookingError("no_show_not_allowed");
  const updated = await db.booking.updateMany({
    where: { id: booking.id, status: { in: ["CONFIRMED", "COMPLETED"] } },
    data: { status: "NO_SHOW", noShowReportedAt: now },
  });
  if (updated.count !== 1) throw new BookingError("no_show_not_allowed");
  console.info(`[booking] no-show reported for ${booking.code} by the host`);
  await audit({
    actorId: params.hostUserId,
    action: "booking.no_show",
    targetType: "Booking",
    targetId: booking.id,
    details: {
      code: booking.code,
      checkIn: dateToDay(booking.checkIn),
      previousStatus: booking.status,
    },
  });
  return { code: booking.code };
}

const JOB_BATCH = 500;

/** Cron: CONFIRMED bookings whose check-out day has passed become COMPLETED (and the guest gets a thank-you). */
export async function completeFinishedBookings(
  now: Date = new Date(),
  scope: { listingId?: string } = {},
): Promise<{ completed: number }> {
  const today = tbilisiToday(now);
  const due = await db.booking.findMany({
    where: { status: "CONFIRMED", checkOut: { lt: dayToDate(today) }, ...(scope.listingId ? { listingId: scope.listingId } : {}) },
    select: { id: true },
    orderBy: { checkOut: "asc" },
    take: JOB_BATCH,
  });
  let completed = 0;
  for (const { id } of due) {
    const updated = await db.booking.updateMany({
      where: { id, status: "CONFIRMED" },
      data: { status: "COMPLETED" },
    });
    if (updated.count !== 1) continue;
    completed++;
    await notifyBookingCompleted(id);
  }
  return { completed };
}

/**
 * Cron: the reminder 3 days before arrival (also catches up on days the job missed). Each booking
 * is claimed by setting reminderSentAt before sending, so a reminder goes out at most once.
 */
export async function sendBookingReminders(
  now: Date = new Date(),
  scope: { listingId?: string } = {},
): Promise<{ reminded: number }> {
  const today = tbilisiToday(now);
  const due = await db.booking.findMany({
    where: {
      ...(scope.listingId ? { listingId: scope.listingId } : {}),
      status: "CONFIRMED",
      reminderSentAt: null,
      checkIn: {
        gte: dayToDate(today),
        lte: dayToDate(addDays(today, REMINDER_DAYS_BEFORE)),
      },
    },
    select: { id: true },
    orderBy: { checkIn: "asc" },
    take: JOB_BATCH,
  });
  let reminded = 0;
  for (const { id } of due) {
    const claimed = await db.booking.updateMany({
      where: { id, reminderSentAt: null, status: "CONFIRMED" },
      data: { reminderSentAt: now },
    });
    if (claimed.count !== 1) continue;
    reminded++;
    await notifyBookingReminder(id, now);
  }
  return { reminded };
}

/**
 * For "Delete my account" (call it before the user row is anonymized): the account's upcoming
 * bookings are cancelled — as the guest's own cancellation, or as the host's for bookings of their
 * listings — and the other side is told; the guest's name, phone and message are then removed
 * from all of the account's bookings as a guest, with the reason text of the guest's own
 * cancellations. The account's listings stop taking instant bookings first.
 */
export async function releaseBookingsOfDeletedAccount(userId: string, now: Date = new Date()): Promise<{ cancelled: number }> {
  // First, no new bookings of the account's listings: one made while the others are being cancelled
  // (each cancellation sends an email and a text) would never be cancelled (hardening B4). The
  // UPDATE waits for a booking that holds a listing's lock, so that booking is in the list below;
  // a later one sees "CONTACT" in its locked re-read and is refused.
  await db.listing.updateMany({ where: { ownerId: userId, bookingMode: "INSTANT" }, data: { bookingMode: "CONTACT" } });
  const upcoming = await db.booking.findMany({
    where: { status: "CONFIRMED", checkOut: { gt: dayToDate(tbilisiToday(now)) }, OR: [{ guestUserId: userId }, { hostUserId: userId }] },
    select: { id: true, code: true, guestUserId: true },
    take: JOB_BATCH,
  });
  let cancelled = 0;
  for (const booking of upcoming) {
    const asGuest = booking.guestUserId === userId;
    try {
      await cancelInTransaction(booking.id, {
        status: asGuest ? "CANCELLED_BY_GUEST" : "CANCELLED_BY_HOST",
        cancelReasonCode: "OTHER",
        cancelledAt: now,
        cancelledById: userId,
      });
    } catch (error) {
      if (error instanceof BookingError) continue;
      throw error;
    }
    cancelled++;
    await audit({
      actorId: userId,
      action: "booking.cancel_account_deleted",
      targetType: "Booking",
      targetId: booking.id,
      details: { code: booking.code, side: asGuest ? "guest" : "host" },
    });
    await notifyBookingCancelled(booking.id);
  }
  await db.booking.updateMany({ where: { guestUserId: userId }, data: { guestName: "—", guestPhone: "", messageToHost: null } });
  // The guest's own words when they cancelled (hosts' reasons stay for staff review; the reason
  // code stays too).
  await db.booking.updateMany({
    where: { guestUserId: userId, cancelledById: userId, status: "CANCELLED_BY_GUEST" },
    data: { cancelReason: null },
  });
  return { cancelled };
}
