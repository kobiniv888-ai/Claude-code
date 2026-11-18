import "server-only";
import { getTranslations } from "next-intl/server";
import type { AppLocale } from "@/config/site";
import heMessages from "../../../messages/he/hebcal.json";
import enMessages from "../../../messages/en/hebcal.json";
import ruMessages from "../../../messages/ru/hebcal.json";
import arMessages from "../../../messages/ar/hebcal.json";
import kaMessages from "../../../messages/ka/hebcal.json";
import {
  DEFAULT_TIME_ZONE,
  addDays,
  hdateFor,
  holidaysBetween,
  isInIsrael,
  observanceAt,
  timedObservances,
  upcomingShabbat,
  weekdayOf,
  ymdToString,
  zonedYmd,
  type GeoPoint,
  type RawHoliday,
  type Ymd,
} from "./core";
import { COMBINED_PARASHA_KEYS, MONTH_KEYS, PARASHA_KEYS, type HolidayCategory, type HolidayKey } from "./keys";

/**
 * Shabbat times, Jewish holidays and Hebrew dates (server-only), from @hebcal/core.
 * Names come from messages/<locale>/hebcal.json (namespace "hebcal").
 *
 *   const shabbat = await getShabbatTimes(city, locale);
 *   formatTime(shabbat.candleLighting, locale, city.timezone)
 *
 * Diaspora schedule everywhere except places in Israel (timezone Asia/Jerusalem).
 */

export type { GeoPoint } from "./core";
export {
  HOLIDAY_KEYS,
  holidayFilterHint,
  isHolidayKey,
  type HolidayCategory,
  type HolidayFilterHint,
  type HolidayKey,
} from "./keys";

type Translator = Awaited<ReturnType<typeof getTranslations>>;

function translator(locale: AppLocale): Promise<Translator> {
  return getTranslations({ locale, namespace: "hebcal" });
}

// ─── Shabbat ──────────────────────────────────────────────────

export type ShabbatTimes = {
  candleLighting: Date | null;
  /** Null when a Yom Tov starts right after Shabbat (there is no Havdalah that night). */
  havdalah: Date | null;
  /** Name of the weekly portion ("Noach"), or null when a holiday reading replaces it. */
  parasha: string | null;
  /** "Parashat Noach" / "פרשת נח". */
  parashaTitle: string | null;
  /** Friday, YYYY-MM-DD (in the place's time zone). */
  erevDate: string;
  /** Saturday, YYYY-MM-DD. */
  shabbatDate: string;
  timezone: string;
};

function parashaName(t: Translator, key: string, names: string[]): string {
  if (t.has(`parashot.${key}`)) return t(`parashot.${key}`);
  // A combination we have no single name for: join the portions.
  return names
    .map((name) => {
      const single = PARASHA_KEYS[name];
      return single && t.has(`parashot.${single}`) ? t(`parashot.${single}`) : name;
    })
    .join("-");
}

/** Candle lighting, Havdalah and parasha of the coming Shabbat (or the current one, until Havdalah). */
export async function getShabbatTimes(place: GeoPoint, locale: AppLocale, from: Date = new Date()): Promise<ShabbatTimes> {
  const raw = upcomingShabbat(place, from);
  let parasha: string | null = null;
  let parashaTitle: string | null = null;
  if (raw.parasha && raw.parashaKey) {
    const t = await translator(locale);
    parasha = parashaName(t, raw.parashaKey, raw.parasha);
    parashaTitle = t("parashaTitle", { name: parasha });
  }
  return {
    candleLighting: raw.candleLighting,
    havdalah: raw.havdalah,
    parasha,
    parashaTitle,
    erevDate: raw.erevDate,
    shabbatDate: raw.shabbatDate,
    timezone: place.timezone,
  };
}

// ─── Holidays ─────────────────────────────────────────────────

export type Holiday = {
  /** YYYY-MM-DD */
  date: string;
  key: HolidayKey;
  /** Translated, e.g. "Sukkot (day 3, Chol HaMoed)", "Erev Pesach". */
  name: string;
  /** A day of Yom Tov (no work, no travel for observant guests). */
  isYomTov: boolean;
  isErev: boolean;
  isCholHamoed: boolean;
  category: HolidayCategory;
  emoji?: never;
};

