"use client";

import { lazy, startTransition, Suspense, useCallback, useEffect, useRef, useState, type KeyboardEvent } from "react";
import Image from "next/image";
import { useLocale, useTranslations } from "next-intl";
import { ImageOffIcon } from "lucide-react";
import { ChevronEnd, ChevronStart } from "@/components/common/directional-icon";
import { dirFor } from "@/i18n/locale";
import { Link } from "@/i18n/navigation";
import type { ListingCardPhoto } from "@/lib/listing/types";
import { cn } from "@/lib/utils";
import type { CarouselApi } from "./photo-carousel-engine";

/** Embla is loaded only when a carousel is about to be used (see PhotoCarousel). */
const PhotoCarouselEngine = lazy(() => import("./photo-carousel-engine"));

/** Only our image CDN source (demo photos) goes through next/image's optimizer; own media is already resized WebP. */
function optimizable(url: string): boolean {
  return url.startsWith("https://images.unsplash.com/");
}

/** Runs `callback` once the browser is idle (Safari has no requestIdleCallback). Returns a cancel function. */
function whenIdle(callback: () => void): () => void {
  if (typeof window.requestIdleCallback === "function") {
    const id = window.requestIdleCallback(callback, { timeout: 3000 });
    return () => window.cancelIdleCallback(id);
  }
  const id = window.setTimeout(callback, 300);
  return () => window.clearTimeout(id);
}

const navButton =
  "absolute top-1/2 z-10 inline-flex size-8 -translate-y-1/2 items-center justify-center rounded-full bg-card/95 text-foreground shadow-md transition outline-none " +
  "opacity-0 group-hover/card:opacity-100 focus-visible:opacity-100 focus-visible:ring-3 focus-visible:ring-ring/60 hover:scale-105 pointer-coarse:hidden";

/**
 * Swipeable photos of a listing card. Direction follows the locale (RTL in Hebrew/Arabic).
 * Only the visible photo and the next one are loaded. Each slide links to the listing but is
 * hidden from the tab order and screen readers — the card title is the one real link.
 *
 * To keep page loads light, the server renders only the first photo and the carousel starts
 * (more slides + Embla) when it is pointed at, focused, or on screen once the page is idle.
 */
