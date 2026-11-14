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

/** True when `translation` has exactly the numbers of `source`. */
export function keepsNumbers(source: string, translation: string): boolean {
  const a = numberCounts(source);
  const b = numberCounts(translation);
  if (a.size !== b.size) return false;
  for (const [value, count] of a) if (b.get(value) !== count) return false;
  return true;
}

/** The translation, or the source text when the translation changed a number. */
export function numbersSafeTranslation(source: string, translation: string): { text: string; kept: boolean } {
  return keepsNumbers(source, translation) ? { text: translation, kept: true } : { text: source, kept: false };
}
