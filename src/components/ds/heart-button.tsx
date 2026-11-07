"use client";

import { useRef, useState, type MouseEvent, type PointerEvent } from "react";
import { HeartIcon } from "lucide-react";
import { cn } from "@/lib/utils";

/**
 * The save heart: fills with purple and pops (1 → 1.25 → 1) when switched on. Presentational —
 * FavoriteButton (src/components/listing) adds saving, login and toasts.
 *
 *   <HeartButton pressed={saved} onClick={toggle} label="שמירת דירה בוואקה" />
 *
 * `onLongPress` (round 3, brief 7.2: choose a list): a press held for LONG_PRESS_MS, a right
 * click, or the keyboard's context-menu key (Shift+F10) calls it instead of `onClick`.
 */

/** How long a press must last to count as a long press. */
const LONG_PRESS_MS = 500;
/** A finger that moves this far (px) is scrolling, not pressing. */
const MOVE_TOLERANCE = 10;
export function HeartButton({
  pressed,
  onClick,
  label,
  variant = "overlay",
  busy = false,
  onLongPress,
  className,
}: {
  pressed: boolean;
  onClick: (event: MouseEvent<HTMLButtonElement>) => void;
  /** A long press, right click or the context-menu key (the list sheet). */
  onLongPress?: () => void;
  /** Accessible name (e.g. "Save {title}" / "Remove {title} from saved"). */
  label: string;
  /** overlay = white circle over a photo; outline = bordered button on a page; plain = icon only. */
  variant?: "overlay" | "outline" | "plain";
  busy?: boolean;
  className?: string;
}) {
  // Counts presses that turned the heart on; each one replays the pop (not on first render).
  const [pops, setPops] = useState(0);
  const press = useRef<{ timer: number; x: number; y: number } | null>(null);
  /** After a long press, the click that ends it is not a tap (until this time). */
  const swallowUntil = useRef(0);
  const cancelPress = () => {
    if (press.current) window.clearTimeout(press.current.timer);
    press.current = null;
  };
  /** A long press happened: ignore the click its release makes (wherever the finger is lifted). */
  const swallowRelease = () => {
    swallowUntil.current = Number.POSITIVE_INFINITY;
    const listening = new AbortController();
    const options = { capture: true, signal: listening.signal };
    const end = (until: number) => () => {
      swallowUntil.current = until === 0 ? 0 : Date.now() + until;
      listening.abort();
    };
    window.addEventListener("pointerup", end(400), options);
    window.addEventListener("pointercancel", end(0), options);
  };
  const longPress = onLongPress
    ? {
        onPointerDown: (event: PointerEvent<HTMLButtonElement>) => {
          if (event.button !== 0) return;
          cancelPress();
          const timer = window.setTimeout(() => {
            press.current = null;
            swallowRelease();
            navigator.vibrate?.(10);
            onLongPress();
          }, LONG_PRESS_MS);
          press.current = { timer, x: event.clientX, y: event.clientY };
        },
        onPointerMove: (event: PointerEvent<HTMLButtonElement>) => {
          const start = press.current;
          if (start && Math.hypot(event.clientX - start.x, event.clientY - start.y) > MOVE_TOLERANCE) cancelPress();
        },
        onPointerUp: cancelPress,
        onPointerCancel: cancelPress,
        onPointerLeave: cancelPress,
        // Right click, the context-menu key, and Android's own long press.
        onContextMenu: (event: MouseEvent<HTMLButtonElement>) => {
          event.preventDefault();
          event.stopPropagation();
          const holding = press.current !== null;
          cancelPress();
          if (swallowUntil.current === Number.POSITIVE_INFINITY) return; // the timer already opened it
          if (holding) swallowRelease();
          onLongPress();
        },
      }
    : {};
  return (
    <button
      type="button"
      {...longPress}
      onClick={(event) => {
        if (swallowUntil.current && Date.now() < swallowUntil.current) {
          swallowUntil.current = 0;
          event.preventDefault();
          event.stopPropagation();
          return;
        }
        swallowUntil.current = 0;
        if (!pressed) setPops((n) => n + 1);
        onClick(event);
      }}
      aria-pressed={pressed}
      aria-label={label}
      aria-busy={busy || undefined}
      className={cn(
        "inline-flex size-11 shrink-0 touch-manipulation items-center justify-center rounded-full outline-none select-none [-webkit-touch-callout:none]",
        "transition-[transform,background-color] duration-(--motion-fast) ease-standard focus-visible:ring-3 focus-visible:ring-ring/60 active:scale-90 motion-reduce:transition-none",
        variant === "overlay" && "bg-card text-foreground ring-1 ring-black/5 hover:bg-surface-muted",
        variant === "outline" && "border border-border-strong bg-card text-foreground hover:bg-surface-muted",
        variant === "plain" && "text-foreground hover:bg-surface-muted",
        className,
      )}
    >
      <HeartIcon
        key={pressed ? `on-${pops}` : "off"}
        aria-hidden="true"
        className={cn(
          "size-5.5 transition-colors duration-(--motion-fast)",
          pressed ? "fill-primary-text text-primary-text" : "fill-transparent",
          pressed && pops > 0 && "animate-heart-pop",
        )}
      />
    </button>
  );
}
