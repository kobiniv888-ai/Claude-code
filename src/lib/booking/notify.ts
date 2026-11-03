import "server-only";
import { getTranslations } from "next-intl/server";
import { siteConfig, type AppLocale } from "@/config/site";
import { isAppLocale, pickLocalized } from "@/i18n/locale";
import { personName } from "@/lib/auth/first-name";
import { db } from "@/lib/db";
import { isEmailDeliveryConfigured, notificationEmailFor, sendEmail, type SendEmailResult } from "@/lib/email";
import type { BookingEmailArrival, BookingEmailStay } from "@/lib/email/templates";
import { formatDateRange } from "@/lib/format";
import { searchPath } from "@/lib/listing/urls";
import { verifiedPhoneOf } from "@/lib/auth/phone-once";
import { sendSms } from "@/lib/sms";
import { absoluteUrl as siteAbsoluteUrl } from "@/lib/site-url";
import { hostBookingPath, tripPath } from "./constants";
import { dateToDay, daysBetween, tbilisiToday } from "./dates";
import { freeCancellationDeadline, isLateCancellation } from "./policy";
import { hostContactFor } from "./reveal";
import { toNumber } from "./terms";

/**
 * Booking notifications: an email (sendEmail: Resend, else the dev outbox) and a text message
 * (sendSms: Twilio Messaging, else the server log) to each side, in that person's own language —
 * the guest in Booking.locale, the host in their account language. Demo accounts never get a real
 * text (their numbers are made up). Never throws.
 *
 * A new booking (round 3): first the host's alert (emailHostNewBooking, through
 * src/lib/booking/alerts.ts — the booking is undone when no channel accepted it), and only then
 * the guest's confirmation (notifyBookingConfirmed).
 *
 * Texts: messages/<locale>/emails.json (templates.booking_*, sms.booking_*).
 */

const userSelect = {
  id: true,
  email: true,
  contactEmail: true,
  name: true,
  firstName: true,
  locale: true,
  phoneNumber: true,
  phoneNumberVerified: true,
  isDemo: true,
} as const;

async function loadBooking(bookingId: string) {
  return db.booking.findUnique({
    where: { id: bookingId },
    include: {
      guest: { select: userSelect },
      host: { select: userSelect },
      listing: {
        select: {
          title: true,
          dealType: true,
          address: true,
          checkInFrom: true,
          checkOutUntil: true,
          contactMethods: true,
          translations: { select: { locale: true, title: true } },
        },
      },
    },
  });
}

type LoadedBooking = NonNullable<Awaited<ReturnType<typeof loadBooking>>>;

function localeOf(value: string | null | undefined): AppLocale {
  return isAppLocale(value) ? value : siteConfig.i18n.fallbackLocale;
}

function absoluteUrl(locale: AppLocale, path: string): string {
  return siteAbsoluteUrl(`/${locale}${path}`);
}

/** The listing title in the recipient's language (the owner's original when there is none). */
function titleIn(booking: LoadedBooking, locale: AppLocale): string {
  const translated = booking.listing.translations.find((t) => t.locale === locale)?.title?.trim();
  return translated || booking.listing.title;
}

function stayFor(booking: LoadedBooking, locale: AppLocale, bookingUrl: string): BookingEmailStay {
  return {
    code: booking.code,
    listingTitle: titleIn(booking, locale),
    roomTypeName: booking.roomTypeName ? pickLocalized(booking.roomTypeName, locale) || null : null,
    checkIn: dateToDay(booking.checkIn),
    checkOut: dateToDay(booking.checkOut),
    nights: booking.nights,
    adults: booking.adults,
    children: booking.children,
    infants: booking.infants,
    total: toNumber(booking.total) ?? 0,
    currency: booking.currency,
    bookingUrl,
  };
}

function arrivalFor(booking: LoadedBooking): BookingEmailArrival {
  const contact = hostContactFor(booking.listing.contactMethods, verifiedPhoneOf(booking.host));
  return {
    checkInFrom: booking.listing.checkInFrom,
    checkOutUntil: booking.listing.checkOutUntil,
    address: booking.listing.address,
    hostName: personName(booking.host),
    hostPhone: contact.phone,
    hostWhatsapp: contact.whatsapp,
    paymentMethods: booking.paymentMethods,
  };
}

type Side = "guest" | "host";

function recipient(booking: LoadedBooking, side: Side) {
  const user = side === "guest" ? booking.guest : booking.host;
  const locale = localeOf(side === "guest" ? booking.locale : user.locale);
  const path = side === "guest" ? tripPath(booking.code) : hostBookingPath(booking.code);
  const phone = side === "guest" ? booking.guestPhone : verifiedPhoneOf(user);
  // Demo accounts have made-up addresses: their emails stay in the dev outbox only.
  const email = user.isDemo && isEmailDeliveryConfigured() ? null : notificationEmailFor(user);
  return { user, locale, path, phone, email };
}

