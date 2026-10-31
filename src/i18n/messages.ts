import "server-only";
import fs from "node:fs/promises";
import path from "node:path";
import type { AppLocale } from "@/config/site";

/**
 * Interface text lives in messages/<locale>/<namespace>.json.
 * Each file becomes a top-level namespace, e.g. messages/he/search.json → t("search.…").
 * Add a new namespace by adding the same file name in all five language folders.
 * Missing keys fall back to English. Admin overrides (TranslationOverride) are merged on top.
 */
type Messages = Record<string, unknown>;

const MESSAGES_DIR = path.join(process.cwd(), "messages");
const cache = new Map<AppLocale, { messages: Messages; loadedAt: number }>();
const isProd = process.env.NODE_ENV === "production";

async function readLocale(locale: AppLocale): Promise<Messages> {
  const dir = path.join(MESSAGES_DIR, locale);
  let files: string[] = [];
  try {
    files = (await fs.readdir(dir)).filter((f) => f.endsWith(".json")).sort();
  } catch {
    return {};
  }
  const entries = await Promise.all(
    files.map(async (file) => {
      const raw = await fs.readFile(path.join(dir, file), "utf8");
      try {
        return [file.replace(/\.json$/, ""), JSON.parse(raw)] as const;
      } catch (error) {
        throw new Error(`Invalid JSON in messages/${locale}/${file}: ${(error as Error).message}`);
      }
    }),
  );
  return Object.fromEntries(entries);
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

export function deepMerge(base: Messages, override: Messages): Messages {
  const out: Messages = { ...base };
  for (const [key, value] of Object.entries(override)) {
    const current = out[key];
    out[key] = isPlainObject(current) && isPlainObject(value) ? deepMerge(current, value) : value;
  }
  return out;
}

function setPath(target: Messages, dottedKey: string, value: string) {
  const parts = dottedKey.split(".");
  let node: Messages = target;
  for (const part of parts.slice(0, -1)) {
    if (!isPlainObject(node[part])) node[part] = {};
    node = node[part] as Messages;
  }
  node[parts[parts.length - 1]] = value;
}

async function loadOverrides(locale: AppLocale): Promise<{ key: string; value: string }[]> {
  try {
    const { db } = await import("@/lib/db");
    return await db.translationOverride.findMany({
      where: { locale },
      select: { key: true, value: true },
    });
  } catch {
    // The database may be unavailable during a static build — interface text still works.
    return [];
  }
}

export async function getMessages(locale: AppLocale): Promise<Messages> {
  const cached = cache.get(locale);
  const ttl = isProd ? 60_000 : 0;
  if (cached && Date.now() - cached.loadedAt < ttl) return cached.messages;

  const [english, localized, overrides] = await Promise.all([
    readLocale("en"),
    locale === "en" ? Promise.resolve({}) : readLocale(locale),
    loadOverrides(locale),
  ]);
  const messages = deepMerge(english, localized);
  for (const { key, value } of overrides) setPath(messages, key, value);

  cache.set(locale, { messages, loadedAt: Date.now() });
  return messages;
}

/** Call after an admin edits translations. */
export function clearMessagesCache() {
  cache.clear();
}
