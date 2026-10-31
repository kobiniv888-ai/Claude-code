/**
 * Cities (from src/config/site.ts) and their neighborhoods — real reference content, kept when
 * demo data is removed. Upserted by slug, so admin edits to other fields are overwritten only for
 * the fields seeded here.
 */
import { siteConfig, type Localized } from "@/config/site";
import type { PrismaClient } from "@/generated/prisma/client";
import { buildSearchText } from "@/lib/search-text";
import { L, assertLocalized } from "./lib";

export type NeighborhoodSeed = {
  slug: string;
  names: Localized;
  aliases?: string[];
  lat: number;
  lng: number;
};

/** Approximate centers. "center" is the town center of smaller places. */
export const NEIGHBORHOODS: Record<string, NeighborhoodSeed[]> = {
  tbilisi: [
    { slug: "vake", names: L("ואקה", "Vake", "Ваке", "فاكي", "ვაკე"), lat: 41.709, lng: 44.765 },
    { slug: "saburtalo", names: L("סבורטלו", "Saburtalo", "Сабуртало", "سابورتالو", "საბურთალო"), lat: 41.7265, lng: 44.753 },
    {
      slug: "old-tbilisi",
      names: L("טביליסי העתיקה", "Old Tbilisi", "Старый Тбилиси", "تبليسي القديمة", "ძველი თბილისი"),
      aliases: ["old town", "kala", "altstadt"],
      lat: 41.6905,
      lng: 44.8085,
    },
    { slug: "sololaki", names: L("סולולאקי", "Sololaki", "Сололаки", "سولولاكي", "სოლოლაკი"), lat: 41.692, lng: 44.798 },
    { slug: "vera", names: L("ורה", "Vera", "Вера", "فيرا", "ვერა"), lat: 41.7065, lng: 44.7845 },
    { slug: "mtatsminda", names: L("מטאצמינדה", "Mtatsminda", "Мтацминда", "متاتسميندا", "მთაწმინდა"), lat: 41.6955, lng: 44.792 },
    { slug: "vake-bagebi", names: L("ואקה-בגבי", "Vake-Bagebi", "Ваке-Багеби", "فاكي-باغيبي", "ვაკე-ბაგები"), aliases: ["bagebi"], lat: 41.7005, lng: 44.74 },
    { slug: "didube", names: L("דידובה", "Didube", "Дидубе", "ديدوبي", "დიდუბე"), lat: 41.7385, lng: 44.786 },
    { slug: "isani", names: L("איסאני", "Isani", "Исани", "إيساني", "ისანი"), lat: 41.689, lng: 44.835 },
    { slug: "avlabari", names: L("אבלברי", "Avlabari", "Авлабари", "أفلاباري", "ავლაბარი"), lat: 41.6935, lng: 44.8125 },
  ],
  batumi: [
    {
      slug: "old-batumi",
      names: L("בטומי העתיקה", "Old Batumi", "Старый Батуми", "باتومي القديمة", "ძველი ბათუმი"),
      aliases: ["old town"],
      lat: 41.6515,
      lng: 41.638,
    },
    {
      slug: "new-boulevard",
      names: L("הבולבר החדש", "New Boulevard", "Новый бульвар", "البوليفارد الجديد", "ახალი ბულვარი"),
      lat: 41.6255,
      lng: 41.5985,
    },
    { slug: "center", names: L("מרכז בטומי", "Batumi Center", "Центр Батуми", "وسط باتومي", "ბათუმის ცენტრი"), lat: 41.643, lng: 41.633 },
    {
      slug: "makhinjauri",
      names: L("מחינג׳אורי", "Makhinjauri", "Махинджаури", "ماخينجاوري", "მახინჯაური"),
      aliases: ["mahinjauri"],
      lat: 41.673,
      lng: 41.699,
    },
    { slug: "gonio", names: L("גוניו", "Gonio", "Гонио", "غونيو", "გონიო"), lat: 41.5615, lng: 41.574 },
  ],
  kutaisi: [
    { slug: "center", names: L("מרכז קוטאיסי", "Kutaisi Center", "Центр Кутаиси", "وسط كوتايسي", "ქუთაისის ცენტრი"), lat: 42.2705, lng: 42.705 },
    { slug: "balakhvani", names: L("בלחוואני", "Balakhvani", "Балахвани", "بالاخفاني", "ბალახვანი"), lat: 42.264, lng: 42.69 },
  ],
  gudauri: [
    { slug: "center", names: L("מרכז גודאורי", "Gudauri Center", "Центр Гудаури", "وسط غوداوري", "გუდაურის ცენტრი"), lat: 42.4775, lng: 44.4795 },
    { slug: "new-gudauri", names: L("גודאורי החדשה", "New Gudauri", "Новый Гудаури", "غوداوري الجديدة", "ახალი გუდაური"), lat: 42.462, lng: 44.473 },
  ],
  bakuriani: [
    { slug: "center", names: L("מרכז בקוריאני", "Bakuriani Center", "Центр Бакуриани", "وسط باكورياني", "ბაკურიანის ცენტრი"), lat: 41.75, lng: 43.531 },
    { slug: "didveli", names: L("דידוולי", "Didveli", "Дидвели", "ديدفيلي", "დიდველი"), lat: 41.737, lng: 43.517 },
  ],
  kobuleti: [
    { slug: "center", names: L("מרכז קובולטי", "Kobuleti Center", "Центр Кобулети", "وسط كوبوليتي", "ქობულეთის ცენტრი"), lat: 41.8214, lng: 41.7792 },
  ],
  borjomi: [
    { slug: "center", names: L("מרכז בורג׳ומי", "Borjomi Center", "Центр Боржоми", "وسط بورجومي", "ბორჯომის ცენტრი"), lat: 41.8394, lng: 43.3788 },
  ],
  kazbegi: [
    { slug: "center", names: L("מרכז קזבגי", "Kazbegi Center", "Центр Казбеги", "وسط كازبيجي", "ყაზბეგის ცენტრი"), lat: 42.6574, lng: 44.6433 },
  ],
  sighnaghi: [
    { slug: "center", names: L("מרכז סיגנאגי", "Sighnaghi Center", "Центр Сигнахи", "وسط سيغناغي", "სიღნაღის ცენტრი"), lat: 41.6205, lng: 45.9222 },
  ],
  mestia: [
    { slug: "center", names: L("מרכז מסטיה", "Mestia Center", "Центр Местиа", "وسط ميستيا", "მესტიის ცენტრი"), lat: 43.0453, lng: 42.7266 },
  ],
};

/** Public path of a city's cover photo (files in public/images/cities, credits in public/images/CREDITS.md). */
export function cityPhotoPath(slug: string): string {
  return `/images/cities/${slug}.webp`;
}

export type PlaceIds = {
  cities: Map<string, string>;
  /** "<citySlug>/<neighborhoodSlug>" → id */
  neighborhoods: Map<string, string>;
};

export async function seedPlaces(db: PrismaClient): Promise<PlaceIds> {
  const cities = new Map<string, string>();
  const neighborhoods = new Map<string, string>();

  for (const [index, city] of siteConfig.cities.entries()) {
    assertLocalized(city.names, `city ${city.slug}`);
    const data = {
      names: city.names,
      searchText: buildSearchText(city.names, city.aliases),
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
