"use client";

import { useCallback, useEffect, useRef, useState, type ReactNode } from "react";
import Image from "next/image";
import { Pause, Play } from "lucide-react";
import { cn } from "@/lib/utils";

export type HeroSlide = { src: string; blurDataURL: string };

const SLIDE_MS = 7000;
const FADE_MS = 1500;
/** Wait this long after the page has loaded before fetching the second photo (keeps it off the LCP path). */
const START_DELAY_MS = 1500;

/**
 * The hero photos: `children` is the first photo (server-rendered, priority — the LCP image);
 * the others are fetched one at a time, only once the page has loaded, and crossfade over it
 * every 7 seconds with a slow zoom. With reduced motion nothing moves and only the first photo
 * shows. A small pause button stops the slideshow (WCAG 2.2.2).
 */
export function HeroSlideshow({
  slides,
  labels,
  children,
}: {
  /** The photos after the first one. */
  slides: HeroSlide[];
  labels: { pause: string; play: string };
  children: ReactNode;
}) {
  const total = slides.length + 1;
  const [enabled, setEnabled] = useState(false);
  const [paused, setPaused] = useState(false);
  const [active, setActive] = useState(0);
  const [behind, setBehind] = useState<number | null>(null);
  const [cycle, setCycle] = useState(0);
  // Overlay photos mounted so far (index into `slides`), and the ones that finished loading.
  const [mounted, setMounted] = useState<number[]>([]);
  const ready = useRef(new Set<number>());

  // Start only with motion allowed, after the page (and its first photo) has loaded.
  useEffect(() => {
    if (slides.length === 0) return;
    const reduce = window.matchMedia("(prefers-reduced-motion: reduce)");
    if (reduce.matches) return;
    let timer: number | undefined;
    const start = () => {
      timer = window.setTimeout(() => {
        setEnabled(true);
        setMounted([0]);
      }, START_DELAY_MS);
    };
    if (document.readyState === "complete") start();
    else window.addEventListener("load", start, { once: true });
    return () => {
      window.removeEventListener("load", start);
      window.clearTimeout(timer);
    };
  }, [slides.length]);

  const activeRef = useRef(0);
  const advance = useCallback(() => {
    const current = activeRef.current;
    const next = (current + 1) % total;
    // The next overlay photo must have loaded; otherwise try again on the next tick.
    if (next !== 0 && !ready.current.has(next - 1)) return;
    activeRef.current = next;
    setActive(next);
    setBehind(current);
    setCycle((c) => c + 1);
    // Fetch the photo after this one in the background.
    if (next < slides.length) setMounted((list) => (list.includes(next) ? list : [...list, next]));
  }, [slides.length, total]);

  useEffect(() => {
    if (!enabled || paused) return;
    let timer = window.setInterval(advance, SLIDE_MS);
    const onVisibility = () => {
      window.clearInterval(timer);
      if (document.visibilityState === "visible") timer = window.setInterval(advance, SLIDE_MS);
    };
    document.addEventListener("visibilitychange", onVisibility);
    return () => {
      window.clearInterval(timer);
      document.removeEventListener("visibilitychange", onVisibility);
    };
  }, [enabled, paused, advance]);

  // Once the new photo has faded in, the one under it can go.
  useEffect(() => {
    if (behind === null) return;
    const timer = window.setTimeout(() => setBehind(null), FADE_MS + 100);
    return () => window.clearTimeout(timer);
  }, [behind, active]);

  // The photo in front zooms with one keyframe set; the one fading out under it keeps the other.
  const zoom = cycle % 2 === 0 ? "a" : "b";
  const zoomOf = (position: number) => (position === active ? zoom : position === behind ? (zoom === "a" ? "b" : "a") : undefined);

  return (
    <>
      <div className={cn("absolute inset-0", "bh-zoom")} data-zoom={zoomOf(0)}>
        {children}
      </div>
      {enabled
        ? slides.map((slide, index) => {
            if (!mounted.includes(index)) return null;
            const position = index + 1;
            const shown = position === active || (position === behind && active !== 0);
            return (
              <div
                key={slide.src}
                aria-hidden="true"
                className={cn("absolute inset-0 overflow-hidden", "bh-slide")}
                data-shown={shown}
                data-front={position === active}
              >
                <div className={cn("absolute inset-0", "bh-zoom")} data-zoom={zoomOf(position)}>
                  <Image
                    src={slide.src}
                    alt=""
                    fill
                    sizes="100vw"
                    loading="eager"
                    fetchPriority="low"
                    placeholder="blur"
                    blurDataURL={slide.blurDataURL}
                    className="object-cover"
                    onLoad={() => ready.current.add(index)}
                  />
                </div>
              </div>
            );
          })
        : null}
      {enabled ? (
        <button
          type="button"
          onClick={() => setPaused((p) => !p)}
          aria-label={paused ? labels.play : labels.pause}
          aria-pressed={paused}
          className="absolute end-3 top-3 z-[4] inline-flex size-11 items-center justify-center rounded-full bg-black/35 text-white outline-none backdrop-blur-sm transition-colors hover:bg-black/50 focus-visible:ring-3 focus-visible:ring-white/70"
        >
          {paused ? <Play className="size-4.5" aria-hidden="true" /> : <Pause className="size-4.5" aria-hidden="true" />}
        </button>
      ) : null}
    </>
  );
}
