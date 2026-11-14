import "server-only";
import { cache as requestCache } from "react";
import { z } from "zod";
import type { Prisma } from "@/generated/prisma/client";
import { currencyCodes, locales, siteConfig, type AppLocale, type CurrencyCode } from "@/config/site";
import { audit } from "@/lib/audit";
import { isEnabledCurrency } from "@/lib/currency/convert";
import { db } from "@/lib/db";
import { ShabbatModeError, ValidationError } from "@/lib/errors";
import { isShabbatOrHolidayNow } from "@/lib/hebcal";
import { demoAllowed } from "@/lib/site-env";

/**
 * Runtime site settings that admins change in /admin/settings (table SiteSetting,
 * one row per key, JSON value). Defaults come from src/config/site.ts.
 *
 *   const settings = await getSettings();
 *   await updateSettings({ listingExpiryDays: 90 }, staff.id);   // validated + audited
 */

/**
 * Home page sections that admins can switch off or reorder (Admin → Content → Home), in their
 * default order (round 3, brief 4: a lighter home page). The hero band, the search card, the
 * promise line and, for returning visitors, "המשך מאיפה שעצרתם" always show; see
 * app/[locale]/(site)/page.tsx.
 *   categories → the category chips · featured → "Recommended places" (the selected tab's type:
 *   promoted, then newest) · cities → "Where to?" · howItWorks → the 3-step row ·
 *   listCta → the host card.
 */
export const HOME_SECTION_KEYS = ["categories", "featured", "cities", "howItWorks", "listCta"] as const;
export type HomeSectionKey = (typeof HOME_SECTION_KEYS)[number];

export type PaidFeatureKey = keyof typeof siteConfig.paidFeatures;
const PAID_FEATURE_KEYS = Object.keys(siteConfig.paidFeatures) as PaidFeatureKey[];

export type SiteSettings = {
  /** Days a listing stays LIVE before it expires. */
  listingExpiryDays: number;
  /** Pause posting, messaging and support during Shabbat and holidays (Israel time). */
  shabbatModeEnabled: boolean;
  /** Display currency when nothing else decides (cookie, account, country). */
  defaultCurrency: CurrencyCode;
  /** Listings with a risk score at or above this wait for a moderator. */
  reviewRiskThreshold: number;
  /** Open reports that hide a listing until a moderator checks it. */
  reportsToAutoHide: number;
  /** Show the current scam-alert banner on the site. */
  scamBannerEnabled: boolean;
  /**
   * Show demo listings on public pages. Always false on the real site (SITE_ENV=production),
   * whatever is stored (SECURITY_REPORT 19.i, C18): see `effectiveSettings`.
   */
  demoDataVisible: boolean;
  /** Home page sections, in display order. */
  homeSections: { key: HomeSectionKey; enabled: boolean }[];
  /** Hand-picked listings for the "Featured" home section (Listing ids). */
  featuredListingIds: string[];
  /** Prices of paid features in USD (Phase 2). */
  paidFeaturePrices: Record<PaidFeatureKey, number>;
  /**
   * Hosts whose accepted welcome-pledge version is below this lose the green "welcomes Israelis"
   * badge until they accept again (1 … siteConfig.pledge.currentVersion).
   */
  pledgeRequiredVersion: number;
  /**
   * The support reply promise shown on the help, contact and ticket pages (SECURITY_REPORT 19.b,
   * founder's answer 9), per language. Empty for a language = the default text in
   * messages/<locale>/help.json `replyTime.promise` (the founder's exact wording).
   */
  supportReplyPromise: Partial<Record<AppLocale, string>>;
};

export const DEFAULT_SETTINGS: SiteSettings = {
  listingExpiryDays: siteConfig.listings.defaultExpiryDays,
  shabbatModeEnabled: false,
  defaultCurrency: siteConfig.currencies.fallback,
  reviewRiskThreshold: siteConfig.safety.reviewRiskThreshold,
  reportsToAutoHide: siteConfig.safety.reportsToAutoHide,
  scamBannerEnabled: true,
  demoDataVisible: true,
  homeSections: HOME_SECTION_KEYS.map((key) => ({ key, enabled: true })),
  featuredListingIds: [],
  paidFeaturePrices: Object.fromEntries(
    PAID_FEATURE_KEYS.map((key) => [key, siteConfig.paidFeatures[key].priceUsd]),
  ) as Record<PaidFeatureKey, number>,
  pledgeRequiredVersion: siteConfig.pledge.currentVersion,
  supportReplyPromise: {},
};

// ─── Validation ───────────────────────────────────────────────

