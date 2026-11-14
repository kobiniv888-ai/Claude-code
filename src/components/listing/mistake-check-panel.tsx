"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useLocale, useTranslations } from "next-intl";
import { ArrowRightIcon, CircleAlertIcon, CircleCheckIcon, ListChecksIcon, RefreshCwIcon, TriangleAlertIcon } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { formatNumber } from "@/lib/format";
import type { MistakeIssue, MistakeResult } from "@/lib/listing/mistake-check";
import { loadMistakeCheck } from "@/lib/listing/mistake-check-actions";
import { cn } from "@/lib/utils";
import { mistakeMessage } from "./mistake-text";

/**
 * "בדיקה לפני פרסום" (round 3, brief 6.1): the host's mistake check on the post form's preview
 * step and on the edit page. Errors first (red, "יש לתקן לפני פרסום": publishing is refused on the
 * server while they exist), then warnings ("כדאי לבדוק"), or "הכל נראה טוב". Each issue names its
 * step and has "לתיקון", which opens that step of the form.
 *
 * The check runs on the server, on the listing as saved (the form saves before it changes step).
 * Dispatch MISTAKE_CHECK_REFRESH on `window` to run it again (e.g. after a refused publish).
 */

export const MISTAKE_CHECK_REFRESH = "bayit:mistake-check-refresh";
/** The panel's heading id (the publish button scrolls to it when publishing is refused). */
export const MISTAKE_CHECK_TITLE_ID = "mistake-check-title";

type State =
  | { status: "loading"; result: MistakeResult | null }
  | { status: "failed"; result: MistakeResult | null }
  | { status: "done"; result: MistakeResult };

/** Loads the check for one of the user's listings; reloads on MISTAKE_CHECK_REFRESH. */
export function useMistakeCheck(listingId: string, onResult?: (result: MistakeResult | null) => void) {
  const [state, setState] = useState<State>({ status: "loading", result: null });
  const seq = useRef(0);
  const onResultRef = useRef(onResult);
  useEffect(() => {
    onResultRef.current = onResult;
  }, [onResult]);

  const load = useCallback(async () => {
    const mine = ++seq.current;
    setState((s) => ({ status: "loading", result: s.result }));
    const response = await loadMistakeCheck(listingId).catch(() => null);
    if (mine !== seq.current) return;
    if (response?.ok) {
      const result = { errors: response.data.errors, warnings: response.data.warnings };
      setState({ status: "done", result });
      onResultRef.current?.(result);
    } else {
      setState((s) => ({ status: "failed", result: s.result }));
      onResultRef.current?.(null);
    }
  }, [listingId]);

  useEffect(() => {
    // Runs once the step is shown; the load itself sets the state when it answers.
    // eslint-disable-next-line react-hooks/set-state-in-effect -- the first check starts on mount
    void load();
    const refresh = () => void load();
    window.addEventListener(MISTAKE_CHECK_REFRESH, refresh);
    return () => window.removeEventListener(MISTAKE_CHECK_REFRESH, refresh);
  }, [load]);

  return { state, reload: load };
}

function IssueRow({
  issue,
  onFix,
  stepLabel,
}: {
  issue: MistakeIssue;
  onFix?: (step: string) => void;
  stepLabel: (step: string) => { short: string; aria: string } | null;
}) {
  const t = useTranslations("wizard.mistakes");
  const locale = useLocale();
  const error = issue.severity === "error";
  const Icon = error ? CircleAlertIcon : TriangleAlertIcon;
  const step = issue.step ? stepLabel(issue.step) : null;
  return (
    <li className={cn("flex items-start gap-2.5 rounded-xl border bg-card p-3", error ? "border-destructive/35" : "border-border")} data-mistake={issue.code}>
      <Icon className={cn("mt-0.5 size-5 shrink-0", error ? "text-destructive" : "text-muted-foreground")} aria-hidden />
      <div className="grid min-w-0 flex-1 gap-1.5">
        <p className="text-sm text-pretty break-words text-foreground">{mistakeMessage(issue, t, locale)}</p>
        {/* The step and "לתיקון" share a line (it wraps under the step when there is no room). */}
        {step || (issue.step && onFix) ? (
          <div className="flex flex-wrap items-center justify-between gap-x-3 gap-y-1">
            {step ? <p className="min-w-0 text-xs text-muted-foreground">{step.short}</p> : <span />}
            {issue.step && onFix ? (
              <Button
                type="button"
                size="sm"
                variant="outline"
                onClick={() => onFix(issue.step!)}
                aria-label={step?.aria}
                className="ms-auto h-11 shrink-0 px-4 sm:h-9"
              >
                {t("fix")}
                <ArrowRightIcon className="rtl:-scale-x-100" aria-hidden />
              </Button>
            ) : null}
          </div>
        ) : null}
      </div>
    </li>
  );
}

