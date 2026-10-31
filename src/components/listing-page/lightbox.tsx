"use client";

import { useCallback, useEffect, useState, type KeyboardEvent } from "react";
import Image from "next/image";
import { useLocale, useTranslations } from "next-intl";
import useEmblaCarousel from "embla-carousel-react";
import { XIcon } from "lucide-react";
import { ChevronEnd, ChevronStart } from "@/components/common/directional-icon";
import { Ltr } from "@/components/common/ltr";
import { Dialog, DialogClose, DialogContent, DialogDescription, DialogTitle } from "@/components/ui/dialog";
import { dirFor } from "@/i18n/locale";
import { formatNumber } from "@/lib/format";
import type { PagePhoto } from "@/lib/listing-page/types";
import { cn } from "@/lib/utils";

const navButton =
  "absolute top-1/2 z-10 hidden size-12 -translate-y-1/2 items-center justify-center rounded-full bg-white/90 text-black shadow-lg outline-none transition hover:bg-white focus-visible:ring-3 focus-visible:ring-white/70 disabled:opacity-30 sm:inline-flex";

/**
 * Full-screen photos: swipe, arrow keys (mirrored in right-to-left languages), Esc to close,
 * a "3 / 24" counter. Only the current photo and its neighbours are loaded.
 */
export function Lightbox({
  photos,
  title,
  open,
  startIndex,
  onOpenChange,
}: {
  photos: PagePhoto[];
  title: string;
  open: boolean;
  startIndex: number;
  onOpenChange: (open: boolean) => void;
}) {
  const t = useTranslations("listing.gallery");
  const locale = useLocale();
  const dir = dirFor(locale);
  const [viewportRef, api] = useEmblaCarousel({ direction: dir, startIndex, loop: false, duration: 22 });
  const [selected, setSelected] = useState(startIndex);
  const total = photos.length;

  useEffect(() => {
    if (!api) return;
    const update = () => setSelected(api.selectedScrollSnap());
    update();
    api.on("select", update).on("reInit", update);
    return () => {
      api.off("select", update).off("reInit", update);
    };
  }, [api]);

  useEffect(() => {
    if (open && api) api.scrollTo(startIndex, true);
  }, [open, api, startIndex]);

  const prev = useCallback(() => api?.scrollPrev(), [api]);
  const next = useCallback(() => api?.scrollNext(), [api]);

  const onKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    if (event.key !== "ArrowLeft" && event.key !== "ArrowRight") return;
    event.preventDefault();
    const forward = (event.key === "ArrowRight") !== (dir === "rtl");
    if (forward) next();
    else prev();
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        showCloseButton={false}
        className="flex h-dvh max-h-dvh w-screen max-w-none flex-col gap-0 rounded-none border-0 bg-black p-0 text-white sm:max-w-none"
        onKeyDown={onKeyDown}
      >
        <DialogTitle className="sr-only">{t("lightboxTitle", { title })}</DialogTitle>
        <DialogDescription className="sr-only">{t("lightboxHint")}</DialogDescription>
        <div className="flex h-14 shrink-0 items-center justify-between gap-4 px-4">
          <p className="text-sm font-medium tabular-nums" aria-live="polite">
            <Ltr>{t("counter", { index: formatNumber(selected + 1, locale), total: formatNumber(total, locale) })}</Ltr>
          </p>
          <DialogClose
            className="inline-flex size-11 items-center justify-center rounded-full outline-none hover:bg-white/10 focus-visible:ring-3 focus-visible:ring-white/60"
            aria-label={t("close")}
          >
            <XIcon className="size-6" aria-hidden />
          </DialogClose>
        </div>
        <div className="relative min-h-0 flex-1">
          <div ref={viewportRef} className="size-full overflow-hidden">
            <div className="flex size-full touch-pan-y">
              {photos.map((photo, index) => (
                <div
                  key={photo.id}
                  className="relative size-full min-w-0 shrink-0 grow-0 basis-full"
                  role="group"
                  aria-roledescription="slide"
                  aria-label={t("slide", { index: index + 1, total })}
                  aria-hidden={index !== selected || undefined}
                >
                  {Math.abs(index - selected) <= 1 ? (
                    <Image
                      src={photo.large}
                      alt={photo.alt}
                      fill
                      sizes="100vw"
                      unoptimized
                      className="object-contain"
                      draggable={false}
                    />
                  ) : null}
                </div>
              ))}
            </div>
          </div>
          {total > 1 ? (
            <>
              <button type="button" className={cn(navButton, "start-4")} onClick={prev} disabled={selected === 0} aria-label={t("previous")}>
                <ChevronStart className="size-6" aria-hidden />
              </button>
              <button type="button" className={cn(navButton, "end-4")} onClick={next} disabled={selected >= total - 1} aria-label={t("next")}>
                <ChevronEnd className="size-6" aria-hidden />
              </button>
            </>
          ) : null}
        </div>
        <p dir="auto" className="shrink-0 truncate px-4 py-3 text-center text-sm text-white/80">
          {photos[selected]?.alt}
        </p>
      </DialogContent>
    </Dialog>
  );
}
