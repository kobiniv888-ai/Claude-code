"use client";

import { useCallback, useState, type MouseEvent } from "react";
import dynamic from "next/dynamic";
import Image from "next/image";
import { useLocale, useTranslations } from "next-intl";
import { ImageOffIcon, ImagesIcon, PlayIcon, Rotate3dIcon } from "lucide-react";
import { ArrowStart } from "@/components/common/directional-icon";
import { BottomSheet } from "@/components/ds/bottom-sheet";
import { PhotoCarousel, isOptimizableImage } from "@/components/ds/photo-carousel";
import { FavoriteButton } from "@/components/listing/favorite-button";
import { Dialog, DialogContent, DialogDescription, DialogTitle } from "@/components/ui/dialog";
import { Link, useRouter } from "@/i18n/navigation";
import { formatNumber } from "@/lib/format";
import type { VideoEmbed } from "@/lib/listing-page/media";
import type { PagePhoto } from "@/lib/listing-page/types";
import { cn } from "@/lib/utils";
import { ShareMenu } from "./share-menu";

/** The full-screen viewer (embla + dialog) loads only when a photo is opened. */
const Lightbox = dynamic(() => import("./lightbox").then((m) => m.Lightbox), { ssr: false });

/**
 * The same `sizes` for the phone carousel's first photo and the desktop mosaic's main photo, so
 * the browser picks the same file for both (one download; CSS shows one of them).
 */
const MAIN_SIZES = "(min-width: 768px) 50vw, 100vw";

/** Round buttons over the photo: white, with a shadow, 44px. */
const ROUND = "inline-flex size-11 items-center justify-center rounded-full bg-card/95 text-foreground shadow-raised outline-none backdrop-blur transition-transform duration-(--motion-fast) ease-standard hover:bg-card focus-visible:ring-3 focus-visible:ring-ring/60 active:scale-95 motion-reduce:active:scale-100";
/** Pill buttons over the photo ("All photos", "Video"). */
const PILL = "inline-flex min-h-9 items-center gap-1.5 rounded-full bg-card/95 px-3 text-small font-semibold text-foreground shadow-raised outline-none backdrop-blur transition-transform duration-(--motion-fast) ease-standard hover:bg-card focus-visible:ring-3 focus-visible:ring-ring/60 active:scale-95 motion-reduce:active:scale-100 [&_svg]:size-4";

export type GalleryProps = {
  photos: PagePhoto[];
  title: string;
  video: VideoEmbed | null;
  tourUrl: string | null;
  /** Where "Back" goes when the visitor did not come from our own site (the city's results). */
  backHref: string;
  shareUrl: string;
  /** The heart (public listings only). */
  favorite: { listingId: string; isFavorite: boolean } | null;
};

/**
 * Listing photos.
 * - Phones: a full-width swipe carousel (ds PhotoCarousel) with a "1 / 12" counter, round
 *   back / share / save buttons over it, and "All photos" (a grid in a sheet).
 * - From tablet width: a mosaic (1 large + 4) with "Show all photos".
 * - Tapping a photo opens the full-screen viewer (lazy). The video loads only when asked for.
 */
