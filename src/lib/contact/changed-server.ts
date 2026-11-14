import "server-only";
import { isAppLocale } from "@/i18n/locale";
import { siteConfig } from "@/config/site";
import { tripPath } from "@/lib/booking/constants";
import { dateToDay, tbilisiToday } from "@/lib/booking/dates";
import { db } from "@/lib/db";
import { notificationEmailFor, sendEmail } from "@/lib/email";
import { scamReportHref } from "@/lib/reports/scam";
import { isUpcomingForNotice, showContactChangedNotice } from "./changed";

/**
 * SECURITY_REPORT 14.3.c, the data side (the rules are in ./changed.ts).
 *
 * - contactChangedNoticeFor: the trip page asks whether its guest sees "פרטי הקשר של המארח שונו
 *   לאחרונה". Only the booking's own guest, checked on the row.
 * - notifyGuestsOfContactChange: after a host changed a live listing's contact details (with a
 *   fresh code), each guest with an upcoming booking gets one email. Never throws (logged).
 */

/** At most this many guests are emailed per change (a hotel's upcoming bookings fit easily). */
export const CONTACT_CHANGE_EMAIL_MAX = 200;

export async function contactChangedNoticeFor(guestUserId: string, bookingId: string, now: Date = new Date()): Promise<boolean> {
  const row = await db.booking.findFirst({
    where: { id: bookingId, guestUserId },
    select: { status: true, checkOut: true, listing: { select: { contactChangedAt: true } } },
  });
  if (!row) return false;
  return showContactChangedNotice({
    contactChangedAt: row.listing.contactChangedAt,
    status: row.status,
    checkOut: dateToDay(row.checkOut),
    today: tbilisiToday(now),
    now,
  });
}

export async function notifyGuestsOfContactChange(listingId: string, now: Date = new Date()): Promise<number> {
  try {
    const today = tbilisiToday(now);
    const bookings = await db.booking.findMany({
      where: { listingId, status: "CONFIRMED", checkOut: { gte: new Date(`${today}T00:00:00.000Z`) } },
      select: {
        code: true,
        status: true,
        checkOut: true,
        locale: true,
        listing: { select: { title: true, publicId: true } },
        guest: { select: { email: true, contactEmail: true, firstName: true, name: true, locale: true } },
      },
      take: CONTACT_CHANGE_EMAIL_MAX,
    });
    let sent = 0;
    for (const booking of bookings) {
      if (!isUpcomingForNotice({ status: booking.status, checkOut: dateToDay(booking.checkOut) }, today)) continue;
      const to = notificationEmailFor(booking.guest);
      if (!to) continue;
      const locale = [booking.locale, booking.guest.locale].find((l) => !!l && isAppLocale(l)) ?? siteConfig.i18n.primaryLocale;
      await sendEmail({
        to,
        locale,
        template: "host_contact_changed_guest",
        data: {
          name: booking.guest.firstName || booking.guest.name,
          listingTitle: booking.listing.title,
          code: booking.code,
          tripUrl: tripPath(booking.code),
          reportUrl: scamReportHref({ listing: booking.listing.publicId, booking: booking.code }),
        },
      }).then(
        () => sent++,
        (error) => console.error("[contact] contact-change notice not sent:", (error as Error)?.name ?? "error"),
      );
    }
    return sent;
  } catch (error) {
    console.error("[contact] contact-change notices failed:", (error as Error)?.name ?? "error");
    return 0;
  }
}
