import { getTranslations } from "next-intl/server";
import { Container } from "@/components/common/container";
import { CardCarousel } from "@/components/ds/card-carousel";
import { ListingCard } from "@/components/listing/listing-card";
import type { AppLocale } from "@/config/site";
import { HOME_DEFAULT_DEAL } from "@/lib/home/recommended";
import type { ListingCardData } from "@/lib/listing/types";
import { searchPath } from "@/lib/listing/urls";
import { SEARCH_BAR_DEALS, type SearchBarDeal } from "@/lib/search/search-bar";
import { CAROUSEL_ALIGN } from "./home-section";
import { RECOMMENDED_CARD_SIZES, RECOMMENDED_CARD_WIDTH } from "./recommended-layout";
import { RecommendedEmpty, RecommendedSwitch, type RecommendedLabels } from "./recommended-switch";

/**
 * "Recommended places" (brief round 2, 5.2; round 3, brief 3 and 4): one carousel of the shared
 * listing card for the selected home tab only (short stays first), promoted listings first (the
 * card labels them), then the newest; "הכל ←" opens the search for that tab. This renders the
 * first tab's row on the server; <RecommendedSwitch> swaps it when the visitor picks another tab.
 */
export async function RecommendedListings({ locale, listings }: { locale: AppLocale; listings: ListingCardData[] }) {
  const [t, tCommon] = await Promise.all([
    getTranslations({ locale, namespace: "home.recommended" }),
    getTranslations({ locale, namespace: "common" }),
  ]);
  const labels: RecommendedLabels = {
    title: t("title"),
    all: t("all"),
    empty: Object.fromEntries(SEARCH_BAR_DEALS.map((deal) => [deal, t(`empty.${deal}`)])) as Record<SearchBarDeal, string>,
    emptyText: t("emptyText"),
    emptyAction: t("emptyAction"),
    error: t("error"),
    retry: tCommon("retry"),
    loading: tCommon("loading"),
  };
  const hrefs = Object.fromEntries(SEARCH_BAR_DEALS.map((deal) => [deal, searchPath({ deal })])) as Record<SearchBarDeal, string>;

  const initial =
    listings.length === 0 ? (
      <Container>
        <RecommendedEmpty title={labels.empty[HOME_DEFAULT_DEAL]} text={labels.emptyText} action={labels.emptyAction} />
      </Container>
    ) : (
      <Container className={CAROUSEL_ALIGN}>
        <CardCarousel label={labels.title} itemClassName={RECOMMENDED_CARD_WIDTH}>
          {/* The first photo is in the first screen on phones (often the largest paint): not lazy. */}
          {listings.map((listing, index) => (
            <ListingCard key={listing.id} listing={listing} sizes={RECOMMENDED_CARD_SIZES} priority={index === 0} />
          ))}
        </CardCarousel>
      </Container>
    );

  return (
    <RecommendedSwitch
      initialDeal={HOME_DEFAULT_DEAL}
      initialEmpty={listings.length === 0}
      initial={initial}
      labels={labels}
      hrefs={hrefs}
    />
  );
}
