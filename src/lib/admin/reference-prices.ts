import { z } from "zod";
import { currencyCodes } from "@/config/site";
import type { DealType, PricePeriod, PropertyType } from "@/generated/prisma/enums";
import { DEAL_TYPES, PROPERTY_TYPES } from "@/lib/listing/fields";

/**
 * Reference prices for the hosts' price guide (round 3, brief 5 and 9): a price RANGE copied by
 * staff from a public report, with its source and month. Pure and client-safe: the admin form and
 * the server actions run the same schema; the phase-4 guide uses matchReferencePrices() and shows
 * the source as "לפי [מקור], [חודש שנה]" (admin.referencePrices.sourceLabel), apart from Bayit's
 * own numbers. Never store copied listings, only the range and the source.
 *
 * Error messages are codes translated with adminContent.form.errors.<code>.
 */

export const REFERENCE_UNITS = ["NIGHT", "MONTH", "TOTAL"] as const satisfies readonly PricePeriod[];
export type ReferenceUnit = (typeof REFERENCE_UNITS)[number];

/** The only unit that fits each deal type (the form sets it from the deal type). */
export const UNIT_BY_DEAL: Record<DealType, ReferenceUnit> = {
  SHORT_STAY: "NIGHT",
  HOTEL_ROOM: "NIGHT",
  MONTHLY_RENT: "MONTH",
  SALE: "TOTAL",
};

export const REFERENCE_LIMITS = {
  sourceName: 120,
  sourceUrl: 500,
  note: 1000,
  maxPrice: 100_000_000,
  maxBedrooms: 20,
  /** Reports older than this are flagged as old in the list (the guide may hide them). */
  staleMonths: 24,
} as const;

export const REFERENCE_ERROR_CODES = [
  "required",
  "too_long",
  "invalid_url",
  "invalid_number",
  "out_of_range",
  "invalid_date",
  "date_in_future",
  "high_below_low",
  "unit_mismatch",
  "per_sqm_sale_only",
  "neighborhood_mismatch",
] as const;
export type ReferenceErrorCode = (typeof REFERENCE_ERROR_CODES)[number];

function emptyToNull(value: unknown): unknown {
  if (value === undefined || value === null) return null;
  if (typeof value === "string" && value.trim() === "") return null;
  return value;
}

function toNumber(value: unknown): unknown {
  const v = emptyToNull(value);
  if (v === null) return v;
  if (typeof v === "number") return v;
  if (typeof v === "string") {
    const n = Number(v.replace(/[\s,]/g, ""));
    return Number.isFinite(n) ? n : Number.NaN;
  }
  return Number.NaN;
}

const price = z.preprocess(
  toNumber,
  z.number({ message: "required" }).refine((n) => Number.isFinite(n), "invalid_number").refine((n) => n > 0 && n <= REFERENCE_LIMITS.maxPrice, "out_of_range"),
);

const httpsUrl = z.preprocess(
  emptyToNull,
  z
    .string()
    .trim()
    .max(REFERENCE_LIMITS.sourceUrl, "too_long")
    .refine((value) => {
      try {
        const url = new URL(value);
        return url.protocol === "https:" || url.protocol === "http:";
      } catch {
        return false;
      }
    }, "invalid_url")
    .nullable(),
);

export const referencePriceSchema = z
  .object({
    cityId: z.string({ message: "required" }).trim().min(1, "required").max(64),
    neighborhoodId: z.preprocess(emptyToNull, z.string().trim().max(64).nullable()),
    dealType: z.enum(DEAL_TYPES, { message: "required" }),
    propertyType: z.preprocess(emptyToNull, z.enum(PROPERTY_TYPES, { message: "required" }).nullable()),
    bedrooms: z.preprocess(
      toNumber,
      z
        .number()
        .refine((n) => Number.isInteger(n), "invalid_number")
        .refine((n) => n >= 0 && n <= REFERENCE_LIMITS.maxBedrooms, "out_of_range")
        .nullable(),
    ),
    unit: z.enum(REFERENCE_UNITS, { message: "required" }),
    perSqm: z.boolean().default(false),
    low: price,
    high: price,
    currency: z.enum(currencyCodes, { message: "required" }),
    sourceName: z.string({ message: "required" }).trim().min(2, "required").max(REFERENCE_LIMITS.sourceName, "too_long"),
    sourceUrl: httpsUrl,
    /** "YYYY-MM" (the report's month). */
    sourceMonth: z.string({ message: "required" }).trim().regex(/^\d{4}-(0[1-9]|1[0-2])$/, "invalid_date"),
    note: z.preprocess(emptyToNull, z.string().trim().max(REFERENCE_LIMITS.note, "too_long").nullable()),
  })
  .superRefine((value, ctx) => {
    if (value.high < value.low) ctx.addIssue({ code: "custom", path: ["high"], message: "high_below_low" });
    if (UNIT_BY_DEAL[value.dealType] !== value.unit) ctx.addIssue({ code: "custom", path: ["unit"], message: "unit_mismatch" });
    if (value.perSqm && value.dealType !== "SALE") ctx.addIssue({ code: "custom", path: ["perSqm"], message: "per_sqm_sale_only" });
  });

export type ReferencePriceInput = z.output<typeof referencePriceSchema>;

/** "2026-10" is not after the current month (reports describe the past). */
export function sourceMonthProblem(month: string, now: Date = new Date()): "date_in_future" | "invalid_date" | null {
  if (!/^\d{4}-(0[1-9]|1[0-2])$/.test(month)) return "invalid_date";
  const year = Number(month.slice(0, 4));
  if (year < 2000) return "invalid_date";
  const current = `${now.getUTCFullYear()}-${String(now.getUTCMonth() + 1).padStart(2, "0")}`;
  return month > current ? "date_in_future" : null;
}

/** "2026-10" ↔ the 1st of that month (the @db.Date column). */
export function monthToDate(month: string): Date {
  return new Date(`${month}-01T00:00:00.000Z`);
}

export function dateToMonth(date: Date): string {
  return date.toISOString().slice(0, 7);
}

/** Is the report older than REFERENCE_LIMITS.staleMonths? */
export function isStaleReference(sourceMonth: Date, now: Date = new Date()): boolean {
  const months = (now.getUTCFullYear() - sourceMonth.getUTCFullYear()) * 12 + (now.getUTCMonth() - sourceMonth.getUTCMonth());
  return months > REFERENCE_LIMITS.staleMonths;
}

/** Field errors by path from a schema failure; unknown messages read as "invalid_number". */
export function referenceFieldErrors(error: z.ZodError): Record<string, string[]> {
  const out: Record<string, string[]> = {};
  for (const issue of error.issues) {
    const path = issue.path.map(String).join(".") || "_form";
    if (out[path]) continue;
    out[path] = [(REFERENCE_ERROR_CODES as readonly string[]).includes(issue.message) ? issue.message : "required"];
  }
  return out;
}

// ─── Matching (for the phase-4 price guide) ──────────────────

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
