import "server-only";
import { db } from "@/lib/db";
import { BUILTIN_PHRASE_RULES, compileAdminPhrase, scanWithRules, type PhraseRule, type ScanHit } from "./phrases";

/**
 * Scam-phrase scan of listing text: the built-in phrases (Western Union, MoneyGram, gift cards,
 * crypto, "deposit first", "I'm abroad, I'll send the keys" — in all five languages) plus the
 * admin's BannedWord rows. BannedWord.locale only documents the phrase's language: every phrase
 * is checked against every text, because owners mix languages.
 *
 *   const { hits } = await scanText(`${title}\n${description}`);
 *   hits.some((h) => h.action === "BLOCK")   // cannot be published
 *
 * BannedWord rows are cached for 5 minutes; call clearBannedWordsCache() after an admin edit.
 */

export type { ScanHit } from "./phrases";

const CACHE_MS = 5 * 60 * 1000;
let cache: { rules: PhraseRule[]; at: number } | null = null;

async function bannedWordRules(): Promise<PhraseRule[]> {
  if (cache && Date.now() - cache.at < CACHE_MS) return cache.rules;
  try {
    const rows = await db.bannedWord.findMany({
      select: { id: true, phrase: true, action: true, category: true, weight: true },
    });
    const rules: PhraseRule[] = [];
    for (const row of rows) {
      const pattern = compileAdminPhrase(row.phrase);
      if (!pattern) continue;
      rules.push({
        id: row.id,
        category: row.category,
        action: row.action,
        weight: Math.max(0, row.weight),
        patterns: [pattern],
        source: "banned_word",
      });
    }
    cache = { rules, at: Date.now() };
    return rules;
  } catch (error) {
    console.error("[risk] could not load banned words, using the built-in phrases only:", error);
    return cache?.rules ?? [];
  }
}

export function clearBannedWordsCache() {
  cache = null;
}

export async function scanText(text: string | null | undefined): Promise<{ hits: ScanHit[] }> {
  const rules = [...BUILTIN_PHRASE_RULES, ...(await bannedWordRules())];
  return { hits: scanWithRules(text, rules) };
}
