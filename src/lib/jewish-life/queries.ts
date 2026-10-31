import "server-only";
import { cache } from "react";
import type { Prisma } from "@/generated/prisma/client";
import type { JewishPlaceType } from "@/generated/prisma/enums";
import { siteConfig, type AppLocale } from "@/config/site";
import { pickLocalized } from "@/i18n/locale";
import { db } from "@/lib/db";
import { getCities } from "@/lib/places";
import { getSettings } from "@/lib/settings";
import { EMERGENCY_CONTACTS_SETTING_KEY, parseEmergencyContacts, type EmergencyContact } from "./emergency";
import type { JewishPlaceRecord } from "./places";

/**
 * Jewish Life data (server-only).
 *
 *   await getJewishPlaces()                                   // every visible place
 *   await getJewishPlaces({ cityId, types: ["SYNAGOGUE"] })   // e.g. synagogues of one city
 *   await getCitiesWithPlaces()                               // cities for the city selector
 *
 * Only active places are returned; demo places (isDemo) only while the admin setting
 * "demo data visible" is on. Places are added by admins/editors only.
 */

export type JewishPlaceFilter = {
  cityId?: string;
  types?: readonly JewishPlaceType[];
};

async function visibleWhere(filter: JewishPlaceFilter = {}): Promise<Prisma.JewishPlaceWhereInput> {
  const settings = await getSettings();
  const where: Prisma.JewishPlaceWhereInput = { active: true };
  if (!settings.demoDataVisible) where.isDemo = false;
  if (filter.cityId) where.cityId = filter.cityId;
  if (filter.types && filter.types.length > 0) where.type = { in: [...filter.types] };
  return where;
}

const placeSelect = {
  id: true,
  type: true,
  names: true,
  description: true,
  address: true,
  hours: true,
  lat: true,
  lng: true,
  phone: true,
  website: true,
  isDemo: true,
  city: { select: { id: true, slug: true, names: true } },
} satisfies Prisma.JewishPlaceSelect;

/** Visible Jewish places (synagogues, Chabad houses, kosher food, mikvaot, heritage sites). */
export async function getJewishPlaces(filter: JewishPlaceFilter = {}): Promise<JewishPlaceRecord[]> {
  const rows = await db.jewishPlace.findMany({
    where: await visibleWhere(filter),
    select: placeSelect,
    orderBy: [{ isDemo: "asc" }, { createdAt: "asc" }],
    take: 1000,
  });
  return rows;
}

export type CityWithPlaces = {
  id: string;
  slug: string;
  names: unknown;
  lat: number;
  lng: number;
  timezone: string;
  placeCount: number;
};

/** Active cities that have at least one visible place, in admin order. */
export async function getCitiesWithPlaces(): Promise<CityWithPlaces[]> {
  const where = await visibleWhere();
  const groups = await db.jewishPlace.groupBy({
    by: ["cityId"],
    where: { ...where, cityId: { not: null } },
    _count: { _all: true },
  });
  const counts = new Map<string, number>();
  for (const group of groups) if (group.cityId) counts.set(group.cityId, group._count._all);
  if (counts.size === 0) return [];

  const cities = await db.city.findMany({
    where: { id: { in: [...counts.keys()] }, active: true },
    select: { id: true, slug: true, names: true, lat: true, lng: true, timezone: true },
    orderBy: [{ sortOrder: "asc" }, { slug: "asc" }],
  });
  return cities.map((city) => ({ ...city, placeCount: counts.get(city.id) ?? 0 }));
}

export type ShabbatCity = {
  slug: string;
  /** In the visitor's language. */
  name: string;
  lat: number;
  lng: number;
  timezone: string;
};

/**
 * Cities for Shabbat times and the calendar: the active cities from the database, in admin order
 * (before the database is seeded, the starting cities from src/config/site.ts).
 */
export const getShabbatCities = cache(async (locale: AppLocale): Promise<ShabbatCity[]> => {
  let cities: Awaited<ReturnType<typeof getCities>> = [];
  try {
    cities = await getCities();
  } catch (error) {
    console.error("[jewish-life] could not load cities, using the configured list:", error);
  }
  if (cities.length > 0) {
    return cities.map((c) => ({
      slug: c.slug,
      name: pickLocalized(c.names, locale),
      lat: c.lat,
      lng: c.lng,
      timezone: c.timezone,
    }));
  }
  return siteConfig.cities.map((c) => ({
    slug: c.slug,
    name: c.names[locale] ?? c.names.en,
    lat: c.lat,
    lng: c.lng,
    timezone: c.timezone,
  }));
});

/** Emergency and embassy contacts entered by admins (SiteSetting "emergencyContacts"); [] when none. */
export const getEmergencyContacts = cache(async (): Promise<EmergencyContact[]> => {
  const row = await db.siteSetting.findUnique({
    where: { key: EMERGENCY_CONTACTS_SETTING_KEY },
    select: { value: true },
  });
  return row ? parseEmergencyContacts(row.value) : [];
});

export type GuideSummary = {
  slug: string;
  category: string;
  title: string;
  excerpt: string | null;
  coverUrl: string | null;
  reviewedByLawyer: boolean;
  publishedAt: Date | null;
};

/** Published guide articles (Phase 2 — only used while siteConfig.features.articles is on). */
export async function getPublishedGuides(locale: AppLocale, limit = 12): Promise<GuideSummary[]> {
  if (!siteConfig.features.articles) return [];
  const rows = await db.article.findMany({
    where: { status: "PUBLISHED", publishedAt: { lte: new Date() } },
    select: {
      slug: true,
      category: true,
      title: true,
      excerpt: true,
      coverUrl: true,
      reviewedByLawyer: true,
      publishedAt: true,
    },
    orderBy: { publishedAt: "desc" },
    take: limit,
  });
  return rows.map((row) => ({
    slug: row.slug,
    category: row.category,
    title: pickLocalized(row.title, locale),
    excerpt: row.excerpt ? pickLocalized(row.excerpt, locale) || null : null,
    coverUrl: row.coverUrl,
    reviewedByLawyer: row.reviewedByLawyer,
    publishedAt: row.publishedAt,
  }));
}

export type GuideArticle = GuideSummary & { body: string };

/** One published guide by slug, or null. */
export async function getPublishedGuide(slug: string, locale: AppLocale): Promise<GuideArticle | null> {
  if (!siteConfig.features.articles) return null;
  const row = await db.article.findFirst({
    where: { slug, status: "PUBLISHED", publishedAt: { lte: new Date() } },
  });
  if (!row) return null;
  return {
    slug: row.slug,
    category: row.category,
    title: pickLocalized(row.title, locale),
    excerpt: row.excerpt ? pickLocalized(row.excerpt, locale) || null : null,
    coverUrl: row.coverUrl,
    reviewedByLawyer: row.reviewedByLawyer,
    publishedAt: row.publishedAt,
    body: pickLocalized(row.body, locale),
  };
}
