/**
 * Demo Jewish-life map points (isDemo). They are clearly named sample points — never real names,
 * hours, phone numbers or claims — so the map, the "x min walk to a synagogue" badges and the
 * filters can be tried before admins add the real places.
 */
import type { Localized } from "@/config/site";
import type { JewishPlaceType, PrismaClient } from "@/generated/prisma/client";
import { L, assertLocalized } from "./lib";

type CityKey = "tbilisi" | "batumi" | "kutaisi";

const CITY_NAMES: Record<CityKey, Localized> = {
  tbilisi: L("טביליסי", "Tbilisi", "Тбилиси", "تبليسي", "თბილისი"),
  batumi: L("בטומי", "Batumi", "Батуми", "باتومي", "ბათუმი"),
  kutaisi: L("קוטאיסי", "Kutaisi", "Кутаиси", "كوتايسي", "ქუთაისი"),
};

const TYPE_NAMES: Record<JewishPlaceType, Localized> = {
  SYNAGOGUE: L("בית כנסת לדוגמה", "Demo synagogue", "Демо-синагога", "كنيس تجريبي", "სადემონსტრაციო სინაგოგა"),
  CHABAD_HOUSE: L("בית חב״ד לדוגמה", "Demo Chabad house", "Демо-дом Хабада", "بيت حاباد تجريبي", "სადემონსტრაციო ხაბადის სახლი"),
  KOSHER_RESTAURANT: L("מסעדה כשרה לדוגמה", "Demo kosher restaurant", "Демо-кошерный ресторан", "مطعم كوشير تجريبي", "სადემონსტრაციო კოშერული რესტორანი"),
  KOSHER_SHOP: L("חנות כשרה לדוגמה", "Demo kosher shop", "Демо-кошерный магазин", "متجر كوشير تجريبي", "სადემონსტრაციო კოშერული მაღაზია"),
  MIKVEH: L("מקווה לדוגמה", "Demo mikveh", "Демо-миква", "مِكفاه تجريبي", "სადემონსტრაციო მიკვე"),
  HERITAGE_SITE: L("אתר מורשת לדוגמה", "Demo heritage site", "Демо-объект наследия", "موقع تراثي تجريبي", "სადემონსტრაციო მემკვიდრეობის ძეგლი"),
};

const SAMPLE_POINT = L("נקודת הדגמה", "sample point", "пример", "نقطة نموذجية", "ნიმუში");

const DESCRIPTION = L(
  "זו נקודת הדגמה לבדיקת המפה ומרחקי ההליכה – לא מקום אמיתי. בדקו מקורות מקומיים לפני שאתם יוצאים.",
  "This is a sample point for trying the map and walking times – not a real place. Check local sources before you go.",
  "Это пример точки для проверки карты и времени пешком – не настоящее место. Перед визитом уточните в местных источниках.",
  "هذه نقطة نموذجية لتجربة الخريطة وأوقات المشي – وليست مكانًا حقيقيًا. تحقّق من المصادر المحلية قبل أن تذهب.",
  "ეს არის სადემონსტრაციო წერტილი რუკისა და ფეხით სავალი დროის შესამოწმებლად – არა რეალური ადგილი. წასვლამდე გადაამოწმეთ ადგილობრივ წყაროებში.",
);

/** "Demo synagogue — Tbilisi (sample point)" in every language. */
export function demoPlaceName(type: JewishPlaceType, city: CityKey): Localized {
  return Object.fromEntries(
    (Object.keys(TYPE_NAMES[type]) as (keyof Localized)[]).map((locale) => [
      locale,
      `${TYPE_NAMES[type][locale]} — ${CITY_NAMES[city][locale]} (${SAMPLE_POINT[locale]})`,
    ]),
  ) as Localized;
}

export type DemoPlaceSeed = {
  id: string;
  type: JewishPlaceType;
  city: CityKey;
  /** Neighborhood label for the address line ("Sample location, Old Tbilisi"). */
  area: Localized;
  lat: number;
  lng: number;
};

