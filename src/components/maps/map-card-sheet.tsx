"use client";

import { useEffect, useRef, type MouseEvent, type PointerEvent, type ReactNode } from "react";
import { useTranslations } from "next-intl";
import { XIcon } from "lucide-react";
import { cn } from "@/lib/utils";

/** Swipe at least this far down (px), or fast enough (px/ms), to close the card. */
const DISMISS_DISTANCE = 72;
const DISMISS_VELOCITY = 0.5;
/** If the slide-down animation never reports its end (hidden tab), close anyway. */
const CLOSE_FALLBACK_MS = 450;

type Drag = { pointerId: number; startX: number; startY: number; startTime: number; dy: number; active: boolean };

/**
 * The listing card that slides up over the map when a marker is tapped (like a bottom sheet, but
 * not modal: the map stays usable and tapping it closes the card).
 *
 * - Phones: full width at the bottom, with a drag handle; swipe down to close. Horizontal swipes
 *   still go to the photo carousel inside.
 * - Desktop: a floating card at the bottom of the map.
 * - The × button and Escape close it on every screen. Focus moves into the card when it opens.
 *
 * `closing` plays the slide-down; `onClosed` fires when it has finished. Only transform and
 * opacity animate (listings-map.css), and reduced motion makes both instant.
 */
export function MapCardSheet({
  closing,
  onClose,
  onClosed,
  children,
  className,
}: {
  closing: boolean;
  /** The visitor asked to close (button, swipe). */
  onClose: () => void;
  /** The slide-down has finished: unmount the card. */
  onClosed: () => void;
  children: ReactNode;
  className?: string;
}) {
  const t = useTranslations("map.card");
  const ref = useRef<HTMLElement>(null);
  const drag = useRef<Drag | null>(null);
  const dragged = useRef(false);

  useEffect(() => {
    ref.current?.focus({ preventScroll: true });
  }, []);

  useEffect(() => {
    if (!closing) return;
    const timer = window.setTimeout(onClosed, CLOSE_FALLBACK_MS);
    return () => window.clearTimeout(timer);
  }, [closing, onClosed]);

  function setOffset(dy: number | null, animate: boolean) {
    const element = ref.current;
    if (!element) return;
    element.style.transition = animate ? "transform var(--motion-base) var(--ease-soft)" : "none";
    element.style.transform = dy === null ? "" : `translateY(${dy}px)`;
  }

  function onPointerDown(event: PointerEvent<HTMLElement>) {
    dragged.current = false;
    // Mouse users have the × button; swiping is for touch and pens.
    if (event.pointerType === "mouse" || closing) return;
    drag.current = {
      pointerId: event.pointerId,
      startX: event.clientX,
      startY: event.clientY,
      startTime: event.timeStamp,
      dy: 0,
      active: false,
    };
  }

  function onPointerMove(event: PointerEvent<HTMLElement>) {
    const state = drag.current;
    if (!state || state.pointerId !== event.pointerId) return;
    const dx = event.clientX - state.startX;
    const dy = event.clientY - state.startY;
    if (!state.active) {
      if (Math.abs(dy) < 8 || Math.abs(dy) <= Math.abs(dx)) return;
      if (dy < 0) {
        drag.current = null;
        return;
      }
      state.active = true;
      dragged.current = true;
      event.currentTarget.setPointerCapture(event.pointerId);
    }
    state.dy = Math.max(0, dy);
    setOffset(state.dy, false);
  }

  function onPointerEnd(event: PointerEvent<HTMLElement>) {
    const state = drag.current;
    drag.current = null;
    if (!state?.active || state.pointerId !== event.pointerId) return;
    const velocity = state.dy / Math.max(1, event.timeStamp - state.startTime);
    if (event.type === "pointerup" && (state.dy > DISMISS_DISTANCE || velocity > DISMISS_VELOCITY)) {
      // Slide down from where the finger left it (the closing animation starts at this offset).
      onClose();
    } else {
      setOffset(null, true);
    }
  }

  // A swipe must not end as a tap on the card's link.
  function onClickCapture(event: MouseEvent<HTMLElement>) {
    if (!dragged.current) return;
    dragged.current = false;
    event.preventDefault();
    event.stopPropagation();
  }

  return (
    <section
      ref={ref}
      tabIndex={-1}
      aria-label={t("label")}
      data-state={closing ? "closing" : "open"}
      onAnimationEnd={(event) => {
        if (closing && event.target === event.currentTarget) onClosed();
      }}
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={onPointerEnd}
      onPointerCancel={onPointerEnd}
      onClickCapture={onClickCapture}
      className={cn(
        "bayit-map-card pointer-events-auto relative rounded-sheet bg-card text-card-foreground shadow-sheet ring-1 ring-foreground/10 outline-none",
        // Vertical swipes are ours (to close); horizontal ones still scroll the photos.
        "touch-pan-x",
        closing && "pointer-events-none",
        className,
      )}
    >
      <div className="relative flex h-9 items-center justify-center">
        <span aria-hidden="true" className="h-1.5 w-10 rounded-full bg-muted-foreground/35 lg:hidden" />
        <button
          type="button"
          onClick={onClose}
          aria-label={t("close")}
          className="absolute end-1.5 top-1 inline-flex size-9 items-center justify-center rounded-full text-muted-foreground outline-none transition-transform duration-(--motion-fast) before:absolute before:-inset-1 before:content-[''] hover:bg-muted hover:text-foreground focus-visible:ring-3 focus-visible:ring-ring/50 active:scale-95"
        >
          <XIcon className="size-5" aria-hidden="true" />
        </button>
      </div>
      <div className="px-1.5 pb-1.5">{children}</div>
    </section>
  );
}
