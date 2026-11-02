"use client";

import { useTranslations } from "next-intl";
import { PhotoCarousel as DsPhotoCarousel } from "@/components/ds/photo-carousel";
import type { ListingCardPhoto } from "@/lib/listing/types";

/**
 * A listing's swipeable photos (the design-system PhotoCarousel with the listing's labels).
 * CSS scroll-snap, so swiping works before any script runs; only the first photo is
 * server-rendered and the rest load when the visitor reaches for them.
 */
export function PhotoCarousel({
  photos,
  title,
  href,
  sizes,
  priority = false,
  aspect = "aspect-[16/10]",
  totalCount,
  peek,
  className,
}: {
  photos: ListingCardPhoto[];
  title: string;
  href: string;
  /** next/image `sizes` for the card width at each breakpoint. */
  sizes: string;
  priority?: boolean;
  aspect?: string;
  /** All photos of the listing ("+N photos" on the last slide when more than shown). */
  totalCount?: number;
  peek?: boolean;
  className?: string;
}) {
  const t = useTranslations("listingCard.carousel");
  return (
    <DsPhotoCarousel
      photos={photos}
      label={t("label", { title })}
      href={href}
      sizes={sizes}
      priority={priority}
      aspect={aspect}
      totalCount={totalCount}
      peek={peek}
      className={className}
    />
  );
}
