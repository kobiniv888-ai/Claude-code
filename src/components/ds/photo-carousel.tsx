"use client";

import { useCallback, useEffect, useRef, useState, type KeyboardEvent, type SyntheticEvent } from "react";
import Image from "next/image";
import { useLocale, useTranslations } from "next-intl";
import { CameraIcon, ImageOffIcon } from "lucide-react";
import { ChevronEnd, ChevronStart } from "@/components/common/directional-icon";
import { dirFor } from "@/i18n/locale";
import { formatNumber } from "@/lib/format";
import { Link } from "@/i18n/navigation";
import { cn } from "@/lib/utils";

export type CarouselPhoto = { url: string; alt: string; blurDataUrl?: string };

/**
 * Photos that go through next/image's optimizer (AVIF/WebP at the right width): our own files
 * in public/ and the stock-photo CDN. Uploaded listing media is already resized WebP.
 */
export function isOptimizableImage(url: string): boolean {
  return (url.startsWith("/") && !url.startsWith("/api/") && !url.startsWith("//")) || url.startsWith("https://images.unsplash.com/");
}

function markLoaded(event: SyntheticEvent<HTMLImageElement>) {
  event.currentTarget.dataset.loaded = "";
}

/**
 * A swipeable photo carousel built on CSS scroll-snap (no carousel library): native swipe,
 * dots where the active one stretches into a pill, arrow buttons on desktop (hover/focus),
 * arrow keys that follow the reading direction, and "+N photos" dimmed over the last slide.
 *
 * Light on the page: the server renders the first photo only; the others are loaded when the
 * visitor points at, focuses or swipes the carousel (the next one first). A blur placeholder
 * shows until each photo arrives, and later photos fade in.
 *
 *   <PhotoCarousel photos={photos} label="תמונות של דירה בוואקה" href={href} sizes="100vw" />
 *   <PhotoCarousel … peek />   // the next photo peeks in at the edge (galleries, rows)
 */
