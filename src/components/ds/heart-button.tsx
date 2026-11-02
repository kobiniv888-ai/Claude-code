"use client";

import { useState, type MouseEvent } from "react";
import { HeartIcon } from "lucide-react";
import { cn } from "@/lib/utils";

/**
 * The save heart: fills with purple and pops (1 → 1.25 → 1) when switched on. Presentational —
 * FavoriteButton (src/components/listing) adds saving, login and toasts.
 *
 *   <HeartButton pressed={saved} onClick={toggle} label="שמירת דירה בוואקה" />
 */
export function HeartButton({
  pressed,
  onClick,
  label,
  variant = "overlay",
  busy = false,
  className,
}: {
  pressed: boolean;
  onClick: (event: MouseEvent<HTMLButtonElement>) => void;
  /** Accessible name (e.g. "Save {title}" / "Remove {title} from saved"). */
  label: string;
  /** overlay = white circle over a photo; outline = bordered button on a page; plain = icon only. */
  variant?: "overlay" | "outline" | "plain";
  busy?: boolean;
  className?: string;
}) {
  // Counts presses that turned the heart on; each one replays the pop (not on first render).
  const [pops, setPops] = useState(0);
  return (
    <button
      type="button"
      onClick={(event) => {
        if (!pressed) setPops((n) => n + 1);
        onClick(event);
      }}
      aria-pressed={pressed}
      aria-label={label}
      aria-busy={busy || undefined}
      className={cn(
        "inline-flex size-11 shrink-0 items-center justify-center rounded-full outline-none",
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
