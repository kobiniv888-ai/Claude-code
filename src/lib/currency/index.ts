import "server-only";
import { cookies } from "next/headers";
import { getLocale } from "next-intl/server";
import { siteConfig, type CurrencyCode } from "@/config/site";
import { db } from "@/lib/db";
import { getCountryCode } from "@/lib/request";
import { getSettings } from "@/lib/settings";
import { CURRENCY_COOKIE_NAME } from "./cookie";
import { defaultCurrencyForLocale } from "./defaults";
import { FALLBACK_RATES, enabledCurrencies, isEnabledCurrency, normalizeRates, type Rates } from "./convert";

/**
 * Display currency and exchange rates (server-only).
 *
 * Rates: the newest ExchangeRate row younger than 3 days, else the fallback table in
 * src/config/site.ts. Refreshed daily by refreshExchangeRates() (cron), and on demand
 * when the stored rates are too old.
 */

export { convert, toUsd, enabledCurrencies, isEnabledCurrency, type Rates } from "./convert";

export { CURRENCY_COOKIE_NAME } from "./cookie";

const RATES_SOURCE_URL = "https://open.er-api.com/v6/latest/USD";
const RATES_MAX_AGE_MS = 3 * 24 * 3600 * 1000;
const CACHE_MS = 10 * 60 * 1000;
const REFRESH_RETRY_MS = 60 * 60 * 1000;

let ratesCache: { rates: Rates; fetchedAt: Date | null; at: number } | null = null;
let lastRefreshAttempt = 0;

/** Rates with when they were fetched (null = fallback table). */
export async function getRatesInfo(): Promise<{ rates: Rates; fetchedAt: Date | null }> {
  if (ratesCache && Date.now() - ratesCache.at < CACHE_MS) {
    return { rates: ratesCache.rates, fetchedAt: ratesCache.fetchedAt };
  }
  let rates: Rates = { ...FALLBACK_RATES };
  let fetchedAt: Date | null = null;
  try {
    const row = await db.exchangeRate.findFirst({
      where: { base: "USD", fetchedAt: { gte: new Date(Date.now() - RATES_MAX_AGE_MS) } },
      orderBy: { fetchedAt: "desc" },
      select: { rates: true, fetchedAt: true },
    });
    if (row) {
      rates = normalizeRates(row.rates);
      fetchedAt = row.fetchedAt;
    } else {
      scheduleRefresh();
    }
  } catch (error) {
    console.error("[currency] could not read exchange rates, using fallback rates:", error);
  }
  ratesCache = { rates, fetchedAt, at: Date.now() };
  return { rates, fetchedAt };
}

/** Units of each currency per 1 USD. Never throws. */
export async function getRates(): Promise<Rates> {
  return (await getRatesInfo()).rates;
}

/** No fresh rates stored: try to fetch them in the background (at most once an hour). */
function scheduleRefresh() {
  if (process.env.NODE_ENV === "test") return;
  const now = Date.now();
  if (now - lastRefreshAttempt < REFRESH_RETRY_MS) return;
  lastRefreshAttempt = now;
  refreshExchangeRates().catch(() => {});
}

type ErApiResponse = { result?: string; base_code?: string; rates?: Record<string, number> };

/**
 * Fetches today's rates from open.er-api.com (free, no key), stores an ExchangeRate row and
 * returns them. Fail-safe: on any error it logs and returns the current rates.
 */
export async function refreshExchangeRates(): Promise<Rates> {
  lastRefreshAttempt = Date.now();
  try {
    const res = await fetch(RATES_SOURCE_URL, { signal: AbortSignal.timeout(10_000), cache: "no-store" });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const data = (await res.json()) as ErApiResponse;
    if (data.result !== "success" || data.base_code !== "USD" || !data.rates) {
      throw new Error(`unexpected response (${data.result ?? "no result"})`);
    }
    const missing = enabledCurrencies.filter((code) => !(Number(data.rates?.[code]) > 0));
    if (missing.length > 0) throw new Error(`missing rates for ${missing.join(", ")}`);

    const rates = normalizeRates(data.rates);
    const row = await db.exchangeRate.create({
      data: { base: "USD", rates, source: "open.er-api.com" },
      select: { fetchedAt: true },
    });
    ratesCache = { rates, fetchedAt: row.fetchedAt, at: Date.now() };
    return rates;
  } catch (error) {
    console.error("[currency] exchange-rate refresh failed:", error);
    ratesCache = null;
    return getRates();
  }
}

/**
 * The currency prices are shown in for this visitor:
 * their choice (cookie) → their account setting → the interface language (he/ru/ar → ILS,
 * en → USD, ka → GEL)
 * → their country → the admin default → USD.
 * Only enabled currencies are returned. Pass the signed-in user's `User.currency`; `locale`
 * defaults to the request's locale (next-intl).
 */
export async function getDisplayCurrency(userCurrency?: string | null, locale?: string): Promise<CurrencyCode> {
  return (await getDisplayCurrencyState(userCurrency, locale)).currency;
}

/**
 * getDisplayCurrency() plus where it came from: `chosen` when the visitor picked it (cookie or
 * account setting), false when it is the automatic one (language, country, admin default). The
 * switcher and the settings form show "Automatic (by language)" as selected when it is false.
 */
export async function getDisplayCurrencyState(
  userCurrency?: string | null,
  locale?: string,
): Promise<{ currency: CurrencyCode; chosen: boolean }> {
  try {
    const fromCookie = (await cookies()).get(CURRENCY_COOKIE_NAME)?.value;
    if (isEnabledCurrency(fromCookie)) return { currency: fromCookie, chosen: true };
  } catch {
    // Outside a request (scripts): no cookie.
  }

  if (isEnabledCurrency(userCurrency)) return { currency: userCurrency, chosen: true };
  return { currency: await automaticCurrency(locale), chosen: false };
}

/** The currency for a visitor who has not chosen one: language → country → admin default → USD. */
async function automaticCurrency(locale?: string): Promise<CurrencyCode> {
  let pageLocale = locale;
  if (!pageLocale) {
    try {
      pageLocale = await getLocale();
    } catch {
      // Outside a request: no locale.
    }
  }
  const byLocale = defaultCurrencyForLocale(pageLocale);
  if (isEnabledCurrency(byLocale)) return byLocale;

  try {
    const country = await getCountryCode();
    const byCountry = country ? siteConfig.currencies.byCountry[country] : undefined;
    if (isEnabledCurrency(byCountry)) return byCountry;
  } catch {
    // No request headers.
  }

  const settings = await getSettings();
  if (isEnabledCurrency(settings.defaultCurrency)) return settings.defaultCurrency;
  return isEnabledCurrency(siteConfig.currencies.fallback) ? siteConfig.currencies.fallback : enabledCurrencies[0];
}
