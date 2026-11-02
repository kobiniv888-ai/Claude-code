import "server-only";
import { locales, type AppLocale } from "@/config/site";
import { isAppLocale } from "@/i18n/locale";
import { db } from "@/lib/db";
import { normalizeSearchText, SEARCH_TEXT_SEPARATOR, splitSearchText } from "@/lib/search-text";

/**
 * Automatic translation of listings (server-only) with Google Cloud Translation v2 (REST).
 *
 * GOOGLE_TRANSLATE_API_KEY — an API key restricted to the "Cloud Translation API". Without it
 * translation is OFF: a listing only has its original-language row and every page shows the
 * owner's text (with a "not translated yet" note). Hebrew, Russian, Arabic and Georgian are all
 * supported by v2. The key is sent in the X-Goog-Api-Key header, never in the URL.
 *
 *   await translateListing(listing.id);                 // after the owner saves text
 *   await translateListing(listing.id, { force: true }); // admin: "translate again"
 *   const { text, translated } = await translateForLocale(note, owner.locale);
 */

const API_URL = "https://translation.googleapis.com/language/translate/v2";
const TIMEOUT_MS = 15_000;
/** Google recommends ≤ 30k characters per request; listings are far below. */
const MAX_CHARS = 30_000;

export function isTranslationEnabled(): boolean {
  return Boolean(process.env.GOOGLE_TRANSLATE_API_KEY?.trim());
}

/** Google still answers "iw" for Hebrew in detectedSourceLanguage. */
function fromGoogleLanguage(code: string | undefined): string | undefined {
  if (!code) return undefined;
  const base = code.toLowerCase().split("-")[0];
  return base === "iw" ? "he" : base;
}

type GoogleResponse = {
  data?: { translations?: { translatedText?: string; detectedSourceLanguage?: string }[] };
  error?: { message?: string };
};

/**
 * Translates several texts in one request. Empty texts stay empty. `from` omitted = auto-detect.
 * Returns null when translation is off or the request failed (logged).
 */
async function translateBatch(
  texts: string[],
  to: AppLocale,
  from?: AppLocale,
): Promise<{ text: string; detected?: string }[] | null> {
  const key = process.env.GOOGLE_TRANSLATE_API_KEY?.trim();
  if (!key) return null;
  const indexes = texts.map((t, i) => (t.trim() ? i : -1)).filter((i) => i >= 0);
  const out = texts.map((text) => ({ text, detected: undefined as string | undefined }));
  if (indexes.length === 0) return out;
  const q = indexes.map((i) => texts[i]);
  if (q.reduce((sum, t) => sum + t.length, 0) > MAX_CHARS) {
    console.error("[translate] text too long to translate in one request");
    return null;
  }

  try {
    const res = await fetch(API_URL, {
      method: "POST",
      headers: { "Content-Type": "application/json; charset=utf-8", "X-Goog-Api-Key": key },
      body: JSON.stringify({ q, target: to, format: "text", ...(from ? { source: from } : {}) }),
      signal: AbortSignal.timeout(TIMEOUT_MS),
      cache: "no-store",
    });
    const data = (await res.json().catch(() => ({}))) as GoogleResponse;
    if (!res.ok) throw new Error(`HTTP ${res.status}: ${data.error?.message ?? "no details"}`);
    const translations = data.data?.translations ?? [];
    if (translations.length !== q.length) throw new Error("unexpected number of translations");
    indexes.forEach((textIndex, i) => {
      out[textIndex] = {
        text: translations[i].translatedText ?? "",
        detected: fromGoogleLanguage(translations[i].detectedSourceLanguage),
      };
    });
    return out;
  } catch (error) {
    console.error(`[translate] translation to "${to}" failed:`, error);
    return null;
  }
}

/** One text from one language to another. Null when translation is off or failed. */
export async function translateText(text: string, from: AppLocale, to: AppLocale): Promise<string | null> {
  if (!text.trim() || from === to) return text;
  const result = await translateBatch([text], to, from);
  return result ? result[0].text : null;
}