const homeSectionsSchema = z
  .array(z.object({ key: z.enum(HOME_SECTION_KEYS), enabled: z.boolean() }))
  .max(HOME_SECTION_KEYS.length)
  .refine((list) => new Set(list.map((s) => s.key)).size === list.length, "Each section can appear once");

/** One schema per setting; the admin form and the database values are both checked with it. */
export const settingSchemas = {
  listingExpiryDays: z.number().int().min(7).max(365),
  shabbatModeEnabled: z.boolean(),
  defaultCurrency: z.enum(currencyCodes).refine(isEnabledCurrency, "Not an enabled currency"),
  reviewRiskThreshold: z.number().int().min(0).max(100),
  reportsToAutoHide: z.number().int().min(1).max(50),
  scamBannerEnabled: z.boolean(),
  demoDataVisible: z.boolean(),
  homeSections: homeSectionsSchema,
  featuredListingIds: z.array(z.string().min(1).max(64)).max(48),
  paidFeaturePrices: z.object(
    Object.fromEntries(PAID_FEATURE_KEYS.map((key) => [key, z.number().min(0).max(10_000)])) as Record<
      PaidFeatureKey,
      z.ZodNumber
    >,
  ),
  pledgeRequiredVersion: z.number().int().min(1).max(siteConfig.pledge.currentVersion),
  supportReplyPromise: z
    .object(Object.fromEntries(locales.map((locale) => [locale, z.string().trim().max(300)])) as Record<AppLocale, z.ZodString>)
    .partial()
    .strict()
    .transform((value) => Object.fromEntries(Object.entries(value).filter(([, text]) => !!text)) as Partial<Record<AppLocale, string>>),
} satisfies { [K in keyof SiteSettings]: z.ZodType };

export const settingsPatchSchema = z.object(settingSchemas).partial().strict();
export type SettingsPatch = Partial<SiteSettings>;

const SETTING_KEYS = Object.keys(settingSchemas) as (keyof SiteSettings)[];

/** Keeps saved order, drops unknown sections and appends sections added in a later release. */
/**
 * Older keys in stored settings: "newest" merged into "featured"; "whyUs", "safetyStrip" (round 1),
 * "shabbatTimes"/"jewishLife" and "recentlyViewed" (round 3: Jewish life stays in the menu, the
 * footer and the "כשר ושבת" chip; recently viewed moved into "המשך מאיפה שעצרתם" under the search
 * card) left the list. Unknown keys are dropped, so an old stored list still validates instead of
 * falling back to the defaults.
 */
const LEGACY_HOME_SECTIONS: Record<string, HomeSectionKey | null> = {
  shabbatTimes: null,
  jewishLife: null,
  recentlyViewed: null,
  newest: null,
  whyUs: null,
  safetyStrip: null,
};

function migrateHomeSections(value: unknown): unknown {
  if (!Array.isArray(value)) return value;
  const seen = new Set<string>();
  return value.flatMap((item: unknown) => {
    if (!item || typeof item !== "object" || !("key" in item) || typeof item.key !== "string") return [item];
    const key = Object.hasOwn(LEGACY_HOME_SECTIONS, item.key) ? LEGACY_HOME_SECTIONS[item.key] : item.key;
    if (!key || !(HOME_SECTION_KEYS as readonly string[]).includes(key) || seen.has(key)) return [];
    seen.add(key);
    return [{ ...item, key }];
  });
}

function normalizeHomeSections(list: SiteSettings["homeSections"]): SiteSettings["homeSections"] {
  const known = list.filter((s) => (HOME_SECTION_KEYS as readonly string[]).includes(s.key));
  const present = new Set(known.map((s) => s.key));
  return [...known, ...HOME_SECTION_KEYS.filter((k) => !present.has(k)).map((key) => ({ key, enabled: true }))];
}

/** Merges stored rows over the defaults; invalid stored values fall back to the default. */
export function mergeSettings(rows: { key: string; value: unknown }[]): SiteSettings {
  const settings: SiteSettings = structuredClone(DEFAULT_SETTINGS);
  const target = settings as Record<keyof SiteSettings, unknown>;
  for (const { key, value } of rows) {
    if (!(SETTING_KEYS as string[]).includes(key)) continue;
    const settingKey = key as keyof SiteSettings;
    if (settingKey === "paidFeaturePrices" && value && typeof value === "object") {
      // Merge per feature so a new paid feature keeps its default price.
      const merged = { ...DEFAULT_SETTINGS.paidFeaturePrices, ...(value as Record<string, unknown>) };
      const parsed = settingSchemas.paidFeaturePrices.safeParse(
        Object.fromEntries(PAID_FEATURE_KEYS.map((k) => [k, merged[k]])),
      );
      if (parsed.success) settings.paidFeaturePrices = parsed.data;
      else console.warn(`[settings] ignoring invalid stored value for "${key}"`);
      continue;
    }
    const parsed = settingSchemas[settingKey].safeParse(
      settingKey === "homeSections" ? migrateHomeSections(value) : value,
    );
    if (parsed.success) target[settingKey] = parsed.data;
    else console.warn(`[settings] ignoring invalid stored value for "${key}"`);
  }
  settings.homeSections = normalizeHomeSections(settings.homeSections);
  return settings;
}

