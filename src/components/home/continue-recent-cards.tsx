"use client";

import { CardCarousel } from "@/components/ds/card-carousel";
import { ListingCard } from "@/components/listing/listing-card";
import type { ListingCardData } from "@/lib/listing/types";
import { RECENT_CARD_CLASS, RECENT_CARD_SIZES, RECENT_CARD_WIDTH } from "./continue-layout";

/**
 * The "נצפו לאחרונה" cards: the short (compact) listing card, so the block under the search card
 * stays low. Loaded by <ContinueBlock> only when there is something to show, so first-time
 * visitors never download the client copy of the listing card.
 */
export function ContinueRecentCards({ label, cards }: { label: string; cards: ListingCardData[] }) {
  return (
    <CardCarousel label={label} itemClassName={RECENT_CARD_WIDTH}>
      {cards.map((card) => (
        <ListingCard key={card.id} listing={card} variant="compact" sizes={RECENT_CARD_SIZES} className={RECENT_CARD_CLASS} />
      ))}
    </CardCarousel>
  );
}
