import "server-only";
import type { FaqCategory } from "@/generated/prisma/enums";
import { pickLocalized } from "@/i18n/locale";
import { db } from "@/lib/db";

export type PublishedFaqItem = { id: string; category: FaqCategory; question: string; answer: string };

/** Published FAQ items in `locale` (falling back to English), by topic and admin order. */
export async function getPublishedFaq(locale: string): Promise<PublishedFaqItem[]> {
  const rows = await db.faqItem.findMany({
    where: { published: true },
    orderBy: [{ category: "asc" }, { sortOrder: "asc" }, { createdAt: "asc" }],
    select: { id: true, category: true, question: true, answer: true },
  });
  return rows
    .map((row) => ({
      id: row.id,
      category: row.category,
      question: pickLocalized(row.question, locale).trim(),
      answer: pickLocalized(row.answer, locale).trim(),
    }))
    .filter((item) => item.question && item.answer);
}
