import "server-only";
import type { AppLocale, Localized } from "@/config/site";
import { db } from "@/lib/db";
import { pickLocalized } from "@/i18n/locale";
import { matchScore, normalizeSearchText, splitSearchText } from "@/lib/search-text";

/**
 * Cities and neighborhoods (server-only), cached in memory (5 minutes in production).
 * Names are { he, en, ru, ar, ka }; search works in any of the five languages and aliases:
 * Tbilisi = טביליסי = Тбилиси = تبليسي = თბილისი.
 * Call clearPlacesCache() after an admin edits cities or neighborhoods.
 */

export { normalizeSearchText, buildSearchText } from "@/lib/search-text";

export type CityRecord = {
  id: string;
  slug: string;
  countryCode: string;
  names: Localized;
  lat: number;
  lng: number;
  timezone: string;
  photoUrl: string | null;
  isPopular: boolean;
  sortOrder: number;
  airportCode: string | null;
  airportLat: number | null;
  airportLng: number | null;
};

export type NeighborhoodRecord = {
  id: string;
  cityId: string;
  slug: string;
  names: Localized;
  lat: number;
  lng: number;
  sortOrder: number;
};

export type PlaceSearchResult = {
  type: "city" | "neighborhood";
  id: string;
  /** City slug for a city; neighborhood slug for a neighborhood. */
  slug: string;
  citySlug: string;
  name: string;
  /** The neighborhood's city (null for cities). */
  cityName: string | null;
  lat: number;
  lng: number;
};

type PlacesData = {
  cities: CityRecord[];
  neighborhoods: NeighborhoodRecord[];
  /** Normalized searchable names per place id. */
  terms: Map<string, string[]>;
};

const CACHE_MS = process.env.NODE_ENV === "production" ? 5 * 60_000 : 5_000;
let cache: { data: PlacesData; at: number } | null = null;
let loading: Promise<PlacesData> | null = null;

function asLocalized(value: unknown): Localized {
  const record = (value && typeof value === "object" ? value : {}) as Partial<Localized>;
  const fallback = record.en ?? Object.values(record).find((v) => typeof v === "string") ?? "";
  return {
    he: record.he || fallback,
    en: record.en || fallback,
    ru: record.ru || fallback,
    ar: record.ar || fallback,
    ka: record.ka || fallback,
  };
}

function searchTerms(names: Localized, searchText: string, slug: string): string[] {
  const terms = new Set<string>([...Object.values(names).map(normalizeSearchText), ...splitSearchText(searchText)]);
  terms.add(normalizeSearchText(slug.replace(/-/g, " ")));
  terms.delete("");
  return [...terms];
}

async function loadPlaces(): Promise<PlacesData> {
  const [cityRows, neighborhoodRows] = await Promise.all([
    db.city.findMany({ where: { active: true }, orderBy: [{ sortOrder: "asc" }, { slug: "asc" }] }),
    db.neighborhood.findMany({
      where: { active: true, city: { active: true } },
      orderBy: [{ sortOrder: "asc" }, { slug: "asc" }],
    }),
  ]);

  const terms = new Map<string, string[]>();
  const cities: CityRecord[] = cityRows.map((c) => {
    const names = asLocalized(c.names);
    terms.set(c.id, searchTerms(names, c.searchText, c.slug));
    return {
      id: c.id,
      slug: c.slug,
      countryCode: c.countryCode,
      names,
      lat: c.lat,
      lng: c.lng,
      timezone: c.timezone,
      photoUrl: c.photoUrl,
      isPopular: c.isPopular,
      sortOrder: c.sortOrder,
      airportCode: c.airportCode,
      airportLat: c.airportLat,
      airportLng: c.airportLng,
    };
  });
  const neighborhoods: NeighborhoodRecord[] = neighborhoodRows.map((n) => {
    const names = asLocalized(n.names);
    terms.set(n.id, searchTerms(names, n.searchText, n.slug));
    return { id: n.id, cityId: n.cityId, slug: n.slug, names, lat: n.lat, lng: n.lng, sortOrder: n.sortOrder };
  });
  return { cities, neighborhoods, terms };
}

async function places(): Promise<PlacesData> {
  if (cache && Date.now() - cache.at < CACHE_MS) return cache.data;
  if (!loading) {
    loading = loadPlaces()
      .then((data) => {
        cache = { data, at: Date.now() };
        return data;
      })
      .finally(() => {
        loading = null;
      });
  }
  try {
    return await loading;
  } catch (error) {
    if (cache) {
      console.error("[places] reload failed, serving the previous list:", error);
      return cache.data;
    }
    throw error;
  }
}

export function clearPlacesCache() {
  cache = null;
}

/** Active cities, in admin order. */
export async function getCities(): Promise<CityRecord[]> {
  return (await places()).cities;
}

export async function getCityBySlug(slug: string): Promise<CityRecord | null> {
  return (await places()).cities.find((c) => c.slug === slug) ?? null;
}

export async function getCityById(id: string): Promise<CityRecord | null> {
  return (await places()).cities.find((c) => c.id === id) ?? null;
}

/** Active neighborhoods of a city, in admin order. */
export async function getNeighborhoods(cityId: string): Promise<NeighborhoodRecord[]> {
  return (await places()).neighborhoods.filter((n) => n.cityId === cityId);
}

export async function getNeighborhoodBySlug(citySlug: string, slug: string): Promise<NeighborhoodRecord | null> {
  const data = await places();
  const city = data.cities.find((c) => c.slug === citySlug);
  if (!city) return null;
  return data.neighborhoods.find((n) => n.cityId === city.id && n.slug === slug) ?? null;
}

function bestScore(terms: string[] | undefined, query: string): number {
  let best = 0;
  for (const term of terms ?? []) best = Math.max(best, matchScore(term, query));
  return best;
}

/**
 * City and neighborhood suggestions for the "Where" box, in any language.
 * Exact and prefix matches first; cities before neighborhoods with the same score.
 */
export async function searchPlaces(query: string, locale: AppLocale, limit = 8): Promise<PlaceSearchResult[]> {
  const q = normalizeSearchText(query).slice(0, 80);
  if (!q) return [];
  const data = await places();
  const citiesById = new Map(data.cities.map((c) => [c.id, c]));

  const scored: { score: number; order: number; result: PlaceSearchResult }[] = [];
  data.cities.forEach((city, index) => {
    const score = bestScore(data.terms.get(city.id), q);
    if (score === 0) return;
    scored.push({
      score: score + 6 + (city.isPopular ? 3 : 0),
      order: index,
      result: {
        type: "city",
        id: city.id,
        slug: city.slug,
        citySlug: city.slug,
        name: pickLocalized(city.names, locale),
        cityName: null,
        lat: city.lat,
        lng: city.lng,
      },
    });
  });
  data.neighborhoods.forEach((n, index) => {
    const city = citiesById.get(n.cityId);
    if (!city) return;
    const score = bestScore(data.terms.get(n.id), q);
    if (score === 0) return;
    scored.push({
      score,
      order: data.cities.length + index,
      result: {
        type: "neighborhood",
        id: n.id,
        slug: n.slug,
        citySlug: city.slug,
        name: pickLocalized(n.names, locale),
        cityName: pickLocalized(city.names, locale),
        lat: n.lat,
        lng: n.lng,
      },
    });
  });

  return scored
    .sort((a, b) => b.score - a.score || a.order - b.order)
    .slice(0, Math.max(1, Math.min(limit, 50)))
    .map((s) => s.result);
}
