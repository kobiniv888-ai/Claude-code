import { z } from "zod";
import { locales, type AppLocale } from "@/config/site";
import { REQUIRED_LOCALES } from "./localized";

/**
 * Validation for the admin content editors (pure, client-safe): the client runs the same
 * schemas before sending, the server actions run them again. Error messages are codes that
 * the UI translates with adminContent.form.errors.<code>.
 */

export const FORM_ERROR_CODES = [
  "required",
  "too_long",
  "too_short",
  "invalid",
  "invalid_slug",
  "invalid_url",
  "invalid_number",
  "out_of_range",
  "invalid_date",
  "invalid_phone",
  "invalid_airport",
  "airport_coords_required",
  "ends_before_start",
  "date_in_past",
  "date_in_future",
  "demo_not_verifiable",
  "source_required",
] as const;
export type FormErrorCode = (typeof FORM_ERROR_CODES)[number];

export const LIMITS = {
  name: 120,
  slug: 80,
  aliases: 1000,
  title: 160,
  excerpt: 400,
  articleBody: 60_000,
  question: 300,
  answer: 5000,
  alertTitle: 160,
  alertBody: 2000,
  description: 3000,
  address: 300,
  hours: 500,
  url: 500,
  placeSource: 500,
  phrase: 120,
  translation: 5000,
  emergencyLabel: 200,
  emergencyPhone: 40,
  savedReplyTitle: 120,
  savedReplyBody: 4000,
} as const;

/** Time zones a city can use (Georgia today; Israel, the UK, the UAE and the US for Phase 3). */
export const CITY_TIMEZONES = [
  "Asia/Tbilisi",
  "Asia/Jerusalem",
  "Asia/Dubai",
  "Europe/London",
  "America/New_York",
  "America/Chicago",
  "America/Denver",
  "America/Los_Angeles",
] as const;

export const JEWISH_PLACE_TYPES = [
  "SYNAGOGUE",
  "CHABAD_HOUSE",
  "KOSHER_RESTAURANT",
  "KOSHER_SHOP",
  "MIKVEH",
  "HERITAGE_SITE",
] as const;
export const FAQ_CATEGORIES = [
  "GETTING_STARTED",
  "POSTING",
  "CONTACTING_OWNERS",
  "SAFETY",
  "ACCOUNT_VERIFICATION",
  "PAYMENTS",
] as const;
export const ALERT_SEVERITIES = ["INFO", "WARNING", "CRITICAL"] as const;
export const BANNED_WORD_ACTIONS = ["FLAG", "BLOCK"] as const;
export const BANNED_WORD_CATEGORIES = ["SCAM", "CONTACT_INFO", "OFFENSIVE"] as const;
export const ARTICLE_STATUSES = ["DRAFT", "PUBLISHED"] as const;
/** Article categories offered in the editor (Article.category is free text in the database). */
export const ARTICLE_CATEGORIES = ["buying", "renting", "investing", "legal", "living", "travel"] as const;
export const STAFF_ROLE_CHOICES = ["ADMIN", "MODERATOR", "SUPPORT", "EDITOR"] as const;

// ─── Building blocks ─────────────────────────────────────────

const text = (max: number) => z.string().trim().max(max, "too_long");
const id = z.string().trim().min(1, "required").max(64, "too_long");

/** Five strings; `required` languages must be filled. */
export function localizedText(max: number, required: readonly AppLocale[] = []) {
  const shape = Object.fromEntries(locales.map((l) => [l, text(max).default("")])) as Record<
    AppLocale,
    z.ZodDefault<z.ZodString>
  >;
  return z.object(shape).superRefine((value, ctx) => {
    for (const locale of required) {
      if (!value[locale]) ctx.addIssue({ code: "custom", path: [locale], message: "required" });
    }
  });
}

export const requiredLocalized = (max: number) => localizedText(max, REQUIRED_LOCALES);
export const optionalLocalized = (max: number) => localizedText(max).prefault({});

export const SLUG_PATTERN = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;
export const slugSchema = z
  .string()
  .trim()
  .toLowerCase()
  .min(1, "required")
  .max(LIMITS.slug, "too_long")
  .regex(SLUG_PATTERN, "invalid_slug");

