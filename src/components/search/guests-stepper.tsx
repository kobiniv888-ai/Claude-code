"use client";

import { useId } from "react";
import { useLocale, useTranslations } from "next-intl";
import { Minus, Plus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { formatNumber } from "@/lib/format";
import { MAX_GUESTS } from "@/lib/search/search-bar";
import { cn } from "@/lib/utils";

/** "Guests: − 2 +" — 0 means any number of guests. */
export function GuestsStepper({
  value,
  onChange,
  max = MAX_GUESTS,
  className,
}: {
  value: number;
  onChange: (value: number) => void;
  max?: number;
  className?: string;
}) {
  const t = useTranslations("search.guests");
  const locale = useLocale();
  const id = useId();
  return (
    <div className={cn("flex items-center justify-between gap-4", className)} role="group" aria-labelledby={`${id}-label`}>
      <div className="grid gap-0.5">
        <span id={`${id}-label`} className="text-sm font-semibold">
          {t("label")}
        </span>
        <span className="text-xs text-muted-foreground">{t("hint")}</span>
      </div>
      <div className="flex items-center gap-3">
        <Button
          type="button"
          variant="outline"
          size="icon"
          className="size-10 rounded-full"
          disabled={value <= 0}
          onClick={() => onChange(Math.max(0, value - 1))}
          aria-label={t("decrease")}
        >
          <Minus aria-hidden="true" />
        </Button>
        <output aria-live="polite" className="min-w-8 text-center text-base font-semibold tabular-nums">
          {value > 0 ? formatNumber(value, locale) : t("any")}
        </output>
        <Button
          type="button"
          variant="outline"
          size="icon"
          className="size-10 rounded-full"
          disabled={value >= max}
          onClick={() => onChange(Math.min(max, value + 1))}
          aria-label={t("increase")}
        >
          <Plus aria-hidden="true" />
        </Button>
      </div>
    </div>
  );
}
