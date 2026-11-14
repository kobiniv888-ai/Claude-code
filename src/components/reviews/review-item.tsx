import type { ReactNode } from "react";
import { getTranslations } from "next-intl/server";
import type { AppLocale } from "@/config/site";
import { formatDate } from "@/lib/format";
import type { ReviewView } from "@/lib/reviews/queries";
import { reviewMonthDate } from "@/lib/reviews/rules";
import { cn } from "@/lib/utils";
import { ReviewText } from "./review-text";
import { Stars } from "./stars";

/** "אוקטובר 2026". */
export function monthLabel(month: string, locale: AppLocale): string {
  return formatDate(reviewMonthDate(month), locale, { month: "long", year: "numeric", timeZone: "UTC" });
}

/**
 * One review: "דנה · אוקטובר 2026" (first name only, founder's answer 6), the stars, the text
 * (translated, with "הצגת המקור"), and the host's reply under it. `children` adds what the page
 * needs below (the host's reply form and "report", a "hidden" note). Server component, no JS.
 */
export async function ReviewItem({
  review,
  locale,
  className,
  before,
  children,
}: {
  review: ReviewView;
  locale: AppLocale;
  className?: string;
  /** Shown above the byline (e.g. which place, in the account). */
  before?: ReactNode;
  children?: ReactNode;
}) {
  const t = await getTranslations({ locale, namespace: "reviews" });
  const labels = { translated: t("text.translated"), showOriginal: t("text.showOriginal"), showTranslation: t("text.showTranslation") };
  const name = review.author ?? t("item.guest");
  return (
    <article id={`review-${review.id}`} aria-label={t("item.label", { name })} className={cn("grid scroll-mt-(--header-height) gap-2", className)}>
      {before}
      <header className="flex flex-wrap items-center justify-between gap-x-3 gap-y-1">
        <p className="text-small">
          <bdi dir="auto" className="font-semibold">
            {name}
          </bdi>
          <span aria-hidden="true" className="px-1.5 text-muted-foreground">
            ·
          </span>
          <span className="sr-only">, </span>
          <span className="whitespace-nowrap text-muted-foreground">{monthLabel(review.month, locale)}</span>
        </p>
        <Stars value={review.rating} label={t("stars.label", { count: review.rating })} />
      </header>
      <ReviewText id={`review-${review.id}`} body={review.body} labels={labels} />
      {review.reply ? (
        <div className="ms-3 grid gap-1 border-s-2 border-border ps-3">
          <p className="text-caption">
            <span className="font-semibold text-foreground">{t("item.reply")}</span>
            <span aria-hidden="true" className="px-1.5 text-muted-foreground">
              ·
            </span>
            <span className="sr-only">, </span>
            <span className="whitespace-nowrap text-muted-foreground">{monthLabel(review.reply.month, locale)}</span>
          </p>
          <ReviewText id={`reply-${review.id}`} body={review.reply.body} labels={labels} />
        </div>
      ) : null}
      {children}
    </article>
  );
}
