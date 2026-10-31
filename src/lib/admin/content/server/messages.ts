import "server-only";
import fs from "node:fs/promises";
import path from "node:path";
import { locales, type AppLocale } from "@/config/site";
import { db } from "@/lib/db";
import { buildMessageRows, isNamespaceName, type MessageRow } from "../translations";

/**
 * Reads the interface-text files (messages/<locale>/<namespace>.json) for the translations
 * editor. English is the source; the namespace list comes from messages/en.
 */

const MESSAGES_DIR = path.join(process.cwd(), "messages");

export async function listNamespaces(): Promise<string[]> {
  try {
    const files = await fs.readdir(path.join(MESSAGES_DIR, "en"));
    return files
      .filter((f) => f.endsWith(".json"))
      .map((f) => f.slice(0, -5))
      .filter(isNamespaceName)
      .sort((a, b) => a.localeCompare(b));
  } catch {
    return [];
  }
}

export async function readNamespace(locale: AppLocale, namespace: string): Promise<unknown> {
  if (!isNamespaceName(namespace) || !(locales as readonly string[]).includes(locale)) return {};
  try {
    const raw = await fs.readFile(path.join(MESSAGES_DIR, locale, `${namespace}.json`), "utf8");
    return JSON.parse(raw) as unknown;
  } catch {
    return {};
  }
}

/** Overrides of one namespace and language: path inside the namespace → text. */
export async function namespaceOverrides(locale: AppLocale, namespace: string): Promise<Map<string, string>> {
  const rows = await db.translationOverride.findMany({
    where: { locale, key: { startsWith: `${namespace}.` } },
    select: { key: true, value: true },
  });
  return new Map(rows.map((r) => [r.key.slice(namespace.length + 1), r.value]));
}

export async function loadMessageRows(locale: AppLocale, namespace: string): Promise<MessageRow[]> {
  const [source, localized, overrides] = await Promise.all([
    readNamespace("en", namespace),
    locale === "en" ? Promise.resolve(null) : readNamespace(locale, namespace),
    namespaceOverrides(locale, namespace),
  ]);
  return buildMessageRows(source, localized ?? source, overrides);
}

/** Number of overrides per namespace for one language (for the namespace picker). */
export async function overrideCounts(locale: AppLocale): Promise<Map<string, number>> {
  const rows = await db.translationOverride.findMany({ where: { locale }, select: { key: true } });
  const counts = new Map<string, number>();
  for (const { key } of rows) {
    const ns = key.split(".")[0];
    counts.set(ns, (counts.get(ns) ?? 0) + 1);
  }
  return counts;
}
