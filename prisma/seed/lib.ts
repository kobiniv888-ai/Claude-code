/**
 * Small pure helpers shared by the seed steps (no database access, safe to unit-test).
 */
import type { AppLocale, Localized } from "@/config/site";

export const DAY_MS = 24 * 60 * 60 * 1000;

/** Georgia has been on UTC+4 all year since 2005 (same rule as src/lib/listing/stats.ts). */
const GEORGIA_OFFSET_MS = 4 * 60 * 60 * 1000;

/** A { he, en, ru, ar, ka } value, written in the site's language order. */
export function L(he: string, en: string, ru: string, ar: string, ka: string): Localized {
  return { he, en, ru, ar, ka };
}

/** `days` days from `now` (negative = in the past), optionally at a fixed UTC hour for tidy times. */
export function daysFromNow(days: number, now: Date, utcHour?: number): Date {
  const date = new Date(now.getTime() + days * DAY_MS);
  if (utcHour !== undefined) date.setUTCHours(utcHour, 0, 0, 0);
  return date;
}

/** "YYYY-MM-DD" of `date` in Georgia. */
export function georgiaDay(date: Date): string {
  return new Date(date.getTime() + GEORGIA_OFFSET_MS).toISOString().slice(0, 10);
}

/**
 * The value for a DATE column (UTC midnight) of the Georgia day `days` days from `now` —
 * ListingStatDaily.date and AvailabilityBlock dates use this form.
 */
export function georgiaDate(days: number, now: Date): Date {
  return new Date(`${georgiaDay(new Date(now.getTime() + days * DAY_MS))}T00:00:00.000Z`);
}

/** Deterministic pseudo-random numbers in [0, 1) from a string seed (mulberry32 over an FNV-1a hash). */
export function seededRandom(seed: string): () => number {
  let h = 2166136261;
  for (let i = 0; i < seed.length; i++) {
    h ^= seed.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  let state = h >>> 0;
  return () => {
    state = (state + 0x6d2b79f5) >>> 0;
    let t = state;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** An integer in [min, max] from a seeded generator. */
export function randomInt(rand: () => number, min: number, max: number): number {
  return min + Math.floor(rand() * (max - min + 1));
}

/** The stored URL of a demo photo on Unsplash's image CDN (resized per use by @/lib/media). */
export function unsplashPhotoUrl(photoId: string): string {
  if (!/^photo-\d{10,13}-[0-9a-f]{12}$/.test(photoId)) throw new Error(`Not an Unsplash photo id: ${photoId}`);
  return `https://images.unsplash.com/${photoId}?w=1600&q=75&auto=format&fit=crop`;
}

/** Words in a text (any script). */
export function wordCount(text: string): number {
  return text.split(/\s+/u).filter((word) => /[\p{L}\p{N}]/u.test(word)).length;
}

export type DailyStat = {
  /** Days from today (0 = today, -1 = yesterday…). */
  day: number;
  views: number;
  contacts: number;
  saves: number;
  contactsByChannel: Partial<Record<string, number>>;
};

/**
 * Plausible daily numbers for an owner's dashboard: more views at weekends and right after
 * publishing, about one contact per 15–25 views, split over the listing's contact channels
 * (the first channel gets most). Deterministic for a given seed.
 */
export function generateDailyStats(opts: {
  seed: string;
  /** Inclusive range of days from today, e.g. { from: -29, to: 0 }. */
  from: number;
  to: number;
  /** Day the listing went live (days from today); views are higher in its first week. */
  publishedDay: number;
  baseViews: number;
  channels: readonly string[];
  now: Date;
}): DailyStat[] {
  const rand = seededRandom(opts.seed);
  const stats: DailyStat[] = [];
  for (let day = opts.from; day <= opts.to; day++) {
    if (day < opts.publishedDay) continue;
    const weekday = new Date(opts.now.getTime() + day * DAY_MS).getUTCDay();
    const weekend = weekday === 5 || weekday === 6 ? 1.35 : 1;
    const fresh = day - opts.publishedDay < 7 ? 1.6 : 1;
    const views = Math.max(1, Math.round(opts.baseViews * weekend * fresh * (0.6 + rand() * 0.8)));
    const contacts = Math.floor(views / randomInt(rand, 15, 25) + rand() * 0.8);
    const saves = Math.floor(views / randomInt(rand, 20, 40) + rand() * 0.5);
    const contactsByChannel: Partial<Record<string, number>> = {};
    for (let i = 0; i < contacts; i++) {
      const roll = rand();
      const index = opts.channels.length === 1 || roll < 0.65 ? 0 : 1 + Math.floor(rand() * (opts.channels.length - 1));
      const channel = opts.channels[index];
      contactsByChannel[channel] = (contactsByChannel[channel] ?? 0) + 1;
    }
    stats.push({ day, views, contacts, saves, contactsByChannel });
  }
  return stats;
}

/** Fails loudly when a localized value misses a language (catches typos in the seed data). */
export function assertLocalized(value: Partial<Record<AppLocale, unknown>>, label: string): void {
  for (const locale of ["he", "en", "ru", "ar", "ka"] as const) {
    const text = value[locale];
    if (typeof text !== "string" || !text.trim()) throw new Error(`${label}: missing "${locale}" text`);
  }
}
