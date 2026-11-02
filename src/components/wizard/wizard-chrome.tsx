"use client";

import { useState } from "react";
import { useLocale, useTranslations } from "next-intl";
import {
  ArrowLeftIcon,
  ArrowRightIcon,
  CheckIcon,
  ChevronDownIcon,
  CloudCheckIcon,
  CloudOffIcon,
  ListChecksIcon,
  LoaderCircleIcon,
} from "lucide-react";
import { Button } from "@/components/ds/button";
import { BottomSheet } from "@/components/ds/bottom-sheet";
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
          <CloudCheckIcon className="size-4 text-success" aria-hidden />
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
          <Button type="button" variant="link" size="sm" className="h-auto px-1" onClick={onRetry}>
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
  const [open, setOpen] = useState(false);
  const index = steps.indexOf(current);
  const position = index + 1;
  const stepOf = t("chrome.stepOf", { step: formatNumber(position, locale), total: formatNumber(steps.length, locale) });
  const percent = Math.round((position / steps.length) * 100);

  return (
    <nav aria-label={t("chrome.progressLabel")} className="grid gap-2.5">
      <div className="flex flex-wrap items-center justify-between gap-x-3 gap-y-1">
        <button
          type="button"
          onClick={() => setOpen(true)}
          aria-haspopup="dialog"
          aria-label={`${stepOf} · ${t("chrome.allSteps")}`}
          className="-ms-2 inline-flex min-h-11 items-center gap-1.5 rounded-full px-2 text-small font-bold text-primary outline-none transition-colors hover:bg-primary-tint focus-visible:ring-3 focus-visible:ring-ring/50"
        >
          <ListChecksIcon className="size-4.5" aria-hidden />
          {stepOf}
          <ChevronDownIcon className="size-4 opacity-70" aria-hidden />
        </button>
        <SaveIndicator state={saveState} onRetry={onRetry} />
      </div>
      {/* One segment per step: done = navy, this step = coral (fills with a transform, not a width). */}
      <div
        className="flex gap-1"
        role="progressbar"
        aria-valuemin={0}
        aria-valuemax={100}
        aria-valuenow={percent}
        aria-valuetext={stepOf}
        aria-label={t("chrome.progressLabel")}
      >
        {steps.map((step, i) => (
          <span key={step} aria-hidden className="relative h-1.5 flex-1 overflow-hidden rounded-full bg-muted">
            <span
              className={cn(
                "absolute inset-0 origin-left rounded-full transition-transform duration-(--motion-slow) ease-soft rtl:origin-right motion-reduce:transition-none",
                i === index ? "bg-primary" : "bg-primary",
                i <= index ? "scale-x-100" : "scale-x-0",
              )}
            />
          </span>
        ))}
      </div>

      <BottomSheet open={open} onOpenChange={setOpen} title={t("chrome.allSteps")}>
        <ol className="grid gap-1 pb-2">
          {steps.map((step, i) => {
            const isCurrent = step === current;
            const done = !isCurrent && complete(step);
            const enabled = canJump(step) && !isCurrent;
            return (
              <li key={step}>
                <button
                  type="button"
                  onClick={() => {
                    setOpen(false);
                    onJump(step);
                  }}
                  disabled={!enabled}
                  aria-current={isCurrent ? "step" : undefined}
                  className={cn(
                    "flex min-h-12 w-full items-center gap-3 rounded-card px-3 py-2 text-start text-body outline-none transition-colors focus-visible:ring-3 focus-visible:ring-ring/50",
                    isCurrent && "bg-primary-tint font-bold text-primary-text",
                    !isCurrent && enabled && "hover:bg-muted",
                    !isCurrent && !enabled && "cursor-not-allowed text-muted-foreground",
                  )}
                >
                  <span
                    aria-hidden
                    className={cn(
                      "flex size-8 shrink-0 items-center justify-center rounded-full text-small font-bold tabular-nums",
                      isCurrent ? "bg-primary text-primary-foreground" : done ? "bg-success text-success-foreground" : "bg-muted",
                    )}
                  >
                    {done ? <CheckIcon className="size-4" strokeWidth={3} /> : formatNumber(i + 1, locale)}
                  </span>
                  <span className="min-w-0 flex-1">{t(`steps.${step}`)}</span>
                  {done && <span className="sr-only">{t("chrome.completed")}</span>}
                </button>
              </li>
            );
          })}
        </ol>
      </BottomSheet>
    </nav>
  );
}

/** Back / Next — a bar stuck to the bottom of the screen (phones) or under the step (desktop). */
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
    <div className="sticky bottom-0 z-(--z-sticky) -mx-4 mt-8 border-t border-border bg-background/95 px-4 pt-3 pb-[max(0.75rem,env(safe-area-inset-bottom))] shadow-sheet backdrop-blur supports-[backdrop-filter]:bg-background/85 sm:bottom-4 sm:mx-0 sm:rounded-full sm:border sm:p-2 sm:shadow-raised">
      <div className="flex items-center justify-between gap-3">
        <Button
          type="button"
          variant="outline"
          className="h-12 min-w-24 px-4 sm:h-11"
          onClick={onBack}
          disabled={backDisabled || busy}
        >
          <ArrowLeftIcon className="rtl:-scale-x-100" aria-hidden />
          {t("back")}
        </Button>
        <div className="flex min-w-0 flex-1 items-center justify-end gap-2">
          {extra}
          {!hideNext && (
            <Button type="button" className="h-12 min-w-0 flex-1 px-5 sm:h-11 sm:max-w-60 sm:min-w-36" onClick={onNext} disabled={busy}>
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
