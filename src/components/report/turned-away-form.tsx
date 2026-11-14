"use client";

import { useCallback, useEffect, useId, useRef, useState, type FormEvent } from "react";
import { useLocale, useTranslations } from "next-intl";
import { CircleCheckBigIcon, ShieldCheckIcon } from "lucide-react";
import { Ltr } from "@/components/common/ltr";
import { Turnstile, type TurnstileHandle } from "@/components/common/turnstile";
import { BottomSheet } from "@/components/ds/bottom-sheet";
import { Button } from "@/components/ds/button";
import { Label } from "@/components/ui/label";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Textarea } from "@/components/ui/textarea";
import { Link, useRouter } from "@/i18n/navigation";
import { errorMessageKey } from "@/lib/errors";
import { formatNumber } from "@/lib/format";
import { createTurnedAwayReport } from "@/lib/reports/actions";
import { REPORT_DETAILS_MAX, REPORT_OTHER_MIN } from "@/lib/reports/schemas";
import {
  happenedOnBounds,
  happenedOnProblem,
  REPORT_SCREENSHOTS,
  TURNED_AWAY_REASONS,
  type ReportAttachment,
  type TurnedAwayReason,
} from "@/lib/reports/turned-away";
import { cn } from "@/lib/utils";
import { HappenedOnPicker } from "./happened-on-picker";
import { ReportScreenshots } from "./report-screenshots";

/**
 * "Turned away?" — the report form (round 3, brief 8.2), in a bottom sheet on phones and a
 * dialog on computers. What happened (4 choices), when, optional text (needed for "Other") and
 * optional screenshots. The host never learns who reported unless the founder decides to.
 * Loaded only when a guest opens it (./turned-away-launcher).
 */

export type TurnedAwayTarget = { bookingId?: string | null; listingId?: string | null };
export type TurnedAwayContext = { bookingCode?: string | null; listingTitle?: string | null };

const KNOWN_ERRORS = new Set([
  "already_reported",
  "own_target",
  "not_found",
  "attachment_invalid",
  "date_invalid",
  "date_future",
  "date_too_old",
]);

