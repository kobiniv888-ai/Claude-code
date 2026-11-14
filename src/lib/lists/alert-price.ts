/**
 * The price a saved place is watched at (brief 7.4, contract (2)): when a place is saved,
 * Favorite.alertPrice / alertCurrency = the listing's HEADLINE price at that moment, in the
 * listing's own currency, the same price its card shows:
 * - the listing's own price when it has one;
 * - otherwise (hotels priced by room type) the "from" price of its cheapest active room type,
 *   by USD value (src/lib/listing/mappers.ts uses the same room order), in that room type's
 *   currency.
 * Null when the listing has no price (the place is saved without a price alert).
 *
 * ONE price period per deal type (lists-alerts-6): Favorite stores no period, so a price is only
 * watched in its deal type's own period (ALERT_PERIOD_BY_DEAL: per night for stays and hotels,
 * per month for monthly rentals, the total for sales). A short stay priced per week, or a room
 * type priced per week or month, has no alert price: ₾700 a week → ₾400 a night is a rise, never
 * a "price dropped" email. Moving between periods leaves the stored alert price alone (the place
 * is compared again once it is back in its period).
 *
 * Pure. The price-drop email (src/lib/alerts) compares the current headline price, computed with
 * `headlineAlertPrice` and ALERT_PRICE_SELECT, against the stored one.
 */
import type { Prisma } from "@/generated/prisma/client";
import type { Currency, DealType, PricePeriod } from "@/generated/prisma/enums";

/** The one price period each deal type's alert prices are kept in. */
export const ALERT_PERIOD_BY_DEAL = {
  SHORT_STAY: "NIGHT",
  HOTEL_ROOM: "NIGHT",
  MONTHLY_RENT: "MONTH",
  SALE: "TOTAL",
} as const satisfies Record<DealType, PricePeriod>;

/** The room types a "from" price may come from: offered to guests, with a price (cards too). */
export const HEADLINE_ROOM_WHERE = { active: true, price: { gt: 0 } } satisfies Prisma.RoomTypeWhereInput;
/** The cheapest by USD value first (the card's order). */
export const HEADLINE_ROOM_ORDER = [
  { priceUsd: { sort: "asc", nulls: "last" } },
  { price: "asc" },
  { sortOrder: "asc" },
] satisfies Prisma.RoomTypeOrderByWithRelationInput[];

/** The Listing columns `headlineAlertPrice` reads. */
export const ALERT_PRICE_SELECT = {
  dealType: true,
  price: true,
  currency: true,
  pricePeriod: true,
  roomTypes: {
    // Room-type alerts are per night (the only room period a stay compares in).
    where: { ...HEADLINE_ROOM_WHERE, pricePeriod: "NIGHT" },
    orderBy: HEADLINE_ROOM_ORDER,
    take: 1,
    select: { price: true, currency: true },
  },
} as const satisfies Prisma.ListingSelect;

type DecimalLike = { toString(): string } | number | null;

export type AlertPriceRow = {
  dealType: DealType;
  price: DecimalLike;
  currency: Currency;
  pricePeriod: PricePeriod;
  /** Active, priced, per-night room types, cheapest first (ALERT_PRICE_SELECT). */
  roomTypes: readonly { price: DecimalLike; currency: Currency }[];
};

/** A headline price: its amount, currency and period, and whether it is a room type's "from" price. */
export type HeadlinePrice = { amount: number; currency: Currency; period: PricePeriod; fromRoom: boolean };

function amount(value: DecimalLike): number | null {
  if (value === null) return null;
  const n = typeof value === "number" ? value : Number(value.toString());
  return Number.isFinite(n) && n > 0 ? Math.round(n * 100) / 100 : null;
}

export function headlineAlertPrice(row: AlertPriceRow): HeadlinePrice | null {
  const period = ALERT_PERIOD_BY_DEAL[row.dealType];
  const own = amount(row.price);
  // The card shows the listing's own price when it has one: in another period, nothing to watch.
  if (own !== null) return row.pricePeriod === period ? { amount: own, currency: row.currency, period, fromRoom: false } : null;
  if (period !== "NIGHT") return null;
  const room = row.roomTypes[0];
  const roomAmount = room ? amount(room.price) : null;
  return room && roomAmount !== null ? { amount: roomAmount, currency: room.currency, period, fromRoom: true } : null;
}
