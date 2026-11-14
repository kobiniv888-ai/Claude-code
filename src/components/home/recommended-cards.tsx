"use client";

import { CardCarousel } from "@/components/ds/card-carousel";
import { ListingCard } from "@/components/listing/listing-card";
import type { ListingCardData } from "@/lib/listing/types";
import { RECOMMENDED_CARD_SIZES, RECOMMENDED_CARD_WIDTH } from "./recommended-layout";

/**
 * The cards of a home tab loaded in the browser (monthly, buy, hotels). Loaded by
 * <RecommendedSwitch> on the first tab switch only, so the client copy of the listing card stays
 * out of the home page's first load.
 */
export function RecommendedCards({ label, listings }: { label: string; listings: ListingCardData[] }) {
  return (
    <CardCarousel label={label} itemClassName={RECOMMENDED_CARD_WIDTH}>
      {listings.map((listing) => (
        <ListingCard key={listing.id} listing={listing} sizes={RECOMMENDED_CARD_SIZES} />
      ))}
    </CardCarousel>
  );
}
