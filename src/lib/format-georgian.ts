/**
 * Georgian ("ka") formatting that comes out the same on the server and in every browser.
 *
 * Chrome ships without Georgian locale data: `Intl.*("ka")` silently falls back to English
 * there, while Node prints Georgian. Server-rendered Georgian pages would then hydrate with
 * different text ("75 $" vs "$75", "1 ოქტ" vs "Oct 1"). So `@/lib/format` never asks Intl for
 * "ka". It formats with locales every engine has and swaps in the Georgian words below
 * (taken from CLDR, the data behind Intl):
 *   - numbers and money: Russian separators ("1 250,5", "1 250 $"), same as Georgian;
 *   - dates and times: British English order and 24-hour clock ("1 ოქტ 2026", "14:00");
 *   - relative times: built here ("3 დღის წინ").
 * Client-safe, no dependencies.
 */

/** Base Intl locale for Georgian numbers (same grouping, decimal comma and symbol placement). */
export const GEORGIAN_NUMBER_BASE = "ru-u-nu-latn";
/** Base Intl locale for Georgian dates (day-month-year order, 24-hour clock). */
export const GEORGIAN_DATE_BASE = "en-GB-u-nu-latn";

export function isGeorgianLocale(locale: string): boolean {
  return locale === "ka" || locale.startsWith("ka-");
}

/** Russian compact suffixes (what GEORGIAN_NUMBER_BASE prints) → Georgian. */
const COMPACT_SUFFIXES: Record<string, string> = {
  "тыс.": "ათ.",
  "млн": "მლნ.",
  "млрд": "მლრდ.",
  "трлн": "ტრლნ.",
};

export function georgianCompactSuffix(ruSuffix: string): string {
  return COMPACT_SUFFIXES[ruSuffix] ?? ruSuffix;
}

export const GEORGIAN_MONTHS_LONG = [
  "იანვარი", "თებერვალი", "მარტი", "აპრილი", "მაისი", "ივნისი",
  "ივლისი", "აგვისტო", "სექტემბერი", "ოქტომბერი", "ნოემბერი", "დეკემბერი",
] as const;
export const GEORGIAN_MONTHS_SHORT = [
  "იან", "თებ", "მარ", "აპრ", "მაი", "ივნ", "ივლ", "აგვ", "სექ", "ოქტ", "ნოე", "დეკ",
] as const;
/** Index 0 = Sunday, like Date#getUTCDay(). */
export const GEORGIAN_WEEKDAYS_LONG = [
  "კვირა", "ორშაბათი", "სამშაბათი", "ოთხშაბათი", "ხუთშაბათი", "პარასკევი", "შაბათი",
] as const;
export const GEORGIAN_WEEKDAYS_SHORT = ["კვი", "ორშ", "სამ", "ოთხ", "ხუთ", "პარ", "შაბ"] as const;

/** Calendar day of `date` in `timeZone`: month 0–11 and weekday 0–6 (Sunday = 0). */
export function zonedDayInfo(date: Date, timeZone: string | undefined): { month: number; weekday: number } {
  const parts = new Intl.DateTimeFormat("en-US-u-nu-latn", {
    timeZone,
    year: "numeric",
    month: "numeric",
    day: "numeric",
  }).formatToParts(date);
  const get = (type: Intl.DateTimeFormatPartTypes) => Number(parts.find((p) => p.type === type)?.value);
  const year = get("year");
  const month = get("month") - 1;
  const day = get("day");
  return { month, weekday: new Date(Date.UTC(year, month, day)).getUTCDay() };
}

type DatePart = { type: string; value: string; source?: string };

/**
 * Replaces the English month and weekday names in `parts` (from GEORGIAN_DATE_BASE) with
 * Georgian ones. Range parts carry `source`; "endRange" parts belong to `end`.
 */
export function georgianizeDateParts(
  parts: DatePart[],
  options: Intl.DateTimeFormatOptions,
  start: Date,
  end: Date = start,
): string {
  const resolved = new Intl.DateTimeFormat(GEORGIAN_DATE_BASE, options).resolvedOptions();
  const longMonth = resolved.month === "long" || options.dateStyle === "long" || options.dateStyle === "full";
  const longWeekday = resolved.weekday === "long" || options.dateStyle === "full";
  const info = { start: zonedDayInfo(start, resolved.timeZone), end: zonedDayInfo(end, resolved.timeZone) };

  return parts
    .map((part) => {
      const day = part.source === "endRange" ? info.end : info.start;
      if (part.type === "month" && !/^\d+$/.test(part.value)) {
        return (longMonth ? GEORGIAN_MONTHS_LONG : GEORGIAN_MONTHS_SHORT)[day.month];
      }
      if (part.type === "weekday") {
        return (longWeekday ? GEORGIAN_WEEKDAYS_LONG : GEORGIAN_WEEKDAYS_SHORT)[day.weekday];
      }
      return part.value;
    })
    .join("");
}

export type RelativeUnit = "year" | "month" | "week" | "day" | "hour" | "minute" | "second";

const RELATIVE_PAST: Record<RelativeUnit, string> = {
  year: "წლის წინ",
  month: "თვის წინ",
  week: "კვირის წინ",
  day: "დღის წინ",
  hour: "საათის წინ",
  minute: "წუთის წინ",
  second: "წამის წინ",
};
const RELATIVE_FUTURE: Record<RelativeUnit, string> = {
  year: "წელიწადში",
  month: "თვეში",
  week: "კვირაში",
  day: "დღეში",
  hour: "საათში",
  minute: "წუთში",
  second: "წამში",
};
/** Words used instead of a number (Intl's `numeric: "auto"`). */
const RELATIVE_WORDS: Partial<Record<RelativeUnit, Record<number, string>>> = {
  second: { 0: "ახლა" },
  minute: { 0: "ამ წუთში" },
  hour: { 0: "ამ საათში" },
  day: { [-2]: "გუშინწინ", [-1]: "გუშინ", 0: "დღეს", 1: "ხვალ", 2: "ზეგ" },
  week: { [-1]: "გასულ კვირაში", 0: "ამ კვირაში", 1: "მომავალ კვირაში" },
  month: { [-1]: "გასულ თვეს", 0: "ამ თვეში", 1: "მომავალ თვეს" },
  year: { [-1]: "გასულ წელს", 0: "ამ წელს", 1: "მომავალ წელს" },
};

/** "3 დღის წინ", "2 საათში", "გუშინ" — like Intl.RelativeTimeFormat("ka", { numeric: "auto" }). */
export function georgianRelativeTime(value: number, unit: RelativeUnit, formatCount: (n: number) => string): string {
  const word = RELATIVE_WORDS[unit]?.[value];
  if (word) return word;
  const count = formatCount(Math.abs(value));
  return value < 0 ? `${count} ${RELATIVE_PAST[unit]}` : `${count} ${RELATIVE_FUTURE[unit]}`;
}
