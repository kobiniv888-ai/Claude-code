import { getTranslations } from "next-intl/server";
import { Container } from "@/components/common/container";
import { CardCarousel } from "@/components/ds/card-carousel";
import { EmptyState } from "@/components/ds/empty-state";
import { SparklesIcon } from "@/components/ds/sprite-icons";
import { ListingCard } from "@/components/listing/listing-card";
import type { AppLocale } from "@/config/site";
import type { ListingCardData } from "@/lib/listing/types";
import { HomeSection } from "./home-section";

/** ~250px cards on a 390px phone (the next one peeks in), 2.5 on tablets, 4 on desktop. */
const CARD_WIDTH = "basis-[66%] sm:basis-[40%] md:basis-[31%] lg:basis-[23.6%]";

/**
 * "Recommended places" (brief round 2, 5.2): one carousel of the shared listing card, promoted
 * listings first (the card labels them), then the newest. Empty: an invitation to list a place.
 */
export async function RecommendedListings({ locale, listings }: { locale: AppLocale; listings: ListingCardData[] }) {
  const t = await getTranslations({ locale, namespace: "home.recommended" });
  if (listings.length === 0) {
    return (
      <section aria-labelledby="home-recommended-title">
        <Container>
          <h2 id="home-recommended-title" className="sr-only">
            {t("title")}
          </h2>
          <EmptyState
            icon={SparklesIcon}
            title={t("emptyTitle")}
            description={t("emptyText")}
            action={{ label: t("emptyAction"), href: "/post" }}
          />
        </Container>
      </section>
    );
  }
  return (
    <HomeSection id="home-recommended-title" title={t("title")} href="/search" linkLabel={t("all")} bleed>
      <CardCarousel label={t("title")} itemClassName={CARD_WIDTH}>
        {listings.map((listing) => (
          <ListingCard key={listing.id} listing={listing} />
        ))}
      </CardCarousel>
    </HomeSection>
  );
}