function holidayDisplayName(t: Translator, h: RawHoliday): string {
  const base = t(`holidays.${h.key}`);
  if (h.key === "chanukah") {
    if (h.candles) return t("chanukahCandles", { name: base, count: h.candles });
    if (h.day) return t("holidayDay", { name: base, day: String(h.day) });
    return base;
  }
  if (h.isErev) return t("erev", { name: base });
  if (h.isHoshanaRaba) return t("hoshanaRaba");
  if (h.isCholHamoed && h.day) return t("cholHamoedDay", { name: base, day: String(h.day) });
  if (h.day) return t("holidayDay", { name: base, day: String(h.day) });
  return base;
}

function toHoliday(t: Translator, h: RawHoliday): Holiday {
  return {
    date: h.date,
    key: h.key,
    name: holidayDisplayName(t, h),
    isYomTov: h.isYomTov,
    isErev: h.isErev,
    isCholHamoed: h.isCholHamoed,
    category: h.category,
  };
}

function toYmd(date: Date | string, timeZone: string): Ymd {
  if (typeof date === "string" && /^\d{4}-\d{2}-\d{2}$/.test(date)) {
    const [y, m, d] = date.split("-").map(Number);
    return { y, m, d };
  }
  return zonedYmd(date instanceof Date ? date : new Date(date), timeZone);
}

/**
 * Major and minor holidays, fasts and Israeli national days between two dates (inclusive),
 * on the diaspora schedule. Accepts Dates or "YYYY-MM-DD" strings (dates are read in Georgia time).
 */
export async function getHolidaysInRange(
  start: Date | string,
  end: Date | string,
  locale: AppLocale,
  options: { il?: boolean } = {},
): Promise<Holiday[]> {
  const from = toYmd(start, DEFAULT_TIME_ZONE);
  const to = toYmd(end, DEFAULT_TIME_ZONE);
  const il = options.il ?? false;
  const key = `${locale}|${il ? "il" : "d"}|${ymdToString(from)}|${ymdToString(to)}`;
  let list = holidayRangeCache.get(key);
  if (!list) {
    list = (async () => {
      const raw = holidaysBetween(from, to, il);
      if (raw.length === 0) return [];
      const t = await translator(locale);
      return raw.map((h) => toHoliday(t, h));
    })();
    if (holidayRangeCache.size >= HOLIDAY_CACHE_MAX) holidayRangeCache.clear();
    holidayRangeCache.set(key, list);
    list.catch(() => holidayRangeCache.delete(key));
  }
  // A copy: callers may sort or filter their list.
  return (await list).slice();
}

/**
 * Holiday lists depend only on the dates, the language and the calendar (pure hebcal
 * computations), so they are kept across requests: the date pickers' 18 months of holiday marks
 * (home, search) and the Jewish life lists no longer recompute on every page view (~4 ms each).
 * Keys hold whole days, so the cache turns over by itself; it is bounded.
 */
const holidayRangeCache = new Map<string, Promise<Holiday[]>>();
const HOLIDAY_CACHE_MAX = 200;

/** Translated base name of a holiday key ("sukkot" → "סוכות"), or of "shabbat". */
export async function holidayName(key: HolidayKey | "shabbat", locale: AppLocale): Promise<string> {
  const t = await translator(locale);
  return key === "shabbat" ? t("shabbat") : t(`holidays.${key}`);
}

// ─── Now ──────────────────────────────────────────────────────

const englishHolidayNames = enMessages.holidays as Record<HolidayKey, string>;

export type ShabbatOrHolidayNow = {
  active: boolean;
  kind: "shabbat" | "holiday" | null;
  endsAt: Date | null;
  /** English name ("Shabbat", "Sukkot") — for logs. Show users `holidayName(key, locale)`. */
  name: string | null;
  key: HolidayKey | "shabbat" | null;
};

/**
 * Is it Shabbat or Yom Tov at `place` right now (from candle lighting until Havdalah)?
 * Synchronous; for a translated name use `holidayName(result.key, locale)`.
 */
