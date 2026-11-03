import "server-only";
import {
  CandleLightingEvent,
  HavdalahEvent,
  HDate,
  HebrewCalendar,
  Location,
  getSedra,
  type Event,
} from "@hebcal/core";
import { siteConfig } from "@/config/site";
import { COUNTRIES, DEFAULT_COUNTRY } from "@/config/countries";
import { HEBCAL_HOLIDAY_KEYS, HOLIDAY_CATEGORY, parashaKey, type HolidayCategory, type HolidayKey } from "./keys";

/**
 * Jewish calendar calculations on top of @hebcal/core (the library behind hebcal.com).
 * Everything here is language-neutral; ./index.ts adds the translated names.
 *
 * Dates: hebcal reads Y/M/D of a JS Date with local getters, so we always pass
 * `new Date(y, m - 1, d)` built from the civil date in the place's own time zone.
 */

export type GeoPoint = { lat: number; lng: number; timezone: string; name?: string };

/** A civil (Gregorian) calendar date. */
export type Ymd = { y: number; m: number; d: number };

/** Georgia — used when a function has no place (holiday lists, Hebrew dates). */
export const DEFAULT_TIME_ZONE = COUNTRIES[DEFAULT_COUNTRY].timezone;

// ─── Civil date helpers ───────────────────────────────────────

const ymdFormatters = new Map<string, Intl.DateTimeFormat>();

/** The civil date (and weekday, 0 = Sunday) of an instant in a time zone. */
export function zonedYmd(date: Date, timeZone: string): Ymd & { weekday: number } {
  let formatter = ymdFormatters.get(timeZone);
  if (!formatter) {
    formatter = new Intl.DateTimeFormat("en-US-u-nu-latn", {
      timeZone,
      year: "numeric",
      month: "numeric",
      day: "numeric",
    });
    ymdFormatters.set(timeZone, formatter);
  }
  const parts = Object.fromEntries(formatter.formatToParts(date).map((p) => [p.type, p.value]));
  const ymd = { y: Number(parts.year), m: Number(parts.month), d: Number(parts.day) };
  return { ...ymd, weekday: new Date(Date.UTC(ymd.y, ymd.m - 1, ymd.d)).getUTCDay() };
}

export function addDays({ y, m, d }: Ymd, days: number): Ymd {
  const date = new Date(Date.UTC(y, m - 1, d + days));
  return { y: date.getUTCFullYear(), m: date.getUTCMonth() + 1, d: date.getUTCDate() };
}

export function ymdToString({ y, m, d }: Ymd): string {
  return `${String(y).padStart(4, "0")}-${String(m).padStart(2, "0")}-${String(d).padStart(2, "0")}`;
}

export function weekdayOf({ y, m, d }: Ymd): number {
  return new Date(Date.UTC(y, m - 1, d)).getUTCDay();
}

/** The Date hebcal expects for a civil date (local midnight on this server). */
function hebcalDate({ y, m, d }: Ymd): Date {
  return new Date(y, m - 1, d);
}

/** Civil date of a hebcal event (created with local getters). */
function eventYmd(event: Event): Ymd {
  const g = event.greg();
  return { y: g.getFullYear(), m: g.getMonth() + 1, d: g.getDate() };
}

export function hdateFor(ymd: Ymd): HDate {
  return new HDate(hebcalDate(ymd));
}

/** Israel follows the Israeli holiday schedule (one day of Yom Tov); everywhere else the diaspora one. */
export function isInIsrael(place: Pick<GeoPoint, "timezone">): boolean {
  return place.timezone === "Asia/Jerusalem";
}

function toLocation(place: GeoPoint): Location {
  return new Location(place.lat, place.lng, isInIsrael(place), place.timezone, place.name ?? "");
}

// ─── Holidays ─────────────────────────────────────────────────

export type RawHoliday = {
  date: string;
  key: HolidayKey;
  category: HolidayCategory;
  /** A day of Yom Tov (work is not done): Rosh Hashana, Yom Kippur, Sukkot I–II, Pesach I–II & VII–VIII… */
  isYomTov: boolean;
  /** The day before (the holiday starts in the evening). */
  isErev: boolean;
  isCholHamoed: boolean;
  /** Day number for multi-day holidays (Pesach day 3…), otherwise null. */
  day: number | null;
  /** Chanukah: candles lit that evening. */
  candles: number | null;
  isHoshanaRaba: boolean;
};