export function Gallery({ photos, title, video, tourUrl, backHref, shareUrl, favorite }: GalleryProps) {
  const t = useTranslations("listing.gallery");
  const locale = useLocale();
  const [viewer, setViewer] = useState<{ mounted: boolean; open: boolean; index: number }>({ mounted: false, open: false, index: 0 });
  const [gridOpen, setGridOpen] = useState(false);
  const [videoOpen, setVideoOpen] = useState(false);
  const total = photos.length;
  const openAt = useCallback((index: number) => setViewer({ mounted: true, open: true, index }), []);
  const allLabel = t("showAll", { count: total, formatted: formatNumber(total, locale) });

  const mediaButtons = (className?: string) =>
    video || tourUrl ? (
      <>
        {video ? (
          <button type="button" className={cn(PILL, className)} onClick={() => setVideoOpen(true)}>
            <PlayIcon aria-hidden="true" />
            {t("video")}
          </button>
        ) : null}
        {tourUrl ? (
          <a href={tourUrl} target="_blank" rel="noopener noreferrer nofollow" className={cn(PILL, className)}>
            <Rotate3dIcon aria-hidden="true" />
            {t("tour")}
            <span className="sr-only">{t("opensNewTab")}</span>
          </a>
        ) : null}
      </>
    ) : null;

  return (
    <section aria-label={t("label", { title })} className="relative">
      {/* Phones: edge to edge under the header. */}
      <div className="relative md:hidden">
        {total > 0 ? (
          <PhotoCarousel
            photos={photos.map((p, i) => ({ url: i === 0 ? p.large : p.medium, alt: p.alt, blurDataUrl: p.blurDataUrl ?? undefined }))}
            label={t("label", { title })}
            sizes={MAIN_SIZES}
            priority
            aspect="aspect-[4/3]"
            counter
            dots={false}
            onPhotoClick={openAt}
            photoLabel={(index, count) => t("open", { index: index + 1, total: count })}
          />
        ) : (
          <NoPhotos className="aspect-[4/3]" />
        )}
        <div className="pointer-events-none absolute inset-x-0 top-0 flex items-start justify-between gap-2 px-[max(0.75rem,env(safe-area-inset-left),env(safe-area-inset-right))] pt-3">
          <BackButton href={backHref} className="pointer-events-auto" />
          <div className="pointer-events-auto flex items-center gap-2">
            <ShareMenu url={shareUrl} title={title} variant="round" />
            {favorite ? <FavoriteButton listingId={favorite.listingId} title={title} isFavorite={favorite.isFavorite} variant="overlay" className="bg-card/95 shadow-raised" /> : null}
          </div>
        </div>
        <div className="pointer-events-none absolute start-3 bottom-3 flex items-center gap-2">
          {total > 1 ? (
            <button type="button" className={cn(PILL, "pointer-events-auto")} onClick={() => setGridOpen(true)} aria-haspopup="dialog">
              <ImagesIcon aria-hidden="true" />
              {t("allPhotos")}
            </button>
          ) : null}
          {mediaButtons("pointer-events-auto")}
        </div>
      </div>

      {/* Tablets and desktop: a mosaic. */}
      <div className="hidden md:block">
        {total > 0 ? <Mosaic photos={photos} onOpen={openAt} /> : <NoPhotos className="aspect-[21/8] rounded-card" />}
        <div className="pointer-events-none absolute end-3 bottom-3 flex items-center gap-2">
          {mediaButtons("pointer-events-auto")}
          {total > 1 ? (
            <button type="button" className={cn(PILL, "pointer-events-auto min-h-10")} onClick={() => setGridOpen(true)} aria-haspopup="dialog">
              <ImagesIcon aria-hidden="true" />
              {allLabel}
            </button>
          ) : null}
        </div>
      </div>

      {total > 1 ? (
        <BottomSheet open={gridOpen} onOpenChange={setGridOpen} title={allLabel} size="full" className="md:max-w-4xl">
          <PhotoGrid photos={photos} onOpen={openAt} />
        </BottomSheet>
      ) : null}
      {viewer.mounted ? (
        <Lightbox
          photos={photos}
          title={title}
          open={viewer.open}
          startIndex={viewer.index}
          onOpenChange={(open) => setViewer((s) => ({ ...s, open }))}
        />
      ) : null}
      <VideoDialog video={video} open={videoOpen} onOpenChange={setVideoOpen} title={title} />
    </section>
  );
}

/** Back to where the visitor came from on our site, or to the city's results. */
function BackButton({ href, className }: { href: string; className?: string }) {
  const t = useTranslations("listing.gallery");
  const router = useRouter();
  const onClick = (event: MouseEvent<HTMLAnchorElement>) => {
    try {
      if (document.referrer && new URL(document.referrer).origin === window.location.origin && window.history.length > 1) {
        event.preventDefault();
        router.back();
      }
    } catch {
      // A malformed referrer: follow the link.
    }
  };
  return (
    <Link href={href} onClick={onClick} aria-label={t("back")} className={cn(ROUND, className)}>
      <ArrowStart className="size-5" aria-hidden="true" />
    </Link>
  );
}

