/**
 * The gazetteer: every Georgian city and neighborhood the site knows, in all five languages, plus
 * the other spellings people type (באטומי/בטומי, Batum, Tiflis, ტფილისი…). Static, client-safe
 * and small (~5 KB), so "where?" suggestions are instant without a server round trip
 * (src/lib/places-match.ts). It is also the ONE source the database seed reads
 * (prisma/seed/places.ts) — slugs here are the slugs in the City/Neighborhood tables.
 *
 * Cities themselves (names, coordinates, time zones, airports) live in siteConfig.cities; this file
 * adds their extra spellings and their neighborhoods.
 */
import { siteConfig, type Localized } from "./site";

export type GazetteerNeighborhood = {
  slug: string;
  names: Localized;
  /** Extra spellings (any language, any case). */
  aliases?: string[];
  lat: number;
  lng: number;
};

export type GazetteerCity = {
  slug: string;
  names: Localized;
  aliases: string[];
  lat: number;
  lng: number;
  popular: boolean;
  neighborhoods: GazetteerNeighborhood[];
};

function L(he: string, en: string, ru: string, ar: string, ka: string): Localized {
  return { he, en, ru, ar, ka };
}

/**
 * Spellings people type besides the official names (merged with siteConfig.cities[].aliases).
 * Hebrew transliterations vary a lot (with or without א/ו/ת), Russian/Georgian have historic names.
 */
export const CITY_ALIASES: Record<string, string[]> = {
  tbilisi: ["טיביליסי", "תביליסי", "טבליסי", "טפליס", "tbilisy", "tiflis", "Тифлис", "ტფილისი", "تفليس"],
  batumi: ["באטומי", "בטום", "באטום", "batum", "batoumi", "Батум", "باطومي"],
  kutaisi: ["קותאיסי", "כותאיסי", "kutaissi", "kutais", "Кутаис"],
  kobuleti: ["קובולתי", "kobuleti", "kobulety", "Кобулеты"],
  gudauri: ["gudaury", "Гудаур"],
  bakuriani: ["באקוריאני", "בקוריאנה", "bakurjani", "Бакуриан"],
  borjomi: ["בורז׳ומי", "בורז'ומי", "בורגומי", "borzhomi", "borjom", "Боржом"],
  kazbegi: ["סטפנצמינדה", "קזבק", "kazbek", "stepantsminda", "Степанцминда", "Казбек", "სტეფანწმინდა"],
  sighnaghi: ["סיגנגי", "סיגנאחי", "signagi", "sighnagi", "signakhi", "Сигнаги"],
  mestia: ["מסטיא", "mestiya", "Местия"],
};

/** Approximate centers. "center" is the town center of smaller places. */
export const NEIGHBORHOODS: Record<string, GazetteerNeighborhood[]> = {
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

export const GAZETTEER: readonly GazetteerCity[] = siteConfig.cities.map((city) => ({
  slug: city.slug,
  names: city.names,
  aliases: [...new Set([...city.aliases, ...(CITY_ALIASES[city.slug] ?? [])])],
  lat: city.lat,
  lng: city.lng,
  popular: city.popular,
  neighborhoods: NEIGHBORHOODS[city.slug] ?? [],
}));
