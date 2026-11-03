/**
 * Booking settings of the demo listings (round 2): every demo short stay takes instant bookings
 * (hotels keep their booking terms but are contact-only until booking by room type, round 3:
 * INSTANT_DEAL_TYPES), with a mix of cancellation policies, payment methods at check-in and a few weekend
 * prices. Monthly rentals and sales stay CONTACT. Booked stays get no weekly/monthly discount (the
 * booking total doesn't apply one, and the host's "הזמנות ומחיר" step clears them), so the seed
 * clears the discounts of bookable listings too: their pages must not promise one.
 */
import type { BookingMode, CancellationPolicy } from "@/generated/prisma/enums";
import { isBookableDealType, isInstantDealType, type PaymentMethod } from "@/lib/booking/constants";
import type { ListingSeed } from "./types";

type Settings = { policy: CancellationPolicy; pay: PaymentMethod[]; weekendPrice?: number };

export type DemoBookingSettings = {
  bookingMode: BookingMode;
  cancellationPolicy: CancellationPolicy;
  paymentMethodsAtCheckIn: PaymentMethod[];
  weekendPrice: number | null;
  weeklyDiscountPct?: null;
  monthlyDiscountPct?: null;
};

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
    weeklyDiscountPct: null,
    monthlyDiscountPct: null,
  };
}