export function isShabbatOrHolidayNow(place: GeoPoint, at: Date = new Date()): ShabbatOrHolidayNow {
  const now = observanceAt(place, at);
  const name = now.key === null ? null : now.key === "shabbat" ? enMessages.shabbat : englishHolidayNames[now.key];
  return { ...now, name };
}

// ─── Hebrew dates ─────────────────────────────────────────────

type HebcalMessages = typeof enMessages;
const MESSAGES: Record<AppLocale, HebcalMessages> = {
  he: heMessages,
  en: enMessages,
  ru: ruMessages,
  ar: arMessages,
  ka: kaMessages,
};

function hebrewDateOf(ymd: Ymd, locale: AppLocale): string {
  const hd = hdateFor(ymd);
  if (locale === "he") return hd.renderGematriya(true);
  const messages = MESSAGES[locale] ?? enMessages;
  const monthKey = MONTH_KEYS[hd.getMonthName()] as keyof HebcalMessages["months"] | undefined;
  const month = (monthKey && messages.months[monthKey]) || hd.getMonthName();
  return messages.hebrewDateFormat
    .replace("{day}", String(hd.getDate()))
    .replace("{month}", month)
    .replace("{year}", String(hd.getFullYear()));
}

/**
 * The Hebrew date of a civil date: "כ׳ חשון תשפ״ז" in Hebrew, "20 Cheshvan 5787" otherwise.
 * Uses the civil day in Georgia time (the Hebrew day really starts at sunset).
 */
export function hebrewDate(date: Date | string, locale: AppLocale): string {
  return hebrewDateOf(toYmd(date, DEFAULT_TIME_ZONE), locale);
}

// ─── Calendar month ───────────────────────────────────────────

export type JewishCalendarDay = {
  /** YYYY-MM-DD */
  date: string;
  /** 0 = Sunday … 6 = Saturday */
  weekday: number;
  hebrewDate: string;
  holidays: { key: HolidayKey; name: string; isYomTov: boolean }[];
  /** ISO timestamps (show with formatTime(…, place.timezone)). Only when a place is given. */
  candleLighting?: string;
  havdalah?: string;
};

/** One Gregorian month with Hebrew dates, holidays and (with a place) candle-lighting/Havdalah times. */
export async function getJewishCalendarMonth(
  year: number,
  month: number,
  locale: AppLocale,
  place?: GeoPoint,
): Promise<JewishCalendarDay[]> {
  if (!Number.isInteger(year) || !Number.isInteger(month) || month < 1 || month > 12) {
    throw new RangeError(`Invalid month ${year}-${month}`);
  }
  const first: Ymd = { y: year, m: month, d: 1 };
  const daysInMonth = new Date(Date.UTC(year, month, 0)).getUTCDate();
  const last: Ymd = { y: year, m: month, d: daysInMonth };
  const il = place ? isInIsrael(place) : false;

  const t = await translator(locale);
  const rawHolidays = holidaysBetween(first, last, il);
  const timed = place ? timedObservances(place, first, last) : [];

  const holidaysByDate = new Map<string, Holiday[]>();
  for (const h of rawHolidays) {
    const list = holidaysByDate.get(h.date) ?? [];
    list.push(toHoliday(t, h));
    holidaysByDate.set(h.date, list);
  }

  const days: JewishCalendarDay[] = [];
  for (let d = 1; d <= daysInMonth; d++) {
    const ymd = addDays(first, d - 1);
    const date = ymdToString(ymd);
    const day: JewishCalendarDay = {
      date,
      weekday: weekdayOf(ymd),
      hebrewDate: hebrewDateOf(ymd, locale),
      holidays: (holidaysByDate.get(date) ?? []).map(({ key, name, isYomTov }) => ({ key, name, isYomTov })),
    };
    const candles = timed.find((e) => e.kind === "candles" && e.date === date);
    const havdalah = timed.find((e) => e.kind === "havdalah" && e.date === date);
    if (candles) day.candleLighting = candles.time.toISOString();
    if (havdalah) day.havdalah = havdalah.time.toISOString();
    days.push(day);
  }
  return days;
}

/** Keys of portions that can be read together (for admin/tests). */
export const COMBINED_PARASHOT = COMBINED_PARASHA_KEYS;