export const latSchema = z.number({ error: "invalid_number" }).min(-90, "out_of_range").max(90, "out_of_range");
export const lngSchema = z.number({ error: "invalid_number" }).min(-180, "out_of_range").max(180, "out_of_range");
const sortOrderSchema = z.number({ error: "invalid_number" }).int("invalid_number").min(0, "out_of_range").max(9999, "out_of_range");

/** "" or an http(s) URL. */
export function isHttpUrl(value: string): boolean {
  try {
    const url = new URL(value);
    return (url.protocol === "https:" || url.protocol === "http:") && Boolean(url.hostname);
  } catch {
    return false;
  }
}

/** A site path ("/photos/cities/tbilisi.webp", "/api/media/…") or an http(s) URL. */
export function isImageUrl(value: string): boolean {
  if (value.startsWith("/")) return !value.startsWith("//") && !/\s/.test(value) && !value.includes("..");
  return isHttpUrl(value);
}

export const optionalHttpUrl = text(LIMITS.url)
  .default("")
  .refine((v) => v === "" || isHttpUrl(v), "invalid_url");
export const optionalImageUrl = text(LIMITS.url)
  .default("")
  .refine((v) => v === "" || isImageUrl(v), "invalid_url");

/** E.164 phone number as produced by PhoneInput ("" = none). */
export const optionalPhone = z
  .string()
  .trim()
  .default("")
  .refine((v) => v === "" || /^\+[1-9]\d{6,14}$/.test(v), "invalid_phone");

const isoDate = z
  .string()
  .trim()
  .refine((v) => !Number.isNaN(Date.parse(v)), "invalid_date")
  .transform((v) => new Date(v));

/** "YYYY-MM-DD" (a calendar day, not in the future; one day of slack for time zones) → Date at UTC midnight, "" → null. */
const placeVerifiedDate = z
  .string()
  .trim()
  .default("")
  .refine((v) => v === "" || (/^\d{4}-\d{2}-\d{2}$/.test(v) && !Number.isNaN(Date.parse(`${v}T00:00:00Z`))), "invalid_date")
  .refine((v) => v === "" || Date.parse(`${v}T00:00:00Z`) <= Date.now() + 86_400_000, "date_in_future")
  .transform((v) => (v ? new Date(`${v}T00:00:00Z`) : null));

// ─── Cities and neighborhoods ────────────────────────────────

export const citySchema = z
  .object({
    names: requiredLocalized(LIMITS.name),
    aliases: text(LIMITS.aliases).default(""),
    slug: slugSchema,
    lat: latSchema,
    lng: lngSchema,
    timezone: z.enum(CITY_TIMEZONES, { error: "invalid" }),
    airportCode: z
      .string()
      .trim()
      .toUpperCase()
      .regex(/^([A-Z]{3})?$/, "invalid_airport")
      .default(""),
    airportLat: latSchema.nullable().default(null),
    airportLng: lngSchema.nullable().default(null),
    isPopular: z.boolean().default(false),
    sortOrder: sortOrderSchema.default(0),
    active: z.boolean().default(true),
    photoUrl: optionalImageUrl,
  })
  .superRefine((city, ctx) => {
    if (city.airportCode && (city.airportLat === null || city.airportLng === null)) {
      ctx.addIssue({ code: "custom", path: ["airportLat"], message: "airport_coords_required" });
    }
  });
export type CityInput = z.input<typeof citySchema>;
export type CityValues = z.output<typeof citySchema>;

export const neighborhoodSchema = z.object({
  cityId: id,
  names: requiredLocalized(LIMITS.name),
  aliases: text(LIMITS.aliases).default(""),
  slug: slugSchema,
  lat: latSchema,
  lng: lngSchema,
  sortOrder: sortOrderSchema.default(0),
  active: z.boolean().default(true),
});
export type NeighborhoodInput = z.input<typeof neighborhoodSchema>;

// ─── Jewish places ───────────────────────────────────────────

