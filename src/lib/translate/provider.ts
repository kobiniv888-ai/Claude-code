import type { AppLocale } from "@/config/site";

/**
 * Machine translation behind one small interface (round 3, founder's answer 2: Microsoft Azure AI
 * Translator, Google as the second adapter; Claude may be added later if Hebrew–Georgian reads
 * badly). Adding a service = one file with a TranslationProvider + one line in PROVIDERS
 * (./registry.ts) + its key in .env.example. Pure (no server imports): unit-tested.
 */

export type TranslatedText = { text: string; /** Detected source language (when `from` was not given). */ detected?: string };

export interface TranslationProvider {
  readonly id: TranslationProviderId;
  /**
   * Translates every text into every target language, in as few requests as the service allows.
   * Empty texts stay empty. `from` omitted = detect the language. Returns null when the request
   * failed (the caller keeps the original text); never throws.
   */
  translate(texts: readonly string[], targets: readonly AppLocale[], from?: AppLocale): Promise<Map<AppLocale, TranslatedText[]> | null>;
}

export const TRANSLATION_PROVIDER_IDS = ["azure", "google"] as const;
export type TranslationProviderId = (typeof TRANSLATION_PROVIDER_IDS)[number];

export type TranslateEnv = {
  TRANSLATE_PROVIDER?: string;
  AZURE_TRANSLATOR_KEY?: string;
  AZURE_TRANSLATOR_REGION?: string;
  GOOGLE_TRANSLATE_API_KEY?: string;
};

const KEYS: Record<TranslationProviderId, keyof TranslateEnv> = {
  azure: "AZURE_TRANSLATOR_KEY",
  google: "GOOGLE_TRANSLATE_API_KEY",
};

/**
 * Which service translates: TRANSLATE_PROVIDER when it names one whose key is set; without it,
 * Azure when its key is set, else Google when its key is set, else none (translation is off).
 * A named service without its key is off too (never silently another, paid, service).
 */
export function chooseTranslationProvider(env: TranslateEnv): TranslationProviderId | null {
  const has = (id: TranslationProviderId) => !!env[KEYS[id]]?.trim();
  const named = env.TRANSLATE_PROVIDER?.trim().toLowerCase();
  if (named) return (TRANSLATION_PROVIDER_IDS as readonly string[]).includes(named) && has(named as TranslationProviderId) ? (named as TranslationProviderId) : null;
  return TRANSLATION_PROVIDER_IDS.find(has) ?? null;
}

/** Positions of the texts worth sending (not empty), and the results array prefilled with the originals. */
export function nonEmptyTexts(texts: readonly string[]): { indexes: number[]; blank: () => TranslatedText[] } {
  return {
    indexes: texts.map((t, i) => (t.trim() ? i : -1)).filter((i) => i >= 0),
    blank: () => texts.map((text) => ({ text })),
  };
}

/** "iw" (Google's old Hebrew code), "he-IL", "zh-Hans" → "he", "he", "zh". */
export function baseLanguage(code: string | undefined | null): string | undefined {
  if (!code) return undefined;
  const base = code.toLowerCase().split("-")[0];
  return base === "iw" ? "he" : base;
}