export function PhotoCarousel({
  photos,
  title,
  href,
  sizes,
  priority = false,
  aspect = "aspect-[4/3]",
  className,
}: {
  photos: ListingCardPhoto[];
  title: string;
  href: string;
  /** next/image `sizes` for the card width at each breakpoint. */
  sizes: string;
  priority?: boolean;
  aspect?: string;
  className?: string;
}) {
  const t = useTranslations("listingCard.carousel");
  const locale = useLocale();
  const direction = dirFor(locale);
  const total = photos.length;
  const rootRef = useRef<HTMLDivElement>(null);
  const [viewport, setViewport] = useState<HTMLDivElement | null>(null);
  const [live, setLive] = useState(false);
  const [api, setApi] = useState<CarouselApi | null>(null);
  /** A slide asked for (prev/next) before Embla was ready. */
  const pendingIndex = useRef<number | null>(null);
  const [selected, setSelected] = useState(0);
  const [loadUpTo, setLoadUpTo] = useState(0);
  const [canPrev, setCanPrev] = useState(false);
  const [canNext, setCanNext] = useState(total > 1);

  const activate = useCallback(() => {
    if (total < 2) return;
    setLive(true);
    // Preload the next photo as soon as the visitor points at the card.
    setLoadUpTo((n) => Math.max(n, 1));
  }, [total]);

  // Start the carousel for cards that are (almost) on screen once the page is idle, so a swipe
  // works the first time on touch screens.
  useEffect(() => {
    const node = rootRef.current;
    if (live || total < 2 || !node || typeof IntersectionObserver === "undefined") return;
    let cancelIdle: (() => void) | undefined;
    const observer = new IntersectionObserver(
      (entries) => {
        if (!entries.some((entry) => entry.isIntersecting)) return;
        observer.disconnect();
        cancelIdle = whenIdle(() => startTransition(() => setLive(true)));
      },
      { rootMargin: "200px" },
    );
    observer.observe(node);
    return () => {
      observer.disconnect();
      cancelIdle?.();
    };
  }, [live, total]);

  useEffect(() => {
    if (!api) return;
    const update = () => {
      const index = api.selectedScrollSnap();
      setSelected(index);
      setLoadUpTo((n) => Math.max(n, index + 1));
      setCanPrev(api.canScrollPrev());
      setCanNext(api.canScrollNext());
    };
    api.on("select", update).on("reInit", update);
    // Preload the next photo as soon as the visitor starts dragging.
    const preload = () => setLoadUpTo((n) => Math.max(n, 1));
    api.on("pointerDown", preload);
    if (pendingIndex.current !== null) {
      api.scrollTo(pendingIndex.current);
      pendingIndex.current = null;
    }
    return () => {
      api.off("select", update).off("reInit", update).off("pointerDown", preload);
    };
  }, [api]);

  const go = useCallback(
    (step: 1 | -1) => {
      if (api) {
        if (step === 1) api.scrollNext();
        else api.scrollPrev();
        return;
      }
      // Not started yet: start it and move once Embla is ready.
      pendingIndex.current = Math.min(Math.max(selected + step, 0), total - 1);
      activate();
    },
    [api, selected, total, activate],
  );

  const onKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    // Arrow keys follow the screen: in RTL, ArrowLeft goes forward.
    const rtl = direction === "rtl";
    if (event.key === "ArrowLeft") {
      event.preventDefault();
      go(rtl ? 1 : -1);
    } else if (event.key === "ArrowRight") {
      event.preventDefault();
      go(rtl ? -1 : 1);
    }
  };

  if (total === 0) {
    return (
      <div className={cn("relative flex flex-col items-center justify-center gap-2 bg-muted text-muted-foreground", aspect, className)}>
        <ImageOffIcon className="size-8" aria-hidden="true" />
        <span className="text-sm">{t("noPhotos")}</span>
      </div>
    );
  }

  const slides = live ? photos : photos.slice(0, 1);

  return (
    <div
      ref={rootRef}
      className={cn("relative overflow-hidden bg-muted", aspect, className)}
      role="group"
      aria-roledescription="carousel"
      aria-label={t("label", { title })}
      onKeyDown={total > 1 ? onKeyDown : undefined}
      onPointerEnter={activate}
      onFocus={activate}
    >
      <div ref={setViewport} className="size-full overflow-hidden">
        <div className="flex size-full touch-pan-y">
          {slides.map((photo, index) => (
            <div
              key={`${photo.url}-${index}`}
              className="relative size-full min-w-0 shrink-0 grow-0 basis-full"
              role="group"
              aria-roledescription="slide"
              aria-label={t("slide", { index: index + 1, total })}
              aria-hidden={index !== selected || undefined}
            >
              <Link href={href} tabIndex={-1} aria-hidden="true" prefetch={false} className="relative block size-full" draggable={false}>
                {index <= loadUpTo ? (
                  <Image
                    src={photo.url}
                    alt={index === selected ? photo.alt : ""}
                    fill
                    sizes={sizes}
                    priority={priority && index === 0}
                    fetchPriority={priority && index === 0 ? "high" : undefined}
                    loading={priority && index === 0 ? undefined : "lazy"}
                    unoptimized={!optimizable(photo.url)}
                    placeholder={photo.blurDataUrl ? "blur" : "empty"}
                    blurDataURL={photo.blurDataUrl}
                    draggable={false}
                    className="object-cover transition-transform duration-500 select-none group-hover/card:scale-[1.03] motion-reduce:transition-none"
                  />
                ) : null}
              </Link>
            </div>
          ))}
        </div>
      </div>

      {total > 1 && (
        <>
          <button
            type="button"
            onClick={(e) => {
              e.preventDefault();
              e.stopPropagation();
              go(-1);
            }}
            aria-label={t("previous")}
            className={cn(navButton, "start-2", !canPrev && "invisible")}
          >
            <ChevronStart className="size-4" aria-hidden="true" />
          </button>
          <button
            type="button"
            onClick={(e) => {
              e.preventDefault();
              e.stopPropagation();
              go(1);
            }}
            aria-label={t("next")}
            className={cn(navButton, "end-2", !canNext && "invisible")}
          >
            <ChevronEnd className="size-4" aria-hidden="true" />
          </button>
          <div className="pointer-events-none absolute inset-x-0 bottom-2.5 z-10 flex justify-center gap-1.5" aria-hidden="true">
            {photos.map((photo, index) => (
              <span
                key={`${photo.url}-dot-${index}`}
                className={cn(
                  "size-1.5 rounded-full bg-white/60 shadow-[0_0_2px_rgb(0_0_0/0.4)] transition-all",
                  index === selected && "w-3 bg-white",
                )}
              />
            ))}
          </div>
          <span className="sr-only" aria-live="polite">
            {t("slide", { index: selected + 1, total })}
          </span>
        </>
      )}

      {live && viewport ? (
        <Suspense fallback={null}>
          <PhotoCarouselEngine viewport={viewport} direction={direction} onApi={setApi} />
        </Suspense>
      ) : null}
    </div>
  );
}
