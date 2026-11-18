/**
 * Machine translations must keep the numbers (SECURITY_REPORT 7.n): prices, times, dates, sizes,
 * floors. Pure. A translation whose numbers differ from the source's is not used: the original
 * text is shown instead (src/lib/translate.ts translateMany).
 *
 *   keepsNumbers("2 rooms, 120 ₾ a night, check-in 14:00", "2 חדרים, 120 ₾ ללילה, כניסה ב-14:00") → true
 *   keepsNumbers("120 ₾ a night", "210 ₾ ללילה") → false
 *
 * The numbers are compared as a multiset (each number and how often): word order may change in a
 * translation, the numbers may not. Thousands separators ("1,200" / "1 200" / "1.200" / "1200")
 * and leading zeros ("09:00" / "9:00") don't matter; Arabic-Indic and full-width digits count as
 * 0–9.
 */

/** Thousands separators: a comma, dot, apostrophe or (narrow / no-break) space before 3 digits. */
const GROUP_SEPARATOR = /(\d)[,.'\u2019\s\u00a0\u202f\u2009](?=\d{3}(?!\d))/gu;

function numberCounts(text: string): Map<string, number> {
  let normalized = text
    .normalize("NFKC")
    .replace(/[٠-٩]/g, (d) => String(d.charCodeAt(0) - 0x0660))
    .replace(/[۰-۹]/g, (d) => String(d.charCodeAt(0) - 0x06f0));
  // "1,200,000": each pass joins every other group, so repeat until nothing changes.
  for (let previous = ""; previous !== normalized; ) {
    previous = normalized;
    normalized = normalized.replace(GROUP_SEPARATOR, "$1");
  }
  const counts = new Map<string, number>();
  for (const [run] of normalized.matchAll(/\d+/g)) {
    const value = run.replace(/^0+(?=\d)/, "");
    counts.set(value, (counts.get(value) ?? 0) + 1);
  }
  return counts;
}

/**
 * Currency and unit words next to a number, by what they mean (S2 review TS-16): "120 ₾" and
 * "120 לארי" are the same, "120 ₾" and "120 $" or "45 m²" and "45 ft²" are not. Stems allow the
 * word forms of each language ("лари", "ლარი", "долларов", "דולרים").
 */
const MEANINGS: [canonical: string, pattern: string][] = [
  ["GEL", "₾|gel|lari|лар\\p{L}*|ლარ\\p{L}*|לארי|لاري"],
  ["USD", "\\$|usd|us\\$|dollars?|доллар\\p{L}*|долл|דולר\\p{L}*|دولار\\p{L}*|დოლარ\\p{L}*"],
  ["EUR", "€|eur|euros?|евро|יורו|يورو|ევრო"],
  ["ILS", "₪|ils|nis|shekels?|шекел\\p{L}*|שקל\\p{L}*|ש\"ח|ש״ח|شيكل\\p{L}*|شيقل\\p{L}*|შეკელ\\p{L}*"],
  ["GBP", "£|gbp|pounds?|фунт\\p{L}*|ליש\"ט|جنيه|ფუნტ\\p{L}*"],
  ["FT2", "ft2|sq\\.? ?ft|square feet|кв\\.? ?фут\\p{L}*"],
  ["M2", "m2|sq\\.? ?m|sqm|square met(?:er|re)s?|кв\\.? ?м|м2|מ\"ר|מ״ר|מטר רבוע|م2|متر مربع|მ2|კვ\\.? ?მ"],
  ["KM", "km|kilomet(?:er|re)s?|км|километр\\p{L}*|ק\"מ|ק״מ|קילומטר\\p{L}*|كم|كيلومتر\\p{L}*|კმ|კილომეტრ\\p{L}*"],
];
const MEANING_RES = MEANINGS.map(([canonical, pattern]) => {
  const token = `(?:${pattern})`;
  // Only next to a number (up to 2 spaces between), so a word on its own ("Euro 2024 final") counts once at most.
  return [canonical, new RegExp(`(?<=\\d\\s{0,2})${token}(?![\\p{L}\\p{N}])|(?<![\\p{L}\\p{N}])${token}(?=\\s{0,2}\\d)`, "giu")] as const;
});

function meaningCounts(text: string): Map<string, number> {
  const normalized = text.normalize("NFKC").replace(/[٠-٩]/g, (d) => String(d.charCodeAt(0) - 0x0660)).replace(/[۰-۹]/g, (d) => String(d.charCodeAt(0) - 0x06f0));
  const counts = new Map<string, number>();
  let rest = normalized;
  for (const [canonical, re] of MEANING_RES) {
    // Longer meanings first in the list (ft² before m²); a matched token is blanked so "sq ft" is not also "sq".
    rest = rest.replace(re, (match) => {
      counts.set(canonical, (counts.get(canonical) ?? 0) + 1);
      return " ".repeat(match.length);
    });
  }
  return counts;
}

function sameCounts(a: Map<string, number>, b: Map<string, number>): boolean {
  if (a.size !== b.size) return false;
  for (const [value, count] of a) if (b.get(value) !== count) return false;
  return true;
}

/**
 * True when `translation` has exactly the numbers of `source`, and the same currencies and units
 * next to them (a changed currency or unit is a changed price or size).
 */
export function keepsNumbers(source: string, translation: string): boolean {
  return sameCounts(numberCounts(source), numberCounts(translation)) && sameCounts(meaningCounts(source), meaningCounts(translation));
}

/** The translation, or the source text when the translation changed a number. */
export function numbersSafeTranslation(source: string, translation: string): { text: string; kept: boolean } {
  return keepsNumbers(source, translation) ? { text: translation, kept: true } : { text: source, kept: false };
}
