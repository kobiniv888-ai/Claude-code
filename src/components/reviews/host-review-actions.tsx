"use client";

import { useEffect, useId, useRef, useState, type FormEvent } from "react";
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
import {
  REPLY_TEXT_MAX,
  REPLY_TEXT_MIN,
  REVIEW_REPORT_DETAILS_MAX,
  REVIEW_REPORT_DETAILS_MIN,
  REVIEW_REPORT_REASONS,
  meaningfulMinimum,
  meetsTextMinimum,
  shortTextReason,
  textLength,
  type ReviewReportReason,
} from "@/lib/reviews/rules";

type Part = "review" | "reply";

/**
 * The host's two actions under a review of their place (brief 8.1): ONE public reply (final, no
 * contact details) and "report this review" to Bayit (Admin → Reports → "ביקורות"). The host can
 * never edit or delete a review. Shown on /account/reviews and on the host's booking page.
 *
 * Focus (keyboard and screen readers): opening the reply puts the focus in its text field;
 * "ביטול" brings it back to "תגובה לביקורת"; after posting, it goes to the actions area (the reply
 * now shows above it); after a report, to the "reported on …" line.
 */
export function HostReviewActions({ reviewId, canReply, reportedAt, hidden }: { reviewId: string; canReply: boolean; reportedAt: string | null; hidden: boolean }) {
  const t = useTranslations("reviews");
  const [replying, setReplying] = useState(false);
  const replyButton = useRef<HTMLButtonElement>(null);
  const area = useRef<HTMLDivElement>(null);
  if (hidden) return null;
  const closeReply = (posted: boolean) => {
    setReplying(false);
    requestAnimationFrame(() => (posted ? area.current : replyButton.current)?.focus());
  };
  return (
    <div ref={area} tabIndex={-1} className="grid gap-3 rounded-md outline-none">
      {replying && canReply ? <ReplyForm reviewId={reviewId} onDone={closeReply} /> : null}
      <div className="flex flex-wrap items-center gap-x-4 gap-y-1">
        {canReply ? (
          // Kept in the page while the form is open (hidden), so "ביטול" can give the focus back.
          <Button ref={replyButton} type="button" variant="secondary" size="sm" hidden={replying} onClick={() => setReplying(true)}>
            <MessageSquareReplyIcon aria-hidden className="rtl:-scale-x-100" />
            {t("reply.open")}
          </Button>
        ) : null}
        <ReviewReport reviewId={reviewId} reportedAt={reportedAt} part="review" />
      </div>
    </div>
  );
}

/**
 * The guest's "report the host's reply" under their own review (/account/reviews), once the host
 * replied: the reply is final too, so a reply that insults the guest or names them goes to Bayit
 * (Admin → Reports → "ביקורות"), and staff can hide the review with it.
 */
export function GuestReplyReport({ reviewId, reportedAt, hidden }: { reviewId: string; reportedAt: string | null; hidden: boolean }) {
  if (hidden) return null;
  return (
    <div className="flex flex-wrap items-center gap-x-4 gap-y-1">
      <ReviewReport reviewId={reviewId} reportedAt={reportedAt} part="reply" />
    </div>
  );
}

