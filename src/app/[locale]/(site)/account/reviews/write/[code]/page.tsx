import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { getTranslations, setRequestLocale } from "next-intl/server";
import { CalendarClockIcon, CircleCheckBigIcon, EyeOffIcon, MessageSquareOffIcon } from "lucide-react";
import { PageHeader } from "@/components/common/page-header";
import { EmptyState } from "@/components/common/states";
import { ReviewForm } from "@/components/reviews/review-form";
import { ReviewItem } from "@/components/reviews/review-item";
import type { AppLocale } from "@/config/site";
import { requireUser } from "@/lib/auth/session";
import { TRIPS_PATH, tripPath } from "@/lib/booking/constants";
import { formatDate } from "@/lib/format";
import { REVIEWS_PATH, writeReviewPath } from "@/lib/reviews/paths";
import { getReviewFormContext } from "@/lib/reviews/queries";
import { isValidRating } from "@/lib/reviews/rules";
import { pageMetadata } from "@/lib/seo";
import { recordIdMiss } from "@/lib/security/id-guess";

type Props = {
  params: Promise<{ locale: string; code: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
};

function decoded(raw: string): string {
  try {
    return decodeURIComponent(raw);
  } catch {
    return raw;
  }
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { locale, code } = await params;
  const t = await getTranslations({ locale, namespace: "reviews.form" });
  return pageMetadata({ locale, path: writeReviewPath(decoded(code)), title: t("metaTitle"), description: t("metaDescription"), noIndex: true });
}

/**
 * /account/reviews/write/<booking code> — the review form (round 3, brief 8.1), opened from the
 * trip page and the review-request email. Only the booking's guest (anyone else: not found).
 * When the booking can't be reviewed (too early, too late, cancelled, a monthly rental, a demo
 * stay) or was reviewed already, the page says so instead of showing the form.
 */
export default async function WriteReviewPage({ params, searchParams }: Props) {
  const { locale: raw, code: rawCode } = await params;
  setRequestLocale(raw);
  const locale = raw as AppLocale;
  const code = decoded(rawCode);
  const user = await requireUser({ next: writeReviewPath(code) });
  const [t, context, query] = await Promise.all([
    getTranslations({ locale, namespace: "reviews.form" }),
    getReviewFormContext(user.id, code, locale),
    searchParams,
  ]);
  if (!context) {
    // 4.7.a: a burst of codes that match nothing alerts the founder (src/lib/security/id-guess.ts).
    await recordIdMiss("review", user.id);
    notFound();
  }
  const wanted = Number(Array.isArray(query.rating) ? query.rating[0] : query.rating);
  const trip = tripPath(context.code);
  const until = formatDate(context.closes, locale, { day: "numeric", month: "long", year: "numeric" });
  const crumbs = [
    { label: t("crumbTrips"), href: TRIPS_PATH },
    { label: context.code, href: trip },
    { label: t("crumb") },
  ];

  return (
    <div className="grid w-full max-w-[42rem] gap-2 pb-10">
      <PageHeader
        breadcrumbs={crumbs}
        title={t("title")}
        description={t.rich("about", { title: context.listingTitle, bdi: (chunks) => <bdi dir="auto" className="font-medium text-foreground">{chunks}</bdi> })}
      />
      {context.review ? (
        <div className="grid gap-4">
          <p className="flex items-start gap-2 rounded-card border border-border bg-surface-muted p-4 text-small">
            {context.review.hidden ? (
              <EyeOffIcon className="mt-0.5 size-5 shrink-0 text-muted-foreground" aria-hidden />
            ) : (
              <CircleCheckBigIcon className="mt-0.5 size-5 shrink-0 text-success" aria-hidden />
            )}
            <span>{context.review.hidden ? t("postedHidden") : t("posted")}</span>
          </p>
          <div className="rounded-card border border-border bg-card p-4">
            <ReviewItem review={context.review} locale={locale} />
          </div>
        </div>
      ) : context.block ? (
        <EmptyState
          bordered
          icon={context.block === "too_early" ? CalendarClockIcon : MessageSquareOffIcon}
          title={t(`blocked.${context.block}.title` as "blocked.too_late.title")}
          description={t(`blocked.${context.block}.body` as "blocked.too_late.body", { date: until })}
          action={{ label: t("backToTrip"), href: trip }}
        />
      ) : (
        <>
          <p className="mb-4 text-small text-muted-foreground">{t("closes", { date: until })}</p>
          <ReviewForm
            bookingCode={context.code}
            listingPath={context.listingPath}
            tripPath={trip}
            initialRating={isValidRating(wanted) ? wanted : null}
          />
          <p className="mt-6 text-caption text-muted-foreground">{t("privacy", { reviews: REVIEWS_PATH })}</p>
        </>
      )}
    </div>
  );
}
