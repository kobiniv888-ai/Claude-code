import { getTranslations } from "next-intl/server";
import { SpriteIcon } from "@/components/ds/sprite-icons";
import { Section } from "@/components/listing-page/section";
import type { AppLocale } from "@/config/site";
import { LISTING_REVIEWS_ANCHOR } from "@/lib/reviews";

/** "No reviews yet" (an honest empty state): shared by ListingReviews and the page's no-query path. */
export function ReviewsEmptyNote({ title, hint }: { title: string; hint: string }) {
  return (
    <div className="flex items-start gap-3 rounded-card border border-border bg-surface-muted p-4">
      <SpriteIcon name="messages-square" className="mt-0.5 size-5 shrink-0 text-muted-foreground" />
      <div className="grid gap-1">
        <p className="text-body font-medium">{title}</p>
        <p className="text-small text-muted-foreground">{hint}</p>
      </div>
    </div>
  );
}

/**
 * The reviews section of a listing with no visible review (Listing.reviewCount 0), drawn without
 * reading the database (speed-2): the counters change in the same transaction as every review and
 * are repaired daily (src/lib/reviews/reconcile.ts), so 0 means none. Every listing starts here
 * (demo listings never get reviews), so this saves two queries on most listing views.
 */
export async function ListingReviewsEmpty({ locale }: { locale: AppLocale }) {
  const t = await getTranslations({ locale, namespace: "reviews" });
  return (
    <Section id={LISTING_REVIEWS_ANCHOR} title={t("section.title")}>
      <ReviewsEmptyNote title={t("section.empty")} hint={t("section.emptyHint")} />
    </Section>
  );
}