type SmsKey =
  | "booking_host_unreached_guest"
  | "booking_confirmed_guest"
  | "booking_new_host"
  | "booking_reminder_guest"
  | "booking_reminder_host"
  | "booking_cancelled_by_guest"
  | "booking_cancelled_by_host";

async function text(booking: LoadedBooking, side: Side, key: SmsKey, extra: Record<string, string | number> = {}) {
  const r = recipient(booking, side);
  if (!r.phone) return;
  const [t, tb] = await Promise.all([
    getTranslations({ locale: r.locale, namespace: "emails" }),
    getTranslations({ locale: r.locale, namespace: "booking" }),
  ]);
  const title = titleIn(booking, r.locale);
  const body = t(`sms.${key}`, {
    brand: siteConfig.localizedName[r.locale] ?? siteConfig.name,
    code: booking.code,
    title: title.length > 40 ? `${title.slice(0, 39)}…` : title,
    dates: formatDateRange(dateToDay(booking.checkIn), dateToDay(booking.checkOut), r.locale, { day: "numeric", month: "short" }),
    guest: booking.guestName,
    guests: tb("guests.total", { count: booking.adults + booking.children }),
    url: absoluteUrl(r.locale, r.path),
    ...extra,
  });
  // Production logs keep no names, places or numbers.
  await sendSms({ to: r.phone, body, logAs: `${key} ${booking.code}`, logOnly: r.user.isDemo });
}

async function safely(label: string, bookingId: string, task: () => Promise<unknown>): Promise<void> {
  try {
    await task();
  } catch (error) {
    console.error(`[booking] ${label} notification for ${bookingId} failed:`, error);
  }
}

/**
 * The "new booking" alert to the host by EMAIL: one channel of src/lib/booking/alerts.ts, which
 * decides whether the booking stands. Returns what happened (never throws). `outboxOnly`: keep it
 * in the dev outbox (demo hosts). Tagged with the booking code, so a later bounce finds the booking.
 */
export async function emailHostNewBooking(bookingId: string, opts: { outboxOnly?: boolean } = {}): Promise<SendEmailResult> {
  try {
    const booking = await loadBooking(bookingId);
    if (!booking) return { ok: false, delivery: "failed" };
    const host = recipient(booking, "host");
    const to = notificationEmailFor(booking.host);
    if (!to) return { ok: false, delivery: "failed" };
    return await sendEmail({
      to,
      locale: host.locale,
      template: "booking_new_host",
      outboxOnly: opts.outboxOnly || booking.host.isDemo,
      tags: { booking: booking.code },
      data: {
        ...stayFor(booking, host.locale, host.path),
        hostName: personName(booking.host),
        guestName: booking.guestName,
        guestPhone: booking.guestPhone,
        messageToHost: booking.messageToHost,
      },
    });
  } catch (error) {
    console.error(`[booking] host alert email for ${bookingId} failed:`, error);
    return { ok: false, delivery: "failed" };
  }
}

/**
 * Once the host was told (Booking.hostNotifiedAt): the confirmation to the guest (email + text),
 * and a text to the host as an extra (it does not count as an alert channel).
 */
export async function notifyBookingConfirmed(bookingId: string, now: Date = new Date()): Promise<void> {
  await safely("confirmed", bookingId, async () => {
    const booking = await loadBooking(bookingId);
    if (!booking || booking.status !== "CONFIRMED" || !booking.hostNotifiedAt) return;
    const guest = recipient(booking, "guest");
    const checkIn = dateToDay(booking.checkIn);
    const deadline = freeCancellationDeadline(booking.cancellationPolicy, checkIn, booking.listing.checkInFrom);
    const displayTotal = toNumber(booking.displayTotal);
    await Promise.all([
      guest.email &&
        sendEmail({
          to: guest.email,
          locale: guest.locale,
          template: "booking_confirmed_guest",
          tags: { booking: booking.code },
          data: {
            ...stayFor(booking, guest.locale, guest.path),
            ...arrivalFor(booking),
            guestName: booking.guestName,
            cancellationPolicy: booking.cancellationPolicy,
            freeCancellationUntil: deadline.getTime() > now.getTime() ? deadline : null,
            displayTotal:
              booking.displayCurrency && displayTotal !== null ? { amount: displayTotal, currency: booking.displayCurrency } : null,
          },
        }),
      text(booking, "guest", "booking_confirmed_guest"),
      text(booking, "host", "booking_new_host"),
    ]);
  });
}

/**
 * The "new booking" alert to the host bounced (Resend webhook): the guest should make sure the
 * host expects them (email, and a text when Twilio is set up). The booking stands.
 */