/**
 * Translates `text` (any language, auto-detected) into `to` — used for moderator notes sent to
 * owners. Returns the original with translated: false when it is already in that language,
 * translation is off, or it failed.
 */
export async function translateForLocale(text: string, to: AppLocale | string): Promise<{ text: string; translated: boolean }> {
  if (!text.trim() || !isAppLocale(to) || !isTranslationEnabled()) return { text, translated: false };
  const result = await translateBatch([text], to);
  if (!result) return { text, translated: false };
  const [{ text: translatedText, detected }] = result;
  if (!detected || detected === to || !translatedText.trim()) return { text, translated: false };
  return { text: translatedText, translated: true };
}

export type TranslateListingResult = {
  enabled: boolean;
  /** Languages that got a new automatic translation in this call. */
  translated: AppLocale[];
  /** Languages kept because the owner wrote them by hand. */
  keptOwnerEdits: AppLocale[];
};

/**
 * Keeps ListingTranslation in step with the listing's text:
 * - the original language always has a row (isOriginal) equal to Listing.title/description;
 * - with translation on, the other four languages get automatic rows (isAuto) — re-translated
 *   only when the original changed (or `force`); rows the owner edited (editedByOwner) are
 *   never overwritten;
 * - with translation off, outdated automatic rows are removed so no stale text is shown.
 * Then refreshes Listing.searchText. Never throws for translation errors (they are logged).
 */
export async function translateListing(
  listingId: string,
  opts: { force?: boolean } = {},
): Promise<TranslateListingResult> {
  const listing = await db.listing.findUnique({
    where: { id: listingId },
    select: {
      id: true,
      title: true,
      description: true,
      originalLocale: true,
      translations: {
        select: { id: true, locale: true, title: true, description: true, isOriginal: true, isAuto: true, editedByOwner: true },
      },
    },
  });
  if (!listing) throw new Error(`translateListing: listing ${listingId} not found`);

  const enabled = isTranslationEnabled();
  const original = listing.originalLocale as AppLocale;
  const rows = new Map(listing.translations.map((row) => [row.locale as AppLocale, row]));
  const originalRow = rows.get(original);
  const sourceChanged =
    !originalRow ||
    !originalRow.isOriginal ||
    originalRow.title !== listing.title ||
    originalRow.description !== listing.description;

  await db.listingTranslation.upsert({
    where: { listingId_locale: { listingId, locale: original } },
    create: { listingId, locale: original, title: listing.title, description: listing.description, isOriginal: true },
    update: { title: listing.title, description: listing.description, isOriginal: true, isAuto: false, editedByOwner: false },
  });

  const result: TranslateListingResult = { enabled, translated: [], keptOwnerEdits: [] };
  const targets = locales.filter((locale) => locale !== original);

  await Promise.all(
    targets.map(async (locale) => {
      const row = rows.get(locale);
      if (row?.editedByOwner) {
        if (row.isOriginal) {
          await db.listingTranslation.update({ where: { id: row.id }, data: { isOriginal: false } });
        }
        result.keptOwnerEdits.push(locale);
        return;
      }
      // A former original (the owner switched language) is treated like an automatic row.
      const stale = !!row && (sourceChanged || row.isOriginal || !!opts.force);
      if (row && !stale && row.isAuto) return;

      const translated = enabled && (listing.title || listing.description)
        ? await translateBatch([listing.title, listing.description], locale, original)
        : null;
      if (translated) {
        const data = { title: translated[0].text, description: translated[1].text, isOriginal: false, isAuto: true, editedByOwner: false };
        await db.listingTranslation.upsert({
          where: { listingId_locale: { listingId, locale } },
          create: { listingId, locale, ...data },
          update: data,
        });
        result.translated.push(locale);
      } else if (row && (stale || !row.isAuto)) {
        await db.listingTranslation.delete({ where: { id: row.id } }).catch(() => undefined);
      }
    }),
  );

  await updateListingSearchText(listingId);
  return result;
}