const ROMAN: Record<string, number> = { I: 1, II: 2, III: 3, IV: 4, V: 5, VI: 6, VII: 7, VIII: 8 };
const MULTI_DAY: ReadonlySet<HolidayKey> = new Set(["rosh-hashana", "sukkot", "pesach", "shavuot"]);

function toRawHoliday(event: Event): RawHoliday | null {
  const key = HEBCAL_HOLIDAY_KEYS[event.basename()];
  if (!key) return null;
  const desc = event.getDesc();
  const isErev = event.hasFlag("EREV");
  const isCholHamoed = event.hasFlag("CHOL_HAMOED");
  let day: number | null = null;
  let candles: number | null = null;

  if (key === "chanukah") {
    const candleMatch = /(\d+) Candles?/.exec(desc);
    if (candleMatch) candles = Number(candleMatch[1]);
    const dayMatch = /(\d+)(?:st|nd|rd|th) Day/.exec(desc);
    if (dayMatch) day = Number(dayMatch[1]);
    else if (candles && !isErev) day = candles - 1;
  } else if (MULTI_DAY.has(key) && !isErev) {
    const roman = /\b(VIII|VII|VI|IV|V|III|II|I)\b/.exec(desc);
    day = roman ? ROMAN[roman[1]] : event.hasFlag("CHAG") ? 1 : null;
  }

  return {
    date: ymdToString(eventYmd(event)),
    key,
    category: HOLIDAY_CATEGORY[key],
    isYomTov: event.hasFlag("CHAG") && !isErev,
    isErev,
    isCholHamoed,
    day,
    candles,
    isHoshanaRaba: desc.includes("Hoshana Raba"),
  };
}

/** Holidays between two civil dates (inclusive), in date order. */
export function holidaysBetween(start: Ymd, end: Ymd, il = false): RawHoliday[] {
  const [from, to] = ymdToString(start) <= ymdToString(end) ? [start, end] : [end, start];
  const events = HebrewCalendar.calendar({
    start: hebcalDate(from),
    end: hebcalDate(to),
    il,
    noRoshChodesh: true,
    noSpecialShabbat: true,
  });
  const out: RawHoliday[] = [];
  const seen = new Set<string>();
  for (const event of events) {
    const holiday = toRawHoliday(event);
    if (!holiday) continue;
    const id = `${holiday.date}|${holiday.key}|${holiday.isErev}`;
    if (seen.has(id)) continue;
    seen.add(id);
    out.push(holiday);
  }
  return out;
}

// ─── Candle lighting & Havdalah ───────────────────────────────

export type TimedObservance = {
  kind: "candles" | "havdalah";
  time: Date;
  /** Civil date of the evening the event happens on. */
  date: string;
};

/** Candle-lighting (Shabbat & Yom Tov, not Chanukah) and Havdalah times between two civil dates. */
export function timedObservances(place: GeoPoint, start: Ymd, end: Ymd): TimedObservance[] {
  const events = HebrewCalendar.calendar({
    start: hebcalDate(start),
    end: hebcalDate(end),
    location: toLocation(place),
    candlelighting: true,
    candleLightingMins: siteConfig.shabbat.candleLightingMinutesBefore,
    havdalahMins: siteConfig.shabbat.havdalahMinutesAfter,
    il: isInIsrael(place),
    noRoshChodesh: true,
    noSpecialShabbat: true,
    noMinorFast: true,
    noModern: true,
  });
  const out: TimedObservance[] = [];
  for (const event of events) {
    if (event instanceof CandleLightingEvent) {
      out.push({ kind: "candles", time: event.eventTime, date: ymdToString(eventYmd(event)) });
    } else if (event instanceof HavdalahEvent) {
      out.push({ kind: "havdalah", time: event.eventTime, date: ymdToString(eventYmd(event)) });
    }
  }
  return out.sort((a, b) => a.time.getTime() - b.time.getTime());
}

// ─── Shabbat ──────────────────────────────────────────────────

