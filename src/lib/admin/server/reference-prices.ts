import "server-only";
import type { Prisma } from "@/generated/prisma/client";
import type { DealType } from "@/generated/prisma/enums";
import { pickLocalized } from "@/i18n/locale";
import { db } from "@/lib/db";
import { pageInfo } from "../params";

/** Admin → Reference prices (server-only, "moderation"): the list, one row, and the form's choices. */

export const REFERENCE_PAGE_SIZE = 30;
export const REFERENCE_STATES = ["active", "inactive", "all"] as const;
export type ReferenceState = (typeof REFERENCE_STATES)[number];

const rowSelect = {
  id: true,
  countryCode: true,
  cityId: true,
  neighborhoodId: true,
  dealType: true,
  propertyType: true,
  bedrooms: true,
  unit: true,
  perSqm: true,
  low: true,
  high: true,
  currency: true,
  sourceName: true,
  sourceUrl: true,
  sourceMonth: true,
  note: true,
  active: true,
  createdById: true,
  createdAt: true,
  updatedAt: true,
  city: { select: { names: true, slug: true } },
  neighborhood: { select: { names: true } },
} satisfies Prisma.ReferencePriceSelect;

type Row = Prisma.ReferencePriceGetPayload<{ select: typeof rowSelect }>;

function present(row: Row, locale: string) {
  return {
    ...row,
    low: Number(row.low),
    high: Number(row.high),
    cityName: pickLocalized(row.city.names, locale) || row.city.slug,
    neighborhoodName: row.neighborhood ? pickLocalized(row.neighborhood.names, locale) || null : null,
  };
}

export type ReferencePriceRow = ReturnType<typeof present>;

export async function listReferencePrices(filters: { state: ReferenceState; cityId?: string; dealType?: DealType }, requestedPage: number, locale: string) {
  const where: Prisma.ReferencePriceWhereInput = {
    ...(filters.state === "all" ? {} : { active: filters.state === "active" }),
    ...(filters.cityId ? { cityId: filters.cityId } : {}),
    ...(filters.dealType ? { dealType: filters.dealType } : {}),
  };
  const [total, active, inactive] = await Promise.all([
    db.referencePrice.count({ where }),
    db.referencePrice.count({ where: { active: true } }),
    db.referencePrice.count({ where: { active: false } }),
  ]);
  const info = pageInfo(total, requestedPage, REFERENCE_PAGE_SIZE);
  const rows = await db.referencePrice.findMany({
    where,
    orderBy: [{ active: "desc" }, { sourceMonth: "desc" }, { updatedAt: "desc" }],
    skip: info.skip,
    take: REFERENCE_PAGE_SIZE,
    select: rowSelect,
  });
  return { total, page: info.page, counts: { active, inactive, all: active + inactive }, rows: rows.map((r) => present(r, locale)) };
}

export async function getReferencePrice(id: string, locale: string) {
  const row = await db.referencePrice.findUnique({ where: { id }, select: rowSelect });
  if (!row) return null;
  const by = row.createdById ? await db.user.findUnique({ where: { id: row.createdById }, select: { name: true } }) : null;
  return { ...present(row, locale), createdByName: by?.name ?? null };
}

/** Cities (with their neighborhoods) for the form, in the staff member's language. */
export async function referenceFormOptions(locale: string) {
  const cities = await db.city.findMany({
    orderBy: [{ sortOrder: "asc" }, { slug: "asc" }],
    select: { id: true, slug: true, names: true, neighborhoods: { orderBy: { slug: "asc" }, select: { id: true, slug: true, names: true } } },
  });
  return cities.map((c) => ({
    id: c.id,
    name: pickLocalized(c.names, locale) || c.slug,
    neighborhoods: c.neighborhoods.map((n) => ({ id: n.id, name: pickLocalized(n.names, locale) || n.slug })),
  }));
}

export type ReferenceFormCity = Awaited<ReturnType<typeof referenceFormOptions>>[number];
