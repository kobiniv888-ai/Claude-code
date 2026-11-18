import { getTranslations } from "next-intl/server";
import { SpriteIcon } from "@/components/ds/sprite-icons";
import { buttonStyles } from "@/components/ds/button";
import { Card } from "@/components/ds/card";
import type { AppLocale } from "@/config/site";
import { Link } from "@/i18n/navigation";
import { getCurrentUser } from "@/lib/auth/session";
import { formatDate } from "@/lib/format";
import { getReviewPrompt } from "@/lib/reviews/queries";
import { writeReviewPath } from "@/lib/reviews/paths";

/**
 * Contract (3): the "how was your stay?" card on the trip page (brief 8.1). Renders NOTHING unless
 * the signed-in guest can review this booking today (completed short stay or hotel, the window
 * from the day after check-out to 14 days later, no review yet, not a demo). Five star links open
 * the form with that rating chosen; the button opens it as it is. Server component, no JS.
 */
export async function TripReviewPrompt({ bookingCode, locale }: { bookingCode: string; locale: AppLocale }) {
  const user = await getCurrentUser();
  if (!user) return null;
  const prompt = await getReviewPrompt(user.id, bookingCode, locale).catch((error: unknown) => {
    console.error("[reviews] the trip page prompt failed:", error);
    return null;
  });
  if (!prompt) return null;
  const t = await getTranslations({ locale, namespace: "reviews.prompt" });
  const until = formatDate(prompt.closes, locale, { day: "numeric", month: "long" });
  return (
    <Card as="section" aria-labelledby="trip-review-title" className="grid gap-3 border-primary-tint-border bg-primary-tint/40">
      <div className="grid gap-1">
        <h2 id="trip-review-title" className="text-h2">
          {t("title")}
        </h2>
        <p className="text-small text-muted-foreground">
          {t.rich("body", { title: prompt.listingTitle, date: until, bdi: (chunks) => <bdi dir="auto">{chunks}</bdi> })}
        </p>
      </div>
      <nav aria-label={t("starsLabel")} className="flex items-center gap-1">
        {[1, 2, 3, 4, 5].map((n) => (
          <Link
            key={n}
            href={writeReviewPath(prompt.code, n)}
            aria-label={t("star", { count: n })}
            className="inline-flex size-11 items-center justify-center rounded-full text-muted-foreground outline-none hover:text-foreground focus-visible:ring-3 focus-visible:ring-ring/50"
          >
            <SpriteIcon name="star" className="size-7" strokeWidth={1.75} />
          </Link>
        ))}
      </nav>
      <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
        <Link href={writeReviewPath(prompt.code)} className={buttonStyles({ variant: "primary", size: "sm" })}>
          {t("cta")}
        </Link>
        <span className="text-caption text-muted-foreground">{t("daysLeft", { count: prompt.daysLeft })}</span>
      </div>
    </Card>
  );
}
