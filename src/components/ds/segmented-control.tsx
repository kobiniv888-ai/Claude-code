"use client";

import { useId, useRef, type KeyboardEvent } from "react";
import { useLocale } from "next-intl";
import { dirFor } from "@/i18n/locale";
import { cn } from "@/lib/utils";
import type { IconComponent } from "./jewish-icons";

export type SegmentedOption<V extends string> = {
  value: V;
  label: React.ReactNode;
  icon?: IconComponent;
  disabled?: boolean;
};

/**
 * Equal-width segments with a sliding indicator (deal type, "Any | 1+ | 2+ …").
 * A radio group: one tab stop, arrow keys move the choice and follow the screen direction
 * (in RTL, ArrowLeft goes to the next option), Home/End jump to the ends.
 *
 * Labels are bidi-isolated, so "1+" stays "1+" in Hebrew.
 *
 *   <SegmentedControl aria-label="סוג עסקה" value={deal} onValueChange={setDeal}
 *     options={[{ value: "short", label: "לטווח קצר" }, …]} />
 */
export function SegmentedControl<V extends string>({
  options,
  value,
  onValueChange,
  size = "md",
  tone = "navy",
  className,
  name,
  ...aria
}: {
  options: readonly SegmentedOption<V>[];
  value: V;
  onValueChange: (value: V) => void;
  size?: "sm" | "md";
  /** navy = filled navy indicator; card = white indicator on a muted track (quieter). */
  tone?: "navy" | "card";
  className?: string;
  /** For forms: renders a hidden input with this name. */
  name?: string;
} & ({ "aria-label": string } | { "aria-labelledby": string })) {
  const locale = useLocale();
  const rtl = dirFor(locale) === "rtl";
  const id = useId();
  const refs = useRef<(HTMLButtonElement | null)[]>([]);
  const count = options.length;
  const index = Math.max(
    0,
    options.findIndex((option) => option.value === value),
  );

  const move = (from: number, step: 1 | -1) => {
    for (let i = 1; i <= count; i++) {
      const next = (from + step * i + count) % count;
      if (!options[next].disabled) return next;
    }
    return from;
  };

  const select = (next: number) => {
    const option = options[next];
    if (!option || option.disabled) return;
    onValueChange(option.value);
    refs.current[next]?.focus();
  };

  const onKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    let next: number | null = null;
    // Arrow keys follow the screen: "forward" is to the left in RTL.
    if (event.key === "ArrowRight") next = move(index, rtl ? -1 : 1);
    else if (event.key === "ArrowLeft") next = move(index, rtl ? 1 : -1);
    else if (event.key === "ArrowDown") next = move(index, 1);
    else if (event.key === "ArrowUp") next = move(index, -1);
    else if (event.key === "Home") next = move(-1, 1);
    else if (event.key === "End") next = move(count, -1);
    if (next === null) return;
    event.preventDefault();
    select(next);
  };

  return (
    <div
      role="radiogroup"
      {...aria}
      onKeyDown={onKeyDown}
      className={cn(
        "relative grid w-full rounded-full bg-muted p-1 ring-1 ring-foreground/5 ring-inset",
        className,
      )}
      style={{ gridTemplateColumns: `repeat(${count}, minmax(0, 1fr))` }}
    >
      {/* The indicator: one segment wide, moved with a transform (RTL moves the other way). */}
      <span
        aria-hidden="true"
        className={cn(
          "pointer-events-none absolute inset-y-1 start-1 rounded-full shadow-sm transition-transform duration-(--motion-base) ease-soft motion-reduce:transition-none",
          tone === "navy" ? "bg-navy" : "bg-card",
        )}
        style={{
          width: `calc((100% - 0.5rem) / ${count})`,
          transform: `translateX(${(rtl ? -100 : 100) * index}%)`,
        }}
      />
      {options.map((option, i) => {
        const selected = i === index;
        const Icon = option.icon;
        return (
          <button
            key={option.value}
            ref={(node) => {
              refs.current[i] = node;
            }}
            id={`${id}-${i}`}
            type="button"
            role="radio"
            aria-checked={selected}
            tabIndex={selected ? 0 : -1}
            disabled={option.disabled}
            onClick={() => select(i)}
            className={cn(
              "relative z-10 inline-flex min-w-0 items-center justify-center gap-1.5 rounded-full px-2 text-center font-semibold leading-tight outline-none",
              "transition-colors duration-(--motion-base) focus-visible:ring-3 focus-visible:ring-ring/50 disabled:opacity-40",
              size === "sm" ? "min-h-9 text-sm [&_svg]:size-4" : "min-h-11 text-sm sm:text-base [&_svg]:size-4.5",
              selected
                ? tone === "navy"
                  ? "text-navy-foreground"
                  : "text-foreground"
                : "text-muted-foreground hover:text-foreground",
            )}
          >
            {Icon ? <Icon aria-hidden="true" /> : null}
            <bdi className="min-w-0 text-balance">{option.label}</bdi>
          </button>
        );
      })}
      {name ? <input type="hidden" name={name} value={value} /> : null}
    </div>
  );
}
