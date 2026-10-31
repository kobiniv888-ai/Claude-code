"use client";

import { useEffect, useRef } from "react";
import { useLocale, useTranslations } from "next-intl";
import {
  ArrowLeftIcon,
  ArrowRightIcon,
  CheckIcon,
  CloudCheckIcon,
  CloudOffIcon,
  LoaderCircleIcon,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { formatNumber, formatTime } from "@/lib/format";
import { cn } from "@/lib/utils";
import type { WizardStepKey } from "@/lib/wizard/steps";
import type { SaveState } from "./use-autosave";

export function SaveIndicator({ state, onRetry }: { state: SaveState; onRetry: () => void }) {
  const t = useTranslations("wizard.chrome");
  const tErrors = useTranslations("wizard.errors");
  const locale = useLocale();
  return (
    <div className="flex min-h-7 items-center gap-1.5 text-xs font-medium sm:text-sm" aria-live="polite" role="status">
      {state.status === "saving" && (
        <>
          <LoaderCircleIcon className="size-4 animate-spin text-muted-foreground" aria-hidden />
          <span className="text-muted-foreground">{t("saving")}</span>
        </>
      )}
      {state.status === "saved" && (
        <>
          <CloudCheckIcon className="size-4 text-verified" aria-hidden />
          <span className="text-muted-foreground">
            {t("savedAt", { time: formatTime(new Date(state.at), locale, Intl.DateTimeFormat().resolvedOptions().timeZone) })}
          </span>
        </>
      )}
      {state.status === "idle" && (
        <>
          <CloudCheckIcon className="size-4 text-muted-foreground" aria-hidden />
          <span className="text-muted-foreground">{t("autosave")}</span>
        </>
      )}
      {state.status === "error" && (
        <>
          <CloudOffIcon className="size-4 text-destructive" aria-hidden />
          <span className="text-destructive">
            {tErrors.has(state.code) ? tErrors(state.code) : t("saveFailed")}
          </span>
          <Button type="button" variant="link" size="xs" className="h-auto px-1" onClick={onRetry}>
            {t("retry")}
          </Button>
        </>
      )}
    </div>
  );
}

export function WizardProgress({
  steps,
  current,
  complete,
  canJump,
  onJump,
  saveState,
  onRetry,
}: {
  steps: WizardStepKey[];
  current: WizardStepKey;
  complete: (step: WizardStepKey) => boolean;
  canJump: (step: WizardStepKey) => boolean;
  onJump: (step: WizardStepKey) => void;
  saveState: SaveState;
  onRetry: () => void;
}) {
  const t = useTranslations("wizard");
  const locale = useLocale();
  const index = steps.indexOf(current);
  const position = index + 1;
  const listRef = useRef<HTMLOListElement>(null);

  useEffect(() => {
    const chip = listRef.current?.querySelector<HTMLElement>('[aria-current="step"]');
    chip?.scrollIntoView({ block: "nearest", inline: "center", behavior: "smooth" });
  }, [current]);

  const percent = Math.round((position / steps.length) * 100);
  return (
    <nav aria-label={t("chrome.progressLabel")} className="grid gap-3">
      <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-1">
        <p className="text-sm font-semibold text-primary">
          {t("chrome.stepOf", { step: formatNumber(position, locale), total: formatNumber(steps.length, locale) })}
        </p>
        <SaveIndicator state={saveState} onRetry={onRetry} />
      </div>
      <div
        className="h-1.5 w-full overflow-hidden rounded-full bg-muted"
        role="progressbar"
        aria-valuemin={0}
        aria-valuemax={100}
        aria-valuenow={percent}
        aria-label={t("chrome.progressLabel")}
      >
        <div
          className="h-full rounded-full bg-primary transition-[width] duration-500 ease-out"
          style={{ width: `${percent}%` }}
        />
      </div>
      <ol
        ref={listRef}
        className="-mx-4 flex snap-x scroll-px-4 gap-2 overflow-x-auto px-4 pb-1 [scrollbar-width:none] sm:mx-0 sm:px-0 lg:flex-wrap [&::-webkit-scrollbar]:hidden"
      >
        {steps.map((step, i) => {
          const isCurrent = step === current;
          const done = !isCurrent && complete(step);
          const enabled = canJump(step);
          return (
            <li key={step} className="shrink-0 snap-start">
              <button
                type="button"
                onClick={() => onJump(step)}
                disabled={!enabled || isCurrent}
                aria-current={isCurrent ? "step" : undefined}
                className={cn(
                  "flex h-9 items-center gap-2 rounded-full border px-3 text-sm font-medium whitespace-nowrap transition-colors outline-none focus-visible:ring-3 focus-visible:ring-ring/50",
                  isCurrent && "border-primary bg-primary text-primary-foreground",
                  !isCurrent && enabled && "border-border bg-card hover:border-primary/40 hover:bg-secondary",
                  !isCurrent && !enabled && "cursor-not-allowed border-dashed border-border text-muted-foreground",
                )}
              >
                <span
                  aria-hidden
                  className={cn(
                    "flex size-5 items-center justify-center rounded-full text-xs tabular-nums",
                    isCurrent ? "bg-primary-foreground/20" : done ? "bg-verified text-verified-foreground" : "bg-muted",
                  )}
                >
                  {done ? <CheckIcon className="size-3" /> : formatNumber(i + 1, locale)}
                </span>
                <span>{t(`steps.${step}`)}</span>
                {done && <span className="sr-only">{t("chrome.completed")}</span>}
              </button>
            </li>
          );
        })}
      </ol>
    </nav>
  );
}

/** Back / Next — sticky at the bottom of the screen on phones. */
export function WizardNav({
  onBack,
  onNext,
  backDisabled,
  nextLabel,
  busy,
  hideNext,
  extra,
}: {
  onBack: () => void;
  onNext: () => void;
  backDisabled: boolean;
  nextLabel: string;
  busy: boolean;
  hideNext?: boolean;
  extra?: React.ReactNode;
}) {
  const t = useTranslations("wizard.chrome");
  return (
    <div className="sticky bottom-0 z-20 -mx-4 mt-8 border-t border-border bg-background/95 px-4 py-3 pb-[max(0.75rem,env(safe-area-inset-bottom))] backdrop-blur supports-[backdrop-filter]:bg-background/80 sm:mx-0 sm:rounded-2xl sm:border sm:px-4 sm:shadow-card">
      <div className="flex items-center justify-between gap-3">
        <Button
          type="button"
          variant="outline"
          className="h-11 min-w-24 px-4 text-base"
          onClick={onBack}
          disabled={backDisabled || busy}
        >
          <ArrowLeftIcon className="rtl:-scale-x-100" aria-hidden />
          {t("back")}
        </Button>
        <div className="flex items-center gap-2">
          {extra}
          {!hideNext && (
            <Button type="button" className="h-11 min-w-28 px-5 text-base" onClick={onNext} disabled={busy}>
              {busy ? <LoaderCircleIcon className="animate-spin" aria-hidden /> : null}
              {nextLabel}
              {!busy && <ArrowRightIcon className="rtl:-scale-x-100" aria-hidden />}
            </Button>
          )}
        </div>
      </div>
    </div>
  );
}