function NoPhotos({ className }: { className?: string }) {
  const t = useTranslations("listing.gallery");
  return (
    <div className={cn("flex flex-col items-center justify-center gap-2 bg-muted text-muted-foreground", className)}>
      <ImageOffIcon className="size-10" aria-hidden="true" />
      <p>{t("noPhotos")}</p>
    </div>
  );
}

function GalleryImage({ photo, src, sizes, eager = false, className }: { photo: PagePhoto; src: string; sizes: string; eager?: boolean; className?: string }) {
  return (
    <Image
      src={src}
      alt={photo.alt}
      fill
      sizes={sizes}
      loading={eager ? "eager" : "lazy"}
      unoptimized={!isOptimizableImage(src)}
      placeholder={photo.blurDataUrl ? "blur" : "empty"}
      blurDataURL={photo.blurDataUrl ?? undefined}
      draggable={false}
      className={cn("object-cover", className)}
    />
  );
}

const TILE =
  "group relative block overflow-hidden bg-muted outline-none focus-visible:z-10 focus-visible:ring-3 focus-visible:ring-ring focus-visible:ring-offset-2";
const ZOOM = "transition-transform duration-500 ease-soft group-hover:scale-[1.03] motion-reduce:transition-none motion-reduce:group-hover:scale-100";

/** 1 large + 4 (or 1 + 2, or 1) photos; each opens the viewer. */
function Mosaic({ photos, onOpen }: { photos: PagePhoto[]; onOpen: (index: number) => void }) {
  const t = useTranslations("listing.gallery");
  const shown = photos.slice(0, photos.length >= 5 ? 5 : photos.length >= 3 ? 3 : 1);
  const layout = shown.length === 5 ? "grid-cols-4 grid-rows-2" : shown.length === 3 ? "grid-cols-2 grid-rows-2" : "grid-cols-1";
  return (
    <div className={cn("grid h-[min(60vh,500px)] gap-2 overflow-hidden rounded-card", layout)}>
      {shown.map((photo, index) => {
        const main = index === 0;
        return (
          <button
            key={photo.id}
            type="button"
            className={cn(TILE, main && shown.length === 5 && "col-span-2 row-span-2", main && shown.length === 3 && "row-span-2")}
            onClick={() => onOpen(index)}
            aria-label={t("open", { index: index + 1, total: photos.length })}
          >
            <GalleryImage
              photo={photo}
              src={main ? photo.large : photo.medium}
              sizes={main ? MAIN_SIZES : "25vw"}
              eager={main}
              className={ZOOM}
            />
          </button>
        );
      })}
    </div>
  );
}

/** "All photos": the first one wide, then two per row; each opens the viewer. */
function PhotoGrid({ photos, onOpen }: { photos: PagePhoto[]; onOpen: (index: number) => void }) {
  const t = useTranslations("listing.gallery");
  return (
    <ul className="grid grid-cols-2 gap-2 p-3 sm:gap-3 sm:p-4">
      {photos.map((photo, index) => (
        <li key={photo.id} className={cn(index % 3 === 0 ? "col-span-2 aspect-[16/10]" : "aspect-square sm:aspect-[4/3]")}>
          <button
            type="button"
            className={cn(TILE, "size-full rounded-xl")}
            onClick={() => onOpen(index)}
            aria-label={t("open", { index: index + 1, total: photos.length })}
          >
            <GalleryImage photo={photo} src={photo.medium} sizes={index % 3 === 0 ? "(min-width: 768px) 56rem, 100vw" : "(min-width: 768px) 28rem, 50vw"} className={ZOOM} />
          </button>
        </li>
      ))}
    </ul>
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
