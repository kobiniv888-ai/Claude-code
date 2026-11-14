import { useLocale, useTranslations } from "next-intl";
import { formatNumber } from "@/lib/format";
import { getRatingSummary, LISTING_REVIEWS_ANCHOR } from "@/lib/reviews";
import { StarValue } from "./stars";

/**
 * "★ 4.7 · 12 ביקורות" under the listing's title, a link to the reviews section — only from 3
 * visible reviews (brief 8.1); nothing before that. No hooks beyond next-intl's: fine in a server
 * component.
 */
export function RatingLine({ reviewCount, ratingSum }: { reviewCount: number; ratingSum: number }) {
  const t = useTranslations("reviews");
  const locale = useLocale();
  const summary = getRatingSummary({ reviewCount, ratingSum });
  if (summary.average === null) return null;
  const average = formatNumber(summary.average, locale, { minimumFractionDigits: 1, maximumFractionDigits: 1 });
  const countText = formatNumber(summary.count, locale);
  return (
    <a
      href={`#${LISTING_REVIEWS_ANCHOR}`}
      aria-label={t("summary.label", { average, count: summary.count, countText })}
      className="inline-flex min-h-11 items-center gap-1.5 self-start rounded-md text-small outline-none focus-visible:ring-3 focus-visible:ring-ring/50 sm:min-h-0"
    >
      <StarValue>{average}</StarValue>
      <span aria-hidden="true" className="text-muted-foreground">
        ·
      </span>
      <span className="underline underline-offset-4">{t("section.count", { count: summary.count, countText })}</span>
    </a>
  );
}
