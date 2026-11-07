/**
 * The price a saved place is watched at (brief 7.4, contract (2)): when a place is saved,
 * Favorite.alertPrice / alertCurrency = the listing's HEADLINE price at that moment, in the
 * listing's own currency and price period, the same price its card shows:
 * - the listing's own price when it has one;
 * - otherwise (hotels priced by room type) the "from" price of its cheapest active room type,
 *   by USD value (src/lib/listing/mappers.ts), in that room type's currency.
 * Null when the listing has no price (the place is saved without a price alert).
 *
 * Pure. The price-drop email (src/lib/alerts) compares the current headline price, computed with
 * `headlineAlertPrice` and ALERT_PRICE_SELECT, against the stored one.
 */
import type { Prisma } from "@/generated/prisma/client";
import type { Currency } from "@/generated/prisma/enums";

/** The Listing columns `headlineAlertPrice` reads. */
export const ALERT_PRICE_SELECT = {
  price: true,
  currency: true,
  roomTypes: {
    where: { active: true, price: { gt: 0 } },
    orderBy: [{ priceUsd: { sort: "asc", nulls: "last" } }, { price: "asc" }, { sortOrder: "asc" }],
    take: 1,
    select: { price: true, currency: true },
  },
} as const satisfies Prisma.ListingSelect;

type DecimalLike = { toString(): string } | number | null;

export type AlertPriceRow = {
  price: DecimalLike;
  currency: Currency;
  roomTypes: readonly { price: DecimalLike; currency: Currency }[];
};

function amount(value: DecimalLike): number | null {
  if (value === null) return null;
  const n = typeof value === "number" ? value : Number(value.toString());
  return Number.isFinite(n) && n > 0 ? Math.round(n * 100) / 100 : null;
}

export function headlineAlertPrice(row: AlertPriceRow): { amount: number; currency: Currency } | null {
  const own = amount(row.price);
  if (own !== null) return { amount: own, currency: row.currency };
  const room = row.roomTypes[0];
  const roomAmount = room ? amount(room.price) : null;
  return room && roomAmount !== null ? { amount: roomAmount, currency: room.currency } : null;
}
