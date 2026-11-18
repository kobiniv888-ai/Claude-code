/**
 * The itemized price of a booking, for every place that shows it after booking (the trip page,
 * the host's booking page, the admin booking page, the booking emails): the lines the guest saw
 * before confirming, copied into Booking.priceLines by createBooking. Bookings made before round 3,
 * phase 4 have no stored lines: they are rebuilt from the copied prices (nightly, weekend, cleaning).
 * Client-safe and pure.
 */
import type { CurrencyCode } from "@/config/site";
import { pickLocalized } from "@/i18n/locale";
import { formatMoney } from "@/lib/format";
import { eachNight, isDay, isWeekendNight } from "./dates";
import { cleanPriceLabel, type PriceLine, type PriceLineKind } from "./pricing";

const KINDS: readonly PriceLineKind[] = ["weekday", "weekend", "date_price", "discount", "cleaning"];
const MAX_LINES = 40;

const finite = (value: unknown): value is number => typeof value === "number" && Number.isFinite(value);
const wholeCount = (value: unknown): value is number => typeof value === "number" && Number.isInteger(value) && value > 0;

/** Booking.priceLines read back from the database (never trusted): valid lines only, or null. */
export function parsePriceLines(value: unknown): PriceLine[] | null {
  if (!Array.isArray(value) || value.length === 0) return null;
  const lines: PriceLine[] = [];
  for (const raw of value.slice(0, MAX_LINES)) {
    if (!raw || typeof raw !== "object") return null;
    const item = raw as Record<string, unknown>;
    const kind = item.kind as PriceLineKind;
    if (!KINDS.includes(kind) || !finite(item.amount)) return null;
    const line: PriceLine = { kind, amount: item.amount };
    if (wholeCount(item.nights)) line.nights = item.nights;
    if (finite(item.price) && item.price >= 0) line.price = item.price;
    if (wholeCount(item.pct)) line.pct = item.pct;
    if (item.period === "weekly" || item.period === "monthly") line.period = item.period;
    if (wholeCount(item.rooms) && item.rooms > 1) line.rooms = item.rooms;
    const label = cleanPriceLabel(item.label);
    if (label) line.label = label;
    lines.push(line);
  }
  return lines;
}

const sum = (lines: readonly PriceLine[]) => Math.round(lines.reduce((total, line) => total + Math.round(line.amount * 100), 0)) / 100;

/** What a stored booking holds about its price (Decimal columns already read as numbers). */
export type StoredBookingPrice = {
  checkIn: string;
  checkOut: string;
  nights: number;
  nightlyPrice: number;
  weekendPrice: number | null;
  subtotal: number;
  cleaningFee: number;
  discount: number | null;
  total: number;
  rooms?: number | null;
  priceLines: unknown;
};

/**
 * The lines to show for a booking: the stored ones when they add up to the stored total, else
 * rebuilt from the copied prices. When even the rebuilt nights do not match the stored subtotal (a
 * rule this code no longer knows), the nights become one line without a per-night price
 * ("3 nights … ₾165") so the lines always add up to the total the guest pays.
 */
export function bookingPriceLines(booking: StoredBookingPrice): PriceLine[] {
  const stored = parsePriceLines(booking.priceLines);
  if (stored && Math.abs(sum(stored) - booking.total) < 0.005) return stored;

  const rooms = wholeCount(booking.rooms) ? booking.rooms : 1;
  const nights = isDay(booking.checkIn) && isDay(booking.checkOut) ? eachNight(booking.checkIn, booking.checkOut) : [];
  const weekend = booking.weekendPrice && booking.weekendPrice > 0 ? booking.weekendPrice : null;
  const weekendNights = weekend === null ? 0 : nights.filter(isWeekendNight).length;
  const weekdayNights = nights.length - weekendNights;
  const amount = (price: number, n: number) => Math.round(Math.round(price * 100) * n * rooms) / 100;
  const withRooms = (line: PriceLine): PriceLine => (rooms > 1 ? { ...line, rooms } : line);

  let lines: PriceLine[] = [];
  if (weekdayNights > 0) lines.push(withRooms({ kind: "weekday", nights: weekdayNights, price: booking.nightlyPrice, amount: amount(booking.nightlyPrice, weekdayNights) }));
  if (weekend !== null && weekendNights > 0) lines.push(withRooms({ kind: "weekend", nights: weekendNights, price: weekend, amount: amount(weekend, weekendNights) }));
  if (lines.length === 0 || Math.abs(sum(lines) - booking.subtotal) >= 0.005) {
    lines = [withRooms({ kind: "weekday", nights: Math.max(1, booking.nights), amount: booking.subtotal })];
  }
  if (booking.discount && booking.discount > 0) lines.push({ kind: "discount", amount: -booking.discount });
  if (booking.cleaningFee > 0) lines.push(withRooms({ kind: "cleaning", amount: booking.cleaningFee, ...(rooms > 1 ? { price: Math.round((booking.cleaningFee / rooms) * 100) / 100 } : {}) }));
  return lines;
}

