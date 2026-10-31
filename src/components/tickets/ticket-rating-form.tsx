"use client";

import { Star, TriangleAlert } from "lucide-react";
import { useTranslations } from "next-intl";
import { useId, useState, useTransition, type FormEvent } from "react";
import { toast } from "@/lib/toast";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { useRouter } from "@/i18n/navigation";
import { rateTicket } from "@/lib/tickets/actions";
import { TICKET_LIMITS } from "@/lib/tickets/constants";
import { cn } from "@/lib/utils";
import { useTicketErrorMessage } from "./use-ticket-error";

const STARS = [1, 2, 3, 4, 5] as const;

/** "Was this helpful?" — shown once while a ticket is RESOLVED; rating closes the ticket. */
export function TicketRatingForm({ number }: { number: number }) {
  const t = useTranslations("tickets.rating");
  const errorMessage = useTicketErrorMessage();
  const router = useRouter();
  const id = useId();
  const [rating, setRating] = useState(0);
  const [hover, setHover] = useState(0);
  const [comment, setComment] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const shown = hover || rating;

  function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!rating) {
      setError(t("pickStars"));
      return;
    }
    setError(null);
    startTransition(async () => {
      const result = await rateTicket({ number, rating, comment });
      if (result.ok) {
        toast.success(t("thanks"));
        router.refresh();
        return;
      }
      if (result.error === "already_rated" || result.error === "not_rateable") router.refresh();
      setError(errorMessage(result.error));
    });
  }

  return (
    <form
      onSubmit={onSubmit}
      noValidate
      aria-labelledby={`${id}-title`}
      className="flex flex-col gap-4 rounded-2xl border border-verified/30 bg-verified-soft p-4 shadow-card sm:p-5"
    >
      <div>
        <h2 id={`${id}-title`} className="text-lg font-semibold">
          {t("title")}
        </h2>
        <p className="mt-1 text-sm text-pretty text-muted-foreground">{t("lead")}</p>
      </div>

      <fieldset>
        <legend className="sr-only">{t("legend")}</legend>
        <div className="flex items-center gap-1" onMouseLeave={() => setHover(0)}>
          {STARS.map((value) => (
            <label
              key={value}
              onMouseEnter={() => setHover(value)}
              className="cursor-pointer rounded-lg p-1 has-[:focus-visible]:ring-3 has-[:focus-visible]:ring-ring/50"
            >
              <input
                type="radio"
                name={`${id}-rating`}
                value={value}
                checked={rating === value}
                onChange={() => {
                  setRating(value);
                  setError(null);
                }}
                className="sr-only"
              />
              <span className="sr-only">{t(`stars.${value}`)}</span>
              <Star
                aria-hidden="true"
                className={cn(
                  "size-9 transition-colors",
                  value <= shown ? "fill-warning text-warning" : "fill-transparent text-muted-foreground/60",
                )}
              />
            </label>
          ))}
          <span aria-live="polite" className="ms-2 text-sm font-medium">
            {shown ? t(`stars.${shown}`) : null}
          </span>
        </div>
      </fieldset>

      <div className="flex flex-col gap-2">
        <label htmlFor={`${id}-comment`} className="text-sm font-medium">
          {t("comment")} <span className="font-normal text-muted-foreground">{t("optional")}</span>
        </label>
        <Textarea
          id={`${id}-comment`}
          dir={comment ? "auto" : undefined}
          rows={3}
          value={comment}
          maxLength={TICKET_LIMITS.ratingCommentMax}
          placeholder={t("commentPlaceholder")}
          onChange={(e) => setComment(e.target.value)}
          className="min-h-20 rounded-xl bg-card px-3.5 py-3 text-base md:text-base"
        />
      </div>

      {error ? (
        <p role="alert" className="flex items-center gap-2 text-sm text-destructive">
          <TriangleAlert aria-hidden="true" className="size-4 shrink-0" />
          {error}
        </p>
      ) : null}

      <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
        <p className="text-xs text-muted-foreground">{t("closesNote")}</p>
        <Button type="submit" disabled={pending} className="h-11 rounded-xl px-5 text-base">
          {pending ? t("sending") : t("submit")}
        </Button>
      </div>
    </form>
  );
}
