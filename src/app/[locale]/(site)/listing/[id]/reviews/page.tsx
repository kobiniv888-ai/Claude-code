import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { getTranslations, setRequestLocale } from "next-intl/server";
import { Container } from "@/components/common/container";
import { buttonStyles } from "@/components/ds/button";
import { SpriteIcon } from "@/components/ds/sprite-icons";
import { ReviewItem } from "@/components/reviews/review-item";
import { StarValue } from "@/components/reviews/stars";
import type { AppLocale } from "@/config/site";
import { isAppLocale } from "@/i18n/locale";
import { Link, redirect } from "@/i18n/navigation";
import { formatNumber } from "@/lib/format";
import { resolveListing } from "@/lib/listing-page/resolve";
import { listingPath, listingSlugParam } from "@/lib/listing/urls";
import { getRatingSummary, isReviewableDealType, LISTING_REVIEWS_ANCHOR, MIN_REVIEWS_FOR_AVERAGE } from "@/lib/reviews";
import { listingReviewsPagePath } from "@/lib/reviews/paths";
import { getListingReviewsPage } from "@/lib/reviews/queries";
import { pageMetadata } from "@/lib/seo";

type Props = {
  params: Promise<{ locale: string; id: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
};

function pageOf(value: string | string[] | undefined): number {
  const raw = Array.isArray(value) ? value[0] : value;
  const page = Number.parseInt(raw ?? "1", 10);
  return Number.isFinite(page) && page > 0 ? page : 1;
}

export async function generateMetadata({ params, searchParams }: Props): Promise<Metadata> {
  const [{ locale, id }, query] = await Promise.all([params, searchParams]);
  if (!isAppLocale(locale)) return {};
  const t = await getTranslations({ locale, namespace: "reviews.all" });
  const resolved = await resolveListing(locale, id);
  if (!resolved) return { robots: { index: false, follow: true } };
  const page = pageOf(query.page);
  return pageMetadata({
    locale,
    path: listingReviewsPagePath(listingPath(resolved.data.publicId, resolved.data.title.shown), page),
    title: t("metaTitle", { title: resolved.data.title.shown }),
    description: t("metaDescription"),
    noIndex: resolved.access !== "public" || page > 1,
  });
}

/**
 * /listing/<id>/reviews — every visible review of a listing, newest first, 20 a page (round 3
 * phase-5 hardening, reviews-7): the listing page shows the newest 30, and this page keeps the
 * older ones readable (they count in the average). Public short stays and hotels only, like the
 * listing page's "ביקורות" section; first name and month only, as everywhere.
 */
export default async function ListingReviewsPage({ params, searchParams }: Props) {
  const [{ locale: raw, id }, query] = await Promise.all([params, searchParams]);
  if (!isAppLocale(raw)) notFound();
  const locale: AppLocale = raw;
  setRequestLocale(locale);
  const resolved = await resolveListing(locale, id);
  if (!resolved || resolved.access !== "public" || !isReviewableDealType(resolved.data.dealType)) notFound();
  const { data } = resolved;
  const requested = pageOf(query.page);
  const canonical = listingSlugParam(data.publicId, data.title.shown);
  const base = listingPath(data.publicId, data.title.shown);
  if (id !== canonical) redirect({ href: listingReviewsPagePath(base, requested), locale });

  const [t, tr, reviews] = await Promise.all([
    getTranslations({ locale, namespace: "reviews.all" }),
    getTranslations({ locale, namespace: "reviews" }),
    getListingReviewsPage(data.id, locale, requested),
  ]);
  // Past the last page: the last page's own address.
  if (reviews.total > 0 && requested > reviews.pages) redirect({ href: listingReviewsPagePath(base, reviews.pages), locale });

  const summary = getRatingSummary({ reviewCount: data.reviewCount ?? 0, ratingSum: data.ratingSum ?? 0 });
  const n = (value: number) => formatNumber(value, locale, { maximumFractionDigits: 1, minimumFractionDigits: 1 });
  const linkClass = buttonStyles({ variant: "secondary", size: "sm" });

  return (
    <Container className="grid max-w-3xl gap-6 pt-4 pb-12">
      <Link
        href={`${base}#${LISTING_REVIEWS_ANCHOR}`}
        className="inline-flex min-h-11 items-center gap-1 justify-self-start rounded-md text-small font-medium text-muted-foreground outline-none hover:text-foreground focus-visible:ring-3 focus-visible:ring-ring/50"
      >
        <SpriteIcon name="chevron-right" className="size-4 ltr:-scale-x-100" />
        {t("back")}
      </Link>
      <header className="grid gap-1">
        <h1 className="text-h1">{tr("section.title")}</h1>
        <p dir="auto" className="text-body text-muted-foreground">
          {data.title.shown}
        </p>
        <p className="text-small text-muted-foreground">
          {summary.average !== null ? (
            <span className="flex flex-wrap items-center gap-x-2 text-foreground">
              <StarValue>{tr("summary.average", { average: n(summary.average) })}</StarValue>
              <span aria-hidden="true" className="text-muted-foreground">
                ·
              </span>
              <span>{tr("section.count", { count: summary.count, countText: formatNumber(summary.count, locale) })}</span>
            </span>
          ) : reviews.total > 0 ? (
            tr("section.noAverage", { min: MIN_REVIEWS_FOR_AVERAGE })
          ) : null}
        </p>
      </header>

      {reviews.total === 0 ? (
        <div className="flex items-start gap-3 rounded-card border border-border bg-surface-muted p-4">
          <SpriteIcon name="messages-square" className="mt-0.5 size-5 shrink-0 text-muted-foreground" />
          <div className="grid gap-1">
            <p className="text-body font-medium">{tr("section.empty")}</p>
            <p className="text-small text-muted-foreground">{tr("section.emptyHint")}</p>
          </div>
        </div>
      ) : (
        <>
          <ul className="grid divide-y divide-border">
            {reviews.reviews.map((review) => (
              <li key={review.id} className="py-4 first:pt-0">
                <ReviewItem review={review} locale={locale} />
              </li>
            ))}
          </ul>
          {reviews.pages > 1 ? (
            <nav aria-label={t("pagesLabel")} className="flex flex-wrap items-center justify-between gap-3 border-t border-border pt-4">
              {reviews.page > 1 ? (
                <Link href={listingReviewsPagePath(base, reviews.page - 1)} rel="prev" className={linkClass}>
                  <SpriteIcon name="chevron-right" className="size-4 ltr:-scale-x-100" />
                  {t("newer")}
                </Link>
              ) : (
                <span />
              )}
              <p className="text-small text-muted-foreground" aria-current="page">
                {t("pageOf", { page: formatNumber(reviews.page, locale), pages: formatNumber(reviews.pages, locale) })}
              </p>
              {reviews.page < reviews.pages ? (
                <Link href={listingReviewsPagePath(base, reviews.page + 1)} rel="next" className={linkClass}>
                  {t("older")}
                  <SpriteIcon name="chevron-right" className="size-4 rtl:-scale-x-100" />
                </Link>
              ) : (
                <span />
              )}
            </nav>
          ) : null}
        </>
      )}
      <p className="flex items-start gap-2 text-caption text-muted-foreground">
        <SpriteIcon name="shield-check" className="mt-px size-4 shrink-0" />
        {tr("section.realOnly")}
      </p>
    </Container>
  );
}