export function PhotoCarousel({
  photos,
  label,
  href,
  sizes,
  priority = false,
  aspect = "aspect-[16/10]",
  totalCount,
  peek = false,
  className,
}: {
  photos: CarouselPhoto[];
  /** Accessible name of the carousel ("Photos of …"). */
  label: string;
  /** Every slide links here (hidden from the tab order: the card title is the real link). */
  href?: string;
  /** next/image `sizes` for the slide width at each breakpoint. */
  sizes: string;
  /** Load the first photo eagerly (above the fold). */
  priority?: boolean;
  /** Tailwind aspect / height classes of the frame. */
  aspect?: string;
  /** All photos of the listing; when more than shown, the last slide says "+N photos". */
  totalCount?: number;
  /** Slides 88% wide with a gap, so the next one peeks in. */
  peek?: boolean;
  className?: string;
}) {
  const t = useTranslations("ds.carousel");
  const locale = useLocale();
  const rtl = dirFor(locale) === "rtl";
  const total = photos.length;
  const scroller = useRef<HTMLDivElement>(null);
  const [selected, setSelected] = useState(0);
  // The peeking variant shows a sliver of the second photo from the start.
  const [loadUpTo, setLoadUpTo] = useState(peek ? 1 : 0);
  const more = totalCount && totalCount > total ? totalCount - total + 1 : 0;

  const activate = useCallback(() => {
    if (total > 1) setLoadUpTo((n) => Math.max(n, 1));
  }, [total]);

  /** Distance between two slides (slide width + gap). */
  const stride = useCallback(() => {
    const el = scroller.current;
    if (!el) return 1;
    const [a, b] = Array.from(el.children) as HTMLElement[];
    return b ? Math.abs(b.offsetLeft - a.offsetLeft) || el.clientWidth : el.clientWidth;
  }, []);

  useEffect(() => {
    const el = scroller.current;
    if (!el || total < 2) return;
    let frame = 0;
    const onScroll = () => {
      cancelAnimationFrame(frame);
      frame = requestAnimationFrame(() => {
        const index = Math.min(total - 1, Math.max(0, Math.round(Math.abs(el.scrollLeft) / stride())));
        setSelected(index);
        setLoadUpTo((n) => Math.max(n, Math.min(total - 1, index + 1)));
      });
    };
    el.addEventListener("scroll", onScroll, { passive: true });
    return () => {
      cancelAnimationFrame(frame);
      el.removeEventListener("scroll", onScroll);
    };
  }, [total, stride]);

  const go = useCallback(
    (index: number) => {
      const el = scroller.current;
      if (!el) return;
      const target = Math.min(total - 1, Math.max(0, index));
      setLoadUpTo((n) => Math.max(n, Math.min(total - 1, target + 1)));
      const reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
      // RTL scrolls toward negative scrollLeft.
      el.scrollTo({ left: target * stride() * (rtl ? -1 : 1), behavior: reduce ? "auto" : "smooth" });
    },
    [rtl, stride, total],
  );

  const onKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    if (event.key === "ArrowLeft" || event.key === "ArrowRight") {
      event.preventDefault();
      const forward = (event.key === "ArrowRight") !== rtl;
      go(selected + (forward ? 1 : -1));
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

  const navButton =
    "absolute top-1/2 z-10 hidden size-9 -translate-y-1/2 items-center justify-center rounded-full bg-card/95 text-foreground shadow-raised outline-none transition-opacity duration-(--motion-fast) " +
    "opacity-0 group-hover/carousel:opacity-100 focus-visible:opacity-100 focus-visible:ring-3 focus-visible:ring-ring/60 pointer-fine:inline-flex";

  return (
    <div
      className={cn("group/carousel relative overflow-hidden", !peek && "bg-muted", aspect, className)}
      role="group"
      aria-roledescription="carousel"
      aria-label={label}
      onKeyDown={total > 1 ? onKeyDown : undefined}
      onPointerEnter={activate}
      onTouchStart={activate}
      onFocus={activate}
    >
      <div
        ref={scroller}
        className={cn(
          "flex size-full snap-x snap-mandatory overflow-x-auto overflow-y-hidden overscroll-x-contain scrollbar-none",
          peek && "gap-2",
        )}
      >
        {photos.map((photo, index) => {
          const isLast = index === total - 1;
          const showMore = isLast && more > 0;
          const image =
            index <= loadUpTo ? (
              <Image
                src={photo.url}
                alt={index === selected ? photo.alt : ""}
                fill
                sizes={sizes}
                priority={priority && index === 0}
                fetchPriority={priority && index === 0 ? "high" : undefined}
                loading={priority && index === 0 ? undefined : "lazy"}
                unoptimized={!isOptimizableImage(photo.url)}
                placeholder={photo.blurDataUrl ? "blur" : "empty"}
                blurDataURL={photo.blurDataUrl}
                draggable={false}
                // The first photo is server-rendered and never hidden (LCP, no-JS); later ones fade in.
                onLoad={index > 0 ? markLoaded : undefined}
                className={cn(
                  "object-cover select-none transition-[transform,opacity] duration-500 ease-soft group-hover/card:scale-[1.04] motion-reduce:transition-none",
                  index > 0 && "opacity-0 data-loaded:opacity-100",
                )}
              />
            ) : null;
          return (
            <div
              key={`${photo.url}-${index}`}
              role="group"
              aria-roledescription="slide"
              aria-label={t("slide", { index: index + 1, total })}
              aria-hidden={index !== selected || undefined}
              className={cn(
                "relative h-full shrink-0 snap-start snap-always overflow-hidden bg-muted bg-cover bg-center",
                peek ? "basis-[88%] rounded-card" : "basis-full",
              )}
              style={photo.blurDataUrl && index > 0 ? { backgroundImage: `url("${photo.blurDataUrl}")` } : undefined}
            >
              {href ? (
                <Link href={href} tabIndex={-1} aria-hidden="true" prefetch={false} data-card-link="" className="relative block size-full" draggable={false}>
                  {image}
                </Link>
              ) : (
                image
              )}
              {showMore ? (
                <div className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center gap-1.5 bg-black/55 text-white">
                  <CameraIcon className="size-7" aria-hidden="true" />
                  <span className="text-h2 leading-none" dir="ltr">
                    +{formatNumber(more, locale)}
                  </span>
                  <span className="text-small font-semibold">{t("morePhotos", { count: more })}</span>
                </div>
              ) : null}
            </div>
          );
        })}
      </div>

      {total > 1 && (
        <>
          <button
            type="button"
            onClick={(e) => {
              e.preventDefault();
              e.stopPropagation();
              go(selected - 1);
            }}
            aria-label={t("previous")}
            className={cn(navButton, "start-2", selected === 0 && "invisible")}
          >
            <ChevronStart className="size-5" aria-hidden="true" />
          </button>
          <button
            type="button"
            onClick={(e) => {
              e.preventDefault();
              e.stopPropagation();
              go(selected + 1);
            }}
            aria-label={t("next")}
            className={cn(navButton, "end-2", selected === total - 1 && "invisible")}
          >
            <ChevronEnd className="size-5" aria-hidden="true" />
          </button>
          <div
            aria-hidden="true"
            className="pointer-events-none absolute inset-x-0 bottom-2.5 z-10 flex justify-center gap-2.5"
          >
            {photos.map((photo, index) => (
              <span
                key={`${photo.url}-dot-${index}`}
                className={cn(
                  "size-1.5 rounded-full bg-white shadow-[0_0_2px_rgb(0_0_0/0.45)] transition-[transform,opacity] duration-(--motion-base) ease-soft motion-reduce:transition-none",
                  index === selected ? "scale-x-[2.4] opacity-100" : "opacity-60",
                )}
              />
            ))}
          </div>
          <span className="sr-only" aria-live="polite">
            {t("slide", { index: selected + 1, total })}
          </span>
        </>
      )}
    </div>
  );
}
