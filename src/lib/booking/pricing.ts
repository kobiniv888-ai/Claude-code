/**
 * Price quote for a stay (client-safe, pure): the nightly breakdown, the itemized lines, the
 * long-stay discount, the cleaning fee and the total in the HOST's currency, plus an estimate in
 * the guest's display currency. The same function checks the stay against the host's rules, so the
 * dates sheet, the review page, the server action and the booking transaction all agree.
 *
 * Which price a night gets (round 3, brief 6.3): a date price ("holiday price", DatePrice) first,
 * then the weekend price (Friday and Saturday nights), then the regular nightly price.
 *
 * Long-stay discount: 28+ nights → monthlyDiscountPct, otherwise 7+ nights → weeklyDiscountPct
 * (never both; a 28+ night stay without a monthly discount, or with a smaller one, gets the weekly one). It is taken off the
 * nights only, never off the cleaning fee. Hotels (`rooms`): every night and the cleaning fee are
 * charged once per room booked.
 *
 * Guests: adults + children count toward the listing's maximum; infants (under 2) do not
 * (at most MAX_INFANTS). At least one adult.
 *
 * Money is computed in integer cents and returned in whole units (165.5, not 16550). The lines add
 * up to the total exactly: Σ line.amount === total (the discount line's amount is negative).
 */
import { locales, type AppLocale, type CurrencyCode } from "@/config/site";
import { convert, type Rates } from "@/lib/currency/convert";
import { MAX_DAYS_AHEAD, MAX_GUESTS_PER_BOOKING, MAX_INFANTS, MAX_STAY_NIGHTS } from "./constants";
import { daysBetween, eachNight, isDay, isWeekendNight, nightsBetween } from "./dates";

/** The host's note on a date price ("פסח"), in any of the site's languages. Host-written: dir="auto". */
export type PriceLineLabel = Partial<Record<AppLocale, string>>;

/** One date price (DatePrice) as the quote reads it. `end` is EXCLUSIVE (the first night not at this price). */
export type DatePriceTerm = {
  start: string;
  end: string;
  /** Per night, in the terms' currency. */
  price: number;
  /** A stay that has a night in this range must be at least this long. */
  minNights?: number | null;
  /** A plain string is the same note in every language. */
  label?: string | PriceLineLabel | null;
};

/** The long-stay discounts' rules (the host's "הזמנות ומחיר" step validates the same numbers). */
export const LONG_STAY = {
  weeklyNights: 7,
  monthlyNights: 28,
  /** Whole percents; anything outside is ignored (no discount). */
  minPct: 1,
  maxPct: 60,
} as const;

export type PricingTerms = {
  currency: CurrencyCode;
  /** Price per night (Listing.price with pricePeriod NIGHT, or the chosen room type's price). */
  nightlyPrice: number | null;
  /** Friday and Saturday nights; null or 0 = the nightly price. */
  weekendPrice?: number | null;
  /** Per booking (hotels: per room booked). */
  cleaningFee?: number | null;
  minStayNights?: number | null;
  /** Adults + children; null = no limit beyond MAX_GUESTS_PER_BOOKING. */
  maxGuests?: number | null;
  /**
   * Date prices that may touch the stay (more is fine). When two cover the same night the first
   * one in the list wins (resolveTerms puts a room type's own prices before the listing's).
   */
  datePrices?: DatePriceTerm[];
  /** % off the nights for 7+ nights (1–60). */
  weeklyDiscountPct?: number | null;
  /** % off the nights for 28+ nights (1–60). */
  monthlyDiscountPct?: number | null;
  /** Hotels: how many rooms of the room type (default 1). */
  rooms?: number;
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

export type NightKind = "weekday" | "weekend" | "date_price";

export type NightPrice = {
  date: string;
  /** A Friday or Saturday night (whether or not the weekend price applied). */
  weekend: boolean;
  /** Which price applied. */
  kind: NightKind;
  /** Per room. */
  price: number;
};

export type PriceLineKind = "weekday" | "weekend" | "date_price" | "discount" | "cleaning";

/**
 * One line of the price, in the order the guest sees them: regular nights ("₪420 × 3 nights"),
 * weekend nights, date-price nights (one line per price and note), the long-stay discount
 * ("Weekly discount −10%", a NEGATIVE amount), the cleaning fee. Copied into Booking.priceLines.
 */
export type PriceLine = {
  kind: PriceLineKind;
  /** Nights lines. */
  nights?: number;
  /** Nights lines: per night (per room); cleaning: per room. */
  price?: number;
  /** In the terms' currency; negative for the discount. */
  amount: number;
  /** Discount: the percent. */
  pct?: number;
  /** Discount: which one applied (optional extension of the shared contract). */
  period?: "weekly" | "monthly";
  /** Date-price lines: the host's note, when set. */
  label?: PriceLineLabel;
  /** Hotels: rooms booked, only when more than 1. */
  rooms?: number;
};

export type QuoteDiscount = { pct: number; /** Positive, taken off the total. */ amount: number; kind: "weekly" | "monthly" };

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
  /** Every night of every room, before the discount. */
  subtotal: number;
  discount: QuoteDiscount | null;
  /** The cleaning fee of the whole booking (per room × rooms). */
  cleaningFee: number;
  total: number;
  rooms: number;
  /** The minimum nights this stay had to meet (the listing's, or a date price's when longer). */
  minNights: number;
  /** Estimate in the guest's display currency (null when it is the host's currency). */
  display: { currency: CurrencyCode; total: number } | null;
};

