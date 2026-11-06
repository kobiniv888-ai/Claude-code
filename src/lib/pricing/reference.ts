import type { DealType, PropertyType } from "@/generated/prisma/enums";

/**
 * Reference prices (round 3, brief 5 and 9): a price RANGE that staff copied from a public report,
 * with its source and month. Pure and client-safe. The admin panel keeps the form schema
 * (src/lib/admin/reference-prices.ts, which re-exports this file's helpers); the hosts' price
 * guide (./guide-server.ts) picks the rows that fit a listing with matchReferencePrices() and shows
 * them apart from Bayit's own numbers, as "לפי [מקור], [חודש שנה]".
 *
 * Public code must not import src/lib/admin, so the matching lives here.
 */

/** Reports older than this many months are flagged as old in the admin list and left out of the guide. */
export const REFERENCE_STALE_MONTHS = 24;

export type ReferenceRow = {
  cityId: string;
  neighborhoodId: string | null;
  dealType: DealType;
  propertyType: PropertyType | null;
  bedrooms: number | null;
  active: boolean;
  sourceMonth: Date;
};

export type ReferenceQuery = {
  cityId: string;
  neighborhoodId?: string | null;
  dealType: DealType;
  propertyType?: PropertyType | null;
  bedrooms?: number | null;
};

/**
 * Active rows that fit a listing, most specific first (neighborhood, property type and bedrooms
 * each count), then the newest report. A row with a value that differs never fits; an empty value
 * ("all types", "all sizes", the whole city) fits everything.
 */
export function matchReferencePrices<T extends ReferenceRow>(rows: readonly T[], query: ReferenceQuery): T[] {
  const fits = (row: T) =>
    row.active &&
    row.cityId === query.cityId &&
    row.dealType === query.dealType &&
    (row.neighborhoodId === null || row.neighborhoodId === (query.neighborhoodId ?? null)) &&
    (row.propertyType === null || row.propertyType === (query.propertyType ?? null)) &&
    (row.bedrooms === null || row.bedrooms === (query.bedrooms ?? null));
  const score = (row: T) => (row.neighborhoodId ? 4 : 0) + (row.propertyType ? 2 : 0) + (row.bedrooms !== null ? 1 : 0);
  return rows.filter(fits).sort((a, b) => score(b) - score(a) || b.sourceMonth.getTime() - a.sourceMonth.getTime());
}

/** Is the report (its month, stored as the 1st) older than REFERENCE_STALE_MONTHS? */
export function isStaleReference(sourceMonth: Date, now: Date = new Date()): boolean {
  const months = (now.getUTCFullYear() - sourceMonth.getUTCFullYear()) * 12 + (now.getUTCMonth() - sourceMonth.getUTCMonth());
  return months > REFERENCE_STALE_MONTHS;
}

/** "2026-10" of a report month stored as the 1st of that month (a @db.Date column, UTC midnight). */
export function referenceMonth(date: Date): string {
  return date.toISOString().slice(0, 7);
}