export const placeSchema = z.object({
  type: z.enum(JEWISH_PLACE_TYPES, { error: "required" }),
  names: requiredLocalized(LIMITS.name),
  description: optionalLocalized(LIMITS.description),
  address: optionalLocalized(LIMITS.address),
  hours: optionalLocalized(LIMITS.hours),
  cityId: z.string().trim().max(64).nullable().default(null),
  lat: latSchema,
  lng: lngSchema,
  phone: optionalPhone,
  website: optionalHttpUrl,
  active: z.boolean().default(true),
  isDemo: z.boolean().default(false),
  /**
   * The day the place was last checked ("YYYY-MM-DD", empty = not verified). Only verified,
   * non-demo places give listings their walking times (brief 5.9).
   */
  verifiedAt: placeVerifiedDate,
  /** Where it was checked (a call, a visit, the community's site…). Required with a date. */
  source: text(LIMITS.placeSource).default(""),
}).superRefine((place, ctx) => {
  if (!place.verifiedAt) return;
  if (place.isDemo) ctx.addIssue({ code: "custom", path: ["verifiedAt"], message: "demo_not_verifiable" });
  if (!place.source) ctx.addIssue({ code: "custom", path: ["source"], message: "source_required" });
});
export type PlaceInput = z.input<typeof placeSchema>;

// ─── Articles ────────────────────────────────────────────────

export const articleSchema = z.object({
  slug: slugSchema,
  category: z.string().trim().toLowerCase().min(1, "required").max(60, "too_long"),
  title: requiredLocalized(LIMITS.title),
  excerpt: optionalLocalized(LIMITS.excerpt),
  body: requiredLocalized(LIMITS.articleBody),
  coverUrl: optionalImageUrl,
  status: z.enum(ARTICLE_STATUSES).default("DRAFT"),
  reviewedByLawyer: z.boolean().default(false),
});
export type ArticleInput = z.input<typeof articleSchema>;

// ─── FAQ ─────────────────────────────────────────────────────

export const faqSchema = z.object({
  category: z.enum(FAQ_CATEGORIES, { error: "required" }),
  question: requiredLocalized(LIMITS.question),
  answer: requiredLocalized(LIMITS.answer),
  published: z.boolean().default(true),
});
export type FaqInput = z.input<typeof faqSchema>;

export const faqReorderSchema = z.object({
  category: z.enum(FAQ_CATEGORIES),
  ids: z.array(id).min(1).max(500),
});

// ─── Saved replies (support tickets) ─────────────────────────

/** A ready answer for ticket replies: an internal title and the text in each language. */
export const savedReplySchema = z.object({
  title: text(LIMITS.savedReplyTitle).min(1, "required"),
  body: requiredLocalized(LIMITS.savedReplyBody),
});
export type SavedReplyInput = z.input<typeof savedReplySchema>;

// ─── Scam alerts ─────────────────────────────────────────────

export const alertSchema = z
  .object({
    title: requiredLocalized(LIMITS.alertTitle),
    body: requiredLocalized(LIMITS.alertBody),
    severity: z.enum(ALERT_SEVERITIES).default("WARNING"),
    active: z.boolean().default(true),
    showAsBanner: z.boolean().default(false),
    startsAt: isoDate,
    endsAt: isoDate.nullable().default(null),
  })
  .superRefine((alert, ctx) => {
    if (alert.endsAt && alert.endsAt.getTime() <= alert.startsAt.getTime()) {
      ctx.addIssue({ code: "custom", path: ["endsAt"], message: "ends_before_start" });
    }
  });
export type AlertInput = z.input<typeof alertSchema>;

// ─── Banned words ────────────────────────────────────────────

/** "all" = the phrase applies to every language (BannedWord.locale = null). */
export const BANNED_WORD_LOCALES = ["all", ...locales] as const;

const bannedWordFields = {
  locale: z.enum(BANNED_WORD_LOCALES).default("all"),
  action: z.enum(BANNED_WORD_ACTIONS).default("FLAG"),
  category: z.enum(BANNED_WORD_CATEGORIES).default("SCAM"),
  weight: z.number({ error: "invalid_number" }).int("invalid_number").min(0, "out_of_range").max(100, "out_of_range"),
};

