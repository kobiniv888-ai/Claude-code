/**
 * Demo bookings (round 2): the demo guest (Noa, +995555000021) at the demo owner Yossi's short
 * stays — one upcoming, one completed, one cancelled by the guest — so "הנסיעות שלי" and the host's
 * bookings list show data. Fixed ids and codes; dates are relative to the seed day, so each run
 * moves them and rewrites their booked nights (AvailabilityBlock source BOOKING). Idempotent.
 * Prices are computed with the site's own quote (src/lib/booking/pricing.ts).
 */
import type { Prisma, PrismaClient } from "@/generated/prisma/client";
import type { BookingStatus } from "@/generated/prisma/enums";
import { quoteStay } from "@/lib/booking/pricing";
import { sealGuestPhone } from "@/lib/field-crypto";
import { DAY_MS, georgiaDay } from "./lib";
import { ALL_LISTINGS, demoListingId } from "./listings";
import { bookingSettingsFor } from "./listings/booking-settings";
import { demoUser, demoUserId } from "./users";

type DemoBooking = {
  id: string;
  code: string;
  listing: number;
  /** Days from the seed day. */
  checkIn: number;
  nights: number;
  adults: number;
  children: number;
  infants: number;
  status: BookingStatus;
  createdDaysAgo: number;
  messageToHost?: string;
  cancel?: { reasonCode: string; daysAgo: number };
};

const DEMO_BOOKINGS: DemoBooking[] = [
  {
    id: "demo-booking-1",
    code: "BT-DEM2A",
    listing: 1,
    checkIn: 9,
    nights: 3,
    adults: 2,
    children: 1,
    infants: 0,
    status: "CONFIRMED",
    createdDaysAgo: 6,
    messageToHost: "שלום יוסי, אנחנו נוחתים בערב ומגיעים בערך ב-20:00. תודה!",
  },
  { id: "demo-booking-2", code: "BT-DEM3B", listing: 3, checkIn: -20, nights: 3, adults: 2, children: 0, infants: 0, status: "COMPLETED", createdDaysAgo: 41 },
  {
    id: "demo-booking-3",
    code: "BT-DEM4C",
    listing: 1,
    checkIn: 24,
    nights: 2,
    adults: 2,
    children: 0,
    infants: 1,
    status: "CANCELLED_BY_GUEST",
    createdDaysAgo: 12,
    cancel: { reasonCode: "CHANGE_OF_PLANS", daysAgo: 2 },
  },
];

const day = (days: number, now: Date) => georgiaDay(new Date(now.getTime() + days * DAY_MS));
const date = (dayString: string) => new Date(`${dayString}T00:00:00.000Z`);

export async function seedBookings(db: PrismaClient, now: Date): Promise<number> {
  const guestId = demoUserId("guest");
  const guest = demoUser("guest");
  for (const demo of DEMO_BOOKINGS) {
    const seed = ALL_LISTINGS.find((l) => l.n === demo.listing);
    if (!seed) throw new Error(`demo booking ${demo.id}: no demo listing ${demo.listing}`);
    const settings = bookingSettingsFor(seed);
    const checkIn = day(demo.checkIn, now);
    const checkOut = day(demo.checkIn + demo.nights, now);
    const priced = quoteStay(
      {
        currency: seed.fields.currency,
        nightlyPrice: Number(seed.fields.price ?? 0),
        weekendPrice: settings.weekendPrice,
        cleaningFee: seed.fields.cleaningFee === undefined ? null : Number(seed.fields.cleaningFee),
        minStayNights: seed.fields.minStayNights ?? null,
        maxGuests: seed.fields.maxGuests ?? null,
        weeklyDiscountPct: settings.weeklyDiscountPct ?? null,
        monthlyDiscountPct: settings.monthlyDiscountPct ?? null,
      },
      { checkIn, checkOut, adults: demo.adults, children: demo.children, infants: demo.infants },
      // Past stays are priced as on the day they were booked.
      { today: checkIn < day(0, now) ? checkIn : day(0, now), displayCurrency: "ILS", rates: null },
    );
    if (!priced.ok) throw new Error(`demo booking ${demo.id}: ${priced.error}`);
    const { quote } = priced;
    const createdAt = new Date(now.getTime() - demo.createdDaysAgo * DAY_MS);
    const cancelledAt = demo.cancel ? new Date(now.getTime() - demo.cancel.daysAgo * DAY_MS) : null;

    const data = {
      code: demo.code,
      listingId: demoListingId(demo.listing),
      guestUserId: guestId,
      hostUserId: demoUserId(seed.owner),
      roomTypeId: null,
      roomTypeName: undefined,
      checkIn: date(checkIn),
      checkOut: date(checkOut),
      nights: quote.nights,
      adults: quote.adults,
      children: quote.children,
      infants: quote.infants,
      nightlyPrice: quote.nightlyPrice,
      weekendPrice: quote.weekendPrice,
      subtotal: quote.subtotal,
      cleaningFee: quote.cleaningFee,
      discount: quote.discount?.amount ?? null,
      total: quote.total,
      currency: quote.currency,
      // The itemized lines, as a real booking stores them (round 3, brief 6.3).
      priceLines: quote.lines as unknown as Prisma.InputJsonValue,
      displayCurrency: quote.display?.currency ?? null,
      displayTotal: quote.display?.total ?? null,
      cancellationPolicy: settings.cancellationPolicy,
      paymentMethods: settings.paymentMethodsAtCheckIn,
      status: demo.status,
      cancelReasonCode: demo.cancel?.reasonCode ?? null,
      cancelReason: null,
      cancelledAt,
      cancelledById: demo.cancel ? guestId : null,
      flaggedForReview: false,
      noShowReportedAt: null,
      messageToHost: demo.messageToHost ?? null,
      guestName: "Noa",
      // Encrypted, with its lookup value, like every booking's (12.3.c).
      ...sealGuestPhone(guest.phone),
      locale: guest.locale,
      rulesAcceptedAt: createdAt,
      // The reminder job may pick up the upcoming one; demo accounts only get logged texts and outbox emails.
      reminderSentAt: null,
      // The host's alert went to the dev outbox when it was "booked" (round 3: a booking stands
      // only once the host was told, src/lib/booking/alerts.ts).
      hostNotifiedAt: createdAt,
      createdAt,
    } satisfies Prisma.BookingUncheckedCreateInput;

    await db.booking.upsert({ where: { id: demo.id }, create: { id: demo.id, ...data }, update: data });
    await db.availabilityBlock.deleteMany({ where: { bookingId: demo.id } });
    if (demo.status === "CONFIRMED" || demo.status === "COMPLETED") {
      await db.availabilityBlock.create({
        data: {
          listingId: data.listingId,
          startDate: data.checkIn,
          endDate: data.checkOut,
          source: "BOOKING",
          bookingId: demo.id,
          sourceRef: demo.id,
        },
      });
    }
  }
  return DEMO_BOOKINGS.length;
}
