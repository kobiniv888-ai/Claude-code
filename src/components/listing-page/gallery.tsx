"use client";

import { useCallback, useMemo, useState, type MouseEvent } from "react";
import dynamic from "next/dynamic";
import { useLocale, useTranslations } from "next-intl";
import { ImageOffIcon, ImagesIcon, PlayIcon, Rotate3dIcon } from "lucide-react";
import { ArrowStart } from "@/components/common/directional-icon";
import { BottomSheet } from "@/components/ds/bottom-sheet";
import { PhotoCarousel } from "@/components/ds/photo-carousel";
import { FavoriteButton } from "@/components/listing/favorite-button";
import { Link, useRouter } from "@/i18n/navigation";
import { formatNumber } from "@/lib/format";
import type { VideoEmbed } from "@/lib/listing-page/media";
import { groupPhotosByRoom } from "@/lib/listing-page/photo-groups";
import type { PagePhoto } from "@/lib/listing-page/types";
import { cn } from "@/lib/utils";
import { GalleryImage, TILE, ZOOM } from "./gallery-image";
import { ShareMenu } from "./share-menu-island";

/** The full-screen viewer (embla + dialog) loads only when a photo is opened. */
const Lightbox = dynamic(() => import("./lightbox").then((m) => m.Lightbox), { ssr: false });
// The video player's dialog (Radix Dialog) loads when the video is first opened.
const VideoDialog = dynamic(() => import("./video-dialog").then((m) => m.VideoDialog), { ssr: false });
// "All photos" by room (round 3) renders only inside the closed sheet: it loads at its first opening.
const RoomSections = dynamic(() => import("./room-sections").then((m) => m.RoomSections), { ssr: false, loading: () => <SectionsSkeleton /> });

/**
 * The same `sizes` for the phone carousel's first photo and the desktop mosaic's main photo, so
 * the browser picks the same file for both (one download; CSS shows one of them).
 */
const MAIN_SIZES = "(min-width: 768px) 50vw, 100vw";

/** Round buttons over the photo: white, with a shadow, 44px. */
const ROUND = "inline-flex size-11 items-center justify-center rounded-full bg-card/95 text-foreground shadow-sm outline-none backdrop-blur transition-transform duration-(--motion-fast) ease-standard hover:bg-card focus-visible:ring-3 focus-visible:ring-ring/60 active:scale-95 motion-reduce:active:scale-100";
/** Pill buttons over the photo ("All photos", "Video"). */
const PILL = "inline-flex min-h-9 items-center gap-1.5 rounded-full bg-card/95 px-3 text-small font-semibold text-foreground shadow-sm outline-none backdrop-blur transition-transform duration-(--motion-fast) ease-standard hover:bg-card focus-visible:ring-3 focus-visible:ring-ring/60 active:scale-95 motion-reduce:active:scale-100 [&_svg]:size-4";

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
 * - "All photos" is grouped by room (bedroom, kitchen…) when the host labelled at least two rooms
 *   (round 3, brief 6.1); the viewer then goes through the photos room by room too.
 */
export function Gallery({ photos, title, video, tourUrl, backHref, shareUrl, favorite }: GalleryProps) {
  const t = useTranslations("listing.gallery");
  const locale = useLocale();
  const [viewer, setViewer] = useState<{ mounted: boolean; open: boolean; index: number }>({ mounted: false, open: false, index: 0 });
  const [gridOpen, setGridOpen] = useState(false);
  const [videoOpen, setVideoOpen] = useState(false);
  // Mounted from the first opening on, so the dialog can animate closed.
  const [videoUsed, setVideoUsed] = useState(false);
  if (videoOpen && !videoUsed) setVideoUsed(true);
  const total = photos.length;
  // Room sections for "All photos" (null: fewer than two rooms labelled, one grid as before).
  const groups = useMemo(() => groupPhotosByRoom(photos), [photos]);
  // The viewer's order: room by room when grouped, else the host's order.
  const viewerPhotos = useMemo(() => (groups ? groups.flatMap((g) => g.photos) : photos), [groups, photos]);
  /** Opens the viewer at a photo of `photos` (the carousel's and the mosaic's order). */
  const openAt = useCallback(
    (index: number) => {
      const id = photos[index]?.id;
      const at = id ? viewerPhotos.findIndex((p) => p.id === id) : -1;
      setViewer({ mounted: true, open: true, index: at === -1 ? index : at });
    },
    [photos, viewerPhotos],
  );
  /** Opens the viewer at a photo of the grouped grid (already in the viewer's order). */
  const openInViewer = useCallback((index: number) => setViewer({ mounted: true, open: true, index }), []);
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
            {/* The share island's scope: an early tap on it is replayed once its code is in. */}
            <span data-share-menu="" className="contents">
              <ShareMenu url={shareUrl} title={title} variant="round" />
            </span>
            {favorite ? <FavoriteButton listingId={favorite.listingId} title={title} isFavorite={favorite.isFavorite} variant="overlay" className="bg-card/95 shadow-sm" /> : null}
          </div>
        </div>
        <div className="pointer-events-none absolute start-3 bottom-3 flex items-center gap-2">
          {total > 1 ? (
            <button type="button" className={cn(PILL, "pointer-events-auto min-h-11")} onClick={() => setGridOpen(true)} aria-haspopup="dialog">
              <ImagesIcon aria-hidden="true" />
              {t("allPhotos")}
            </button>
          ) : null}
          {mediaButtons("pointer-events-auto min-h-11")}
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
          {groups ? <RoomSections groups={groups} total={total} onOpen={openInViewer} /> : <PhotoGrid photos={photos} onOpen={openAt} />}
        </BottomSheet>
      ) : null}
      {viewer.mounted ? (
        <Lightbox
          photos={viewerPhotos}
          title={title}
          open={viewer.open}
          startIndex={viewer.index}
          onOpenChange={(open) => setViewer((s) => ({ ...s, open }))}
        />
      ) : null}
      {video && videoUsed ? <VideoDialog video={video} open={videoOpen} onOpenChange={setVideoOpen} title={title} /> : null}
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

/** 1 large + 4 (or 1 + 2, 2 side by side, or 1) photos; each opens the viewer. */
function Mosaic({ photos, onOpen }: { photos: PagePhoto[]; onOpen: (index: number) => void }) {
  const t = useTranslations("listing.gallery");
  const shown = photos.slice(0, photos.length >= 5 ? 5 : photos.length >= 3 ? 3 : photos.length);
  const layout =
    shown.length === 5 ? "grid-cols-4 grid-rows-2" : shown.length === 3 ? "grid-cols-2 grid-rows-2" : shown.length === 2 ? "grid-cols-2" : "grid-cols-1";
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
              sizes={main ? MAIN_SIZES : shown.length === 5 ? "25vw" : "50vw"}
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

/** While "All photos" by room loads (the first opening only). */
function SectionsSkeleton() {
  return (
    <div className="grid grid-cols-2 gap-2 p-3 sm:gap-3 sm:p-4" aria-hidden="true">
      <div className="col-span-2 h-11 w-2/3 rounded-full bg-muted motion-safe:animate-pulse" />
      <div className="col-span-2 aspect-[16/10] rounded-xl bg-muted motion-safe:animate-pulse" />
      <div className="aspect-square rounded-xl bg-muted motion-safe:animate-pulse sm:aspect-[4/3]" />
      <div className="aspect-square rounded-xl bg-muted motion-safe:animate-pulse sm:aspect-[4/3]" />
    </div>
  );
}
