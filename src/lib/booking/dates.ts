/**
 * Booking dates (client-safe, pure). A stay is two calendar days in Georgia ("YYYY-MM-DD",
 * Asia/Tbilisi): checkIn is the first night, checkOut the morning the guest leaves (exclusive).
 * nights = checkOut − checkIn. Weekend nights are Friday and Saturday nights.
 *
 * Database columns are `@db.Date`: Prisma reads and writes them as UTC midnight, so a day string
 * maps to `new Date("YYYY-MM-DDT00:00:00Z")` and back with toISOString().slice(0, 10).
 */

import { COUNTRIES, DEFAULT_COUNTRY } from "@/config/countries";

/** Georgia's zone (src/config/countries.ts). Hotels and stays in another country will pass their own. */
export const BOOKING_TIME_ZONE = COUNTRIES[DEFAULT_COUNTRY].timezone;

const DAY_MS = 86_400_000;
const DAY_PATTERN = /^\d{4}-\d{2}-\d{2}$/;

/** Georgia (BOOKING_TIME_ZONE) has used UTC+4 all year since 2005 (no daylight saving). */
const TBILISI_OFFSET_MS = 4 * 3600 * 1000;

/** True for a real calendar day "YYYY-MM-DD" (rejects 2026-02-30). */
export function isDay(value: unknown): value is string {
  if (typeof value !== "string" || !DAY_PATTERN.test(value)) return false;
  const time = Date.parse(`${value}T00:00:00Z`);
  return Number.isFinite(time) && new Date(time).toISOString().slice(0, 10) === value;
}

/** Today in Georgia, "YYYY-MM-DD". */
export function tbilisiToday(now: Date = new Date()): string {
  return new Date(now.getTime() + TBILISI_OFFSET_MS).toISOString().slice(0, 10);
}

/** "YYYY-MM-DD" → the Date Prisma uses for a @db.Date column (UTC midnight). */
export function dayToDate(day: string): Date {
  return new Date(`${day}T00:00:00.000Z`);
}

/** A @db.Date value (UTC midnight) → "YYYY-MM-DD". */
export function dateToDay(date: Date): string {
  return date.toISOString().slice(0, 10);
}

export function addDays(day: string, days: number): string {
  return new Date(Date.parse(`${day}T00:00:00Z`) + days * DAY_MS).toISOString().slice(0, 10);
}

/** Whole days from `from` to `to` (negative when `to` is earlier). */
export function daysBetween(from: string, to: string): number {
  return Math.round((Date.parse(`${to}T00:00:00Z`) - Date.parse(`${from}T00:00:00Z`)) / DAY_MS);
}

/** Nights of a stay (0 when the range is empty or reversed). */
export function nightsBetween(checkIn: string, checkOut: string): number {
  return Math.max(0, daysBetween(checkIn, checkOut));
}

/** Every night of the stay: checkIn, checkIn+1, …, checkOut−1. */
export function eachNight(checkIn: string, checkOut: string): string[] {
  const nights = nightsBetween(checkIn, checkOut);
  return Array.from({ length: nights }, (_, i) => addDays(checkIn, i));
}

/** 0 = Sunday … 6 = Saturday. */
export function weekdayOf(day: string): number {
  return new Date(`${day}T00:00:00Z`).getUTCDay();
}

/** Friday and Saturday nights use the weekend price. */
export function isWeekendNight(day: string): boolean {
  const weekday = weekdayOf(day);
  return weekday === 5 || weekday === 6;
}

/** Midnight at the start of a Georgian calendar day, as an instant (UTC+4, no daylight saving). */
export function startOfTbilisiDay(day: string): Date {
  return new Date(Date.parse(`${day}T00:00:00Z`) - TBILISI_OFFSET_MS);
}

/** When a stay starts when the host gives no check-in time. */
export const DEFAULT_CHECK_IN_TIME = "14:00";

/** "HH:MM" (00:00–23:59), or null. */
export function cleanTime(value: string | null | undefined): string | null {
  const match = /^(\d{1,2}):(\d{2})$/.exec(value?.trim() ?? "");
  if (!match) return null;
  const hours = Number(match[1]);
  const minutes = Number(match[2]);
  return hours < 24 && minutes < 60 ? `${String(hours).padStart(2, "0")}:${match[2]}` : null;
}

/** The check-in instant: the check-in day at the host's "check-in from" time (else 14:00), Georgia time. */
export function checkInMoment(checkIn: string, checkInTime?: string | null): Date {
  const time = cleanTime(checkInTime) ?? DEFAULT_CHECK_IN_TIME;
  return new Date(Date.parse(`${checkIn}T${time}:00Z`) - TBILISI_OFFSET_MS);
}