const AREA = {
  oldTbilisi: L("טביליסי העתיקה", "Old Tbilisi", "Старый Тбилиси", "تبليسي القديمة", "ძველი თბილისი"),
  sololaki: L("סולולאקי", "Sololaki", "Сололаки", "سولولاكي", "სოლოლაკი"),
  vake: L("ואקה", "Vake", "Ваке", "فاكي", "ვაკე"),
  saburtalo: L("סבורטלו", "Saburtalo", "Сабуртало", "سابورتالو", "საბურთალო"),
  oldBatumi: L("בטומי העתיקה", "Old Batumi", "Старый Батуми", "باتومي القديمة", "ძველი ბათუმი"),
  newBoulevard: L("הבולבר החדש", "New Boulevard", "Новый бульвар", "البوليفارد الجديد", "ახალი ბულვარი"),
  batumiCenter: L("מרכז בטומי", "Batumi Center", "Центр Батуми", "وسط باتومي", "ბათუმის ცენტრი"),
  kutaisiCenter: L("מרכז קוטאיסי", "Kutaisi Center", "Центр Кутаиси", "وسط كوتايسي", "ქუთაისის ცენტრი"),
};

export const DEMO_PLACES: DemoPlaceSeed[] = [
  { id: "demo-place-tbilisi-synagogue", type: "SYNAGOGUE", city: "tbilisi", area: AREA.oldTbilisi, lat: 41.6912, lng: 44.8058 },
  { id: "demo-place-tbilisi-chabad", type: "CHABAD_HOUSE", city: "tbilisi", area: AREA.vake, lat: 41.7101, lng: 44.7612 },
  { id: "demo-place-tbilisi-restaurant", type: "KOSHER_RESTAURANT", city: "tbilisi", area: AREA.sololaki, lat: 41.6929, lng: 44.8001 },
  { id: "demo-place-tbilisi-shop", type: "KOSHER_SHOP", city: "tbilisi", area: AREA.saburtalo, lat: 41.7251, lng: 44.7552 },
  { id: "demo-place-tbilisi-mikveh", type: "MIKVEH", city: "tbilisi", area: AREA.oldTbilisi, lat: 41.6898, lng: 44.8071 },
  { id: "demo-place-tbilisi-heritage", type: "HERITAGE_SITE", city: "tbilisi", area: AREA.oldTbilisi, lat: 41.6887, lng: 44.8102 },
  { id: "demo-place-batumi-synagogue", type: "SYNAGOGUE", city: "batumi", area: AREA.oldBatumi, lat: 41.6497, lng: 41.6402 },
  { id: "demo-place-batumi-chabad", type: "CHABAD_HOUSE", city: "batumi", area: AREA.newBoulevard, lat: 41.6271, lng: 41.6012 },
  { id: "demo-place-batumi-restaurant", type: "KOSHER_RESTAURANT", city: "batumi", area: AREA.batumiCenter, lat: 41.6418, lng: 41.6315 },
  { id: "demo-place-batumi-shop", type: "KOSHER_SHOP", city: "batumi", area: AREA.oldBatumi, lat: 41.6521, lng: 41.6359 },
  { id: "demo-place-kutaisi-synagogue", type: "SYNAGOGUE", city: "kutaisi", area: AREA.kutaisiCenter, lat: 42.2689, lng: 42.7021 },
  { id: "demo-place-kutaisi-heritage", type: "HERITAGE_SITE", city: "kutaisi", area: AREA.kutaisiCenter, lat: 42.2716, lng: 42.7068 },
  { id: "demo-place-kutaisi-shop", type: "KOSHER_SHOP", city: "kutaisi", area: AREA.kutaisiCenter, lat: 42.2731, lng: 42.7031 },
];

const SAMPLE_LOCATION = L("מיקום לדוגמה", "Sample location", "Условное место", "موقع نموذجي", "სანიმუშო მდებარეობა");

export async function seedJewishPlaces(db: PrismaClient, cityIds: Map<string, string>): Promise<number> {
  for (const place of DEMO_PLACES) {
    const names = demoPlaceName(place.type, place.city);
    const address = Object.fromEntries(
      (Object.keys(SAMPLE_LOCATION) as (keyof Localized)[]).map((l) => [l, `${SAMPLE_LOCATION[l]}, ${place.area[l]}`]),
    ) as Localized;
    assertLocalized(names, place.id);
    assertLocalized(address, `${place.id} address`);
    const data = {
      type: place.type,
      names,
      description: DESCRIPTION,
      address,
      cityId: cityIds.get(place.city) ?? null,
      lat: place.lat,
      lng: place.lng,
      phone: null,
      website: null,
      isDemo: true,
      active: true,
    };
    await db.jewishPlace.upsert({ where: { id: place.id }, create: { id: place.id, ...data }, update: data });
  }
  return DEMO_PLACES.length;
}
