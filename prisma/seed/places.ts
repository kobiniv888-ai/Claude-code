/**
 * Cities (from src/config/site.ts) and their neighborhoods — real reference content, kept when
 * demo data is removed. Upserted by slug, so admin edits to other fields are overwritten only for
 * the fields seeded here.
 */
import { GAZETTEER, NEIGHBORHOODS as GAZETTEER_NEIGHBORHOODS } from "@/config/places";
import { siteConfig, type Localized } from "@/config/site";
import type { PrismaClient } from "@/generated/prisma/client";
import { buildSearchText } from "@/lib/search-text";
import { assertLocalized } from "./lib";

export type NeighborhoodSeed = {
  slug: string;
  names: Localized;
  aliases?: string[];
  lat: number;
  lng: number;
};

/** Neighborhoods come from the gazetteer (src/config/places.ts), the one list the site also searches. */
export const NEIGHBORHOODS: Record<string, NeighborhoodSeed[]> = GAZETTEER_NEIGHBORHOODS;

/** Public path of a city's cover photo (files in public/photos/cities, credits in public/photos/CREDITS.md). */
export function cityPhotoPath(slug: string): string {
  return `/photos/cities/${slug}.webp`;
}

export type PlaceIds = {
  cities: Map<string, string>;
  /** "<citySlug>/<neighborhoodSlug>" → id */
  neighborhoods: Map<string, string>;
};

export async function seedPlaces(db: PrismaClient): Promise<PlaceIds> {
  const cities = new Map<string, string>();
  const neighborhoods = new Map<string, string>();

  const aliasesBySlug = new Map(GAZETTEER.map((place) => [place.slug, place.aliases]));
  for (const [index, city] of siteConfig.cities.entries()) {
    assertLocalized(city.names, `city ${city.slug}`);
    const data = {
      names: city.names,
      searchText: buildSearchText(city.names, aliasesBySlug.get(city.slug) ?? city.aliases),
      lat: city.lat,
      lng: city.lng,
      timezone: city.timezone,
      photoUrl: cityPhotoPath(city.slug),
      airportCode: city.airport.code,
      airportLat: city.airport.lat,
      airportLng: city.airport.lng,
      isPopular: city.popular,
      sortOrder: index,
    };
    const row = await db.city.upsert({
      where: { slug: city.slug },
      create: { slug: city.slug, countryCode: "GE", active: true, ...data },
      update: data,
      select: { id: true },
    });
    cities.set(city.slug, row.id);

    for (const [order, hood] of (NEIGHBORHOODS[city.slug] ?? []).entries()) {
      assertLocalized(hood.names, `neighborhood ${city.slug}/${hood.slug}`);
      const hoodData = {
        names: hood.names,
        searchText: buildSearchText(hood.names, hood.aliases ?? []),
        lat: hood.lat,
        lng: hood.lng,
        sortOrder: order,
      };
      const saved = await db.neighborhood.upsert({
        where: { cityId_slug: { cityId: row.id, slug: hood.slug } },
        create: { cityId: row.id, slug: hood.slug, active: true, ...hoodData },
        update: hoodData,
        select: { id: true },
      });
      neighborhoods.set(`${city.slug}/${hood.slug}`, saved.id);
    }
  }
  return { cities, neighborhoods };
}