/** The date price whose minimum stay a too-short stay missed (to explain it in the dates sheet). */
export type MinStayDatePrice = { start: string; end: string; label?: PriceLineLabel };

export type QuoteResult =
  | { ok: true; quote: Quote }
  | {
      ok: false;
      error: QuoteError;
      minNights?: number;
      maxNights?: number;
      maxGuests?: number;
      /** min_stay because of a date price's own minimum. */
      datePrice?: MinStayDatePrice;
    };

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

const LABEL_MAX = 60;

/** A date price's note as stored on a line: known languages only, trimmed, never empty. */
export function cleanPriceLabel(value: unknown): PriceLineLabel | undefined {
  if (typeof value === "string") {
    const text = value.trim().slice(0, LABEL_MAX);
    return text ? Object.fromEntries(locales.map((l) => [l, text])) : undefined;
  }
  if (!value || typeof value !== "object" || Array.isArray(value)) return undefined;
  const out: PriceLineLabel = {};
  for (const locale of locales) {
    const text = (value as Record<string, unknown>)[locale];
    if (typeof text === "string" && text.trim()) out[locale] = text.trim().slice(0, LABEL_MAX);
  }
  return Object.keys(out).length > 0 ? out : undefined;
}

type CleanDatePrice = { start: string; end: string; price: number; minNights: number; label?: PriceLineLabel };

/** Valid date prices only (real days, end after start, a positive price), in the given order. */
export function cleanDatePrices(list: readonly DatePriceTerm[] | null | undefined): CleanDatePrice[] {
  const out: CleanDatePrice[] = [];
  for (const item of list ?? []) {
    if (!item || !isDay(item.start) || !isDay(item.end) || item.end <= item.start) continue;
    const price = positive(item.price);
    if (price === null) continue;
    out.push({ start: item.start, end: item.end, price, minNights: count(item.minNights ?? null), label: cleanPriceLabel(item.label) });
  }
  return out;
}

/** The date price for one night (the first that covers it), or undefined. */
function priceForNight<T extends { start: string; end: string }>(night: string, list: readonly T[]): T | undefined {
  return list.find((p) => p.start <= night && night < p.end);
}

/**
 * The minimum nights a stay [checkIn, checkOut) must have: the listing's minimum, or the longest
 * minimum of a date price that has a night in the stay. `datePrice` names that date price when its
 * minimum is the one that counts (longer than the listing's).
 */
export function requiredMinNights(
  minStayNights: number | null | undefined,
  datePrices: readonly Pick<DatePriceTerm, "start" | "end" | "minNights" | "label">[] | null | undefined,
  checkIn: string,
  checkOut: string,
): { minNights: number; datePrice?: MinStayDatePrice } {
  const base = Math.max(1, count(minStayNights ?? null));
  let best: { minNights: number; datePrice?: MinStayDatePrice } = { minNights: base };
  for (const p of datePrices ?? []) {
    if (!isDay(p.start) || !isDay(p.end) || !(p.start < checkOut && p.end > checkIn)) continue;
    const min = count(p.minNights ?? null);
    if (min > best.minNights) best = { minNights: min, datePrice: { start: p.start, end: p.end, label: cleanPriceLabel(p.label) } };
  }
  return best;
}

function validPct(value: number | null | undefined): number | null {
  return typeof value === "number" && Number.isInteger(value) && value >= LONG_STAY.minPct && value <= LONG_STAY.maxPct ? value : null;
}

/**
 * Which long-stay discount a stay of `nights` gets, or null: 28+ nights the monthly one, else 7+
 * nights the weekly one, never both. A 28+ night stay never gets less than a 7-night stay would:
 * without a monthly discount, or with a smaller one (the post form refuses that, but a live
 * listing's auto-save may hold it for a moment), the weekly one applies.
 */
