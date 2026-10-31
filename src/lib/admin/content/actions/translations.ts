"use server";

import { createTranslator } from "next-intl";
import { fail, ok, type ActionResult } from "@/lib/action";
import { audit } from "@/lib/audit";
import { db } from "@/lib/db";
import { clearMessagesCache } from "@/i18n/messages";
import { translationOverrideSchema } from "../schemas";
import { flattenMessages, overrideKey, overrideProblems } from "../translations";
import { listNamespaces, readNamespace } from "../server/messages";
import { ContentActionError, parseInput, runContentAction } from "../server/common";

/**
 * Interface-text overrides ("content"): TranslationOverride rows (locale, "namespace.key", value)
 * are merged over the message files by @/i18n/messages.
 */

/** The English text of a key, or null when the key does not exist. */
async function sourceText(namespace: string, key: string): Promise<string | null> {
  if (!(await listNamespaces()).includes(namespace)) return null;
  const source = new Map(flattenMessages(await readNamespace("en", namespace)));
  return source.get(key) ?? null;
}

/** True when next-intl cannot parse the text (a broken brace or plural). */
function hasSyntaxError(locale: string, value: string): boolean {
  let broken = false;
  const t = createTranslator({
    locale,
    messages: { probe: value },
    onError: (error) => {
      if (error.code === "INVALID_MESSAGE") broken = true;
    },
    getMessageFallback: () => "",
  });
  try {
    t("probe");
  } catch {
    broken = true;
  }
  return broken;
}

export async function saveTranslationOverride(input: unknown): Promise<ActionResult> {
  return runContentAction(
    "content",
    "translation",
    async (staff) => {
      const parsed = parseInput(translationOverrideSchema, input);
      if (!parsed.ok) return parsed.result;
      const { locale, namespace, key, value } = parsed.data;
      const source = await sourceText(namespace, key);
      if (source === null) throw new ContentActionError("unknown_key", 404);
      const text = value.trim();
      if (!text) return fail("invalid_input", { value: ["required"] });
      const problems = overrideProblems(source, text);
      if (problems.unknownArguments.length > 0 || problems.unknownTags.length > 0) {
        throw new ContentActionError("unknown_placeholder", 422);
      }
      if (hasSyntaxError(locale, text)) throw new ContentActionError("invalid_message", 422);

      const fullKey = overrideKey(namespace, key);
      const before = await db.translationOverride.findUnique({ where: { locale_key: { locale, key: fullKey } }, select: { value: true } });
      await db.translationOverride.upsert({
        where: { locale_key: { locale, key: fullKey } },
        create: { locale, key: fullKey, value: text, updatedById: staff.id },
        update: { value: text, updatedById: staff.id },
      });
      clearMessagesCache();
      await audit({
        actorId: staff.id,
        action: "translation.override",
        targetType: "TranslationOverride",
        targetId: `${locale}:${fullKey}`,
        details: { from: before?.value ?? null, to: text },
      });
      return ok();
    },
    { limit: 120, windowSeconds: 60 },
  );
}

export async function resetTranslationOverride(input: unknown): Promise<ActionResult> {
  return runContentAction("content", "translation", async (staff) => {
    const parsed = translationOverrideSchema.omit({ value: true }).safeParse(input);
    if (!parsed.success) return fail("invalid_input");
    const { locale, namespace, key } = parsed.data;
    const fullKey = overrideKey(namespace, key);
    const existing = await db.translationOverride.findUnique({ where: { locale_key: { locale, key: fullKey } }, select: { id: true, value: true } });
    if (!existing) return ok();
    await db.translationOverride.delete({ where: { id: existing.id } });
    clearMessagesCache();
    await audit({
      actorId: staff.id,
      action: "translation.reset",
      targetType: "TranslationOverride",
      targetId: `${locale}:${fullKey}`,
      details: { removed: existing.value },
    });
    return ok();
  });
}
