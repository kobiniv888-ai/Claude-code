"use client";

import { useEffect, useId, useRef, useState, type FormEvent } from "react";
import { useLocale, useTranslations } from "next-intl";
import { ChevronDownIcon, CircleCheckBigIcon, LockKeyholeIcon } from "lucide-react";
import { Button, buttonStyles } from "@/components/ds/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Link } from "@/i18n/navigation";
import { errorMessageKey } from "@/lib/errors";
import { formatNumber } from "@/lib/format";
import { createReview } from "@/lib/reviews/actions";
import { isReviewErrorCode } from "@/lib/reviews/errors";
import {
  QUICK_RATING_KEYS,
  REVIEW_TEXT_MAX,
  REVIEW_TEXT_MIN,
  meaningfulMinimum,
  meetsTextMinimum,
  shortTextReason,
  textLength,
  type QuickRatingKey,
} from "@/lib/reviews/rules";
import { cn } from "@/lib/utils";
import { StarPicker } from "./star-picker";

type Field = "rating" | "text" | "confirm" | "form";

/**
 * The review form (brief 8.1): the overall stars (required), six optional quick ratings, the text
 * (20–2000 characters, no phone numbers, emails or links), and "I understand a review is final"
 * before it is posted — a review is never edited or deleted (founder's answer 6). After posting:
 * a thank-you with links to the review on the listing and back to the trip.
 */