export function TurnedAwayForm({
  open,
  onOpenChange,
  target,
  context,
  today,
  defaultDate,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  target: TurnedAwayTarget;
  context: TurnedAwayContext;
  /** "YYYY-MM-DD" in Georgia. */
  today: string;
  /** The day the form starts with (e.g. the day the host cancelled). */
  defaultDate?: string | null;
}) {
  const t = useTranslations("report.turnedAway");
  const te = useTranslations("errors");
  const locale = useLocale();
  const router = useRouter();
  const id = useId();
  const bounds = happenedOnBounds(today);
  const initialDate = defaultDate && !happenedOnProblem(defaultDate, today) ? defaultDate : today;
  const [reason, setReason] = useState<TurnedAwayReason | "">("");
  const [happenedOn, setHappenedOn] = useState(initialDate);
  const [details, setDetails] = useState("");
  const [attachments, setAttachments] = useState<ReportAttachment[]>([]);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState<{ field: "reason" | "date" | "details" | "form"; text: string } | null>(null);
  const [pending, setPending] = useState(false);
  const [done, setDone] = useState(false);
  const [token, setToken] = useState<string | null>(null);
  const captcha = useRef<TurnstileHandle>(null);
  // Where a problem is: focusing the field also scrolls it into view inside the sheet's scrolling
  // body (the send button is pinned below it, so the message could otherwise be out of sight).
  const firstReason = useRef<HTMLButtonElement>(null);
  const dateButton = useRef<HTMLButtonElement>(null);
  const detailsField = useRef<HTMLTextAreaElement>(null);
  const closeButton = useRef<HTMLButtonElement>(null);
  const onAttachments = useCallback((list: ReportAttachment[]) => setAttachments(list), []);
  const onBusy = useCallback((busy: boolean) => setUploading(busy), []);

  function errorText(code: string): string {
    if (code === "details_required") return t("errors.details", { count: REPORT_OTHER_MIN });
    if (KNOWN_ERRORS.has(code)) return t(`errors.${code}` as never);
    return te(errorMessageKey(code));
  }

  // The send button is replaced by "Close" on success: focus moves there, not to the sheet.
  useEffect(() => {
    if (done) closeButton.current?.focus();
  }, [done]);

  function showError(field: "reason" | "date" | "details" | "form", text: string) {
    setError({ field, text });
    const target = field === "reason" ? firstReason : field === "date" ? dateButton : field === "details" ? detailsField : null;
    // After the render that shows the message (and marks the field invalid).
    if (target) requestAnimationFrame(() => target.current?.focus());
  }

  async function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (pending) return;
    if (!reason) return showError("reason", t("errors.reason"));
    const dateProblem = happenedOnProblem(happenedOn, today);
    if (dateProblem) return showError("date", errorText(dateProblem));
    if (reason === "OTHER" && details.trim().length < REPORT_OTHER_MIN) {
      return showError("details", errorText("details_required"));
    }
    if (uploading) return setError({ field: "form", text: t("errors.uploading") });
    setPending(true);
    setError(null);
    try {
      const result = await createTurnedAwayReport({
        bookingId: target.bookingId ?? null,
        listingId: target.listingId ?? null,
        reason,
        happenedOn,
        details,
        attachments,
        turnstileToken: token,
      });
      if (result.ok) {
        setDone(true);
        return;
      }
      captcha.current?.reset(); // Turnstile tokens are single-use.
      if (result.error.startsWith("date_")) showError("date", errorText(result.error));
      else setError({ field: "form", text: errorText(result.error) });
    } catch {
      captcha.current?.reset();
      setError({ field: "form", text: te("network") });
    } finally {
      setPending(false);
    }
  }

  // After a report from a trip, closing the thanks shows the trip page's "you reported" note.
  function close(next: boolean) {
    if (pending) return;
    onOpenChange(next);
    if (!next && done && target.bookingId) router.refresh();
  }

  const formId = `${id}-form`;
  const about = context.bookingCode ? (
    t.rich("aboutBooking", { code: context.bookingCode, ltr: (chunks) => <Ltr className="font-medium text-foreground">{chunks}</Ltr> })
  ) : context.listingTitle ? (
    t.rich("aboutListing", { title: context.listingTitle, bdi: (chunks) => <bdi className="font-medium text-foreground">{chunks}</bdi> })
  ) : null;

  return (
    <BottomSheet
      open={open}
      onOpenChange={close}
      title={done ? t("thanksTitle") : t("title")}
      description={done ? undefined : t("intro")}
      footer={
        done ? (
          <Button ref={closeButton} type="button" variant="secondary" block onClick={() => close(false)}>
            {t("close")}
          </Button>
        ) : (
          <Button type="submit" form={formId} block disabled={pending} aria-busy={pending || undefined}>
            {pending ? t("sending") : t("submit")}
          </Button>
        )
      }
    >
      {done ? (
        <div role="status" className="grid justify-items-center gap-3 py-6 text-center">
          <CircleCheckBigIcon className="size-12 text-success" aria-hidden />
          <p className="text-body">{t("thanks")}</p>
          <p className="text-small text-muted-foreground">{t("thanksHidden")}</p>
          {target.bookingId ? (
            <Link href="/search" className="min-h-11 content-center text-small font-medium text-primary-text underline underline-offset-4" onClick={() => onOpenChange(false)}>
              {t("searchAgain")}
            </Link>
          ) : null}
        </div>
      ) : (
        <form id={formId} className="grid gap-5 pb-2" onSubmit={onSubmit} noValidate>
          {about ? <p className="text-small text-muted-foreground">{about}</p> : null}

          <fieldset className="grid gap-2" aria-describedby={error?.field === "reason" ? `${id}-reason-error` : undefined}>
            <legend className="mb-2 text-small font-semibold">{t("whatLabel")}</legend>
            <RadioGroup
              value={reason}
              onValueChange={(v) => {
                setReason(v as TurnedAwayReason);
                if (error?.field === "reason") setError(null);
              }}
              className="grid gap-2"
            >
              {TURNED_AWAY_REASONS.map((key, index) => (
                <Label
                  key={key}
                  htmlFor={`${id}-${key}`}
                  className="flex min-h-12 cursor-pointer items-center gap-3 rounded-xl border border-border px-3 py-2.5 text-small font-normal leading-snug has-[[data-state=checked]]:border-primary has-[[data-state=checked]]:bg-primary-tint"
                >
                  <RadioGroupItem
                    ref={index === 0 ? firstReason : undefined}
                    id={`${id}-${key}`}
                    value={key}
                    aria-invalid={error?.field === "reason" || undefined}
                  />
                  <span>{t(`reasons.${key}`)}</span>
                </Label>
              ))}
            </RadioGroup>
            {error?.field === "reason" ? (
              <p id={`${id}-reason-error`} role="alert" className="text-small text-destructive">
                {error.text}
              </p>
            ) : null}
          </fieldset>

          <div className="grid gap-1.5">
            <Label id={`${id}-date-label`} htmlFor={`${id}-date`} className="text-small font-semibold">
              {t("whenLabel")}
            </Label>
            <HappenedOnPicker
              ref={dateButton}
              id={`${id}-date`}
              labelId={`${id}-date-label`}
              value={happenedOn}
              min={bounds.min}
              max={bounds.max}
              onChange={(day) => {
                setHappenedOn(day);
                if (error?.field === "date") setError(null);
              }}
              invalid={error?.field === "date"}
              describedBy={error?.field === "date" ? `${id}-date-error` : undefined}
            />
            {error?.field === "date" ? (
              <p id={`${id}-date-error`} role="alert" className="text-small text-destructive">
                {error.text}
              </p>
            ) : null}
          </div>

          <div className="grid gap-1.5">
            <Label htmlFor={`${id}-details`} className="text-small font-semibold">
              {reason === "OTHER" ? t("detailsRequired") : t("detailsOptional")}
            </Label>
            <Textarea
              ref={detailsField}
              id={`${id}-details`}
              value={details}
              onChange={(e) => setDetails(e.target.value)}
              rows={4}
              maxLength={REPORT_DETAILS_MAX}
              dir={details ? "auto" : undefined}
              placeholder={t("detailsPlaceholder")}
              aria-invalid={error?.field === "details" || undefined}
              aria-describedby={error?.field === "details" ? `${id}-details-error` : undefined}
              className="text-body"
            />
            {error?.field === "details" ? (
              <p id={`${id}-details-error`} role="alert" className="text-small text-destructive">
                {error.text}
              </p>
            ) : null}
          </div>

          <div className="grid gap-2">
            <p className="text-small font-semibold" id={`${id}-shots`}>
              {t("screenshotsLabel")}
            </p>
            <p className="text-caption text-muted-foreground" id={`${id}-shots-hint`}>
              {t("screenshotsHint", {
                count: REPORT_SCREENSHOTS.maxFiles,
                size: formatNumber(REPORT_SCREENSHOTS.maxBytes / (1024 * 1024), locale),
              })}
            </p>
            <ReportScreenshots onChange={onAttachments} onBusyChange={onBusy} disabled={pending} describedBy={`${id}-shots-hint`} />
          </div>

          <p className="flex items-start gap-2 rounded-input bg-surface-muted p-3 text-small">
            <ShieldCheckIcon className="mt-0.5 size-5 shrink-0 text-primary-text" aria-hidden />
            <span>{t("privacy")}</span>
          </p>

          <Turnstile ref={captcha} action="report" onToken={setToken} onExpire={() => setToken(null)} />

          {error?.field === "form" ? (
            <p role="alert" className={cn("rounded-xl bg-destructive/10 p-3 text-small text-destructive")}>
              {error.text}
            </p>
          ) : null}
        </form>
      )}
    </BottomSheet>
  );
}
