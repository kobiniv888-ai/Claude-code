/**
 * Price quote for a stay (client-safe, pure): nightly breakdown (weekday / weekend nights),
 * subtotal, cleaning fee and total in the HOST's currency, plus an estimate in the guest's
 * display currency. The same function checks the stay against the host's rules, so the review
 * page, the server action and the transaction all agree.
 *
 * Guests: adults + children count toward the listing's maximum; infants (under 2) do not
 * (at most MAX_INFANTS). At least one adult.
 */
import type { CurrencyCode } from "@/config/site";
import { convert, type Rates } from "@/lib/currency/convert";
import { MAX_DAYS_AHEAD, MAX_GUESTS_PER_BOOKING, MAX_INFANTS, MAX_STAY_NIGHTS } from "./constants";
import { daysBetween, eachNight, isDay, isWeekendNight, nightsBetween } from "./dates";

export type PricingTerms = {
  currency: CurrencyCode;
  /** Price per night (Listing.price with pricePeriod NIGHT, or the chosen room type's price). */
  nightlyPrice: number | null;
  /** Friday and Saturday nights; null or 0 = the nightly price. */
  weekendPrice?: number | null;
  cleaningFee?: number | null;
  minStayNights?: number | null;
  /** Adults + children; null = no limit beyond MAX_GUESTS_PER_BOOKING. */
  maxGuests?: number | null;
};

export type StayRequest = {
  checkIn: string;
  checkOut: string;
  adults: number;
  children?: number;
  infants?: number;
};

export const QUOTE_ERRORS = [
  "dates_invalid",
  "dates_past",
  "too_far_ahead",
  "max_stay",
  "min_stay",
  "no_adults",
  "too_many_guests",
  "too_many_infants",
  "no_price",
] as const;
export type QuoteError = (typeof QUOTE_ERRORS)[number];

export type NightPrice = { date: string; weekend: boolean; price: number };

/** "₪420 × 3 nights" lines: weekday nights first, then weekend nights (only lines with nights). */
export type PriceLine = { kind: "weekday" | "weekend"; nights: number; price: number; amount: number };

export type Quote = {
  checkIn: string;
  checkOut: string;
  nights: number;
  adults: number;
  children: number;
  infants: number;
  /** Adults + children (what the maximum counts). */
  guests: number;
  currency: CurrencyCode;
  nightlyPrice: number;
  /** The weekend price when the host set one (even if this stay has no weekend night). */
  weekendPrice: number | null;
  nightly: NightPrice[];
  lines: PriceLine[];
  subtotal: number;
  cleaningFee: number;
  total: number;
  /** Estimate in the guest's display currency (null when it is the host's currency). */
  display: { currency: CurrencyCode; total: number } | null;
};

export type QuoteResult =
  | { ok: true; quote: Quote }
  | { ok: false; error: QuoteError; minNights?: number; maxNights?: number; maxGuests?: number };

export type QuoteContext = {
  /** Today in Georgia, "YYYY-MM-DD" (tbilisiToday()). */
  today: string;
  displayCurrency?: CurrencyCode | null;
  rates?: Partial<Rates> | null;
};

const cents = (amount: number) => Math.round(amount * 100);
const fromCents = (value: number) => value / 100;

function positive(value: number | null | undefined): number | null {
  return typeof value === "number" && Number.isFinite(value) && value > 0 ? value : null;
}

function count(value: number | null | undefined): number {
  return typeof value === "number" && Number.isInteger(value) && value > 0 ? value : 0;
}

/** Checks the stay against the host's rules and prices it. */
export function quoteStay(terms: PricingTerms, request: StayRequest, context: QuoteContext): QuoteResult {
  const { checkIn, checkOut } = request;
  if (!isDay(checkIn) || !isDay(checkOut) || checkOut <= checkIn) return { ok: false, error: "dates_invalid" };
  if (checkIn < context.today) return { ok: false, error: "dates_past" };
  if (daysBetween(context.today, checkIn) > MAX_DAYS_AHEAD) return { ok: false, error: "too_far_ahead" };

  const nights = nightsBetween(checkIn, checkOut);
  if (nights > MAX_STAY_NIGHTS) return { ok: false, error: "max_stay", maxNights: MAX_STAY_NIGHTS };
  const minNights = Math.max(1, count(terms.minStayNights));
  if (nights < minNights) return { ok: false, error: "min_stay", minNights };

  const adults = count(request.adults);
  const children = count(request.children);
  const infants = count(request.infants);
  if (adults < 1) return { ok: false, error: "no_adults" };
  const guests = adults + children;
  const maxGuests = Math.min(MAX_GUESTS_PER_BOOKING, count(terms.maxGuests) || MAX_GUESTS_PER_BOOKING);
  if (guests > maxGuests) return { ok: false, error: "too_many_guests", maxGuests };
  if (infants > MAX_INFANTS) return { ok: false, error: "too_many_infants" };

  const nightlyPrice = positive(terms.nightlyPrice);
  if (nightlyPrice === null) return { ok: false, error: "no_price" };
  const weekendPrice = positive(terms.weekendPrice);

  const nightly: NightPrice[] = eachNight(checkIn, checkOut).map((date) => {
    const weekend = isWeekendNight(date);
    return { date, weekend, price: weekend && weekendPrice !== null ? weekendPrice : nightlyPrice };
  });

  const lines: PriceLine[] = [];
  const weekdayNights = weekendPrice === null ? nights : nightly.filter((n) => !n.weekend).length;
  const weekendNights = nights - weekdayNights;
  if (weekdayNights > 0) {
    lines.push({ kind: "weekday", nights: weekdayNights, price: nightlyPrice, amount: fromCents(cents(nightlyPrice) * weekdayNights) });
  }
  if (weekendNights > 0 && weekendPrice !== null) {
    lines.push({ kind: "weekend", nights: weekendNights, price: weekendPrice, amount: fromCents(cents(weekendPrice) * weekendNights) });
  }

  const subtotalCents = nightly.reduce((sum, night) => sum + cents(night.price), 0);
  const cleaningCents = cents(positive(terms.cleaningFee) ?? 0);
  const totalCents = subtotalCents + cleaningCents;
  const total = fromCents(totalCents);

  const displayCurrency = context.displayCurrency ?? null;
  const display =
    displayCurrency && displayCurrency !== terms.currency
      ? { currency: displayCurrency, total: fromCents(cents(convert(total, terms.currency, displayCurrency, context.rates))) }
      : null;

  return {
    ok: true,
    quote: {
      checkIn,
      checkOut,
      nights,
      adults,
      children,
      infants,
      guests,
      currency: terms.currency,
      nightlyPrice,
      weekendPrice,
      nightly,
      lines,
      subtotal: fromCents(subtotalCents),
      cleaningFee: fromCents(cleaningCents),
      total,
      display,
    },
  };
}
