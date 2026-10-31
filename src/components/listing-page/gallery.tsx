"use client";

import { useCallback, useEffect, useState } from "react";
import Image from "next/image";
import { useLocale, useTranslations } from "next-intl";
import useEmblaCarousel from "embla-carousel-react";
import { GalleryHorizontalEndIcon, ImageOffIcon, PlayIcon, Rotate3dIcon } from "lucide-react";
import { Ltr } from "@/components/common/ltr";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogTitle } from "@/components/ui/dialog";
import { dirFor } from "@/i18n/locale";
import { formatNumber } from "@/lib/format";
import type { VideoEmbed } from "@/lib/listing-page/media";
import type { PagePhoto } from "@/lib/listing-page/types";
import { cn } from "@/lib/utils";
import { Lightbox } from "./lightbox";

/**
 * Listing photos: a mosaic (1 large + 4) from tablet width, a swipe carousel on phones, and a
 * full-screen lightbox. The video (YouTube/Vimeo) loads only when the visitor asks for it.
 */
export function Gallery({
  photos,
  title,
  video,
  tourUrl,
}: {
  photos: PagePhoto[];
  title: string;
  video: VideoEmbed | null;
  tourUrl: string | null;
}) {
  const t = useTranslations("listing.gallery");
  const locale = useLocale();
  const [lightbox, setLightbox] = useState<{ open: boolean; index: number }>({ open: false, index: 0 });
  const [videoOpen, setVideoOpen] = useState(false);
  const openAt = useCallback((index: number) => setLightbox({ open: true, index }), []);
  const total = photos.length;

  const media = (video || tourUrl) && (
    <div className="flex flex-wrap gap-2">
      {video ? (
        <Button type="button" variant="outline" className="h-10 rounded-full bg-card/95 shadow-sm" onClick={() => setVideoOpen(true)}>
          <PlayIcon aria-hidden />
          {t("video")}
        </Button>
      ) : null}
      {tourUrl ? (
        <Button asChild variant="outline" className="h-10 rounded-full bg-card/95 shadow-sm">
          <a href={tourUrl} target="_blank" rel="noopener noreferrer nofollow">
            <Rotate3dIcon aria-hidden />
            {t("tour")}
            <span className="sr-only">{t("opensNewTab")}</span>
          </a>
        </Button>
      ) : null}
    </div>
  );

  if (total === 0) {
    return (
      <div className="grid gap-3">
        <div className="flex aspect-[16/9] flex-col items-center justify-center gap-2 rounded-2xl bg-muted text-muted-foreground md:aspect-[21/8]">
          <ImageOffIcon className="size-10" aria-hidden />
          <p>{t("noPhotos")}</p>
        </div>
        {media}
        <VideoDialog video={video} open={videoOpen} onOpenChange={setVideoOpen} title={title} />
      </div>
    );
  }

  return (
    <section aria-label={t("label", { title })} className="grid gap-3">
      <MobileCarousel photos={photos} title={title} onOpen={openAt} />
      <Mosaic photos={photos} onOpen={openAt} />
      <div className="flex flex-wrap items-center justify-between gap-2">
        {media || <span />}
        {total > 1 ? (
          <Button type="button" variant="outline" className="hidden h-10 rounded-full md:inline-flex" onClick={() => openAt(0)}>
            <GalleryHorizontalEndIcon aria-hidden />
            {t("showAll", { count: total, formatted: formatNumber(total, locale) })}
          </Button>
        ) : null}
      </div>
      <Lightbox
        photos={photos}
        title={title}
        open={lightbox.open}
        startIndex={lightbox.index}
        onOpenChange={(open) => setLightbox((s) => ({ ...s, open }))}
      />
      <VideoDialog video={video} open={videoOpen} onOpenChange={setVideoOpen} title={title} />
    </section>
  );
}

/**
 * `first` marks the main photo (high fetch priority). Both the mosaic (wide screens) and the phone
 * carousel render it and CSS hides one of them, so it is not preloaded (that fetched both sizes
 * on every device): the carousel copy loads eagerly, the mosaic copy with `lazy` (a lazy image
 * that is hidden is never fetched; on wide screens it is on screen and loads at once).
 */
function Photo({
  photo,
  sizes,
  first = false,
  lazy = false,
  className,
}: {
  photo: PagePhoto;
  sizes: string;
  first?: boolean;
  lazy?: boolean;
  className?: string;
}) {
  const src = sizes === "large" ? photo.large : photo.medium;
  return (
    <Image
      src={src}
      alt={photo.alt}
      fill
      sizes={sizes === "large" ? "(min-width: 768px) 50vw, 100vw" : "(min-width: 768px) 25vw, 100vw"}
      loading={first && !lazy ? "eager" : "lazy"}
      fetchPriority={first ? "high" : undefined}
      unoptimized
      placeholder={photo.blurDataUrl ? "blur" : "empty"}
      blurDataURL={photo.blurDataUrl ?? undefined}
      className={cn("object-cover transition duration-300", className)}
      draggable={false}
    />
  );
}

