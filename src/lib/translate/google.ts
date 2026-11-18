import type { AppLocale } from "@/config/site";
import { baseLanguage, nonEmptyTexts, type TranslatedText, type TranslationProvider } from "./provider";

/**
 * Google Cloud Translation v2 (REST), the second adapter. One request per target language (v2
 * takes one target); the key goes in the X-Goog-Api-Key header, never in the URL. Google answers
 * "iw" for Hebrew in detectedSourceLanguage.
 */

const API_URL = "https://translation.googleapis.com/language/translate/v2";
const TIMEOUT_MS = 15_000;
/** Google recommends ≤ 30k characters per request; listings are far below. */
const MAX_CHARS = 30_000;

type GoogleResponse = {
  data?: { translations?: { translatedText?: string; detectedSourceLanguage?: string }[] };
  error?: { message?: string };
};

export function googleProvider(key: string, fetchImpl: typeof fetch = fetch): TranslationProvider {
  return {
    id: "google",
    async translate(texts, targets, from) {
      const { indexes, blank } = nonEmptyTexts(texts);
      const out = new Map<AppLocale, TranslatedText[]>(targets.map((to) => [to, blank()]));
      if (indexes.length === 0 || targets.length === 0) return out;
      const q = indexes.map((i) => texts[i]);
      if (q.reduce((sum, t) => sum + t.length, 0) > MAX_CHARS) {
        console.error("[translate:google] text too long to translate in one request");
        return null;
      }
      try {
        for (const to of targets) {
          const res = await fetchImpl(API_URL, {
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
          const list = out.get(to)!;
          indexes.forEach((textIndex, i) => {
            list[textIndex] = { text: translations[i].translatedText ?? "", detected: baseLanguage(translations[i].detectedSourceLanguage) };
          });
        }
        return out;
      } catch (error) {
        console.error(`[translate:google] translation to ${targets.join(",")} failed:`, error);
        return null;
      }
    },
  };
}
