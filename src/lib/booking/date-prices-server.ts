import "server-only";
import type { AppLocale } from "@/config/site";
import { pickLocalized } from "@/i18n/locale";
import type { Prisma } from "@/generated/prisma/client";
import { db } from "@/lib/db";
import { DATE_PRICE_LIMITS, type HostDatePrice } from "./date-prices";
import { dateToDay, dayToDate, tbilisiToday } from "./dates";
import { toNumber } from "./terms";

/**
 * The listing's holiday prices from today on, for its owner's calendar (server-only; callers check
 * ownership). A room type's own price is in that room type's currency, the others in the listing's.
 */
export async function listHostDatePrices(
  listingId: string,
  locale: AppLocale,
  options: { today?: string; client?: Prisma.TransactionClient | typeof db } = {},
): Promise<HostDatePrice[]> {
  const today = options.today ?? tbilisiToday();
  const rows = await (options.client ?? db).datePrice.findMany({
    where: { listingId, endDate: { gt: dayToDate(today) } },
    orderBy: [{ startDate: "asc" }, { createdAt: "asc" }],
    take: DATE_PRICE_LIMITS.maxPerListing * 2,
    select: {
      id: true,
      roomTypeId: true,
      startDate: true,
      endDate: true,
      price: true,
      minNights: true,
      label: true,
      listing: { select: { currency: true } },
      roomType: { select: { currency: true } },
    },
  });
  return rows.map((row) => ({
    id: row.id,
    roomTypeId: row.roomTypeId,
    start: dateToDay(row.startDate),
    end: dateToDay(row.endDate),
    price: toNumber(row.price) ?? 0,
    currency: row.roomType?.currency ?? row.listing.currency,
    minNights: row.minNights,
    label: row.label ? pickLocalized(row.label, locale).trim() || null : null,
  }));
}
