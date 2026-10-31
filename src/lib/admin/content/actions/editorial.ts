"use server";

import { z } from "zod";
import { Prisma } from "@/generated/prisma/client";
import { fail, ok, type ActionResult } from "@/lib/action";
import { audit } from "@/lib/audit";
import { db } from "@/lib/db";
import { cleanLocalized, cleanLocalizedOrNull } from "../localized";
import { alertSchema, articleSchema, faqReorderSchema, faqSchema } from "../schemas";
import { ContentActionError, isUniqueViolation, parseInput, runContentAction } from "../server/common";

/** Articles, FAQ items and scam alerts ("content"). */

const idInput = z.object({ id: z.string().min(1).max(64) });

function splitInput(input: unknown): { id: string | null; values: unknown } {
  const raw = (input ?? {}) as { id?: unknown; values?: unknown };
  return { id: typeof raw.id === "string" && raw.id ? raw.id : null, values: raw.values };
}

// ─── Articles ────────────────────────────────────────────────

export async function saveArticle(input: unknown): Promise<ActionResult<{ id: string }>> {
  return runContentAction("content", "article", async (staff) => {
    const { id, values } = splitInput(input);
    const parsed = parseInput(articleSchema, values);
    if (!parsed.ok) return parsed.result;
    const v = parsed.data;
    const data = {
      slug: v.slug,
      category: v.category,
      title: cleanLocalized(v.title),
      excerpt: cleanLocalizedOrNull(v.excerpt) ?? Prisma.DbNull,
      body: cleanLocalized(v.body),
      coverUrl: v.coverUrl || null,
      status: v.status,
      reviewedByLawyer: v.reviewedByLawyer,
    };
    try {
      if (id) {
        const before = await db.article.findUnique({ where: { id }, select: { id: true, status: true, publishedAt: true } });
        if (!before) throw new ContentActionError("item_not_found", 404);
        const publishedAt = v.status === "PUBLISHED" ? (before.publishedAt ?? new Date()) : before.publishedAt;
        await db.article.update({ where: { id }, data: { ...data, publishedAt } });
        await audit({
          actorId: staff.id,
          action: before.status !== v.status ? (v.status === "PUBLISHED" ? "article.publish" : "article.unpublish") : "article.update",
          targetType: "Article",
          targetId: id,
          details: { slug: v.slug, status: v.status, reviewedByLawyer: v.reviewedByLawyer },
        });
        return ok({ id });
      }
      const article = await db.article.create({
        data: { ...data, authorId: staff.id, publishedAt: v.status === "PUBLISHED" ? new Date() : null },
        select: { id: true },
      });
      await audit({
        actorId: staff.id,
        action: "article.create",
        targetType: "Article",
        targetId: article.id,
        details: { slug: v.slug, status: v.status },
      });
      return ok({ id: article.id });
    } catch (error) {
      if (isUniqueViolation(error)) return fail("slug_taken", { slug: ["invalid"] });
      throw error;
    }
  });
}

export async function deleteArticle(input: unknown): Promise<ActionResult> {
  return runContentAction("content", "article", async (staff) => {
    const parsed = idInput.safeParse(input);
    if (!parsed.success) return fail("invalid_input");
    const article = await db.article.findUnique({ where: { id: parsed.data.id }, select: { id: true, slug: true } });
    if (!article) throw new ContentActionError("item_not_found", 404);
    await db.article.delete({ where: { id: article.id } });
    await audit({ actorId: staff.id, action: "article.delete", targetType: "Article", targetId: article.id, details: { slug: article.slug } });
    return ok();
  });
}

// ─── FAQ ─────────────────────────────────────────────────────

export async function saveFaqItem(input: unknown): Promise<ActionResult<{ id: string }>> {
  return runContentAction("content", "faq", async (staff) => {
    const { id, values } = splitInput(input);
    const parsed = parseInput(faqSchema, values);
    if (!parsed.ok) return parsed.result;
    const v = parsed.data;
    const data = {
      category: v.category,
      question: cleanLocalized(v.question),
      answer: cleanLocalized(v.answer),
      published: v.published,
    };
    // New items (and items moved to another category) go to the end of their category.
    const nextOrder = async () =>
      ((await db.faqItem.aggregate({ where: { category: v.category }, _max: { sortOrder: true } }))._max.sortOrder ?? -1) + 1;

    if (id) {
      const before = await db.faqItem.findUnique({ where: { id }, select: { id: true, category: true } });
      if (!before) throw new ContentActionError("item_not_found", 404);
      const moved = before.category !== v.category;
      await db.faqItem.update({ where: { id }, data: { ...data, ...(moved ? { sortOrder: await nextOrder() } : {}) } });
      await audit({ actorId: staff.id, action: "faq.update", targetType: "FaqItem", targetId: id, details: { category: v.category, published: v.published } });
      return ok({ id });
    }
    const item = await db.faqItem.create({ data: { ...data, sortOrder: await nextOrder() }, select: { id: true } });
    await audit({ actorId: staff.id, action: "faq.create", targetType: "FaqItem", targetId: item.id, details: { category: v.category } });
    return ok({ id: item.id });
  });
}

