import { getTranslations } from "next-intl/server";
import { EyeOffIcon } from "lucide-react";
import { Ltr } from "@/components/common/ltr";
import type { AppLocale } from "@/config/site";
import { Link } from "@/i18n/navigation";
import type { GuestReviewView, HostReviewView, OwnReviewView } from "@/lib/reviews/queries";
import { GuestReplyReport, HostReviewActions } from "./host-review-actions";
import { ReviewItem } from "./review-item";

/**
 * A review in the account (server component): which place and booking, the review itself, and
 * — for the host — the reply / report actions, for the guest "report the host's reply" once there
 * is one; a hidden review says so (the reason's name only).
 */
export async function AccountReviewCard({
  review,
  locale,
  role,
}: {
  review: OwnReviewView | HostReviewView | GuestReviewView;
  locale: AppLocale;
  role: "host" | "guest";
}) {
  const t = await getTranslations({ locale, namespace: "reviews" });
  const host = role === "host" ? (review as HostReviewView) : null;
  const guest = role === "guest" && "reportedAt" in review ? (review as GuestReviewView) : null;
  return (
    <li className="rounded-card border border-border bg-card p-4">
      <ReviewItem
        review={review}
        locale={locale}
        before={
          <p className="grid min-w-0 gap-0.5 text-caption text-muted-foreground">
            <Link href={review.listingPath} dir="auto" className="min-w-0 truncate font-medium text-foreground underline-offset-4 hover:underline">
              {review.listingTitle}
            </Link>
            <span>
              {t("account.booking")} <Ltr>{review.bookingCode}</Ltr>
            </span>
          </p>
        }
      >
        {review.hidden ? (
          <p className="flex items-start gap-2 rounded-input bg-surface-muted p-3 text-small">
            <EyeOffIcon aria-hidden className="mt-0.5 size-4.5 shrink-0 text-muted-foreground" />
            <span>{t(role === "host" ? "account.hiddenHost" : "account.hiddenGuest", { reason: t(`hideReasons.${review.hiddenReason ?? "other"}`) })}</span>
          </p>
        ) : null}
        {host ? <HostReviewActions reviewId={host.id} canReply={host.canReply} reportedAt={host.reportedAt?.toISOString() ?? null} hidden={host.hidden} /> : null}
        {guest?.reply ? <GuestReplyReport reviewId={guest.id} reportedAt={guest.reportedAt?.toISOString() ?? null} hidden={guest.hidden} /> : null}
      </ReviewItem>
    </li>
  );
}