export const bannedWordSchema = z.object({
  phrase: z.string().trim().min(2, "too_short").max(LIMITS.phrase, "too_long"),
  ...bannedWordFields,
});
export type BannedWordInput = z.input<typeof bannedWordSchema>;

export const bannedWordBulkSchema = z.object({
  lines: z.string().max(20_000, "too_long"),
  ...bannedWordFields,
});

/** One phrase per line → trimmed, de-duplicated phrases (2–120 characters), at most 200. */
export function parseBulkPhrases(lines: string): { phrases: string[]; skipped: number } {
  const seen = new Set<string>();
  const phrases: string[] = [];
  let skipped = 0;
  for (const raw of lines.split(/\r?\n/)) {
    const phrase = raw.trim().replace(/\s+/g, " ");
    if (!phrase) continue;
    const key = phrase.toLowerCase();
    if (phrase.length < 2 || phrase.length > LIMITS.phrase || seen.has(key) || phrases.length >= 200) {
      skipped++;
      continue;
    }
    seen.add(key);
    phrases.push(phrase);
  }
  return { phrases, skipped };
}

// ─── Settings ────────────────────────────────────────────────

export const emergencyContactSchema = z
  .object({
    label: localizedText(LIMITS.emergencyLabel, ["en"]),
    phone: z.string().trim().max(LIMITS.emergencyPhone, "too_long").default(""),
    url: optionalHttpUrl,
  })
  .superRefine((entry, ctx) => {
    if (!entry.phone && !entry.url) ctx.addIssue({ code: "custom", path: ["phone"], message: "required" });
    if (entry.phone && !/^\+?[\d\s()-]{2,40}$/.test(entry.phone)) {
      ctx.addIssue({ code: "custom", path: ["phone"], message: "invalid_phone" });
    }
  });
export const emergencyContactsSchema = z.array(emergencyContactSchema).max(50);
export const emergencyContactsInputSchema = z.object({ contacts: emergencyContactsSchema });
export type EmergencyContactInput = z.input<typeof emergencyContactSchema>;

/** The exact text the admin must type before demo data is deleted. */
export const DELETE_DEMO_CONFIRMATION = "DELETE DEMO";

// ─── Featured listings, roles, translations ──────────────────

export const featuredAddSchema = z.object({
  listingId: id,
  /** "YYYY-MM-DD" — featured until the end of that day (Georgia time). */
  until: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "invalid_date"),
});

export const roleAssignSchema = z.object({ userId: id, role: z.enum(STAFF_ROLE_CHOICES) });

export const translationOverrideSchema = z.object({
  locale: z.enum(locales),
  namespace: z.string().regex(/^[A-Za-z][\w-]{0,63}$/, "invalid"),
  key: z.string().regex(/^[A-Za-z0-9_-]+(\.[A-Za-z0-9_-]+){0,9}$/, "invalid").max(300),
  value: z.string().max(LIMITS.translation, "too_long"),
});

// ─── Errors ──────────────────────────────────────────────────

/** Zod issues → { "names.he": ["required"] } (dotted paths, first code per field). */
export function issuesToFieldErrors(error: z.ZodError): Record<string, string[]> {
  const out: Record<string, string[]> = {};
  for (const issue of error.issues) {
    const path = issue.path.map(String).join(".") || "_form";
    if (out[path]) continue;
    const code = (FORM_ERROR_CODES as readonly string[]).includes(issue.message) ? issue.message : "invalid";
    out[path] = [code];
  }
  return out;
}

/** End of a calendar day in Georgia time (UTC+4, no daylight saving) as a Date. */
export function endOfGeorgiaDay(day: string): Date {
  return new Date(`${day}T23:59:59.999+04:00`);
}

/** Today's date in Georgia ("YYYY-MM-DD"). */
export function georgiaToday(now: Date = new Date()): string {
  return new Date(now.getTime() + 4 * 3600_000).toISOString().slice(0, 10);
}

/** Adds days to "YYYY-MM-DD". */
export function addDays(day: string, days: number): string {
  const d = new Date(`${day}T12:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}