const tile =
  "group relative block overflow-hidden bg-muted outline-none focus-visible:z-10 focus-visible:ring-3 focus-visible:ring-ring focus-visible:ring-offset-2";

function Mosaic({ photos, onOpen }: { photos: PagePhoto[]; onOpen: (index: number) => void }) {
  const t = useTranslations("listing.gallery");
  const shown = photos.slice(0, photos.length >= 5 ? 5 : 3);
  const layout =
    shown.length >= 5 ? "grid-cols-4 grid-rows-2" : shown.length === 1 ? "grid-cols-1 grid-rows-1" : "grid-cols-2 grid-rows-2";
  return (
    <div className={cn("hidden h-[min(56vh,480px)] gap-2 overflow-hidden rounded-2xl md:grid", layout)}>
      {shown.map((photo, index) => {
        const main = index === 0;
        const span = main
          ? shown.length >= 5
            ? "col-span-2 row-span-2"
            : shown.length === 1
              ? ""
              : "row-span-2"
          : shown.length === 2
            ? "row-span-2"
            : "";
        return (
          <button
            key={photo.id}
            type="button"
            className={cn(tile, span)}
            onClick={() => onOpen(index)}
            aria-label={t("open", { index: index + 1, total: photos.length })}
          >
            <Photo photo={photo} sizes={main ? "large" : "medium"} first={main} lazy className="group-hover:scale-[1.02] group-hover:brightness-95" />
          </button>
        );
      })}
    </div>
  );
}

function MobileCarousel({ photos, title, onOpen }: { photos: PagePhoto[]; title: string; onOpen: (index: number) => void }) {
  const t = useTranslations("listing.gallery");
  const locale = useLocale();
  const [viewportRef, api] = useEmblaCarousel({ direction: dirFor(locale), loop: false });
  const [selected, setSelected] = useState(0);
  const total = photos.length;

  useEffect(() => {
    if (!api) return;
    const update = () => setSelected(api.selectedScrollSnap());
    api.on("select", update).on("reInit", update);
    return () => {
      api.off("select", update).off("reInit", update);
    };
  }, [api]);

  return (
    <div
      className="relative -mx-4 aspect-[4/3] overflow-hidden bg-muted sm:mx-0 sm:rounded-2xl md:hidden"
      role="group"
      aria-roledescription="carousel"
      aria-label={t("label", { title })}
    >
      <div ref={viewportRef} className="size-full overflow-hidden">
        <div className="flex size-full touch-pan-y">
          {photos.map((photo, index) => (
            <div key={photo.id} className="relative size-full min-w-0 shrink-0 grow-0 basis-full" aria-hidden={index !== selected || undefined}>
              <button
                type="button"
                className={cn(tile, "size-full")}
                onClick={() => onOpen(index)}
                tabIndex={index === selected ? 0 : -1}
                aria-label={t("open", { index: index + 1, total })}
              >
                {Math.abs(index - selected) <= 1 ? <Photo photo={photo} sizes="medium" first={index === 0} /> : null}
              </button>
            </div>
          ))}
        </div>
      </div>
      {total > 1 ? (
        <span className="pointer-events-none absolute end-3 bottom-3 rounded-full bg-black/65 px-2.5 py-1 text-xs font-medium text-white tabular-nums" aria-hidden>
          <Ltr>{t("counter", { index: formatNumber(selected + 1, locale), total: formatNumber(total, locale) })}</Ltr>
        </span>
      ) : null}
    </div>
  );
}

function VideoDialog({
  video,
  open,
  onOpenChange,
  title,
}: {
  video: VideoEmbed | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: string;
}) {
  const t = useTranslations("listing.gallery");
  if (!video) return null;
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="w-[min(96vw,64rem)] max-w-none gap-3 bg-black p-2 text-white sm:max-w-none sm:p-3">
        <DialogTitle className="sr-only">{t("videoTitle", { title })}</DialogTitle>
        <DialogDescription className="sr-only">{t("videoHint")}</DialogDescription>
        <div className="relative aspect-video w-full overflow-hidden rounded-lg" dir="ltr">
          {open ? (
            <iframe
              src={video.embedUrl}
              title={t("videoTitle", { title })}
              className="absolute inset-0 size-full"
              allow="autoplay; encrypted-media; picture-in-picture; fullscreen"
              allowFullScreen
              loading="lazy"
              referrerPolicy="strict-origin-when-cross-origin"
            />
          ) : null}
        </div>
      </DialogContent>
    </Dialog>
  );
}
