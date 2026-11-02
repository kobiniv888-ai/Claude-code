/**
 * Public URLs of listings, owners and searches (client-safe, pure).
 * All paths are WITHOUT the locale prefix — pass them to Link / redirect / useRouter from
 * @/i18n/navigation, which add "/he", "/en"…
 *
 *   <Link href={listingPath(1234, "Sunny flat in Vake")}>   → /listing/1234-sunny-flat-in-vake
 *   const publicId = parseListingParam(params.slug);       → 1234 | null
 */
import { serializeSearchQuery, type SearchFilters } from "@/lib/listing/search-params";

const MAX_SLUG_LENGTH = 60;

/** Rough Latin spelling of Hebrew, Cyrillic, Georgian and Arabic letters (for URLs only). */
const TRANSLITERATION: Record<string, string> = {
  // Hebrew
  א: "a", ב: "b", ג: "g", ד: "d", ה: "h", ו: "v", ז: "z", ח: "ch", ט: "t", י: "y",
  כ: "k", ך: "k", ל: "l", מ: "m", ם: "m", נ: "n", ן: "n", ס: "s", ע: "a", פ: "p",
  ף: "f", צ: "ts", ץ: "ts", ק: "k", ר: "r", ש: "sh", ת: "t",
  // Russian / Ukrainian
  а: "a", б: "b", в: "v", г: "g", д: "d", е: "e", ё: "e", ж: "zh", з: "z", и: "i",
  й: "y", к: "k", л: "l", м: "m", н: "n", о: "o", п: "p", р: "r", с: "s", т: "t",
  у: "u", ф: "f", х: "kh", ц: "ts", ч: "ch", ш: "sh", щ: "shch", ъ: "", ы: "y", ь: "",
  э: "e", ю: "yu", я: "ya", і: "i", ї: "yi", є: "ye", ґ: "g",
  // Georgian
  ა: "a", ბ: "b", გ: "g", დ: "d", ე: "e", ვ: "v", ზ: "z", თ: "t", ი: "i", კ: "k",
  ლ: "l", მ: "m", ნ: "n", ო: "o", პ: "p", ჟ: "zh", რ: "r", ს: "s", ტ: "t", უ: "u",
  ფ: "p", ქ: "k", ღ: "gh", ყ: "q", შ: "sh", ჩ: "ch", ც: "ts", ძ: "dz", წ: "ts", ჭ: "ch",
  ხ: "kh", ჯ: "j", ჰ: "h",
  // Arabic
  ا: "a", أ: "a", إ: "i", آ: "a", ٱ: "a", ب: "b", ت: "t", ث: "th", ج: "j", ح: "h",
  خ: "kh", د: "d", ذ: "dh", ر: "r", ز: "z", س: "s", ش: "sh", ص: "s", ض: "d", ط: "t",
  ظ: "z", ع: "a", غ: "gh", ف: "f", ق: "q", ك: "k", ل: "l", م: "m", ن: "n", ه: "h",
  ة: "a", و: "w", ي: "y", ى: "a", ء: "", ئ: "y", ؤ: "w",
  // Latin letters NFKD does not split
  ß: "ss", æ: "ae", œ: "oe", ø: "o", ł: "l", đ: "d", ð: "d", þ: "th", ı: "i",
};

/**
 * ASCII URL slug of a title in any of our languages: "Sunny flat in Vake" → "sunny-flat-in-vake",
 * "דירה בטביליסי" → "dyrh-btbylysy" (rough, for readability only — the number is what counts).
 * Returns "" when nothing readable is left.
 */
export function slugify(title: string | null | undefined): string {
  if (!title) return "";
  const latin = title
    .normalize("NFKD")
    .replace(/\p{M}/gu, "") // accents, niqqud, harakat
    .toLowerCase()
    .replace(/./gu, (ch) => TRANSLITERATION[ch] ?? ch)
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
  if (latin.length <= MAX_SLUG_LENGTH) return latin;
  const cut = latin.slice(0, MAX_SLUG_LENGTH + 1);
  const lastDash = cut.lastIndexOf("-");
  return (lastDash > 20 ? cut.slice(0, lastDash) : cut.slice(0, MAX_SLUG_LENGTH)).replace(/-+$/, "");
}

/** The [slug] segment of a listing URL: "1234-sunny-flat-in-vake" (or "1234"). */
export function listingSlugParam(publicId: number, title?: string | null): string {
  const slug = slugify(title);
  return slug ? `${publicId}-${slug}` : String(publicId);
}

/** "/listing/1234-sunny-flat-in-vake". */
export function listingPath(publicId: number, title?: string | null): string {
  return `/listing/${listingSlugParam(publicId, title)}`;
}

const MAX_PUBLIC_ID = 2_147_483_647; // Postgres INT

/**
 * The public ID in a listing URL segment: "1234-sunny-flat" → 1234, "1234" → 1234.
 * The words after the number are ignored (titles change), so old links keep working.
 */
export function parseListingParam(param: string | null | undefined): number | null {
  if (!param) return null;
  let value = param;
  try {
    value = decodeURIComponent(param);
  } catch {
    // Keep the raw value.
  }
  const match = /^(\d{1,10})(?:-[\s\S]*)?$/u.exec(value.trim());
  if (!match) return null;
  const id = Number(match[1]);
  return Number.isSafeInteger(id) && id > 0 && id <= MAX_PUBLIC_ID ? id : null;
}

/** "/owner/<userId>" — the owner's public profile. */
export function ownerPath(userId: string): string {
  return `/owner/${encodeURIComponent(userId)}`;
}

/** "/search?deal=buy&city=batumi" (just "/search" without filters). */
export function searchPath(filters: Partial<SearchFilters> = {}): string {
  const query = serializeSearchQuery(filters);
  return query ? `/search?${query}` : "/search";
}

export { COMPARE_PATH, FAVORITES_PATH } from "./paths";
