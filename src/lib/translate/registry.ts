import { azureProvider } from "./azure";
import { googleProvider } from "./google";
import { chooseTranslationProvider, type TranslateEnv, type TranslationProvider, type TranslationProviderId } from "./provider";

/**
 * The translation service this server uses (TRANSLATE_PROVIDER, AZURE_TRANSLATOR_KEY,
 * GOOGLE_TRANSLATE_API_KEY; see ./provider.ts), or null when translation is off. Server code reads
 * it through @/lib/translate (isTranslationEnabled, translateListing…).
 * Claude later: add `claude: (env) => claudeProvider(env.ANTHROPIC_API_KEY!)` and its id.
 */
const PROVIDERS: Record<TranslationProviderId, (env: TranslateEnv) => TranslationProvider> = {
  azure: (env) => azureProvider(env.AZURE_TRANSLATOR_KEY!.trim(), env.AZURE_TRANSLATOR_REGION),
  google: (env) => googleProvider(env.GOOGLE_TRANSLATE_API_KEY!.trim()),
};

export function activeTranslationProvider(env: TranslateEnv = process.env as TranslateEnv): TranslationProvider | null {
  const id = chooseTranslationProvider(env);
  return id ? PROVIDERS[id](env) : null;
}

export { chooseTranslationProvider, type TranslationProvider, type TranslationProviderId } from "./provider";