/** "Report …" (opens the sheet), or "reported on …" once there is an open report (focused right after reporting). */
function ReviewReport({ reviewId, reportedAt, part }: { reviewId: string; reportedAt: string | null; part: Part }) {
  const t = useTranslations("reviews.report");
  const locale = useLocale();
  const [reporting, setReporting] = useState(false);
  const [justReported, setJustReported] = useState(false);
  const reportedLine = useRef<HTMLParagraphElement>(null);

  useEffect(() => {
    if (justReported && reportedAt) reportedLine.current?.focus();
  }, [justReported, reportedAt]);

  return (
    <>
      {reportedAt ? (
        <p ref={reportedLine} tabIndex={-1} className="flex min-h-11 items-center gap-1.5 rounded-md text-small text-muted-foreground outline-none focus-visible:ring-3 focus-visible:ring-ring/50">
          <FlagIcon aria-hidden className="size-4 shrink-0" />
          {t(part === "reply" ? "replyReported" : "reported", { date: formatDate(reportedAt, locale, { day: "numeric", month: "long", year: "numeric" }) })}
        </p>
      ) : (
        <button
          type="button"
          onClick={() => setReporting(true)}
          className="inline-flex min-h-11 items-center gap-1.5 rounded-md text-small text-muted-foreground underline-offset-4 outline-none hover:text-destructive hover:underline focus-visible:ring-3 focus-visible:ring-ring/50"
        >
          <FlagIcon aria-hidden className="size-4 shrink-0" />
          {t(part === "reply" ? "replyOpen" : "open")}
        </button>
      )}
      {reporting ? <ReportSheet reviewId={reviewId} part={part} open={reporting} onOpenChange={setReporting} onReported={() => setJustReported(true)} /> : null}
    </>
  );
}

function useErrorText() {
  const te = useTranslations("reviews.errors");
  const tc = useTranslations("errors");
  return (code: string) => (isReviewErrorCode(code) ? te(code) : tc(errorMessageKey(code)));
}

function ReplyForm({ reviewId, onDone }: { reviewId: string; onDone: (posted: boolean) => void }) {
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
  const confirmBox = useRef<HTMLButtonElement>(null);
  // By code point, like the server (an emoji is one character).
  const length = textLength(text);

  // The form opens with the focus in its text field.
  useEffect(() => field.current?.focus(), []);

  /** "Too short": too few characters, or enough but too few letters or digits (only dots or emoji). */
  function tooShort(): string {
    return shortTextReason(text, REPLY_TEXT_MIN) === "letters"
      ? t("tooFewLetters", { count: meaningfulMinimum(REPLY_TEXT_MIN) })
      : t("tooShort", { count: REPLY_TEXT_MIN });
  }

  /** Shows the message and moves the focus to what needs fixing. */
  function refuse(message: string, target: "field" | "confirm" = "field") {
    setError(message);
    (target === "confirm" ? confirmBox.current : field.current)?.focus();
  }

  async function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (pending) return;
    if (!meetsTextMinimum(text, REPLY_TEXT_MIN)) return refuse(tooShort());
    if (length > REPLY_TEXT_MAX) return refuse(t("tooLong", { count: REPLY_TEXT_MAX }));
    if (!confirmed) return refuse(t("confirmRequired"), "confirm");
    setPending(true);
    setError(null);
    try {
      const result = await replyToReview({ reviewId, text, locale, confirmFinal: true });
      if (result.ok) {
        onDone(true);
        router.refresh();
        return;
      }
      setError(result.error === "too_short" ? tooShort() : result.error === "too_long" ? t("tooLong", { count: REPLY_TEXT_MAX }) : errorText(result.error));
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
        <Checkbox
          ref={confirmBox}
          id={`${id}-confirm`}
          checked={confirmed}
          onCheckedChange={(v) => setConfirmed(v === true)}
          aria-describedby={error ? `${id}-reply-error` : undefined}
          className="mt-0.5 size-5"
        />
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
        <Button type="button" variant="ghost" size="sm" onClick={() => onDone(false)} disabled={pending}>
          {t("cancel")}
        </Button>
      </div>
    </form>
  );
}

function ReportSheet({
  reviewId,
  part,
  open,
  onOpenChange,
  onReported,
}: {
  reviewId: string;
  part: Part;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onReported: () => void;
}) {
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
      if (result.ok) {
        setDone(true);
        onReported();
      }
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
      title={done ? t("doneTitle") : t(part === "reply" ? "replyTitle" : "title")}
      description={done ? undefined : t(part === "reply" ? "replyIntro" : "intro")}
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
          <p className="text-body">{t(part === "reply" ? "replyDone" : "done")}</p>
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
                  <span>{t(part === "reply" ? `replyReasons.${key}` : `reasons.${key}`)}</span>
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
