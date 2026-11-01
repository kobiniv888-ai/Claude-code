/**
 * The site's photo slots (client-safe). Every photo that is not a listing photo lives here:
 * the home hero slideshow, city tiles, category tiles, the "list your property" call to action
 * and the Jewish-life photos.
 *
 * - Files: public/photos/<group>/<name>.webp. Size, blur placeholder and credit of each file are
 *   in ./photos-manifest.json, written by scripts/photos/*.mjs and scripts/fetch-wikimedia-photos.sh.
 * - A slot whose file is not in the manifest (yet) resolves to its `fallback` slot, or to a styled
 *   "photo coming soon" placeholder (<PhotoSlot> renders it). PHOTOS_NEEDED.md lists what each
 *   slot should show, so real photos can replace the stock ones later.
 *
 *   <PhotoSlot slot="hero.tbilisi" sizes="100vw" priority className="h-[70svh]" />
 *   const photo = resolvePhoto("category.shabbat");   // { kind: "photo", src, width, … } | { kind: "placeholder", … }
 */
import manifest from "./photos-manifest.json";

export type PhotoCredit = {
  /** What the photo shows (English, as on the source page). */
  title: string;
  author: string;
  /** The page of the photo (Unsplash, Pexels, Wikimedia Commons). */
  source: string;
  license: string;
  licenseUrl: string;
};

export type PhotoFile = {
  width: number;
  height: number;
  bytes: number;
  /** ~16 px WebP data URL for next/image placeholder="blur". */
  blurDataURL: string;
  credit?: PhotoCredit;
};

type SlotDef = {
  /** Public path of the file. */
  src: string;
  /** Used when this slot's file is missing (e.g. a Wikimedia photo not downloaded yet). */
  fallback?: string;
  /** For PHOTOS_NEEDED.md: what the photo should show, its shape and where it appears. */
  shows: string;
  ratio: string;
  minSize: string;
  usedIn: string;
};

const hero = (src: string, shows: string): SlotDef => ({
  src,
  shows,
  ratio: "3:2 (cropped to the screen, keep the subject in the middle)",
  minSize: "2400×1600",
  usedIn: "Home page hero slideshow",
});
const city = (slug: string, name: string): SlotDef => ({
  src: `/photos/cities/${slug}.webp`,
  shows: `${name}: a recognisable view of the town, no people as the subject`,
  ratio: "3:4 tile (cropped from a 3:2 landscape photo)",
  minSize: "1200×800",
  usedIn: "Home page \"Where to?\" city cards, search and city pages (City.photoUrl)",
});
const category = (src: string, shows: string): SlotDef => ({
  src,
  shows,
  ratio: "4:3 tile",
  minSize: "1200×900",
  usedIn: "Home page category tiles",
});

