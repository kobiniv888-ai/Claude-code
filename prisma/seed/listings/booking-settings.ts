/**
 * Booking settings of the demo listings (round 2): every demo short stay takes instant bookings,
 * and so do the demo hotels since round 3, phase 4 (booked by room type: each demo hotel has 2–3
 * room types with a number of rooms, src/lib/booking/room-availability.ts), with a mix of
 * cancellation policies, payment methods at check-in and a few weekend prices. Monthly rentals and
 * sales stay CONTACT.
 *
 * Round 3 (brief 6.3): one demo short stay (n 1) has long-stay discounts and a demo holiday price
 * for the next Chanukah (Israel schedule) that starts at least 2 days after the seed day, so the dates sheet,
 * the review page and the host calendar show them. Demo data only (isDemo listings), made-up prices.
 */
import type { BookingMode, CancellationPolicy } from "@/generated/prisma/enums";
import { isBookableDealType, isInstantDealType, type PaymentMethod } from "@/lib/booking/constants";
import { holidaysBetween } from "@/lib/hebcal/core";
import heHebcal from "../../../messages/he/hebcal.json";
import enHebcal from "../../../messages/en/hebcal.json";
import ruHebcal from "../../../messages/ru/hebcal.json";
import arHebcal from "../../../messages/ar/hebcal.json";
import kaHebcal from "../../../messages/ka/hebcal.json";
import { georgiaDay } from "../lib";
import type { ListingSeed } from "./types";

type Settings = { policy: CancellationPolicy; pay: PaymentMethod[]; weekendPrice?: number };

export type DemoBookingSettings = {
  bookingMode: BookingMode;
  cancellationPolicy: CancellationPolicy;
  paymentMethodsAtCheckIn: PaymentMethod[];
  weekendPrice: number | null;
  weeklyDiscountPct?: number | null;
  monthlyDiscountPct?: number | null;
};

/** Long-stay discounts of the demo short stays that have them (whole percents). */
const DISCOUNTS: Record<number, { weekly: number; monthly: number }> = { 1: { weekly: 10, monthly: 20 } };

const SETTINGS: Record<number, Settings> = {
  1: { policy: "MODERATE", pay: ["cash", "card"], weekendPrice: 95 },
  3: { policy: "FLEXIBLE", pay: ["cash"] },
  4: { policy: "STRICT", pay: ["cash"] },
  6: { policy: "MODERATE", pay: ["cash", "bank_transfer"] },
  11: { policy: "STRICT", pay: ["cash", "card"], weekendPrice: 250 },
  16: { policy: "FLEXIBLE", pay: ["cash", "card", "bank_transfer"] },
  19: { policy: "STRICT", pay: ["card", "bank_transfer"] },
  20: { policy: "MODERATE", pay: ["cash", "card"] },
  21: { policy: "FLEXIBLE", pay: ["cash"], weekendPrice: 480 },
  23: { policy: "MODERATE", pay: ["cash", "card"] },
  24: { policy: "FLEXIBLE", pay: ["cash"] },
  25: { policy: "MODERATE", pay: ["cash", "card"] },
};

export function bookingSettingsFor(seed: ListingSeed): DemoBookingSettings {
  if (!isBookableDealType(seed.fields.dealType)) {
    return { bookingMode: "CONTACT", cancellationPolicy: "MODERATE", paymentMethodsAtCheckIn: [], weekendPrice: null };
  }
  const settings = SETTINGS[seed.n] ?? { policy: "MODERATE", pay: ["cash"] };
  return {
    bookingMode: isInstantDealType(seed.fields.dealType) ? "INSTANT" : "CONTACT",
    cancellationPolicy: settings.policy,
    paymentMethodsAtCheckIn: settings.pay,
    weekendPrice: settings.weekendPrice ?? null,
    weeklyDiscountPct: DISCOUNTS[seed.n]?.weekly ?? null,
    monthlyDiscountPct: DISCOUNTS[seed.n]?.monthly ?? null,
  };
}

/** Demo holiday prices: listing → { price per night, minimum nights } for its next Chanukah. */
const HOLIDAY_PRICES: Record<number, { price: number; minNights: number }> = { 1: { price: 110, minNights: 3 } };

export type DemoDatePrice = { startDate: Date; endDate: Date; price: number; minNights: number; label: Record<string, string> };

/**
 * The demo holiday price of a listing: the nights of the next Chanukah (its eve to its last day,
 * Israel schedule) that starts 2 days or more after the seed day, so a codespace seeded in November still
 * shows this year's Chanukah (the listing calendar shows this month and the next). The demo owner
 * blocks skip these nights (blocksOutsideDatePrices); a demo booking may share some of them.
 */
export function demoDatePricesFor(seed: ListingSeed, now: Date): DemoDatePrice[] {
  const demo = HOLIDAY_PRICES[seed.n];
  if (!demo || !isBookableDealType(seed.fields.dealType)) return [];
  const from = georgiaDay(new Date(now.getTime() + 2 * 86_400_000));
  const to = georgiaDay(new Date(now.getTime() + 430 * 86_400_000));
  const ymd = (day: string) => {
    const [y, m, d] = day.split("-").map(Number);
    return { y, m, d };
  };
  const days = holidaysBetween(ymd(from), ymd(to), true)
    .filter((h) => h.key === "chanukah")
    .map((h) => h.date)
    .sort();
  if (days.length === 0) return [];
  // The first run of days in a row (one Chanukah).
  let last = days[0];
  for (const day of days.slice(1)) {
    if (Date.parse(day) - Date.parse(last) > 86_400_000) break;
    last = day;
  }
  const date = (day: string) => new Date(`${day}T00:00:00.000Z`);
  return [
    {
      startDate: date(days[0]),
      endDate: new Date(date(last).getTime() + 86_400_000),
      price: demo.price,
      minNights: demo.minNights,
      label: {
        he: heHebcal.holidays.chanukah,
        en: enHebcal.holidays.chanukah,
        ru: ruHebcal.holidays.chanukah,
        ar: arHebcal.holidays.chanukah,
        ka: kaHebcal.holidays.chanukah,
      },
    },
  ];
}

/**
 * The demo owner blocks that leave the demo holiday prices free: a block that shares a night with
 * one is dropped, so the holiday nights stay bookable in the dates sheet and on the review page.
 */
export function blocksOutsideDatePrices<T extends { startDate: Date; endDate: Date }>(blocks: readonly T[], datePrices: readonly { startDate: Date; endDate: Date }[]): T[] {
  return blocks.filter((block) => datePrices.every((price) => block.endDate <= price.startDate || block.startDate >= price.endDate));
}
