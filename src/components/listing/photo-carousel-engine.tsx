"use client";

import { useEffect } from "react";
import useEmblaCarousel, { type UseEmblaCarouselType } from "embla-carousel-react";

export type CarouselApi = NonNullable<UseEmblaCarouselType[1]>;

/**
 * Embla for a listing card's photo carousel. PhotoCarousel loads this module (and Embla with it)
 * only when the carousel is about to be used, and hands it the viewport element it already
 * rendered. Renders nothing.
 */
export default function PhotoCarouselEngine({
  viewport,
  direction,
  onApi,
}: {
  viewport: HTMLElement;
  direction: "ltr" | "rtl";
  onApi: (api: CarouselApi | null) => void;
}) {
  const [attach, api] = useEmblaCarousel({ direction, loop: false, align: "start", skipSnaps: false });

  useEffect(() => {
    attach(viewport);
  }, [attach, viewport]);

  useEffect(() => {
    if (!api) return;
    onApi(api);
    return () => onApi(null);
  }, [api, onApi]);

  return null;
}
