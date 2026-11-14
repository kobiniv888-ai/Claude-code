import { getTranslations } from "next-intl/server";
import { SpriteIcon } from "@/components/ds/sprite-icons";
import { Section } from "@/components/listing-page/section";
import type { AppLocale } from "@/config/site";
import { Link } from "@/i18n/navigation";
import { formatNumber } from "@/lib/format";
import { getListingReviews } from "@/lib/reviews/queries";
import { getRatingSummary, LISTING_REVIEWS_ANCHOR, MIN_REVIEWS_FOR_AVERAGE, reviewsShown } from "@/lib/reviews";
import { ReviewsEmptyNote } from "./listing-reviews-empty";
import { ReviewItem } from "./review-item";
import { StarValue } from "./stars";

/** Reviews shown before "עוד N ביקורות" (the rest open in place, no JavaScript). */
const FIRST = 4;
/** At most this many on the page. */
const MAX = 30;

/**
 * "ביקורות" on the listing page of a short stay or hotel (round 3, brief 8.1). Real reviews only,
 * by guests who booked and stayed; never invented or imported, demo listings have none.
 * - From 3 visible reviews: the average and the count, and the quick ratings that 3 guests gave.
 * - Before that: the reviews themselves, without an average (and a line saying when it appears).
 * - None yet: an honest empty state.
 * - More than MAX: "showing the newest 30 of N" and a link to every review (`allHref`,
 *   /listing/<id>/reviews), so older reviews that count in the average can still be read.
 * A server component streamed in its own <Suspense> (the page doesn't wait for it), no JavaScript.
 * If the reviews can't be read (a database error), the section says so and keeps the counters'
 * summary: an optional section never takes the price and the booking box down with it.
 */
export async function ListingReviews({
  listingId,
  locale,
  counters,
  allHref,
}: {
  listingId: string;
  locale: AppLocale;
  counters: { reviewCount: number; ratingSum: number };
  /** "All reviews" of this listing (listingReviewsPagePath in src/lib/reviews/paths.ts). */
  allHref?: string;
}) {
  const [t, data] = await Promise.all([
    getTranslations({ locale, namespace: "reviews" }),
    getListingReviews(listingId, locale, MAX).catch((error: unknown) => {
      console.error("[reviews] listing reviews failed", error);
      return null;
    }),
  ]);
  const summary = getRatingSummary(counters);
  const n = (value: number) => formatNumber(value, locale, { maximumFractionDigits: 1, minimumFractionDigits: 1 });
  const averageLine =
    summary.average !== null ? (
      <span className="flex flex-wrap items-center gap-x-2 text-body text-foreground">
        <StarValue>{t("summary.average", { average: n(summary.average) })}</StarValue>
        <span aria-hidden="true" className="text-muted-foreground">
          ·
        </span>
        <span>{t("section.count", { count: summary.count, countText: formatNumber(summary.count, locale) })}</span>
      </span>
    ) : null;

  if (!data) {
    return (
      <Section id={LISTING_REVIEWS_ANCHOR} title={t("section.title")} description={averageLine}>
        <p role="status" className="flex items-start gap-3 rounded-card border border-border bg-surface-muted p-4 text-small text-muted-foreground">
          <SpriteIcon name="messages-square" className="mt-0.5 size-5 shrink-0" />
          {t("section.unavailable")}
        </p>
      </Section>
    );
  }

  const count = data.total;
  const { shown, hidden } = reviewsShown(count, data.reviews.length);
  const first = data.reviews.slice(0, FIRST);
  const rest = data.reviews.slice(FIRST);

  return (
    <Section
      id={LISTING_REVIEWS_ANCHOR}
      title={t("section.title")}
      description={averageLine ?? (count > 0 ? t("section.noAverage", { min: MIN_REVIEWS_FOR_AVERAGE }) : null)}
    >
      {count === 0 ? (
        <ReviewsEmptyNote title={t("section.empty")} hint={t("section.emptyHint")} />
      ) : (
        <div className="grid gap-5">
          {summary.average !== null && data.quick.length > 0 ? (
            <dl aria-label={t("quick.title")} className="grid grid-cols-2 gap-x-6 gap-y-2 sm:grid-cols-3">
              {data.quick.map((q) => (
                <div key={q.key} className="flex items-center justify-between gap-2 border-b border-border pb-2 text-small">
                  <dt className="min-w-0 text-muted-foreground">{t(`quick.${q.key}`)}</dt>
                  <dd className="font-medium">{n(q.average)}</dd>
                </div>
              ))}
            </dl>
          ) : null}
          <ul className="grid divide-y divide-border">
            {first.map((review) => (
              <li key={review.id} className="py-4 first:pt-0">
                <ReviewItem review={review} locale={locale} />
              </li>
            ))}
          </ul>
          {rest.length > 0 ? (
            <details className="group/more">
              <summary className="inline-flex min-h-11 cursor-pointer list-none items-center gap-1.5 rounded-md text-small font-medium text-primary-text underline underline-offset-4 outline-none focus-visible:ring-3 focus-visible:ring-ring/50 [&::-webkit-details-marker]:hidden">
                {t("section.showMore", { count: rest.length, countText: formatNumber(rest.length, locale) })}
                <SpriteIcon name="chevron-down" className="size-4 transition-transform group-open/more:rotate-180" />
              </summary>
              <ul className="mt-2 grid divide-y divide-border">
                {rest.map((review) => (
                  <li key={review.id} className="py-4">
                    <ReviewItem review={review} locale={locale} />
                  </li>
                ))}
              </ul>
            </details>
          ) : null}
          {hidden > 0 ? (
            <div className="grid gap-1">
              <p className="text-small text-muted-foreground">
                {t("section.showingOf", { shown: formatNumber(shown, locale), total: formatNumber(count, locale) })}
              </p>
              {allHref ? (
                <Link
                  href={allHref}
                  className="inline-flex min-h-11 items-center gap-1.5 justify-self-start rounded-md text-small font-medium text-primary-text underline underline-offset-4 outline-none focus-visible:ring-3 focus-visible:ring-ring/50"
                >
                  {t("section.allReviews", { count, countText: formatNumber(count, locale) })}
                  <SpriteIcon name="chevron-right" className="size-4 rtl:-scale-x-100" />
                </Link>
              ) : null}
            </div>
          ) : null}
          <p className="flex items-start gap-2 text-caption text-muted-foreground">
            <SpriteIcon name="shield-check" className="mt-px size-4 shrink-0" />
            {t("section.realOnly")}
          </p>
        </div>
      )}
    </Section>
  );
}

/** The streaming placeholder: the section's height, quiet. */
export function ListingReviewsSkeleton() {
  return (
    <section aria-hidden="true" className="border-t border-border pt-8">
      <div className="mb-4 h-7 w-32 rounded-md skeleton-shimmer" />
      <div className="grid gap-3">
        <div className="h-4 w-48 rounded skeleton-shimmer" />
        <div className="h-16 rounded-card skeleton-shimmer" />
      </div>
    </section>
  );
}