/** Listing statuses worth translating: everything a visitor or a moderator can read (not drafts). */
const TRANSLATABLE_STATUSES = ["IN_REVIEW", "NEEDS_CHANGES", "LIVE", "PAUSED", "HIDDEN", "RENTED", "SOLD", "EXPIRED"] as const;

/**
 * The languages a listing still lacks a translation for (pure). Owner-written rows count as
 * present, so they are never replaced.
 */
export function missingTranslationLocales(originalLocale: string, presentLocales: readonly string[]): AppLocale[] {
  const present = new Set(presentLocales);
  return locales.filter((locale) => locale !== originalLocale && !present.has(locale));
}

/**
 * Translates a listing only when at least one language is missing — safe to call on every
 * approval or start: an up-to-date listing costs nothing. Returns the languages added.
 */
export async function translateListingIfMissing(listingId: string): Promise<AppLocale[]> {
  if (!isTranslationEnabled()) return [];
  const listing = await db.listing.findUnique({
    where: { id: listingId },
    select: { originalLocale: true, title: true, description: true, translations: { select: { locale: true } } },
  });
  if (!listing || !(listing.title.trim() || listing.description.trim())) return [];
  const missing = missingTranslationLocales(listing.originalLocale, listing.translations.map((t) => t.locale));
  if (missing.length === 0) return [];
  const result = await translateListing(listingId);
  return result.translated;
}

/**
 * Catch-up for listings sent before translation was switched on (`npm run translate:missing`,
 * also run by .devcontainer/start.sh when a key is set). Real listings only — demo listings carry
 * their own hand-written texts. Drafts are translated when the owner sends them.
 */
export async function translateMissingListings(): Promise<{ checked: number; translated: number }> {
  if (!isTranslationEnabled()) return { checked: 0, translated: 0 };
  const listings = await db.listing.findMany({
    where: { isDemo: false, deletedAt: null, status: { in: [...TRANSLATABLE_STATUSES] } },
    select: { id: true, originalLocale: true, translations: { select: { locale: true } } },
  });
  let translated = 0;
  for (const listing of listings) {
    const missing = missingTranslationLocales(listing.originalLocale, listing.translations.map((t) => t.locale));
    if (missing.length === 0) continue;
    if ((await translateListingIfMissing(listing.id)).length > 0) translated += 1;
  }
  return { checked: listings.length, translated };
}

/**
 * Listing.searchText: every title (original + translations), the city and neighborhood names in
 * all languages (with aliases) and the public ID — normalized with @/lib/search-text, so a search
 * in any of the five languages finds the listing.
 */
export async function updateListingSearchText(listingId: string): Promise<string> {
  const listing = await db.listing.findUnique({
    where: { id: listingId },
    select: {
      publicId: true,
      title: true,
      translations: { select: { title: true } },
      city: { select: { names: true, searchText: true } },
      neighborhood: { select: { names: true, searchText: true } },
    },
  });
  if (!listing) throw new Error(`updateListingSearchText: listing ${listingId} not found`);

  const names = (value: unknown) =>
    value && typeof value === "object" ? Object.values(value as Record<string, unknown>).filter((v): v is string => typeof v === "string") : [];
  const parts = [
    listing.title,
    ...listing.translations.map((t) => t.title),
    ...names(listing.neighborhood?.names),
    ...splitSearchText(listing.neighborhood?.searchText),
    ...names(listing.city?.names),
    ...splitSearchText(listing.city?.searchText),
    String(listing.publicId),
  ];
  const unique = [...new Set(parts.map(normalizeSearchText).filter(Boolean))];
  const searchText = unique.join(SEARCH_TEXT_SEPARATOR).slice(0, 8000);
  await db.listing.update({ where: { id: listingId }, data: { searchText } });
  return searchText;
}