export function longStayDiscount(
  nights: number,
  weeklyPct: number | null | undefined,
  monthlyPct: number | null | undefined,
): { pct: number; kind: "weekly" | "monthly" } | null {
  const monthly = validPct(monthlyPct);
  const weekly = validPct(weeklyPct);
  if (nights >= LONG_STAY.monthlyNights && monthly !== null && monthly >= (weekly ?? 0)) return { pct: monthly, kind: "monthly" };
  if (nights >= LONG_STAY.weeklyNights && weekly !== null) return { pct: weekly, kind: "weekly" };
  return null;
}

/** Checks the stay against the host's rules and prices it. */
export function quoteStay(terms: PricingTerms, request: StayRequest, context: QuoteContext): QuoteResult {
  const { checkIn, checkOut } = request;
  if (!isDay(checkIn) || !isDay(checkOut) || checkOut <= checkIn) return { ok: false, error: "dates_invalid" };
  if (checkIn < context.today) return { ok: false, error: "dates_past" };
  if (daysBetween(context.today, checkIn) > MAX_DAYS_AHEAD) return { ok: false, error: "too_far_ahead" };

  const nights = nightsBetween(checkIn, checkOut);
  if (nights > MAX_STAY_NIGHTS) return { ok: false, error: "max_stay", maxNights: MAX_STAY_NIGHTS };
  const datePrices = cleanDatePrices(terms.datePrices).filter((p) => p.start < checkOut && p.end > checkIn);
  const required = requiredMinNights(terms.minStayNights, datePrices, checkIn, checkOut);
  if (nights < required.minNights) {
    return { ok: false, error: "min_stay", minNights: required.minNights, ...(required.datePrice ? { datePrice: required.datePrice } : {}) };
  }

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
  const rooms = Math.max(1, count(terms.rooms ?? null));

  // Which price each night gets: a date price, then the weekend price, then the regular price.
  const groups = new Map<CleanDatePrice, string[]>();
  const nightly: NightPrice[] = eachNight(checkIn, checkOut).map((date) => {
    const weekend = isWeekendNight(date);
    const special = priceForNight(date, datePrices);
    if (special) {
      groups.set(special, [...(groups.get(special) ?? []), date]);
      return { date, weekend, kind: "date_price", price: special.price };
    }
    if (weekend && weekendPrice !== null) return { date, weekend, kind: "weekend", price: weekendPrice };
    return { date, weekend, kind: "weekday", price: nightlyPrice };
  });

  const withRooms = (line: PriceLine): PriceLine => (rooms > 1 ? { ...line, rooms } : line);
  const nightsLine = (kind: NightKind, n: number, price: number, label?: PriceLineLabel): PriceLine =>
    withRooms({ kind, nights: n, price, amount: fromCents(cents(price) * n * rooms), ...(label ? { label } : {}) });

  const lines: PriceLine[] = [];
  const weekdayNights = nightly.filter((n) => n.kind === "weekday").length;
  const weekendNights = nightly.filter((n) => n.kind === "weekend").length;
  if (weekdayNights > 0) lines.push(nightsLine("weekday", weekdayNights, nightlyPrice));
  if (weekendNights > 0 && weekendPrice !== null) lines.push(nightsLine("weekend", weekendNights, weekendPrice));
  // One line per price and note (two ranges with the same price and note read as one line), in
  // the order of their first night.
  const special = new Map<string, { price: number; label?: PriceLineLabel; nights: number }>();
  for (const [price, days] of groups) {
    const key = `${cents(price.price)}|${JSON.stringify(price.label ?? null)}`;
    const current = special.get(key);
    if (current) current.nights += days.length;
    else special.set(key, { price: price.price, label: price.label, nights: days.length });
  }
  for (const group of special.values()) lines.push(nightsLine("date_price", group.nights, group.price, group.label));

  const subtotalCents = nightly.reduce((sum, night) => sum + cents(night.price) * rooms, 0);
  const long = longStayDiscount(nights, terms.weeklyDiscountPct, terms.monthlyDiscountPct);
  const discountCents = long ? Math.round((subtotalCents * long.pct) / 100) : 0;
  const discount: QuoteDiscount | null = long && discountCents > 0 ? { pct: long.pct, amount: fromCents(discountCents), kind: long.kind } : null;
  if (discount) lines.push({ kind: "discount", pct: discount.pct, period: discount.kind, amount: -discount.amount });

  const feeCents = cents(positive(terms.cleaningFee) ?? 0);
  const cleaningCents = feeCents * rooms;
  if (cleaningCents > 0) lines.push(withRooms({ kind: "cleaning", price: fromCents(feeCents), amount: fromCents(cleaningCents) }));

  const totalCents = subtotalCents - (discount ? discountCents : 0) + cleaningCents;
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
      discount,
      cleaningFee: fromCents(cleaningCents),
      total,
      rooms,
      minNights: required.minNights,
      display,
    },
  };
}
