"use client";

import { useEffect, useState } from "react";
import Image from "next/image";
import { useLocale, useTranslations } from "next-intl";
import useEmblaCarousel from "embla-carousel-react";
import { BedIcon } from "lucide-react";
import { ChevronEnd, ChevronStart } from "@/components/common/directional-icon";
import { Ltr } from "@/components/common/ltr";
import { dirFor } from "@/i18n/locale";
import { formatNumber } from "@/lib/format";
import type { PagePhoto } from "@/lib/listing-page/types";
import { cn } from "@/lib/utils";
import { Lightbox } from "./lightbox";

const nav =
  "absolute top-1/2 z-10 inline-flex size-8 -translate-y-1/2 items-center justify-center rounded-full bg-card/95 text-foreground shadow-md outline-none focus-visible:ring-3 focus-visible:ring-ring/60 disabled:opacity-0";

/** A room type's photos: swipe carousel; tap for full screen. */
export function RoomPhotos({ photos, name }: { photos: PagePhoto[]; name: string }) {
  const t = useTranslations("listing.gallery");
  const locale = useLocale();
  const [viewportRef, api] = useEmblaCarousel({ direction: dirFor(locale) });
  const [selected, setSelected] = useState(0);
  const [lightbox, setLightbox] = useState(false);
  const total = photos.length;

  useEffect(() => {
    if (!api) return;
    const update = () => setSelected(api.selectedScrollSnap());
    api.on("select", update).on("reInit", update);
    return () => {
      api.off("select", update).off("reInit", update);
    };
  }, [api]);

  if (total === 0) {
    return (
      <div className="flex aspect-[4/3] items-center justify-center rounded-xl bg-muted text-muted-foreground">
        <BedIcon className="size-8" aria-hidden />
      </div>
    );
  }

  return (
    <div className="relative aspect-[4/3] overflow-hidden rounded-xl bg-muted" role="group" aria-roledescription="carousel" aria-label={t("label", { title: name })}>
      <div ref={viewportRef} className="size-full overflow-hidden">
        <div className="flex size-full touch-pan-y">
          {photos.map((photo, index) => (
            <div key={photo.id} className="relative size-full min-w-0 shrink-0 grow-0 basis-full" aria-hidden={index !== selected || undefined}>
              <button
                type="button"
                className="relative block size-full outline-none focus-visible:ring-3 focus-visible:ring-ring"
                onClick={() => setLightbox(true)}
                tabIndex={index === selected ? 0 : -1}
                aria-label={t("open", { index: index + 1, total })}
              >
                {Math.abs(index - selected) <= 1 ? (
                  <Image src={photo.medium} alt={photo.alt} fill sizes="(min-width: 640px) 300px, 100vw" unoptimized className="object-cover" draggable={false} />
                ) : null}
              </button>
            </div>
          ))}
        </div>
      </div>
      {total > 1 ? (
        <>
          <button type="button" className={cn(nav, "start-2")} onClick={() => api?.scrollPrev()} disabled={selected === 0} aria-label={t("previous")}>
            <ChevronStart className="size-4" aria-hidden />
          </button>
          <button type="button" className={cn(nav, "end-2")} onClick={() => api?.scrollNext()} disabled={selected >= total - 1} aria-label={t("next")}>
            <ChevronEnd className="size-4" aria-hidden />
          </button>
          <span className="pointer-events-none absolute end-2 bottom-2 rounded-full bg-black/65 px-2 py-0.5 text-xs text-white tabular-nums" aria-hidden>
            <Ltr>{t("counter", { index: formatNumber(selected + 1, locale), total: formatNumber(total, locale) })}</Ltr>
          </span>
        </>
      ) : null}
      <Lightbox photos={photos} title={name} open={lightbox} startIndex={selected} onOpenChange={setLightbox} />
    </div>
  );
}
