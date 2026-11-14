import "server-only";
import { Prisma } from "@/generated/prisma/client";
import { isAppLocale } from "@/i18n/locale";
import { db } from "@/lib/db";
import { isTranslationEnabled, translateTextInto } from "@/lib/translate";
import { translationTargets } from "./rules";

/**
 * Machine translations of reviews and host replies (round 3, brief 8.1), with the site's
 * provider (src/lib/translate.ts: Azure, or Google). Run after the response, once per text:
 * the original is never changed; Review.translations / hostReplyTranslations get
 * { en: "…", ru: "…", … } for the other four languages. Without a key (or when the service fails)
 * nothing is stored and every reader sees the original (pickReviewText in ./rules.ts). Never
 * throws.
 *
 * translateMissingReviews catches up: reviews and replies posted while there was no key, or whose
 * translation failed once (a timeout, the free quota), are translated later — by the daily
 * cleanup job (a capped step) and by `npm run translate:missing`.
 */

export async function translateReview(reviewId: string): Promise<boolean> {
  if (!isTranslationEnabled()) return false;
  try {
    const review = await db.review.findUnique({ where: { id: reviewId }, select: { text: true, language: true, translations: true } });
    if (!review || review.translations || !isAppLocale(review.language)) return false;
    const translations = await translateTextInto(review.text, review.language, translationTargets(review.language));
    if (!translations || Object.keys(translations).length === 0) return false;
    // Only while none is stored (a second run at the same time changes nothing).
    const { count } = await db.review.updateMany({
      where: { id: reviewId, translations: { equals: Prisma.AnyNull } },
      data: { translations },
    });
    return count === 1;
  } catch (error) {
    console.error(`[reviews] could not translate review ${reviewId}:`, error);
    return false;
  }
}

export async function translateReply(reviewId: string): Promise<boolean> {
  if (!isTranslationEnabled()) return false;
  try {
    const review = await db.review.findUnique({
      where: { id: reviewId },
      select: { hostReply: true, hostReplyLanguage: true, hostReplyTranslations: true },
    });
    if (!review?.hostReply || review.hostReplyTranslations || !isAppLocale(review.hostReplyLanguage)) return false;
    const translations = await translateTextInto(review.hostReply, review.hostReplyLanguage, translationTargets(review.hostReplyLanguage));
    if (!translations || Object.keys(translations).length === 0) return false;
    const { count } = await db.review.updateMany({
      where: { id: reviewId, hostReplyTranslations: { equals: Prisma.AnyNull } },
      data: { hostReplyTranslations: translations },
    });
    return count === 1;
  } catch (error) {
    console.error(`[reviews] could not translate the reply to review ${reviewId}:`, error);
    return false;
  }
}

/** Reviews and replies translated per call (the next run goes on). */
export const TRANSLATE_MISSING_LIMIT = 100;
const TRANSLATE_BATCH = 50;

/**
 * Translates visible reviews and host replies that have no translation yet, newest first, at most
 * `limit` texts in all. 0 when no translation provider is set. Safe to run again (and at the same
 * time as the after-post translation): each text is stored only while none is.
 */
export async function translateMissingReviews({
  limit = TRANSLATE_MISSING_LIMIT,
  listingId,
}: {
  limit?: number;
  /** Only this listing's reviews (tests). */
  listingId?: string;
} = {}): Promise<{ reviews: number; replies: number }> {
  const done = { reviews: 0, replies: 0 };
  if (!isTranslationEnabled() || limit <= 0) return done;
  let budget = limit;
  const tried = new Set<string>();
  while (budget > 0) {
    const rows = await db.review.findMany({
      where: { hidden: false, translations: { equals: Prisma.AnyNull }, id: { notIn: [...tried] }, ...(listingId ? { listingId } : {}) },
      orderBy: [{ createdAt: "desc" }, { id: "desc" }],
      take: Math.min(TRANSLATE_BATCH, budget),
      select: { id: true },
    });
    if (rows.length === 0) break;
    for (const { id } of rows) {
      tried.add(id);
      budget--;
      if (await translateReview(id)) done.reviews++;
    }
  }
  tried.clear();
  while (budget > 0) {
    const rows = await db.review.findMany({
      where: { hidden: false, hostReply: { not: null }, hostReplyTranslations: { equals: Prisma.AnyNull }, id: { notIn: [...tried] }, ...(listingId ? { listingId } : {}) },
      orderBy: [{ hostReplyAt: "desc" }, { id: "desc" }],
      take: Math.min(TRANSLATE_BATCH, budget),
      select: { id: true },
    });
    if (rows.length === 0) break;
    for (const { id } of rows) {
      tried.add(id);
      budget--;
      if (await translateReply(id)) done.replies++;
    }
  }
  return done;
}
