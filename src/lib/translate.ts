import "server-only";
import { after } from "next/server";
import { locales, type AppLocale } from "@/config/site";
import { isAppLocale } from "@/i18n/locale";
import { db } from "@/lib/db";
import { normalizeSearchText, SEARCH_TEXT_SEPARATOR, splitSearchText } from "@/lib/search-text";
import { stripTitleEmoji } from "@/lib/text/emoji";
import type { TranslatedText } from "@/lib/translate/provider";
import { activeTranslationProvider } from "@/lib/translate/registry";

/**
 * Automatic translation of listings (server-only), through one small provider interface
 * (src/lib/translate/provider.ts): Microsoft Azure AI Translator (the founder's choice) or Google
 * Cloud Translation, picked by TRANSLATE_PROVIDER / AZURE_TRANSLATOR_KEY / GOOGLE_TRANSLATE_API_KEY
 * (src/lib/translate/registry.ts). Switching to another service (Claude) = one adapter file.
 *
 * Without a key translation is OFF: a listing only has its original-language row and every page
 * shows the owner's text with "Original in …" and a "Translate" link (Google Translate in the
 * browser). Titles AND descriptions are translated; machine-translated titles lose their emoji
 * like the owner's (stripTitleEmoji). Results are cached in ListingTranslation and redone when
 * the original changes.
 *
 *   await translateListing(listing.id);                 // after the owner saves text
 *   await translateListing(listing.id, { force: true }); // admin: "translate again"
 *   scheduleListingTranslation(listing.id, stamp);       // autosaved edit of a live listing
 *   const { text, translated } = await translateForLocale(note, owner.locale);
 */

export function isTranslationEnabled(): boolean {
  return activeTranslationProvider() !== null;
}

/** "azure" | "google" | null (for the admin settings page and logs). */
export function translationProviderId(): string | null {
  return activeTranslationProvider()?.id ?? null;
}

/**
 * Translates several texts into several languages in as few requests as the service allows.
 * Null when translation is off or the request failed (logged).
 */
async function translateMany(texts: string[], targets: AppLocale[], from?: AppLocale): Promise<Map<AppLocale, TranslatedText[]> | null> {
  const provider = activeTranslationProvider();
  if (!provider || targets.length === 0) return null;
  return provider.translate(texts, targets, from);
}

async function translateBatch(texts: string[], to: AppLocale, from?: AppLocale): Promise<TranslatedText[] | null> {
  return (await translateMany(texts, [to], from))?.get(to) ?? null;
}

/** One text from one language to another. Null when translation is off or failed. */
export async function translateText(text: string, from: AppLocale, to: AppLocale): Promise<string | null> {
  if (!text.trim() || from === to) return text;
  const result = await translateBatch([text], to, from);
  return result ? result[0].text : null;
}

/**
 * One user-written text (a review, a host's reply; round 3, brief 8.1) into several languages in
 * one request: { en: "…", ru: "…" }. Languages the service returned empty are left out. Null when
 * translation is off or the request failed (the caller shows the original).
 */
export async function translateTextInto(text: string, from: AppLocale, targets: readonly AppLocale[]): Promise<Partial<Record<AppLocale, string>> | null> {
  const wanted = targets.filter((locale) => locale !== from);
  if (!text.trim() || wanted.length === 0) return {};
  const result = await translateMany([text], wanted, from);
  if (!result) return null;
  const out: Partial<Record<AppLocale, string>> = {};
  for (const locale of wanted) {
    const translated = result.get(locale)?.[0]?.text?.trim();
    if (translated) out[locale] = translated;
  }
  return out;
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
  const needed: AppLocale[] = [];
  const outdated: { id: string }[] = [];

  for (const locale of targets) {
    const row = rows.get(locale);
    if (row?.editedByOwner) {
      if (row.isOriginal) await db.listingTranslation.update({ where: { id: row.id }, data: { isOriginal: false } });
      result.keptOwnerEdits.push(locale);
      continue;
    }
    // A former original (the owner switched language) is treated like an automatic row.
    const stale = !!row && (sourceChanged || row.isOriginal || !!opts.force);
    if (row && !stale && row.isAuto) continue;
    needed.push(locale);
    if (row && (stale || !row.isAuto)) outdated.push({ id: row.id });
  }

  // One request for every language that needs it (Azure takes them all at once).
  const translated = enabled && needed.length > 0 && (listing.title || listing.description)
    ? await translateMany([listing.title, listing.description], needed, original)
    : null;

  if (translated) {
    await Promise.all(
      needed.map(async (locale) => {
        const [title, description] = translated.get(locale) ?? [];
        if (!title || !description) return;
        const data = { title: stripTitleEmoji(title.text), description: description.text, isOriginal: false, isAuto: true, editedByOwner: false };
        await db.listingTranslation.upsert({
          where: { listingId_locale: { listingId, locale } },
          create: { listingId, locale, ...data },
          update: data,
        });
        result.translated.push(locale);
      }),
    );
  } else if (outdated.length > 0) {
    // Translation off or failed: no stale text is shown (the page shows the original with a label).
    await db.listingTranslation.deleteMany({ where: { id: { in: outdated.map((row) => row.id) } } });
  }

  await updateListingSearchText(listingId);
  return result;
}

/** Autosaves come every few seconds while the host types: translate once the text has settled. */
const SETTLE_MS = 3000;

/**
 * Re-translates a LIVE listing after an autosaved text edit (the host never has to press "Save
 * changes"), after the response (next/server after()). Deduplicated by Listing.contentUpdatedAt:
 * when a newer edit arrived in the meantime, that edit's own run does the work. `stamp` is the
 * contentUpdatedAt this edit wrote (null: no dedupe). Never throws.
 */
export function scheduleListingTranslation(listingId: string, stamp: Date | null): void {
  if (!isTranslationEnabled()) return;
  const run = async () => {
    await new Promise((resolve) => setTimeout(resolve, SETTLE_MS));
    const row = await db.listing.findUnique({ where: { id: listingId }, select: { status: true, contentUpdatedAt: true } });
    if (!row || row.status !== "LIVE") return;
    if (stamp && row.contentUpdatedAt && row.contentUpdatedAt.getTime() !== stamp.getTime()) return;
    await translateListing(listingId);
  };
  const safe = () => run().catch((error) => console.error(`[translate] re-translation of ${listingId} failed:`, error));
  try {
    after(safe);
  } catch {
    // Outside a request (a script): run it now, without waiting.
    void safe();
  }
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
