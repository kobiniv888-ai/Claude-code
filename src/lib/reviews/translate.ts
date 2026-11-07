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