export type RawShabbat = {
  /** Friday, YYYY-MM-DD. */
  erevDate: string;
  /** Saturday, YYYY-MM-DD. */
  shabbatDate: string;
  candleLighting: Date | null;
  /** Null when a Yom Tov starts right after Shabbat (no Havdalah that night). */
  havdalah: Date | null;
  /** Hebcal parasha names (two for a double portion), or null on a holiday Shabbat. */
  parasha: string[] | null;
  parashaKey: string | null;
};

function shabbatFor(place: GeoPoint, friday: Ymd): { shabbat: RawShabbat; endsAt: Date | null } {
  const saturday = addDays(friday, 1);
  const fridayStr = ymdToString(friday);
  const saturdayStr = ymdToString(saturday);
  const timed = timedObservances(place, friday, saturday);
  const candles = timed.find((e) => e.kind === "candles" && e.date === fridayStr) ?? null;
  const havdalah = timed.find((e) => e.kind === "havdalah" && e.date === saturdayStr) ?? null;
  // When Yom Tov starts on Saturday night, hebcal gives a candle-lighting time instead of Havdalah.
  const yomTovStart = timed.find((e) => e.kind === "candles" && e.date === saturdayStr) ?? null;

  const saturdayH = hdateFor(saturday);
  const sedra = getSedra(saturdayH.getFullYear(), isInIsrael(place)).lookup(saturdayH);
  const parasha = sedra.chag ? null : [...sedra.parsha];

  return {
    shabbat: {
      erevDate: fridayStr,
      shabbatDate: saturdayStr,
      candleLighting: candles?.time ?? null,
      havdalah: havdalah?.time ?? null,
      parasha,
      parashaKey: parasha ? parashaKey(parasha) : null,
    },
    endsAt: havdalah?.time ?? yomTovStart?.time ?? null,
  };
}

/** The coming Shabbat — or the current one, from Friday until Havdalah. */
export function upcomingShabbat(place: GeoPoint, from: Date = new Date()): RawShabbat {
  const today = zonedYmd(from, place.timezone);
  const daysToFriday = today.weekday === 6 ? -1 : (5 - today.weekday + 7) % 7;
  const friday = addDays(today, daysToFriday);
  const current = shabbatFor(place, friday);
  if (today.weekday === 6 && current.endsAt && from.getTime() >= current.endsAt.getTime()) {
    return shabbatFor(place, addDays(friday, 7)).shabbat;
  }
  return current.shabbat;
}

// ─── "Is it Shabbat or a holiday now?" ────────────────────────

export type ObservanceNow = {
  active: boolean;
  kind: "shabbat" | "holiday" | null;
  endsAt: Date | null;
  /** "shabbat" or a HolidayKey. */
  key: "shabbat" | HolidayKey | null;
};

/**
 * True from candle lighting until Havdalah, on Shabbat and Yom Tov.
 * A Yom Tov that runs into Shabbat (or the reverse) is one continuous period.
 */
export function observanceAt(place: GeoPoint, at: Date = new Date()): ObservanceNow {
  const today = zonedYmd(at, place.timezone);
  const timed = timedObservances(place, addDays(today, -3), addDays(today, 3));
  const t = at.getTime();

  let windowStart: Date | null = null;
  let segments: { start: Date; observed: string }[] = [];
  for (const event of timed) {
    if (event.kind === "candles") {
      if (!windowStart) {
        windowStart = event.time;
        segments = [];
      }
      const [y, m, d] = event.date.split("-").map(Number);
      segments.push({ start: event.time, observed: ymdToString(addDays({ y, m, d }, 1)) });
      continue;
    }
    if (!windowStart) continue;
    const windowEnd = event.time;
    if (windowStart.getTime() <= t && t < windowEnd.getTime()) {
      const segment = [...segments].reverse().find((s) => s.start.getTime() <= t) ?? segments[0];
      const [y, m, d] = segment.observed.split("-").map(Number);
      const observed = { y, m, d };
      const yomTov = holidaysBetween(observed, observed, isInIsrael(place)).find((h) => h.isYomTov);
      if (yomTov) return { active: true, kind: "holiday", endsAt: windowEnd, key: yomTov.key };
      return { active: true, kind: "shabbat", endsAt: windowEnd, key: "shabbat" };
    }
    windowStart = null;
  }
  return { active: false, kind: null, endsAt: null, key: null };
}