export const PHOTO_SLOTS = {
  "hero.tbilisi": hero("/photos/hero/tbilisi.webp", "Tbilisi old town: Narikala fortress, the old roofs or the carved wooden balconies"),
  "hero.batumi": hero("/photos/hero/batumi.webp", "Batumi seafront: the bay, the boulevard and the mountains"),
  "hero.kazbegi": hero("/photos/hero/kazbegi.webp", "Kazbegi: Gergeti Trinity Church below snowy Mount Kazbek"),
  "hero.gudauri": hero("/photos/hero/gudauri.webp", "Gudauri or Bakuriani in winter: snowy slopes and chalets"),
  "hero.sighnaghi": hero("/photos/hero/sighnaghi.webp", "Sighnaghi: terracotta roofs above the Alazani valley"),
  "hero.mestia": hero("/photos/hero/mestia.webp", "Mestia: the Svan towers with the Caucasus behind"),
  "hero.borjomi": hero("/photos/hero/borjomi.webp", "Borjomi: the green valley and the town"),

  "city.tbilisi": city("tbilisi", "Tbilisi"),
  "city.batumi": city("batumi", "Batumi"),
  "city.kutaisi": city("kutaisi", "Kutaisi"),
  "city.kobuleti": city("kobuleti", "Kobuleti"),
  "city.gudauri": city("gudauri", "Gudauri"),
  "city.bakuriani": city("bakuriani", "Bakuriani"),
  "city.borjomi": city("borjomi", "Borjomi"),
  "city.kazbegi": city("kazbegi", "Kazbegi (Stepantsminda)"),
  "city.sighnaghi": city("sighnaghi", "Sighnaghi"),
  "city.mestia": city("mestia", "Mestia"),

  "category.apartments": category("/photos/categories/apartments.webp", "A bright, inviting apartment living room"),
  "category.houses": category("/photos/categories/houses.webp", "A house or villa with a garden"),
  "category.rooms": category("/photos/categories/rooms.webp", "A cosy bedroom"),
  "category.hotels": category("/photos/categories/hotels.webp", "A hotel or guesthouse room"),
  "category.sale": category("/photos/categories/sale.webp", "A residential building (homes for sale)"),
  "category.shabbat": category("/photos/categories/shabbat.webp", "A Shabbat table: candlesticks, challah, kiddush cup, no people"),

  "cta.listYourProperty": {
    src: "/photos/cta/list-your-property.webp",
    shows: "A welcoming home detail: a balcony, a door with keys, a set table — no people, no logos",
    ratio: "4:3 or 3:4 (card background)",
    minSize: "1600×1200",
    usedIn: "Home page \"List your property for free\" card",
  },

  "jewish.tbilisiSynagogue": {
    src: "/photos/jewish/tbilisi-great-synagogue.webp",
    shows: "The Great Synagogue of Tbilisi (outside), no police cars or flags",
    ratio: "3:2",
    minSize: "1920×1280",
    usedIn: "Jewish life page hero and the home page \"Jewish life in Georgia\" band",
  },
  "jewish.batumiSynagogue": {
    src: "/photos/jewish/batumi-synagogue.webp",
    shows: "The Batumi synagogue (outside)",
    ratio: "3:2",
    minSize: "1920×1280",
    usedIn: "Home page \"Jewish life in Georgia\" band and the Jewish life page",
  },
  "jewish.synagogueInterior": {
    src: "/photos/jewish/synagogue-interior.webp",
    fallback: "jewish.challah",
    shows: "Inside a Georgian synagogue (the ark, the bimah), without congregants",
    ratio: "3:2",
    minSize: "1920×1280",
    usedIn: "Jewish life page (synagogues section)",
  },
  "jewish.challah": {
    src: "/photos/jewish/challah.webp",
    shows: "Challah for Shabbat (stock photo, shown until the synagogue interior photo arrives)",
    ratio: "3:2",
    minSize: "1600×1067",
    usedIn: "Fallback for the synagogue interior",
  },
  "jewish.kosherFood": {
    src: "/photos/jewish/kosher-food.webp",
    shows: "Kosher food in Georgia: a kosher shop shelf or a dish — no restaurant names or logos",
    ratio: "3:2",
    minSize: "1600×1067",
    usedIn: "Jewish life page (kosher food section)",
  },
  "jewish.community": {
    src: "/photos/jewish/community.webp",
    shows: "Jewish community life in Georgia (a Shabbat table, a Chabad house building) — no faces as the subject",
    ratio: "3:2",
    minSize: "1600×1067",
    usedIn: "Jewish life page (community section)",
  },
} as const satisfies Record<string, SlotDef>;

export type PhotoSlotKey = keyof typeof PHOTO_SLOTS;

/** The home hero slideshow, in order (the first one is the LCP image: give it priority). */
export const HERO_SLIDES = [
  "hero.tbilisi",
  "hero.batumi",
  "hero.kazbegi",
  "hero.gudauri",
  "hero.sighnaghi",
  "hero.mestia",
  "hero.borjomi",
] as const satisfies readonly PhotoSlotKey[];

const FILES = manifest as Record<string, PhotoFile>;

/** Size, blur and credit of a file under public/ ("/photos/cities/batumi.webp"), or null when it is missing. */
export function photoFile(src: string): PhotoFile | null {
  return FILES[src] ?? null;
}

export type ResolvedPhoto =
  | { kind: "photo"; slot: PhotoSlotKey; src: string; width: number; height: number; blurDataURL: string; credit: PhotoCredit | null }
  | { kind: "placeholder"; slot: PhotoSlotKey };

/** The slot's photo, its fallback's photo, or a placeholder. */
export function resolvePhoto(slot: PhotoSlotKey): ResolvedPhoto {
  const seen = new Set<string>();
  let key: string | undefined = slot;
  while (key && !seen.has(key)) {
    seen.add(key);
    const def: SlotDef | undefined = (PHOTO_SLOTS as Record<string, SlotDef>)[key];
    if (!def) break;
    const file = photoFile(def.src);
    if (file) {
      return {
        kind: "photo",
        slot: key as PhotoSlotKey,
        src: def.src,
        width: file.width,
        height: file.height,
        blurDataURL: file.blurDataURL,
        credit: file.credit ?? null,
      };
    }
    key = def.fallback;
  }
  return { kind: "placeholder", slot };
}

/** The photo of a city slug ("city.batumi"), for the city tiles. */
export function citySlot(slug: string): PhotoSlotKey | null {
  const key = `city.${slug}`;
  return key in PHOTO_SLOTS ? (key as PhotoSlotKey) : null;
}

/** Every file in the manifest with a credit (for the photo credits page). */
export function creditedPhotos(): { src: string; credit: PhotoCredit }[] {
  return Object.entries(FILES)
    .filter((entry): entry is [string, PhotoFile & { credit: PhotoCredit }] => !!entry[1].credit)
    .map(([src, file]) => ({ src, credit: file.credit }));
}
