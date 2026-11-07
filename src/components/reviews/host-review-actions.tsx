"use client";

import { useId, useRef, useState, type FormEvent } from "react";
import { useLocale, useTranslations } from "next-intl";
import { CircleCheckBigIcon, FlagIcon, LockKeyholeIcon, MessageSquareReplyIcon } from "lucide-react";
import { BottomSheet } from "@/components/ds/bottom-sheet";
import { Button } from "@/components/ds/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Label } from "@/components/ui/label";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Textarea } from "@/components/ui/textarea";
import { useRouter } from "@/i18n/navigation";
import { errorMessageKey } from "@/lib/errors";
import { formatDate, formatNumber } from "@/lib/format";
import { replyToReview, reportReview } from "@/lib/reviews/actions";
import { isReviewErrorCode } from "@/lib/reviews/errors";
import { REPLY_TEXT_MAX, REPLY_TEXT_MIN, REVIEW_REPORT_DETAILS_MAX, REVIEW_REPORT_DETAILS_MIN, REVIEW_REPORT_REASONS, type ReviewReportReason } from "@/lib/reviews/rules";

/**
 * The host's two actions under a review of their place (brief 8.1): ONE public reply (final, no
 * contact details) and "report this review" to Bayit (Admin → Reports → "ביקורות"). The host can
 * never edit or delete a review. Shown on /account/reviews and on the host's booking page.
 */
export function HostReviewActions({ reviewId, canReply, reportedAt, hidden }: { reviewId: string; canReply: boolean; reportedAt: string | null; hidden: boolean }) {
  const t = useTranslations("reviews");
  const locale = useLocale();
  const [replying, setReplying] = useState(false);
  const [reporting, setReporting] = useState(false);
  if (hidden) return null;
  return (
    <div className="grid gap-3">
      {replying && canReply ? <ReplyForm reviewId={reviewId} onDone={() => setReplying(false)} /> : null}
      <div className="flex flex-wrap items-center gap-x-4 gap-y-1">
        {canReply && !replying ? (
          <Button type="button" variant="secondary" size="sm" onClick={() => setReplying(true)}>
            <MessageSquareReplyIcon aria-hidden className="rtl:-scale-x-100" />
            {t("reply.open")}
          </Button>
        ) : null}
        {reportedAt ? (
          <p className="flex min-h-11 items-center gap-1.5 text-small text-muted-foreground">
            <FlagIcon aria-hidden className="size-4 shrink-0" />
            {t("report.reported", { date: formatDate(reportedAt, locale, { day: "numeric", month: "long", year: "numeric" }) })}
          </p>
        ) : (
          <button
            type="button"
            onClick={() => setReporting(true)}
            className="inline-flex min-h-11 items-center gap-1.5 rounded-md text-small text-muted-foreground underline-offset-4 outline-none hover:text-destructive hover:underline focus-visible:ring-3 focus-visible:ring-ring/50"
          >
            <FlagIcon aria-hidden className="size-4 shrink-0" />
            {t("report.open")}
          </button>
        )}
      </div>
      {reporting ? <ReportSheet reviewId={reviewId} open={reporting} onOpenChange={setReporting} /> : null}
    </div>
  );
}

function useErrorText() {
  const te = useTranslations("reviews.errors");
  const tc = useTranslations("errors");
  return (code: string) => (isReviewErrorCode(code) ? te(code) : tc(errorMessageKey(code)));
}

function ReplyForm({ reviewId, onDone }: { reviewId: string; onDone: () => void }) {
  const t = useTranslations("reviews.reply");
  const locale = useLocale();
  const router = useRouter();
  const id = useId();
  const errorText = useErrorText();
  const [text, setText] = useState("");
  const [confirmed, setConfirmed] = useState(false);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const field = useRef<HTMLTextAreaElement>(null);
  const length = text.trim().length;

  async function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (pending) return;
    if (length < REPLY_TEXT_MIN) return setError(t("tooShort", { count: REPLY_TEXT_MIN }));
    if (length > REPLY_TEXT_MAX) return setError(t("tooLong", { count: REPLY_TEXT_MAX }));
    if (!confirmed) return setError(t("confirmRequired"));
    setPending(true);
    setError(null);
    try {
      const result = await replyToReview({ reviewId, text, locale, confirmFinal: true });
      if (result.ok) {
        onDone();
        router.refresh();
        return;
      }
      setError(result.error === "too_short" ? t("tooShort", { count: REPLY_TEXT_MIN }) : result.error === "too_long" ? t("tooLong", { count: REPLY_TEXT_MAX }) : errorText(result.error));
      field.current?.focus();
    } catch {
      setError(errorText("network"));
    } finally {
      setPending(false);
    }
  }

  return (
    <form onSubmit={onSubmit} noValidate className="grid gap-3 rounded-card border border-border bg-surface-muted p-3">
      <Label htmlFor={`${id}-reply`} className="text-small font-semibold">
        {t("label")}
      </Label>
      <Textarea
        ref={field}
        id={`${id}-reply`}
        value={text}
        onChange={(e) => setText(e.target.value)}
        rows={4}
        maxLength={REPLY_TEXT_MAX + 100}
        dir={text ? "auto" : undefined}
        placeholder={t("placeholder")}
        aria-invalid={!!error || undefined}
        aria-describedby={`${id}-reply-count${error ? ` ${id}-reply-error` : ""}`}
        className="bg-card text-body"
      />
      <p id={`${id}-reply-count`} className="text-end text-caption text-muted-foreground">
        {t("counter", { count: formatNumber(length, locale), max: formatNumber(REPLY_TEXT_MAX, locale) })}
      </p>
      <p className="flex items-start gap-2 text-small">
        <LockKeyholeIcon className="mt-0.5 size-4.5 shrink-0 text-primary-text" aria-hidden />
        {t("finalNote")}
      </p>
      <div className="flex items-start gap-3">
        <Checkbox id={`${id}-confirm`} checked={confirmed} onCheckedChange={(v) => setConfirmed(v === true)} className="mt-0.5 size-5" />
        <Label htmlFor={`${id}-confirm`} className="text-small leading-snug font-medium">
          {t("confirm")}
        </Label>
      </div>
      {error ? (
        <p id={`${id}-reply-error`} role="alert" className="text-small text-destructive">
          {error}
        </p>
      ) : null}
      <div className="flex flex-wrap gap-2">
        <Button type="submit" size="sm" disabled={pending} aria-busy={pending || undefined}>
          {pending ? t("sending") : t("submit")}
        </Button>
        <Button type="button" variant="ghost" size="sm" onClick={onDone} disabled={pending}>
          {t("cancel")}
        </Button>
      </div>
    </form>
  );
}

