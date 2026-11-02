"use client";

import { useLocale, useTranslations } from "next-intl";
import { MinusIcon, PlusIcon } from "lucide-react";
import { GUEST_KINDS, canStep, guestLimit, stepGuests, type GuestCounts, type GuestKind } from "@/lib/booking/guest";
import { MAX_GUESTS_PER_BOOKING } from "@/lib/booking/constants";
import { formatNumber } from "@/lib/format";
import { cn } from "@/lib/utils";

const STEP =
  "inline-flex size-11 shrink-0 items-center justify-center rounded-full border border-border-strong bg-card text-foreground outline-none transition-[transform,background-color] duration-(--motion-fast) hover:bg-surface-muted focus-visible:ring-3 focus-visible:ring-ring/50 active:scale-95 motion-reduce:active:scale-100 disabled:pointer-events-none disabled:opacity-35";

/**
 * Adults / children / infants with − and + (44px). At least one adult; adults + children up to the
 * listing's maximum; infants (under 2) do not count, at most 5. Text: `booking.sheet`, `booking.guests`.
 */
export function GuestCounters({
  value,
  onChange,
  maxGuests,
  className,
}: {
  value: GuestCounts;
  onChange: (next: GuestCounts) => void;
  maxGuests: number | null;
  className?: string;
}) {
  const t = useTranslations("booking.sheet");
  const tg = useTranslations("booking.guests");
  const locale = useLocale();
  const limit = guestLimit(maxGuests);
  const full = value.adults + value.children >= limit;

  const row = (kind: GuestKind) => {
    const label = t(kind);
    const id = `guests-${kind}`;
    return (
      <li key={kind} className="flex items-center justify-between gap-3 py-3">
        <span className="grid min-w-0">
          <span id={id} className="text-body font-medium">
            {label}
          </span>
          <span className="text-caption text-muted-foreground">{t(`${kind}Hint`)}</span>
        </span>
        <span className="flex shrink-0 items-center gap-1" role="group" aria-labelledby={id}>
          <button
            type="button"
            className={STEP}
            disabled={!canStep(value, kind, -1, maxGuests)}
            aria-label={t("decrease", { label })}
            onClick={() => onChange(stepGuests(value, kind, -1, maxGuests))}
          >
            <MinusIcon className="size-4.5" aria-hidden />
          </button>
          <output aria-live="polite" aria-labelledby={id} className="w-8 text-center text-body font-semibold tabular-nums">
            {formatNumber(value[kind], locale)}
          </output>
          <button
            type="button"
            className={STEP}
            disabled={!canStep(value, kind, 1, maxGuests)}
            aria-label={t("increase", { label })}
            onClick={() => onChange(stepGuests(value, kind, 1, maxGuests))}
          >
            <PlusIcon className="size-4.5" aria-hidden />
          </button>
        </span>
      </li>
    );
  };

  return (
    <div className={cn("grid", className)}>
      <ul className="divide-y divide-border">{GUEST_KINDS.map(row)}</ul>
      <p className={cn("text-caption", full ? "text-foreground" : "text-muted-foreground")} aria-live="polite">
        {limit < MAX_GUESTS_PER_BOOKING ? `${t("maxGuests", { count: limit })}. ` : null}
        {tg("infantsNote")}
      </p>
    </div>
  );
}