// ─── Read ─────────────────────────────────────────────────────

const CACHE_MS = process.env.NODE_ENV === "production" ? 30_000 : 0;
let cache: { settings: SiteSettings; at: number } | null = null;

/**
 * What the site actually uses: the stored settings, except that demo listings never show on the
 * real site (SITE_ENV=production, or SITE_ENV missing: fail closed), even when the admin switch
 * is on. On development and staging sites the switch works as stored.
 */
export function effectiveSettings(settings: SiteSettings): SiteSettings {
  return settings.demoDataVisible && !demoAllowed() ? { ...settings, demoDataVisible: false } : settings;
}

async function loadSettings(): Promise<SiteSettings> {
  if (cache && Date.now() - cache.at < CACHE_MS) return effectiveSettings(cache.settings);
  try {
    const rows = await db.siteSetting.findMany({ select: { key: true, value: true } });
    const settings = mergeSettings(rows);
    cache = { settings, at: Date.now() };
    return effectiveSettings(settings);
  } catch (error) {
    console.error("[settings] could not read settings, using defaults:", error);
    return effectiveSettings(cache?.settings ?? structuredClone(DEFAULT_SETTINGS));
  }
}

/**
 * Current settings — cached 30 s in production (none in development) and read once per request.
 * Never throws: falls back to the defaults when the database is unavailable. Demo listings are
 * always off on the real site (`effectiveSettings`).
 */
export const getSettings: () => Promise<SiteSettings> = requestCache(loadSettings);

export function clearSettingsCache() {
  cache = null;
}

// ─── Write ────────────────────────────────────────────────────

/**
 * Validates and saves changed settings, then writes "settings.update" to the audit log.
 * Throws ValidationError for invalid input. Check the staff permission before calling.
 */
export async function updateSettings(patch: unknown, actorId: string): Promise<SiteSettings> {
  const parsed = settingsPatchSchema.safeParse(patch);
  if (!parsed.success) throw new ValidationError(z.flattenError(parsed.error).fieldErrors);
  const changes = parsed.data as SettingsPatch;
  if (changes.homeSections) changes.homeSections = normalizeHomeSections(changes.homeSections);

  clearSettingsCache(); // compare against fresh values, not another instance's stale copy
  const before = await loadSettings();
  const keys = (Object.keys(changes) as (keyof SiteSettings)[]).filter(
    (key) => JSON.stringify(before[key]) !== JSON.stringify(changes[key]),
  );
  if (keys.length === 0) return before;

  await db.$transaction(
    keys.map((key) => {
      const value = changes[key] as Prisma.InputJsonValue;
      return db.siteSetting.upsert({
        where: { key },
        create: { key, value, updatedById: actorId },
        update: { value, updatedById: actorId },
      });
    }),
  );
  clearSettingsCache();

  await audit({
    actorId,
    action: "settings.update",
    targetType: "SiteSetting",
    targetId: keys.join(","),
    details: {
      changes: Object.fromEntries(keys.map((key) => [key, { from: before[key], to: changes[key] }])),
    },
  });

  return loadSettings();
}

// ─── Shabbat mode ─────────────────────────────────────────────

/** Shabbat mode is on in settings AND it is Shabbat or Yom Tov in Israel right now. */
export async function isShabbatModeActive(at: Date = new Date()): Promise<{ active: boolean; endsAt: Date | null }> {
  const settings = await getSettings();
  if (!settings.shabbatModeEnabled) return { active: false, endsAt: null };
  try {
    const now = isShabbatOrHolidayNow(siteConfig.shabbat.israel, at);
    return { active: now.active, endsAt: now.endsAt };
  } catch (error) {
    console.error("[settings] Shabbat check failed:", error);
    return { active: false, endsAt: null };
  }
}

/** Call at the start of posting, messaging and support actions. Throws ShabbatModeError. */
export async function assertNotShabbatMode(): Promise<void> {
  const { active, endsAt } = await isShabbatModeActive();
  if (active) throw new ShabbatModeError(endsAt);
}
