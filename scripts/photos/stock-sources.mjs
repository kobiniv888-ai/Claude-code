/**
 * Free stock photos for the site's photo slots (Unsplash License / Pexels License: free to use,
 * no attribution required — we credit them anyway). Every photo was checked by eye: real photo
 * (not AI), the right place, no people as the subject, no logos or watermarks, not an Unsplash+
 * (premium) photo. To replace one, change it here and run: node scripts/photos/fetch-stock-photos.mjs --force
 *
 * City photos come from Wikimedia Commons (see CITY_PHOTOS); synagogue photos are fetched by
 * scripts/fetch-wikimedia-photos.sh (Wikimedia blocks some servers).
 */
import { LICENSES } from "./lib.mjs";

const unsplash = (id, slug, author, title) => ({
  url: `https://images.unsplash.com/${id}?w=2400&q=85&fm=jpg`,
  credit: { title, author, source: `https://unsplash.com/photos/${slug}`, license: LICENSES.unsplash.name, licenseUrl: LICENSES.unsplash.url },
});
const pexels = (id, author, title) => ({
  url: `https://images.pexels.com/photos/${id}/pexels-photo-${id}.jpeg?auto=compress&cs=tinysrgb&w=2400`,
  credit: { title, author, source: `https://www.pexels.com/photo/${id}/`, license: LICENSES.pexels.name, licenseUrl: LICENSES.pexels.url },
});

/** path under public/ → source. size "hero" = up to 2400 px wide. */
export const STOCK_PHOTOS = {
  // Home hero slideshow
  "/photos/hero/tbilisi.webp": { size: "hero", ...unsplash("photo-1696878833169-56cadf9fc477", "W6PQKa74oME", "Khrystyna Miskevych", "Narikala fortress above the roofs of Old Tbilisi") },
  "/photos/hero/batumi.webp": { size: "hero", ...unsplash("photo-1632751528465-be2aa8646d41", "hczaARWyIa0", "Moon Moons", "Batumi bay, the city and the mountains") },
  "/photos/hero/kazbegi.webp": { size: "hero", ...unsplash("photo-1563284223-333497472e88", "5iQWgow3_S0", "Iman Gozal", "Gergeti Trinity Church below snowy Mount Kazbek") },
  "/photos/hero/gudauri.webp": { size: "hero", ...unsplash("photo-1546706442-373624e9c90b", "56Q7NasRWrc", "Vruyr Martirosyan", "Chalets of New Gudauri in winter") },
  "/photos/hero/sighnaghi.webp": { size: "hero", ...unsplash("photo-1756753226092-d1728fc63da7", "vn-KT5CsLOY", "NOMAD GULL", "Terracotta roofs and a bell tower in Sighnaghi") },
  "/photos/hero/mestia.webp": { size: "hero", ...unsplash("photo-1643140823513-12363657fe8d", "akB2NtavKfA", "Marek Piwnicki", "Svan towers in Mestia at sunset") },
  "/photos/hero/borjomi.webp": { size: "hero", ...unsplash("photo-1635191126434-9d2f74595e8a", "MV9nrfiTcV4", "David Kapanadze", "The Borjomi valley at sunset") },

  // Home category tiles
  "/photos/categories/apartments.webp": unsplash("photo-1665249934445-1de680641f50", "AgK_XAqSbfk", "Danilo Rios", "A bright living room in an apartment"),
  "/photos/categories/houses.webp": unsplash("photo-1416331108676-a22ccb276e35", "KtOid0FLjqU", "Vita Vilcina", "A house with a garden"),
  "/photos/categories/rooms.webp": unsplash("photo-1675409145919-277c0fc2aa7d", "EYoK3eVKIiQ", "Natalia Gusakova", "A cosy bedroom"),
  "/photos/categories/hotels.webp": unsplash("photo-1611892440504-42a792e24d32", "T5pL6ciEn-I", "visualsofdana", "A hotel room"),
  "/photos/categories/sale.webp": unsplash("photo-1519380400109-9ef80d934359", "87jHTTqQ4os", "Bernard Hermant", "A new apartment building with balconies"),
  "/photos/categories/shabbat.webp": pexels("9241890", "RDNE Stock project", "A Shabbat table with candlesticks, challah cover and a kiddush cup"),

  // "List your property for free" call to action
  "/photos/cta/list-your-property.webp": unsplash("photo-1695319132760-d93566d1a179", "Mna0m2pF4q0", "Valeria V", "An old wooden balcony with a table"),

  // Jewish life (shown until the synagogue photos from Wikimedia Commons are added)
  "/photos/jewish/challah.webp": unsplash("photo-1775172258063-8f20e384503c", "LDXu5N0W82k", "Jing Wang", "A braided challah for Shabbat"),
};

const commons = (file, author, licenseKey, title) => ({
  title,
  author,
  source: `https://commons.wikimedia.org/wiki/File:${file}`,
  license: LICENSES[licenseKey].name,
  licenseUrl: LICENSES[licenseKey].url,
});

/** City tiles: Wikimedia Commons files (already optimized: 1200 px, WebP q72) and their credits. */
export const CITY_PHOTOS = {
  "/photos/cities/tbilisi.webp": commons("Looking_out_towards_the_Mother_of_Georgia_statue_(29707092441).jpg", "shankar s. (Dubai, UAE)", "cc-by-2.0", "Old Tbilisi below Sololaki ridge, with the Mother of Georgia statue"),
  "/photos/cities/batumi.webp": commons("Botanical_Garden,_Batumi_kz02.jpg", "Krzysztof Ziarnek, Kenraiz", "cc-by-sa-4.0", "Batumi bay and skyline from the Botanical Garden"),
  "/photos/cities/kutaisi.webp": commons("2014_Kutaisi,_Rzeka_Rioni_widziana_z_Mostu_%C5%81a%C5%84cuchowego_(04).jpg", "Marcin Konsek", "cc-by-sa-4.0", "The Rioni river in Kutaisi, Bagrati Cathedral on the hill"),
  "/photos/cities/kobuleti.webp": commons("Kobuleti_Beach.JPG", "MIKHEIL", "cc-by-sa-4.0", "Kobuleti beach"),
  "/photos/cities/gudauri.webp": commons("Gudauri_Ski_Resort,_Gudauri,_Georgia_(Unsplash).jpg", "Alexey Okhrimenko (alexeyok, via Unsplash)", "cc0", "Gudauri ski resort peaks"),
  "/photos/cities/bakuriani.webp": commons("Mount_Kenchikara_in_winter_(view_from_Bakuriani).jpg", "Yasuhiro Kojima", "cc-by-sa-4.0", "Bakuriani in winter, Mount Kenchikara behind"),
  "/photos/cities/borjomi.webp": commons("Borjomi_spa_2019_3.jpg", "Karelj", "cc-by-sa-3.0", "Borjomi spa buildings on the river"),
  "/photos/cities/kazbegi.webp": commons("Kazbek,_Gergeti_Trinity_Church_2017.jpg", "MaxBenidze", "cc-by-sa-4.0", "Mount Kazbek, Gergeti Trinity Church and Stepantsminda"),
  "/photos/cities/sighnaghi.webp": commons("General_view_of_Sighnaghi,_Georiga.jpg", "George Mel", "cc-by-sa-2.0", "Sighnaghi on its ridge above the Alazani valley"),
  "/photos/cities/mestia.webp": commons("Near_Mestia,_Svan_towers_(35252565354).jpg", "Arian Zwegers (Brussels, Belgium)", "cc-by-2.0", "Svan towers near Mestia"),
};