function ReportSheet({ reviewId, open, onOpenChange }: { reviewId: string; open: boolean; onOpenChange: (open: boolean) => void }) {
  const t = useTranslations("reviews.report");
  const router = useRouter();
  const id = useId();
  const errorText = useErrorText();
  const [reason, setReason] = useState<ReviewReportReason | "">("");
  const [details, setDetails] = useState("");
  const [pending, setPending] = useState(false);
  const [done, setDone] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (pending) return;
    if (!reason) return setError(t("reasonRequired"));
    if (reason === "OTHER" && details.trim().length < REVIEW_REPORT_DETAILS_MIN) return setError(t("detailsRequired", { count: REVIEW_REPORT_DETAILS_MIN }));
    setPending(true);
    setError(null);
    try {
      const result = await reportReview({ reviewId, reason, details });
      if (result.ok) setDone(true);
      else setError(result.error === "details_required" ? t("detailsRequired", { count: REVIEW_REPORT_DETAILS_MIN }) : errorText(result.error));
    } catch {
      setError(errorText("network"));
    } finally {
      setPending(false);
    }
  }

  function close(next: boolean) {
    if (pending) return;
    onOpenChange(next);
    if (!next && done) router.refresh();
  }

  const formId = `${id}-form`;
  return (
    <BottomSheet
      open={open}
      onOpenChange={close}
      title={done ? t("doneTitle") : t("title")}
      description={done ? undefined : t("intro")}
      footer={
        done ? (
          <Button type="button" variant="secondary" block onClick={() => close(false)}>
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
          <p className="text-body">{t("done")}</p>
        </div>
      ) : (
        <form id={formId} onSubmit={onSubmit} noValidate className="grid gap-5 pb-2">
          <fieldset className="grid gap-2">
            <legend className="mb-2 text-small font-semibold">{t("reasonLabel")}</legend>
            <RadioGroup value={reason} onValueChange={(v) => setReason(v as ReviewReportReason)} className="grid gap-2">
              {REVIEW_REPORT_REASONS.map((key) => (
                <Label
                  key={key}
                  htmlFor={`${id}-${key}`}
                  className="flex min-h-12 cursor-pointer items-center gap-3 rounded-xl border border-border px-3 py-2.5 text-small leading-snug font-normal has-[[data-state=checked]]:border-primary has-[[data-state=checked]]:bg-primary-tint"
                >
                  <RadioGroupItem id={`${id}-${key}`} value={key} />
                  <span>{t(`reasons.${key}`)}</span>
                </Label>
              ))}
            </RadioGroup>
          </fieldset>
          <div className="grid gap-1.5">
            <Label htmlFor={`${id}-details`} className="text-small font-semibold">
              {reason === "OTHER" ? t("detailsLabelRequired") : t("detailsLabel")}
            </Label>
            <Textarea
              id={`${id}-details`}
              value={details}
              onChange={(e) => setDetails(e.target.value)}
              rows={4}
              maxLength={REVIEW_REPORT_DETAILS_MAX}
              dir={details ? "auto" : undefined}
              placeholder={t("detailsPlaceholder")}
              className="text-body"
            />
          </div>
          <p className="rounded-input bg-surface-muted p-3 text-small">{t("note")}</p>
          {error ? (
            <p role="alert" className="rounded-xl bg-destructive/10 p-3 text-small text-destructive">
              {error}
            </p>
          ) : null}
        </form>
      )}
    </BottomSheet>
  );
}
