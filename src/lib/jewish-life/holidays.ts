/**
 * Holiday helpers for the Shabbat/holiday widgets (pure, client-safe).
 *
 *   groupHolidays(await getHolidaysInRange(start, end, locale))
 *     → one entry per holiday ("Sukkot, Oct 6 – 13") instead of one per day
 *   jewishFeatureSearchHref(currentParams, "sukkah_space")
 *     → { pathname: "/search", query: { …currentParams, jewish: "sukkah_space" } }
 */
import { holidayFilterHint, type HolidayCategory, type HolidayFilterHint, type HolidayKey } from "@/lib/hebcal/keys";

export type HolidayDayLike = {
  /** YYYY-MM-DD */
  date: string;
  key: HolidayKey;
  isYomTov: boolean;
  isErev: boolean;
  category: HolidayCategory;
};

export type HolidayGroup = {
  key: HolidayKey;
  category: HolidayCategory;
  /** First day in the range (may be the Erev). */
  start: string;
  /** Last day in the range. */
  end: string;
  /** First day that is not the Erev (the holiday itself), or `start`. */
  firstDay: string;
  /** Starts the evening before `firstDay` (the range includes the Erev). */
  includesErev: boolean;
  /** At least one day of Yom Tov (no work, no travel for observant guests). */
  hasYomTov: boolean;
  /** Days of Yom Tov in the range. */
  yomTovDates: string[];
  /** The listing filter worth suggesting ("sukkah_space" for Sukkot…), or null. */
  hint: HolidayFilterHint | null;
};

function dayDiff(a: string, b: string): number {
  const [ay, am, ad] = a.split("-").map(Number);
  const [by, bm, bd] = b.split("-").map(Number);
  return Math.round((Date.UTC(by, bm - 1, bd) - Date.UTC(ay, am - 1, ad)) / 86_400_000);
}

/**
 * Collapses consecutive days of the same holiday into one entry, in date order.
 * Two runs of the same holiday more than a day apart (e.g. Pesach in two different years) stay separate.
 */
export function groupHolidays(days: readonly HolidayDayLike[]): HolidayGroup[] {
  const sorted = [...days].sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : 0));
  const groups: HolidayGroup[] = [];
  const openByKey = new Map<HolidayKey, HolidayGroup>();

  for (const day of sorted) {
    const open = openByKey.get(day.key);
    if (open && dayDiff(open.end, day.date) <= 1) {
      if (day.date > open.end) open.end = day.date;
      if (open.includesErev && open.firstDay === open.start && !day.isErev && day.date > open.start) {
        open.firstDay = day.date;
      }
      if (day.isYomTov && !open.yomTovDates.includes(day.date)) {
        open.yomTovDates.push(day.date);
        open.hasYomTov = true;
      }
      continue;
    }
    const group: HolidayGroup = {
      key: day.key,
      category: day.category,
      start: day.date,
      end: day.date,
      firstDay: day.date,
      includesErev: day.isErev,
      hasYomTov: day.isYomTov,
      yomTovDates: day.isYomTov ? [day.date] : [],
      hint: holidayFilterHint(day.key),
    };
    groups.push(group);
    openByKey.set(day.key, group);
  }
  return groups;
}

/** The distinct filter hints for a list of holiday groups, in first-seen order. */
export function holidayHints(groups: readonly HolidayGroup[]): { hint: HolidayFilterHint; key: HolidayKey }[] {
  const seen = new Set<HolidayFilterHint>();
  const out: { hint: HolidayFilterHint; key: HolidayKey }[] = [];
  for (const group of groups) {
    if (group.hint && !seen.has(group.hint)) {
      seen.add(group.hint);
      out.push({ hint: group.hint, key: group.key });
    }
  }
  return out;
}

export type SearchParamsInput =
  | URLSearchParams
  | Record<string, string | string[] | undefined>
  | string
  | null
  | undefined;

function toEntries(params: SearchParamsInput): [string, string][] {
  if (!params) return [];
  if (typeof params === "string") return [...new URLSearchParams(params.replace(/^\?/, "")).entries()];
  if (params instanceof URLSearchParams) return [...params.entries()];
  const out: [string, string][] = [];
  for (const [key, value] of Object.entries(params)) {
    if (value === undefined) continue;
    for (const v of Array.isArray(value) ? value : [value]) out.push([key, v]);
  }
  return out;
}

/** Name of the Jewish-features filter in search URLs (`/search?jewish=sukkah_space,pesach_ready`). */
export const JEWISH_FEATURE_PARAM = "jewish";

/**
 * /search with the guest's other filters kept and a Jewish-feature filter added
 * (`jewish=sukkah_space`). The page number is dropped because the results change.
 */
export function jewishFeatureSearchHref(
  params: SearchParamsInput,
  feature: string,
): { pathname: "/search"; query: Record<string, string | string[]> } {
  const query: Record<string, string | string[]> = {};
  const features: string[] = [];
  for (const [key, value] of toEntries(params)) {
    if (key === "page") continue;
    if (key === JEWISH_FEATURE_PARAM) {
      for (const part of value.split(",")) {
        const trimmed = part.trim();
        if (trimmed && !features.includes(trimmed)) features.push(trimmed);
      }
      continue;
    }
    const current = query[key];
    if (current === undefined) query[key] = value;
    else query[key] = Array.isArray(current) ? [...current, value] : [current, value];
  }
  if (!features.includes(feature)) features.push(feature);
  query[JEWISH_FEATURE_PARAM] = features.join(",");
  return { pathname: "/search", query };
}