export async function notifyGuestHostUnreached(bookingId: string): Promise<void> {
  await safely("host unreached", bookingId, async () => {
    const booking = await loadBooking(bookingId);
    if (!booking || booking.status !== "CONFIRMED") return;
    const guest = recipient(booking, "guest");
    const contact = arrivalFor(booking);
    await Promise.all([
      guest.email &&
        sendEmail({
          to: guest.email,
          locale: guest.locale,
          template: "booking_host_unreached_guest",
          tags: { booking: booking.code },
          data: {
            ...stayFor(booking, guest.locale, guest.path),
            guestName: booking.guestName,
            hostName: contact.hostName,
            hostPhone: contact.hostPhone,
            hostWhatsapp: contact.hostWhatsapp,
          },
        }),
      text(booking, "guest", "booking_host_unreached_guest"),
    ]);
  });
}

/** A cancelled booking: the other side hears about it. */
export async function notifyBookingCancelled(bookingId: string): Promise<void> {
  await safely("cancelled", bookingId, async () => {
    const booking = await loadBooking(bookingId);
    if (!booking) return;
    const checkIn = dateToDay(booking.checkIn);
    if (booking.status === "CANCELLED_BY_GUEST") {
      const host = recipient(booking, "host");
      await Promise.all([
        host.email &&
          sendEmail({
            to: host.email,
            locale: host.locale,
            template: "booking_cancelled_by_guest",
            data: {
              ...stayFor(booking, host.locale, host.path),
              hostName: personName(booking.host),
              guestName: booking.guestName,
              reasonCode: booking.cancelReasonCode ?? "OTHER",
              reasonText: booking.cancelReason,
              late: isLateCancellation(booking.cancellationPolicy, checkIn, booking.cancelledAt ?? new Date(), booking.listing.checkInFrom),
            },
          }),
        text(booking, "host", "booking_cancelled_by_guest"),
      ]);
    } else if (booking.status === "CANCELLED_BY_HOST") {
      const guest = recipient(booking, "guest");
      const checkOut = dateToDay(booking.checkOut);
      const deal = booking.listing.dealType === "HOTEL_ROOM" ? "hotels" : "short-stay";
      await Promise.all([
        guest.email &&
          sendEmail({
            to: guest.email,
            locale: guest.locale,
            template: "booking_cancelled_by_host",
            data: {
              ...stayFor(booking, guest.locale, guest.path),
              guestName: booking.guestName,
              reasonCode: booking.cancelReasonCode ?? "OTHER",
              reasonText: booking.cancelReason,
              searchUrl: searchPath({ deal, checkIn, checkOut, guests: booking.adults + booking.children }),
            },
          }),
        text(booking, "guest", "booking_cancelled_by_host"),
      ]);
    }
  });
}

/** The reminder before arrival, to both sides. */
export async function notifyBookingReminder(bookingId: string, now: Date = new Date()): Promise<void> {
  await safely("reminder", bookingId, async () => {
    const booking = await loadBooking(bookingId);
    if (!booking || booking.status !== "CONFIRMED") return;
    const daysLeft = Math.max(0, daysBetween(tbilisiToday(now), dateToDay(booking.checkIn)));
    const guest = recipient(booking, "guest");
    const host = recipient(booking, "host");
    await Promise.all([
      guest.email &&
        sendEmail({
          to: guest.email,
          locale: guest.locale,
          template: "booking_reminder_guest",
          data: { ...stayFor(booking, guest.locale, guest.path), ...arrivalFor(booking), guestName: booking.guestName, daysLeft },
        }),
      host.email &&
        sendEmail({
          to: host.email,
          locale: host.locale,
          template: "booking_reminder_host",
          data: {
            ...stayFor(booking, host.locale, host.path),
            hostName: personName(booking.host),
            guestName: booking.guestName,
            guestPhone: booking.guestPhone,
            daysLeft,
          },
        }),
      text(booking, "guest", "booking_reminder_guest", { count: daysLeft }),
      text(booking, "host", "booking_reminder_host", { count: daysLeft }),
    ]);
  });
}

/** "Thank you for staying" to the guest, the day after check-out (email only). */
export async function notifyBookingCompleted(bookingId: string): Promise<void> {
  await safely("completed", bookingId, async () => {
    const booking = await loadBooking(bookingId);
    if (!booking || booking.status !== "COMPLETED") return;
    const guest = recipient(booking, "guest");
    if (!guest.email) return;
    const stay = stayFor(booking, guest.locale, guest.path);
    await sendEmail({
      to: guest.email,
      locale: guest.locale,
      template: "booking_completed",
      data: {
        code: stay.code,
        listingTitle: stay.listingTitle,
        checkIn: stay.checkIn,
        checkOut: stay.checkOut,
        bookingUrl: stay.bookingUrl,
        guestName: booking.guestName,
      },
    });
  });
}