function PanelSkeleton() {
  const t = useTranslations("wizard.mistakes");
  return (
    <div className="grid gap-2" role="status" aria-live="polite">
      <span className="sr-only">{t("loading")}</span>
      {[0, 1, 2].map((i) => (
        <div key={i} className="flex items-center gap-3 rounded-xl border border-border p-3" aria-hidden>
          <Skeleton className="size-5 shrink-0 rounded-full" />
          <div className="grid flex-1 gap-2">
            <Skeleton className="h-3.5 w-11/12" />
            <Skeleton className="h-3 w-1/3" />
          </div>
        </div>
      ))}
    </div>
  );
}

export type MistakeCheckPanelProps = {
  listingId: string;
  /** Opens a step of the form ("לתיקון"). Without it the issues show their step only. */
  onFix?: (step: string) => void;
  /** The 1-based number and name of a step in this listing's form (null: not one of its steps). */
  stepInfo?: (step: string) => { number: number; name: string } | null;
  /** Told about every finished check (null when it failed). */
  onResult?: (result: MistakeResult | null) => void;
  className?: string;
};

export function MistakeCheckPanel({ listingId, onFix, stepInfo, onResult, className }: MistakeCheckPanelProps) {
  const t = useTranslations("wizard.mistakes");
  const locale = useLocale();
  const { state, reload } = useMistakeCheck(listingId, onResult);
  const result = state.result;
  const loading = state.status === "loading";

  const stepLabel = (step: string) => {
    const info = stepInfo?.(step);
    if (!info) return null;
    const values = { step: formatNumber(info.number, locale), name: info.name };
    return { short: t("inStep", values), aria: t("fixLabel", values) };
  };

  const clean = result && result.errors.length === 0 && result.warnings.length === 0;

  return (
    <section
      className={cn("grid min-w-0 gap-4 rounded-card bg-card p-4 shadow-card ring-1 ring-foreground/5 sm:p-6 [&>*]:min-w-0", className)}
      aria-labelledby={MISTAKE_CHECK_TITLE_ID}
      aria-busy={loading || undefined}
      data-testid="mistake-check"
    >
      <header className="flex flex-wrap items-start justify-between gap-3">
        <div className="flex min-w-0 flex-1 items-start gap-3">
          <span className="flex size-10 shrink-0 items-center justify-center rounded-full bg-primary-tint text-primary-text">
            <ListChecksIcon className="size-5" aria-hidden />
          </span>
          <div className="grid min-w-0 gap-0.5 pt-1">
            <h2 id={MISTAKE_CHECK_TITLE_ID} tabIndex={-1} className="text-h3 break-words text-foreground outline-none">
              {t("title")}
            </h2>
            <p className="text-small text-pretty text-muted-foreground">{t("subtitle")}</p>
          </div>
        </div>
        {result || state.status === "failed" ? (
          // Icon only on phones (long Georgian / Russian labels would crowd the title), 44px.
          <Button
            type="button"
            variant="ghost"
            size="sm"
            onClick={() => void reload()}
            disabled={loading}
            className="size-11 shrink-0 px-0 sm:h-9 sm:w-auto sm:px-3"
          >
            <RefreshCwIcon className={cn(loading && "animate-spin motion-reduce:animate-none")} aria-hidden />
            <span className="max-sm:sr-only">{t("retry")}</span>
          </Button>
        ) : null}
      </header>

      {state.status === "failed" ? (
        <p role="alert" className="flex items-start gap-2 rounded-xl border border-destructive/30 bg-destructive/5 p-3 text-sm font-medium text-destructive">
          <CircleAlertIcon className="mt-0.5 size-4.5 shrink-0" aria-hidden />
          {t("failed")}
        </p>
      ) : null}

      {!result && loading ? <PanelSkeleton /> : null}

      {result ? (
        <div className={cn("grid gap-5", loading && "opacity-60 transition-opacity")} aria-live="polite">
          {clean ? (
            <div className="flex items-start gap-3 rounded-xl bg-primary-tint p-3.5" data-mistake-clean="">
              <CircleCheckIcon className="mt-0.5 size-5 shrink-0 text-success" aria-hidden />
              <div className="grid gap-0.5">
                <p className="font-semibold text-foreground">{t("allGood")}</p>
                <p className="text-sm text-muted-foreground">{t("allGoodHint")}</p>
              </div>
            </div>
          ) : null}

          {result.errors.length > 0 ? (
            <div className="grid gap-2.5">
              <div className="grid gap-0.5">
                <h3 className="flex items-center gap-2 font-semibold text-destructive">
                  <CircleAlertIcon className="size-5 shrink-0" aria-hidden />
                  {t("errorsTitle")}
                </h3>
                <p className="text-sm text-muted-foreground">{t("errorsHint", { count: result.errors.length })}</p>
              </div>
              <ul className="grid gap-2">
                {result.errors.map((issue, i) => (
                  <IssueRow key={`${issue.code}-${i}`} issue={issue} onFix={onFix} stepLabel={stepLabel} />
                ))}
              </ul>
            </div>
          ) : null}

          {result.warnings.length > 0 ? (
            <div className="grid gap-2.5">
              <div className="grid gap-0.5">
                <h3 className="flex items-center gap-2 font-semibold text-foreground">
                  <TriangleAlertIcon className="size-5 shrink-0 text-muted-foreground" aria-hidden />
                  {t("warningsTitle")}
                </h3>
                <p className="text-sm text-muted-foreground">{t("warningsHint")}</p>
              </div>
              <ul className="grid gap-2">
                {result.warnings.map((issue, i) => (
                  <IssueRow key={`${issue.code}-${i}`} issue={issue} onFix={onFix} stepLabel={stepLabel} />
                ))}
              </ul>
            </div>
          ) : null}
        </div>
      ) : null}
    </section>
  );
}