/** Left-to-right isolate (amounts inside a translated sentence) and first-strong isolate (host text). */
const ltr = (text: string) => `⁦${text}⁩`;
const auto = (text: string) => `⁨${text}⁩`;

/** A translator of the `booking.price` messages (next-intl's t, server or client). */
export type PriceLineTranslator = (key: string, values?: Record<string, string | number>) => string;

/**
 * The words of one line, e.g. "₾55 × 3 לילות", "₾80 × 2 לילות (פסח)", "₾80 × 2 לילות במחיר מיוחד",
 * "הנחה לשבוע −10%", "דמי ניקיון". `money` formats an amount in the booking's currency and
 * `percent` a whole number ("10" → "10" in Western digits).
 */
export function describePriceLine(
  line: PriceLine,
  t: PriceLineTranslator,
  options: { money: (amount: number) => string; number: (value: number) => string; locale: string },
): string {
  const rooms = line.rooms && line.rooms > 1 ? line.rooms : null;
  const withRooms = (text: string) => (rooms ? t("perRooms", { text, rooms: t("rooms", { count: rooms }) }) : text);
  switch (line.kind) {
    case "weekday":
    case "weekend":
    case "date_price": {
      const n = line.nights ?? 0;
      if (line.price === undefined) return withRooms(t("nights", { count: n }));
      const price = ltr(options.money(line.price));
      if (line.kind === "weekday") return withRooms(t("times", { price, nights: t("nights", { count: n }) }));
      if (line.kind === "weekend") return withRooms(t("weekendTimes", { price, nights: t("nights", { count: n }) }));
      const label = line.label ? pickLocalized(line.label, options.locale).trim() : "";
      return withRooms(
        label
          ? t("labelTimes", { price, nights: t("nights", { count: n }), label: auto(label) })
          : t("times", { price, nights: t("specialNights", { count: n }) }),
      );
    }
    case "discount": {
      if (!line.pct) return t("discount");
      const pct = ltr(`−${options.number(line.pct)}%`);
      return t(line.period === "monthly" ? "discountMonthly" : line.period === "weekly" ? "discountWeekly" : "discountPct", { pct });
    }
    case "cleaning":
      return rooms && line.price !== undefined
        ? t("cleaningFeeRooms", { price: ltr(options.money(line.price)), rooms: t("rooms", { count: rooms }) })
        : t("cleaningFee");
  }
}

/** The amount column: "₾165", "−₾33" for the discount. */
export function priceLineAmount(line: PriceLine, money: (amount: number) => string): string {
  return line.amount < 0 ? `−${money(-line.amount)}` : money(line.amount);
}

/**
 * A booking amount, exact to the cent: "$375", "$55.50", "$519.50" (formatMoney drops the cents of
 * amounts from 100 up, which would make a discounted total read "$520"). For the price lines and
 * the total the guest pays.
 */
export function formatBookingMoney(amount: number, currency: CurrencyCode, locale: string): string {
  const cents = Math.round(amount * 100);
  return cents % 100 === 0
    ? formatMoney(cents / 100, currency, locale)
    : formatMoney(cents / 100, currency, locale, { maximumFractionDigits: 2, minimumFractionDigits: 2 });
}
