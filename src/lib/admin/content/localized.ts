import { locales, type AppLocale, type Localized } from "@/config/site";
import { normalizeSearchText, splitSearchText } from "@/lib/search-text";

/**
 * Helpers for translated database content ({ he, en, ru, ar, ka } JSON) in the admin
 * content editors (pure, client-safe). Forms always hold all five strings; the database
 * stores only the filled ones.
 */

export type LocalizedForm = Localized<string>;

/** Languages every name / title must have: the main language and the fallback. */
export const REQUIRED_LOCALES: readonly AppLocale[] = ["he", "en"];

export function emptyLocalized(): LocalizedForm {
  return { he: "", en: "", ru: "", ar: "", ka: "" };
}

/** A stored JSON value → five strings (missing or non-string values become ""). */
export function toLocalizedForm(value: unknown): LocalizedForm {
  const form = emptyLocalized();
  if (!value || typeof value !== "object" || Array.isArray(value)) return form;
  const record = value as Record<string, unknown>;
  for (const locale of locales) {
    const text = record[locale];
    if (typeof text === "string") form[locale] = text;
  }
  return form;
}

/** Trimmed, without empty languages — what is written to the database. */
export function cleanLocalized(form: Partial<Record<AppLocale, string | null | undefined>>): Partial<Localized> {
  const out: Partial<Localized> = {};
  for (const locale of locales) {
    const text = form[locale]?.trim();
    if (text) out[locale] = text;
  }
  return out;
}

/** Like cleanLocalized, but null when nothing is filled (for optional JSON columns). */
export function cleanLocalizedOrNull(
  form: Partial<Record<AppLocale, string | null | undefined>> | null | undefined,
): Partial<Localized> | null {
  if (!form) return null;
  const out = cleanLocalized(form);
  return Object.keys(out).length > 0 ? out : null;
}

/** Languages with no text yet. */
export function missingLocales(value: unknown): AppLocale[] {
  const form = toLocalizedForm(value);
  return locales.filter((locale) => form[locale].trim().length === 0);
}

/** Aliases typed as "tiflis, tbilissi" or one per line → a clean, de-duplicated list. */
export function parseAliases(text: string): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const part of text.split(/[\n,;]+/)) {
    const alias = part.trim().toLowerCase().slice(0, 60);
    if (!alias || seen.has(alias)) continue;
    seen.add(alias);
    out.push(alias);
  }
  return out.slice(0, 30);
}

/** The aliases part of a stored searchText (everything that is not one of the names). */
export function extractAliases(searchText: string | null | undefined, names: unknown): string[] {
  const form = toLocalizedForm(names);
  const nameSet = new Set(locales.map((l) => normalizeSearchText(form[l])).filter(Boolean));
  return splitSearchText(searchText).filter((part) => !nameSet.has(part));
}