/**
 * The edit page's short line above the form: "1 thing to fix · 3 things to check" with "Show",
 * which opens the preview step where the full panel is. Nothing while the check is clean.
 */
export function MistakeCheckSummary({
  listingId,
  refreshKey,
  onShow,
  className,
}: {
  listingId: string;
  /** Checks again when this changes (the form's step: the step before it was just saved). */
  refreshKey?: string;
  onShow: () => void;
  className?: string;
}) {
  const t = useTranslations("wizard.mistakes");
  const { state, reload } = useMistakeCheck(listingId);
  const lastKey = useRef(refreshKey);
  useEffect(() => {
    if (lastKey.current === refreshKey) return;
    lastKey.current = refreshKey;
    void reload();
  }, [refreshKey, reload]);
  // The last answer stays on screen while the next check runs (no jump on every step).
  const result = state.result;
  if (!result || (result.errors.length === 0 && result.warnings.length === 0)) return null;
  const errors = result.errors.length;
  const warnings = result.warnings.length;
  return (
    <div
      className={cn(
        "flex flex-wrap items-center gap-x-3 gap-y-2 rounded-card border px-4 py-3",
        errors > 0 ? "border-destructive/35 bg-destructive/5" : "border-border bg-surface-muted dark:bg-surface-muted/10",
        className,
      )}
      role="status"
      data-testid="mistake-check-summary"
    >
      {errors > 0 ? (
        <CircleAlertIcon className="size-5 shrink-0 text-destructive" aria-hidden />
      ) : (
        <TriangleAlertIcon className="size-5 shrink-0 text-muted-foreground" aria-hidden />
      )}
      <p className="min-w-0 flex-1 text-sm">
        <span className="font-semibold">{t("title")}:</span>{" "}
        {[errors > 0 ? t("summaryErrors", { count: errors }) : null, warnings > 0 ? t("summaryWarnings", { count: warnings }) : null]
          .filter(Boolean)
          .join(" · ")}
      </p>
      <Button type="button" size="sm" variant="outline" onClick={onShow} className="h-11 px-4 sm:h-9">
        {t("summaryShow")}
        <ArrowRightIcon className="rtl:-scale-x-100" aria-hidden />
      </Button>
    </div>
  );
}
