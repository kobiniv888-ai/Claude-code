import type { Metadata } from "next";
import { getTranslations, setRequestLocale } from "next-intl/server";
import { MessageSquareTextIcon, StarIcon } from "lucide-react";
import { PageHeader } from "@/components/common/page-header";
import { EmptyState } from "@/components/common/states";
import { buttonStyles } from "@/components/ds/button";
import { Card } from "@/components/ds/card";
import { AccountReviewCard } from "@/components/reviews/account-review-card";
import { ReviewRequestSwitch } from "@/components/reviews/review-request-switch";
import type { AppLocale } from "@/config/site";
import { Link } from "@/i18n/navigation";
import { parseNotificationPrefs } from "@/lib/account/settings-schema";
import { requireUser } from "@/lib/auth/session";
import { db } from "@/lib/db";
import { formatDate } from "@/lib/format";
import { REVIEWS_PATH, writeReviewPath } from "@/lib/reviews/paths";
import { getGuestReviews, getHostReviews } from "@/lib/reviews/queries";
import { pageMetadata } from "@/lib/seo";

type Props = { params: Promise<{ locale: string }> };

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: "reviews.account" });
  return pageMetadata({ locale, path: REVIEWS_PATH, title: t("title"), description: t("description"), noIndex: true });
}

/**
 * /account/reviews — "ביקורות" (round 3, brief 8.1):
 * - stays waiting for the guest's review (with the last day), and the reviews they wrote;
 * - for hosts, the reviews of their places, each with the ONE public reply and "report this
 *   review" (reviews are final: nobody edits or deletes them; staff can only hide one);
 * - the "ask me for a review by email" switch (the review request's unsubscribe link lands here).
 */
export default async function AccountReviewsPage({ params }: Props) {
  const { locale: raw } = await params;
  setRequestLocale(raw);
  const locale = raw as AppLocale;
  const user = await requireUser({ next: REVIEWS_PATH });
  const [t, hostReviews, guest, prefs] = await Promise.all([
    getTranslations({ locale, namespace: "reviews.account" }),
    getHostReviews(user.id, locale),
    getGuestReviews(user.id, locale),
    db.user.findUnique({ where: { id: user.id }, select: { notificationPrefs: true } }),
  ]);
  const empty = hostReviews.length === 0 && guest.written.length === 0 && guest.pending.length === 0;

  return (
    <div className="grid gap-8 pb-10">
      <PageHeader title={t("title")} description={t("description")} className="pb-0 sm:pb-0" />

      {guest.pending.length > 0 ? (
        <section aria-labelledby="reviews-pending" className="grid gap-3">
          <h2 id="reviews-pending" className="text-h2">
            {t("pendingTitle")}
          </h2>
          <ul className="grid gap-3 lg:grid-cols-2">
            {guest.pending.map((p) => (
              <Card as="li" key={p.code} className="flex flex-wrap items-center justify-between gap-3">
                <div className="grid min-w-0 gap-0.5">
                  <p dir="auto" className="truncate text-body font-medium">
                    {p.listingTitle}
                  </p>
                  <p className="text-small text-muted-foreground">{t("pendingUntil", { date: formatDate(p.closes, locale, { day: "numeric", month: "long" }) })}</p>
                </div>
                <Link href={writeReviewPath(p.code)} className={buttonStyles({ variant: "primary", size: "sm" })}>
                  {t("write")}
                </Link>
              </Card>
            ))}
          </ul>
        </section>
      ) : null}

      {empty ? (
        <EmptyState bordered icon={StarIcon} title={t("emptyTitle")} description={t("emptyText")} action={{ label: t("toTrips"), href: "/account/trips" }} />
      ) : null}

      {hostReviews.length > 0 ? (
        <section aria-labelledby="reviews-host" className="grid gap-3">
          <div className="grid gap-1">
            <h2 id="reviews-host" className="text-h2">
              {t("hostTitle")}
            </h2>
            <p className="text-small text-muted-foreground">{t("hostLead")}</p>
          </div>
          <ul className="grid gap-3">
            {hostReviews.map((review) => (
              <AccountReviewCard key={review.id} review={review} locale={locale} role="host" />
            ))}
          </ul>
        </section>
      ) : null}

      {guest.written.length > 0 ? (
        <section aria-labelledby="reviews-written" className="grid gap-3">
          <h2 id="reviews-written" className="text-h2">
            {t("writtenTitle")}
          </h2>
          <ul className="grid gap-3">
            {guest.written.map((review) => (
              <AccountReviewCard key={review.id} review={review} locale={locale} role="guest" />
            ))}
          </ul>
        </section>
      ) : null}

      <Card as="section" aria-labelledby="reviews-email" padding="lg" className="grid gap-3">
        <h2 id="reviews-email" className="flex items-center gap-2 text-h3">
          <MessageSquareTextIcon aria-hidden className="size-5 text-muted-foreground" />
          {t("emailSection")}
        </h2>
        <ReviewRequestSwitch initial={parseNotificationPrefs(prefs?.notificationPrefs).email.reviewRequests} />
      </Card>
    </div>
  );
}
