"use client";

import { Send, TriangleAlert } from "lucide-react";
import { useLocale, useTranslations } from "next-intl";
import { useId, useState, useTransition, type FormEvent } from "react";
import { toast } from "sonner";
import { z } from "zod";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import type { TicketStatus } from "@/generated/prisma/enums";
import { useRouter } from "@/i18n/navigation";
import { formatNumber } from "@/lib/format";
import { replyToTicket } from "@/lib/tickets/actions";
import type { TicketAttachment } from "@/lib/tickets/attachments";
import { TICKET_LIMITS } from "@/lib/tickets/constants";
import { fieldErrorKey, firstFieldErrors, replySchema } from "@/lib/tickets/schemas";
import { cn } from "@/lib/utils";
import { NO_GROUPING, textareaClass } from "./form-styles";
import { ScreenshotPicker } from "./screenshot-picker";
import { ShabbatPauseNotice } from "./shabbat-pause-notice";
import { useTicketErrorMessage } from "./use-ticket-error";

/** The user's answer box on their ticket page. Replying reopens a waiting or resolved ticket. */
export function TicketReplyForm({ number, status }: { number: number; status: TicketStatus }) {
  const t = useTranslations("tickets.reply");
  const tField = useTranslations("tickets.fieldErrors");
  const errorMessage = useTicketErrorMessage();
  const locale = useLocale();
  const router = useRouter();
  const id = useId();

  const [message, setMessage] = useState("");
  const [attachments, setAttachments] = useState<TicketAttachment[]>([]);
  const [uploading, setUploading] = useState(false);
  const [clearSignal, setClearSignal] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const [fieldError, setFieldError] = useState<string | null>(null);
  const [shabbat, setShabbat] = useState<{ endsAt: string | null } | null>(null);
  const [pending, startTransition] = useTransition();

  function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (pending || uploading) return;
    setError(null);
    setShabbat(null);
    const input = { number, message, attachments };
    const parsed = replySchema.safeParse(input);
    if (!parsed.success) {
      const errors = firstFieldErrors(z.flattenError(parsed.error).fieldErrors);
      setFieldError(errors.message ?? errors.attachments ?? "invalid");
      document.getElementById(`${id}-message`)?.focus();
      return;
    }
    setFieldError(null);

    startTransition(async () => {
      const result = await replyToTicket(input);
      if (result.ok) {
        setMessage("");
        setAttachments([]);
        setClearSignal((n) => n + 1);
        toast.success(t("sent"));
        router.refresh();
        return;
      }
      if (result.error === "shabbat_mode") {
        setShabbat({ endsAt: "shabbatEndsAt" in result ? (result.shabbatEndsAt ?? null) : null });
        return;
      }
      if (result.error === "ticket_closed") router.refresh();
      setError(errorMessage(result.error));
    });
  }

  const reopens = status === "WAITING_FOR_USER" || status === "RESOLVED";

  return (
    <form
      onSubmit={onSubmit}
      noValidate
      aria-labelledby={`${id}-title`}
      className="flex flex-col gap-4 rounded-2xl border bg-card p-4 shadow-card sm:p-5"
    >
      <div>
        <h2 id={`${id}-title`} className="text-lg font-semibold">
          {status === "WAITING_FOR_USER" ? t("titleWaiting") : t("title")}
        </h2>
        {reopens ? <p className="mt-1 text-sm text-muted-foreground">{t("reopenHint")}</p> : null}
      </div>
      <div className="flex flex-col gap-2">
        <div className="flex items-end justify-between gap-3">
          <label htmlFor={`${id}-message`} className="text-sm font-medium">
            {t("label")}
          </label>
          <span aria-hidden="true" className="text-xs text-muted-foreground">
            {t("counter", {
              current: formatNumber(message.trim().length, locale, NO_GROUPING),
              max: formatNumber(TICKET_LIMITS.messageMax, locale, NO_GROUPING),
            })}
          </span>
        </div>
        <Textarea
          id={`${id}-message`}
          dir={message ? "auto" : undefined}
          value={message}
          rows={4}
          maxLength={TICKET_LIMITS.messageMax}
          placeholder={t("placeholder")}
          aria-invalid={!!fieldError}
          aria-describedby={fieldError ? `${id}-error` : undefined}
          onChange={(e) => {
            setMessage(e.target.value);
            setFieldError(null);
          }}
          className={cn(textareaClass, "min-h-28")}
        />
        {fieldError ? (
          <p id={`${id}-error`} role="alert" className="text-sm text-destructive">
            {tField(fieldErrorKey(fieldError))}
          </p>
        ) : null}
      </div>

      <ScreenshotPicker
        onChange={setAttachments}
        onBusyChange={setUploading}
        disabled={pending}
        clearSignal={clearSignal}
      />

      {shabbat ? <ShabbatPauseNotice endsAt={shabbat.endsAt} compact /> : null}
      {error ? (
        <p role="alert" className="flex items-start gap-2 rounded-xl border border-destructive/30 bg-destructive/5 p-3 text-sm text-destructive">
          <TriangleAlert aria-hidden="true" className="mt-0.5 size-4 shrink-0" />
          {error}
        </p>
      ) : null}

      <div className="flex justify-end">
        <Button type="submit" disabled={pending || uploading} className="h-11 w-full rounded-xl px-5 text-base sm:w-auto">
          <Send aria-hidden="true" className="size-5 rtl:-scale-x-100" />
          {pending ? t("sending") : uploading ? t("waitUploads") : t("submit")}
        </Button>
      </div>
    </form>
  );
}