export function ReviewForm({
  bookingCode,
  listingPath,
  tripPath,
  initialRating,
}: {
  bookingCode: string;
  /** The listing page (the review shows in its "ביקורות" section). */
  listingPath: string;
  tripPath: string;
  initialRating: number | null;
}) {
  const t = useTranslations("reviews.form");
  const tq = useTranslations("reviews.quick");
  const te = useTranslations("reviews.errors");
  const tc = useTranslations("errors");
  const locale = useLocale();
  const id = useId();
  const [rating, setRating] = useState<number | null>(initialRating);
  const [quick, setQuick] = useState<Partial<Record<QuickRatingKey, number>>>({});
  const [text, setText] = useState("");
  const [confirmed, setConfirmed] = useState(false);
  const [pending, setPending] = useState(false);
  const [done, setDone] = useState(false);
  const [error, setError] = useState<{ field: Field; text: string } | null>(null);
  const ratingRef = useRef<HTMLInputElement>(null);
  const textRef = useRef<HTMLTextAreaElement>(null);
  const confirmRef = useRef<HTMLButtonElement>(null);
  const doneRef = useRef<HTMLHeadingElement>(null);
  // By code point, like the server (an emoji is one character).
  const length = textLength(text);

  useEffect(() => {
    if (done) doneRef.current?.focus();
  }, [done]);

  function show(field: Field, message: string) {
    setError({ field, text: message });
    const target = field === "rating" ? ratingRef : field === "text" ? textRef : field === "confirm" ? confirmRef : null;
    if (target) requestAnimationFrame(() => target.current?.focus());
  }

  function errorText(code: string): string {
    if (code === "too_short") {
      // Enough characters but mostly dots, "!" or emoji: say what is missing (letters or digits).
      return shortTextReason(text, REVIEW_TEXT_MIN) === "letters"
        ? t("textTooFewLetters", { count: meaningfulMinimum(REVIEW_TEXT_MIN) })
        : t("textTooShort", { count: REVIEW_TEXT_MIN });
    }
    if (code === "too_long") return t("textTooLong", { count: REVIEW_TEXT_MAX });
    if (isReviewErrorCode(code)) return te(code);
    return tc(errorMessageKey(code));
  }

  async function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (pending) return;
    if (!rating) return show("rating", t("ratingRequired"));
    if (!meetsTextMinimum(text, REVIEW_TEXT_MIN)) return show("text", errorText("too_short"));
    if (length > REVIEW_TEXT_MAX) return show("text", errorText("too_long"));
    if (!confirmed) return show("confirm", t("confirmRequired"));
    setPending(true);
    setError(null);
    try {
      const result = await createReview({ bookingCode, rating, ...quick, text, locale, confirmFinal: true });
      if (result.ok) {
        setDone(true);
        return;
      }
      const field: Field = ["too_short", "too_long", "contact_in_text"].includes(result.error) ? "text" : "form";
      show(field, errorText(result.error));
    } catch {
      show("form", tc("network"));
    } finally {
      setPending(false);
    }
  }

  if (done) {
    return (
      <div role="status" className="grid justify-items-center gap-3 rounded-card border border-border bg-card p-6 text-center">
        <CircleCheckBigIcon className="size-12 text-success" aria-hidden />
        <h2 ref={doneRef} tabIndex={-1} className="text-h2 outline-none">
          {t("doneTitle")}
        </h2>
        <p className="max-w-prose text-body text-muted-foreground">{t("doneBody")}</p>
        <div className="flex flex-wrap justify-center gap-2">
          <Link href={`${listingPath}#reviews`} className={buttonStyles({ variant: "primary", size: "sm" })}>
            {t("viewListing")}
          </Link>
          <Link href={tripPath} className={buttonStyles({ variant: "secondary" })}>
            {t("backToTrip")}
          </Link>
        </div>
      </div>
    );
  }

  const starName = (n: number) => t("starOption", { count: n, name: t(`ratingNames.${n}` as "ratingNames.1") });
  return (
    <form className="grid gap-6" onSubmit={onSubmit} noValidate>
      <StarPicker
        name={`${id}-rating`}
        value={rating}
        onChange={(n) => {
          setRating(n);
          if (error?.field === "rating") setError(null);
        }}
        firstRef={ratingRef}
        invalid={error?.field === "rating"}
        describedBy={error?.field === "rating" ? `${id}-rating-error` : undefined}
        starLabel={starName}
        legend={
          <legend className="mb-1 flex flex-wrap items-baseline gap-x-2 text-body font-semibold">
            {t("ratingLabel")}
            {rating ? <span className="text-small font-normal text-muted-foreground">{t(`ratingNames.${rating}` as "ratingNames.1")}</span> : null}
          </legend>
        }
      />
      {error?.field === "rating" ? (
        <p id={`${id}-rating-error`} role="alert" className="-mt-4 text-small text-destructive">
          {error.text}
        </p>
      ) : null}

      <div className="grid gap-1.5">
        <Label htmlFor={`${id}-text`} className="text-body font-semibold">
          {t("textLabel")}
        </Label>
        <p id={`${id}-text-hint`} className="text-small text-muted-foreground">
          {t("textHint", { count: REVIEW_TEXT_MIN })}
        </p>
        <Textarea
          ref={textRef}
          id={`${id}-text`}
          value={text}
          onChange={(e) => {
            setText(e.target.value);
            if (error?.field === "text") setError(null);
          }}
          rows={7}
          maxLength={REVIEW_TEXT_MAX + 200}
          dir={text ? "auto" : undefined}
          placeholder={t("placeholder")}
          aria-invalid={error?.field === "text" || undefined}
          aria-describedby={`${id}-text-hint ${id}-text-count${error?.field === "text" ? ` ${id}-text-error` : ""}`}
          className="min-h-40 text-body"
        />
        <p id={`${id}-text-count`} className={cn("text-end text-caption", length > REVIEW_TEXT_MAX ? "text-destructive" : "text-muted-foreground")}>
          {t("counter", { count: formatNumber(length, locale), max: formatNumber(REVIEW_TEXT_MAX, locale) })}
        </p>
        {error?.field === "text" ? (
          <p id={`${id}-text-error`} role="alert" className="text-small text-destructive">
            {error.text}
          </p>
        ) : null}
      </div>

      <details className="group rounded-card border border-border bg-card" open={Object.keys(quick).length > 0 || undefined}>
        <summary className="flex min-h-12 cursor-pointer list-none items-center justify-between gap-3 rounded-card px-4 py-3 text-body font-semibold outline-none focus-visible:ring-3 focus-visible:ring-ring/50 [&::-webkit-details-marker]:hidden">
          <span className="min-w-0">{t("quickTitle")}</span>
          <span className="flex shrink-0 items-center gap-1.5 text-small font-normal text-muted-foreground">
            {t("optional")}
            <ChevronDownIcon aria-hidden className="size-4.5 transition-transform group-open:rotate-180" />
          </span>
        </summary>
        <div className="grid gap-4 border-t border-border p-4">
          {QUICK_RATING_KEYS.map((key) => (
            <div key={key} className="flex flex-wrap items-center justify-between gap-x-4 gap-y-1">
              <StarPicker
                name={`${id}-${key}`}
                size="md"
                value={quick[key] ?? null}
                onChange={(n) => setQuick((q) => ({ ...q, [key]: n }))}
                starLabel={(n) => `${tq(key)}: ${t("starOption", { count: n, name: t(`ratingNames.${n}` as "ratingNames.1") })}`}
                legend={<legend className="text-small font-medium">{tq(key)}</legend>}
                className="min-w-0"
              />
              {quick[key] ? (
                <button
                  type="button"
                  onClick={() =>
                    setQuick((q) => {
                      const next = { ...q };
                      delete next[key];
                      return next;
                    })
                  }
                  className="min-h-11 rounded-md px-2 text-small text-muted-foreground underline underline-offset-4 outline-none focus-visible:ring-3 focus-visible:ring-ring/50"
                  aria-label={t("clearOne", { name: tq(key) })}
                >
                  {t("clear")}
                </button>
              ) : null}
            </div>
          ))}
        </div>
      </details>

      <div className="grid gap-3 rounded-card bg-surface-muted p-4">
        <p className="flex items-start gap-2 text-small">
          <LockKeyholeIcon className="mt-0.5 size-4.5 shrink-0 text-primary-text" aria-hidden />
          <span>
            <span className="font-semibold">{t("finalTitle")}</span> {t("finalBody")}
          </span>
        </p>
        <div className="flex items-start gap-3">
          <Checkbox
            ref={confirmRef}
            id={`${id}-confirm`}
            checked={confirmed}
            onCheckedChange={(value) => {
              setConfirmed(value === true);
              if (error?.field === "confirm") setError(null);
            }}
            aria-invalid={error?.field === "confirm" || undefined}
            aria-describedby={error?.field === "confirm" ? `${id}-confirm-error` : undefined}
            className="mt-0.5 size-5"
          />
          <Label htmlFor={`${id}-confirm`} className="text-small leading-snug font-medium">
            {t("confirm")}
          </Label>
        </div>
        {error?.field === "confirm" ? (
          <p id={`${id}-confirm-error`} role="alert" className="text-small text-destructive">
            {error.text}
          </p>
        ) : null}
      </div>

      {error?.field === "form" ? (
        <p role="alert" className="rounded-xl bg-destructive/10 p-3 text-small text-destructive">
          {error.text}
        </p>
      ) : null}

      <Button type="submit" block disabled={pending} aria-busy={pending || undefined} className="sm:w-auto sm:justify-self-start">
        {pending ? t("sending") : t("submit")}
      </Button>
    </form>
  );
}
