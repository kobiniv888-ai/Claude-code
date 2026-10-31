import "server-only";
import { getLocale } from "next-intl/server";
import type { AppLocale } from "@/config/site";
import { isAppLocale } from "@/i18n/locale";
import { getCurrentUser } from "@/lib/auth/session";

/** A place for Shabbat times: what <ShabbatTimesCard city={…} /> needs. */
export type ShabbatCityInput = {
  /** Display name in the visitor's language. */
  name: string;
  lat: number;
  lng: number;
  /** IANA zone, e.g. "Asia/Tbilisi". Times are shown in this zone. */
  timezone: string;
};

export type HeadingLevel = "h2" | "h3" | "h4";

export async function resolveLocale(locale?: AppLocale): Promise<AppLocale> {
  if (locale) return locale;
  const current = await getLocale();
  return isAppLocale(current) ? current : "en";
}

/** The signed-in user's "show Hebrew dates" preference (false for guests or if the session can't be read). */
export async function userWantsHebrewDates(): Promise<boolean> {
  try {
    const user = await getCurrentUser();
    return user?.showHebrewDates ?? false;
  } catch {
    return false;
  }
}
