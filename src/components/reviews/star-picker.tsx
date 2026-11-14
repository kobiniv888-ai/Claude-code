"use client";

import { StarIcon } from "lucide-react";
import { cn } from "@/lib/utils";

/**
 * 1–5 stars as a native radio group (arrow keys move between them, the group has one tab stop).
 * Each star is a 44px target on phones (`size="lg"`) or a 36px one in the quick ratings.
 */
export function StarPicker({
  name,
  value,
  onChange,
  legend,
  starLabel,
  size = "lg",
  invalid,
  describedBy,
  firstRef,
  className,
}: {
  name: string;
  value: number | null;
  onChange: (value: number) => void;
  legend: React.ReactNode;
  /** "4 כוכבים: טוב מאוד" */
  starLabel: (n: number) => string;
  size?: "lg" | "md";
  invalid?: boolean;
  describedBy?: string;
  firstRef?: React.Ref<HTMLInputElement>;
  className?: string;
}) {
  const box = size === "lg" ? "size-11" : "size-11 sm:size-9";
  const icon = size === "lg" ? "size-8" : "size-6";
  return (
    <fieldset className={cn("grid gap-1.5", className)} aria-describedby={describedBy} aria-invalid={invalid || undefined}>
      {legend}
      <div className="flex items-center gap-0.5">
        {[1, 2, 3, 4, 5].map((n) => {
          const on = value !== null && n <= value;
          return (
            <label key={n} className={cn("relative inline-flex cursor-pointer items-center justify-center rounded-full has-[:focus-visible]:ring-3 has-[:focus-visible]:ring-ring/50", box)}>
              <input
                ref={n === 1 ? firstRef : undefined}
                type="radio"
                name={name}
                value={n}
                checked={value === n}
                onChange={() => onChange(n)}
                aria-label={starLabel(n)}
                className="peer sr-only"
              />
              <StarIcon
                aria-hidden="true"
                strokeWidth={1.75}
                className={cn(icon, "transition-colors", on ? "fill-current text-foreground" : "text-muted-foreground hover:text-foreground")}
              />
            </label>
          );
        })}
      </div>
    </fieldset>
  );
}
