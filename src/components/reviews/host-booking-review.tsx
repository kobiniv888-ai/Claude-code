import { getTranslations } from "next-intl/server";
import { StarIcon } from "lucide-react";
import type { AppLocale } from "@/config/site";
import { Link } from "@/i18n/navigation";
import { getCurrentUser } from "@/lib/auth/session";
import { getHostBookingReview } from "@/lib/reviews/queries";
import { REVIEWS_PATH } from "@/lib/reviews/paths";
import { AccountReviewCard } from "./account-review-card";

/**
 * The guest's review on the host's booking page (brief 8.1): the review with the host's reply /
 * report actions, or nothing when the guest hasn't written one. Server component.
 */
export async function HostBookingReview({ bookingId, locale }: { bookingId: string; locale: AppLocale }) {
  const user = await getCurrentUser();
  if (!user) return null;
  const review = await getHostBookingReview(user.id, bookingId, locale);
  if (!review) return null;
  const t = await getTranslations({ locale, namespace: "reviews.hostBooking" });
  return (
    <section aria-labelledby="booking-review-title" className="grid gap-2">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h2 id="booking-review-title" className="flex items-center gap-2 text-h3">
          <StarIcon aria-hidden className="size-5 text-muted-foreground" />
          {t("title")}
        </h2>
        <Link href={REVIEWS_PATH} className="inline-flex min-h-11 items-center text-small font-medium text-primary-text underline-offset-4 hover:underline">
          {t("all")}
        </Link>
      </div>
      <ul className="grid">
        <AccountReviewCard review={review} locale={locale} role="host" />
      </ul>
    </section>
  );
}
