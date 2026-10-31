"use server";

import { z } from "zod";
import { fail, ok, type ActionResult } from "@/lib/action";
import { audit } from "@/lib/audit";
import { db } from "@/lib/db";
import { clearBannedWordsCache, scanText, type ScanHit } from "@/lib/risk";
import { updateSettings } from "@/lib/settings";
import { bannedWordBulkSchema, bannedWordSchema, parseBulkPhrases } from "../schemas";
import { ContentActionError, isUniqueViolation, parseInput, runContentAction } from "../server/common";

/** Banned words for the automatic listing checks, and the scam-banner switch ("content"). */

const toLocale = (value: string) => (value === "all" ? null : (value as "he" | "en" | "ru" | "ar" | "ka"));

export async function saveBannedWord(input: unknown): Promise<ActionResult<{ id: string }>> {
  return runContentAction("content", "banned_word", async (staff) => {
    const raw = (input ?? {}) as { id?: unknown; values?: unknown };
    const wordId = typeof raw.id === "string" && raw.id ? raw.id : null;
    const parsed = parseInput(bannedWordSchema, raw.values);
    if (!parsed.ok) return parsed.result;
    const v = parsed.data;
    const locale = toLocale(v.locale);
    // NULL locales are not unique in Postgres, so look for a duplicate ourselves.
    const duplicate = await db.bannedWord.findFirst({
      where: { phrase: { equals: v.phrase, mode: "insensitive" }, locale, ...(wordId ? { NOT: { id: wordId } } : {}) },
      select: { id: true },
    });
    if (duplicate) throw new ContentActionError("phrase_exists");
    const data = { phrase: v.phrase, locale, action: v.action, category: v.category, weight: v.weight };
    try {
      if (wordId) {
        const before = await db.bannedWord.findUnique({ where: { id: wordId }, select: { id: true } });
        if (!before) throw new ContentActionError("item_not_found", 404);
        await db.bannedWord.update({ where: { id: wordId }, data });
        clearBannedWordsCache();
        await audit({ actorId: staff.id, action: "banned_word.update", targetType: "BannedWord", targetId: wordId, details: data });
        return ok({ id: wordId });
      }
      const word = await db.bannedWord.create({ data, select: { id: true } });
      clearBannedWordsCache();
      await audit({ actorId: staff.id, action: "banned_word.create", targetType: "BannedWord", targetId: word.id, details: data });
      return ok({ id: word.id });
    } catch (error) {
      if (isUniqueViolation(error)) throw new ContentActionError("phrase_exists");
      throw error;
    }
  });
}

export async function addBannedWordsBulk(input: unknown): Promise<ActionResult<{ added: number; skipped: number }>> {
  return runContentAction(
    "content",
    "banned_word_bulk",
    async (staff) => {
      const parsed = parseInput(bannedWordBulkSchema, input);
      if (!parsed.ok) return parsed.result;
      const v = parsed.data;
      const { phrases, skipped } = parseBulkPhrases(v.lines);
      if (phrases.length === 0) throw new ContentActionError("no_phrases", 422);
      const locale = toLocale(v.locale);
      const existing = await db.bannedWord.findMany({
        where: { locale, phrase: { in: phrases, mode: "insensitive" } },
        select: { phrase: true },
      });
      const taken = new Set(existing.map((e) => e.phrase.toLowerCase()));
      const fresh = phrases.filter((p) => !taken.has(p.toLowerCase()));
      if (fresh.length > 0) {
        await db.bannedWord.createMany({
          data: fresh.map((phrase) => ({ phrase, locale, action: v.action, category: v.category, weight: v.weight })),
          skipDuplicates: true,
        });
        clearBannedWordsCache();
      }
      await audit({
        actorId: staff.id,
        action: "banned_word.bulk_create",
        targetType: "BannedWord",
        targetId: null,
        details: { added: fresh.length, locale, action: v.action, category: v.category, weight: v.weight, phrases: fresh.slice(0, 50) },
      });
      return ok({ added: fresh.length, skipped: skipped + (phrases.length - fresh.length) });
    },
    { limit: 10, windowSeconds: 60 },
  );
}

export async function deleteBannedWord(input: unknown): Promise<ActionResult> {
  return runContentAction("content", "banned_word", async (staff) => {
    const parsed = z.object({ id: z.string().min(1).max(64) }).safeParse(input);
    if (!parsed.success) return fail("invalid_input");
    const word = await db.bannedWord.findUnique({ where: { id: parsed.data.id } });
    if (!word) throw new ContentActionError("item_not_found", 404);
    await db.bannedWord.delete({ where: { id: word.id } });
    clearBannedWordsCache();
    await audit({
      actorId: staff.id,
      action: "banned_word.delete",
      targetType: "BannedWord",
      targetId: word.id,
      details: { phrase: word.phrase, locale: word.locale, action: word.action },
    });
    return ok();
  });
}

export type BannedWordTestHit = ScanHit & { source: "builtin" | "banned_word"; wordId: string | null };

/** Runs the listing scam-phrase scan on pasted text (nothing is saved). */
export async function testBannedWords(input: unknown): Promise<ActionResult<{ hits: BannedWordTestHit[]; blocked: boolean; points: number }>> {
  return runContentAction(
    "content",
    "banned_word_test",
    async () => {
      const parsed = z.object({ text: z.string().max(10_000) }).safeParse(input);
      if (!parsed.success) return fail("invalid_input");
      // Fresh rules, so a phrase added a moment ago is tested too.
      clearBannedWordsCache();
      const { hits } = await scanText(parsed.data.text);
      const mapped = hits.map((hit) => {
        const [source, ...rest] = hit.rule.split(":");
        return {
          ...hit,
          source: source === "banned_word" ? ("banned_word" as const) : ("builtin" as const),
          wordId: source === "banned_word" ? rest.join(":") : null,
        };
      });
      return ok({
        hits: mapped,
        blocked: mapped.some((h) => h.action === "BLOCK"),
        points: mapped.filter((h) => h.action === "FLAG").reduce((sum, h) => sum + h.weight, 0),
      });
    },
    { limit: 30, windowSeconds: 60 },
  );
}

/** The site-wide scam banner master switch (also on the Settings page). */
export async function setScamBannerEnabled(input: unknown): Promise<ActionResult> {
  return runContentAction("content", "scam_banner", async (staff) => {
    const parsed = z.object({ enabled: z.boolean() }).safeParse(input);
    if (!parsed.success) return fail("invalid_input");
    await updateSettings({ scamBannerEnabled: parsed.data.enabled }, staff.id);
    return ok();
  });
}
