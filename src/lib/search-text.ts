/**
 * Search-text normalization (client-safe, pure).
 *
 * City and neighborhood names are searchable in every language:
 * Tbilisi = טביליסי = Тбилиси = تبليسي = თბილისი. Both the stored `searchText`
 * and the visitor's query go through `normalizeSearchText`, so niqqud, accents,
 * case, apostrophes/geresh and spacing never prevent a match.
 */
import type { Localized } from "@/config/site";

const COMBINING_MARKS = /[̀-ͯ᪰-᫿᷀-᷿⃐-⃿︠-︯]/g;
/** Hebrew cantillation and niqqud (U+0591–U+05C7, except the maqaf U+05BE which is a hyphen). */
const HEBREW_MARKS = /[֑-ֽֿ-ׇ]/g;
/** Arabic harakat, superscript alef and tatweel. */
const ARABIC_MARKS = /[ؐ-ًؚ-ٰٟۖ-ۭـ]/g;
/** Apostrophes, geresh and gershayim are dropped: "בורג׳ומי" = "בורג'ומי" = "בורגומי". */
const APOSTROPHES = /['"`´‘’‚‛“”„׳״]/g;
/** Everything that is not a letter or digit becomes a space. */
const SEPARATORS = /[^\p{L}\p{N}]+/gu;

const HEBREW_FINALS: Record<string, string> = { ך: "כ", ם: "מ", ן: "נ", ף: "פ", ץ: "צ" };
const ARABIC_LETTERS: Record<string, string> = { أ: "ا", إ: "ا", آ: "ا", ٱ: "ا", ة: "ه", ى: "ي", ؤ: "و", ئ: "ي" };

export function normalizeSearchText(value: string | null | undefined): string {
  if (!value) return "";
  return value
    .normalize("NFKD")
    .replace(COMBINING_MARKS, "")
    .replace(HEBREW_MARKS, "")
    .replace(ARABIC_MARKS, "")
    .normalize("NFC")
    .toLowerCase()
    .replace(/[ךםןףץ]/g, (ch) => HEBREW_FINALS[ch] ?? ch)
    .replace(/[أإآٱةىؤئ]/g, (ch) => ARABIC_LETTERS[ch] ?? ch)
    .replace(APOSTROPHES, "")
    .replace(SEPARATORS, " ")
    .trim()
    .replace(/\s+/g, " ");
}

/** Separator between names in `searchText`; queries can never contain it after normalizing. */
export const SEARCH_TEXT_SEPARATOR = " | ";

/**
 * The value stored in City.searchText / Neighborhood.searchText:
 * every localized name plus aliases, normalized and de-duplicated.
 */
export function buildSearchText(names: Partial<Localized> | Record<string, unknown>, aliases: string[] = []): string {
  const values = [...Object.values(names), ...aliases]
    .filter((v): v is string => typeof v === "string")
    .map(normalizeSearchText)
    .filter(Boolean);
  return [...new Set(values)].join(SEARCH_TEXT_SEPARATOR);
}

/** Splits a stored searchText back into its normalized names. */
export function splitSearchText(searchText: string | null | undefined): string[] {
  if (!searchText) return [];
  return searchText
    .split("|")
    .map((part) => normalizeSearchText(part))
    .filter(Boolean);
}

/**
 * How well `query` (already normalized) matches one normalized name.
 * 0 = no match; higher is better.
 */
export function matchScore(name: string, query: string): number {
  if (!name || !query) return 0;
  if (name === query) return 100;
  if (name.startsWith(query)) return 80;
  if (name.split(" ").some((word) => word.startsWith(query))) return 60;
  if (name.includes(query)) return 40;
  // Space-insensitive fallback: "tbi lisi" or "telaviv".
  const compactName = name.replace(/ /g, "");
  const compactQuery = query.replace(/ /g, "");
  if (compactQuery.length >= 3 && compactName.includes(compactQuery)) return 20;
  return 0;
}
