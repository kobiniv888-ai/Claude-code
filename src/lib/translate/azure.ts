import type { AppLocale } from "@/config/site";
import { baseLanguage, nonEmptyTexts, type TranslatedText, type TranslationProvider } from "./provider";

/**
 * Microsoft Azure AI Translator, Translator Text v3 REST (founder's choice, round 3).
 * https://learn.microsoft.com/azure/ai-services/translator/text-translation/reference/v3/translate
 *
 * One request carries every target language (?to=en&to=ru&to=ar&to=ka). Limits per request: 1,000
 * texts and 50,000 characters counted once per target language, so a long text is sent to fewer
 * languages per request. The key goes in a header, never in the URL. Hebrew, Russian, Arabic,
 * Georgian and English are all supported (codes he, ru, ar, ka, en).
 */

const ENDPOINT = "https://api.cognitive.microsofttranslator.com/translate";
const TIMEOUT_MS = 15_000;
export const AZURE_MAX_CHARS = 50_000;
const MAX_TEXTS = 1000;

type AzureItem = { detectedLanguage?: { language?: string }; translations?: { text?: string; to?: string }[] };
type AzureError = { error?: { code?: number; message?: string } };

/** Target groups that keep each request under the character limit (chars × targets). */
export function azureTargetGroups(chars: number, targets: readonly AppLocale[]): AppLocale[][] {
  if (chars <= 0 || targets.length === 0) return [];
  const perRequest = Math.max(1, Math.floor(AZURE_MAX_CHARS / chars));
  const groups: AppLocale[][] = [];
  for (let i = 0; i < targets.length; i += perRequest) groups.push(targets.slice(i, i + perRequest));
  return groups;
}

export function azureTranslateUrl(targets: readonly AppLocale[], from?: AppLocale): string {
  const params = new URLSearchParams({ "api-version": "3.0", textType: "plain" });
  if (from) params.set("from", from);
  for (const to of targets) params.append("to", to);
  return `${ENDPOINT}?${params}`;
}

export function azureProvider(key: string, region?: string | null, fetchImpl: typeof fetch = fetch): TranslationProvider {
  return {
    id: "azure",
    async translate(texts, targets, from) {
      const { indexes, blank } = nonEmptyTexts(texts);
      const out = new Map<AppLocale, TranslatedText[]>(targets.map((to) => [to, blank()]));
      if (indexes.length === 0 || targets.length === 0) return out;
      if (indexes.length > MAX_TEXTS) return null;
      const chars = indexes.reduce((sum, i) => sum + texts[i].length, 0);
      if (chars > AZURE_MAX_CHARS) {
        console.error("[translate:azure] text too long to translate in one request");
        return null;
      }
      try {
        for (const group of azureTargetGroups(chars, targets)) {
          const res = await fetchImpl(azureTranslateUrl(group, from), {
            method: "POST",
            headers: {
              "Content-Type": "application/json; charset=UTF-8",
              "Ocp-Apim-Subscription-Key": key,
              ...(region?.trim() ? { "Ocp-Apim-Subscription-Region": region.trim() } : {}),
            },
            body: JSON.stringify(indexes.map((i) => ({ Text: texts[i] }))),
            signal: AbortSignal.timeout(TIMEOUT_MS),
            cache: "no-store",
          });
          const data = (await res.json().catch(() => null)) as AzureItem[] | AzureError | null;
          if (!res.ok || !Array.isArray(data)) {
            const message = data && !Array.isArray(data) ? data.error?.message : undefined;
            throw new Error(`HTTP ${res.status}: ${message ?? "no details"}`);
          }
          if (data.length !== indexes.length) throw new Error("unexpected number of translations");
          data.forEach((item, n) => {
            const detected = baseLanguage(item.detectedLanguage?.language);
            const returned = new Set<string>();
            for (const translation of item.translations ?? []) {
              const to = baseLanguage(translation.to) as AppLocale | undefined;
              const list = to && group.includes(to) ? out.get(to) : undefined;
              if (!list || typeof translation.text !== "string") continue;
              list[indexes[n]] = { text: translation.text, detected };
              returned.add(to!);
            }
            // Every language asked for must have come back for every text.
            const missing = group.find((to) => !returned.has(to));
            if (missing) throw new Error(`no "${missing}" translation in the answer`);
          });
        }
        return out;
      } catch (error) {
        console.error(`[translate:azure] translation to ${targets.join(",")} failed:`, error);
        return null;
      }
    },
  };
}