export async function deleteFaqItem(input: unknown): Promise<ActionResult> {
  return runContentAction("content", "faq", async (staff) => {
    const parsed = idInput.safeParse(input);
    if (!parsed.success) return fail("invalid_input");
    const item = await db.faqItem.findUnique({ where: { id: parsed.data.id }, select: { id: true, category: true, question: true } });
    if (!item) throw new ContentActionError("item_not_found", 404);
    await db.faqItem.delete({ where: { id: item.id } });
    await audit({ actorId: staff.id, action: "faq.delete", targetType: "FaqItem", targetId: item.id, details: { category: item.category, question: item.question } });
    return ok();
  });
}

/** Saves the order of every item in one category (ids in the new order). */
export async function reorderFaqItems(input: unknown): Promise<ActionResult> {
  return runContentAction("content", "faq_order", async (staff) => {
    const parsed = faqReorderSchema.safeParse(input);
    if (!parsed.success) return fail("invalid_input");
    const { category, ids } = parsed.data;
    const current = await db.faqItem.findMany({ where: { category }, select: { id: true } });
    const known = new Set(current.map((c) => c.id));
    if (ids.length !== known.size || new Set(ids).size !== ids.length || ids.some((i) => !known.has(i))) {
      // Someone else added or removed an item meanwhile: reload and try again.
      throw new ContentActionError("reorder_mismatch");
    }
    await db.$transaction(ids.map((itemId, index) => db.faqItem.update({ where: { id: itemId }, data: { sortOrder: index } })));
    await audit({ actorId: staff.id, action: "faq.reorder", targetType: "FaqItem", targetId: category, details: { ids } });
    return ok();
  });
}

// ─── Scam alerts ─────────────────────────────────────────────

export async function saveScamAlert(input: unknown): Promise<ActionResult<{ id: string }>> {
  return runContentAction("content", "alert", async (staff) => {
    const { id, values } = splitInput(input);
    const parsed = parseInput(alertSchema, values);
    if (!parsed.ok) return parsed.result;
    const v = parsed.data;
    const data = {
      title: cleanLocalized(v.title),
      body: cleanLocalized(v.body),
      severity: v.severity,
      active: v.active,
      showAsBanner: v.showAsBanner,
      startsAt: v.startsAt,
      endsAt: v.endsAt,
    };
    if (id) {
      const before = await db.scamAlert.findUnique({ where: { id }, select: { id: true } });
      if (!before) throw new ContentActionError("item_not_found", 404);
      await db.scamAlert.update({ where: { id }, data });
      await audit({
        actorId: staff.id,
        action: "scam_alert.update",
        targetType: "ScamAlert",
        targetId: id,
        details: { severity: v.severity, active: v.active, showAsBanner: v.showAsBanner },
      });
      return ok({ id });
    }
    const alert = await db.scamAlert.create({ data: { ...data, createdById: staff.id }, select: { id: true } });
    await audit({
      actorId: staff.id,
      action: "scam_alert.create",
      targetType: "ScamAlert",
      targetId: alert.id,
      details: { severity: v.severity, showAsBanner: v.showAsBanner },
    });
    return ok({ id: alert.id });
  });
}

export async function deleteScamAlert(input: unknown): Promise<ActionResult> {
  return runContentAction("content", "alert", async (staff) => {
    const parsed = idInput.safeParse(input);
    if (!parsed.success) return fail("invalid_input");
    const alert = await db.scamAlert.findUnique({ where: { id: parsed.data.id }, select: { id: true, title: true } });
    if (!alert) throw new ContentActionError("item_not_found", 404);
    await db.scamAlert.delete({ where: { id: alert.id } });
    await audit({ actorId: staff.id, action: "scam_alert.delete", targetType: "ScamAlert", targetId: alert.id, details: { title: alert.title } });
    return ok();
  });
}
