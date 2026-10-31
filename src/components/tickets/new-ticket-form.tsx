"use client";

import { CircleCheck, Link2, Search, Send, ShieldAlert, TriangleAlert } from "lucide-react";
import { useLocale, useTranslations } from "next-intl";
import { useCallback, useId, useRef, useState, useTransition, type FormEvent } from "react";
import { z } from "zod";
import { Ltr } from "@/components/common/ltr";
import { Turnstile, type TurnstileHandle } from "@/components/common/turnstile";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import type { TicketCategory } from "@/generated/prisma/enums";
import { formatNumber } from "@/lib/format";
import { createTicket, lookupTicketListing } from "@/lib/tickets/actions";
import type { TicketAttachment } from "@/lib/tickets/attachments";
import { TICKET_CATEGORIES, TICKET_LIMITS } from "@/lib/tickets/constants";
import { parseListingRef } from "@/lib/tickets/listing-ref";
import { createTicketSchema, fieldErrorKey, firstFieldErrors } from "@/lib/tickets/schemas";
import { cn } from "@/lib/utils";
import { inputClass, NO_GROUPING, textareaClass } from "./form-styles";
import { ScreenshotPicker } from "./screenshot-picker";
import { ShabbatPauseNotice } from "./shabbat-pause-notice";
import { ticketCategoryIcons } from "./ticket-icons";
import { useTicketErrorMessage } from "./use-ticket-error";

type ListingPreview = { publicId: number; title: string | null };
type ListingState =
  | { kind: "idle" }
  | { kind: "checking" }
  | { kind: "found"; listing: ListingPreview }
  | { kind: "error"; code: "listing_invalid" | "listing_not_found" | string };

const FIELD_ORDER = ["category", "subject", "message", "listingRef", "attachments"] as const;

export function NewTicketForm({
  initialCategory,
  initialListingRef = "",
  initialListing = null,
}: {
  initialCategory?: TicketCategory | null;
  initialListingRef?: string;
  initialListing?: ListingPreview | null;
}) {
  const t = useTranslations("tickets.form");
  const tCat = useTranslations("tickets.category");
  const tField = useTranslations("tickets.fieldErrors");
  const errorMessage = useTicketErrorMessage();
  const locale = useLocale();
  const ids = useId();

  const [category, setCategory] = useState<TicketCategory | null>(initialCategory ?? null);
  const [subject, setSubject] = useState("");
  const [message, setMessage] = useState("");
  const [listingRef, setListingRef] = useState(initialListingRef);
  const [listing, setListing] = useState<ListingState>(
    initialListing ? { kind: "found", listing: initialListing } : { kind: "idle" },
  );
  const [attachments, setAttachments] = useState<TicketAttachment[]>([]);
  const [uploading, setUploading] = useState(false);
  const [token, setToken] = useState<string | null>(null);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [formError, setFormError] = useState<string | null>(null);
  const [shabbat, setShabbat] = useState<{ endsAt: string | null } | null>(null);
  const [pending, startTransition] = useTransition();
  const captcha = useRef<TurnstileHandle>(null);
  const formRef = useRef<HTMLFormElement>(null);
  const lookupSeq = useRef(0);

  const fieldId = (name: string) => `${ids}-${name}`;
  const errorText = (name: string) => (errors[name] ? tField(fieldErrorKey(errors[name])) : null);
  const clearError = (name: string) =>
    setErrors((current) => {
      if (!current[name]) return current;
      const next = { ...current };
      delete next[name];
      return next;
    });

  const checkListing = useCallback(
    async (value: string) => {
      const ref = value.trim();
      const seq = ++lookupSeq.current;
      if (!ref) {
        setListing({ kind: "idle" });
        return;
      }
      if (parseListingRef(ref) == null) {
        setListing({ kind: "error", code: "listing_invalid" });
        return;
      }
      setListing({ kind: "checking" });
      const result = await lookupTicketListing(ref, locale);
      if (seq !== lookupSeq.current) return;
      if (result.ok) setListing({ kind: "found", listing: result.data });
      else setListing({ kind: "error", code: result.error });
    },
    [locale],
  );

  function focusFirstError(fieldErrors: Record<string, string>) {
    const first = FIELD_ORDER.find((name) => fieldErrors[name]);
    if (!first) return;
    const el = formRef.current?.querySelector<HTMLElement>(`[data-field="${first}"]`);
    el?.focus();
  }

  function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (pending || uploading) return;
    setFormError(null);
    setShabbat(null);

    const input = {
      category: category ?? undefined,
      subject,
      message,
      listingRef,
      attachments,
      turnstileToken: token,
      locale,
    };
    const parsed = createTicketSchema.safeParse(input);
    const fieldErrors = parsed.success ? {} : firstFieldErrors(z.flattenError(parsed.error).fieldErrors);
    if (listing.kind === "error" && listingRef.trim()) fieldErrors.listingRef = listing.code;
    if (Object.keys(fieldErrors).length) {
      setErrors(fieldErrors);
      focusFirstError(fieldErrors);
      return;
    }
    setErrors({});

    startTransition(async () => {
      const result = await createTicket(input);
      // On success the action redirects to the new ticket.
      if (!result || result.ok) return;
      captcha.current?.reset();
      if (result.error === "shabbat_mode") {
        setShabbat({ endsAt: "shabbatEndsAt" in result ? (result.shabbatEndsAt ?? null) : null });
        return;
      }
      if (result.error === "invalid_input" && result.fieldErrors) {
        const serverErrors = firstFieldErrors(result.fieldErrors);
        setErrors(serverErrors);
        focusFirstError(serverErrors);
        if (serverErrors.listingRef) setListing({ kind: "error", code: serverErrors.listingRef });
      }
      setFormError(errorMessage(result.error));
    });
  }

  const busy = pending || uploading;
  const counter = (value: string, max: number) =>
    t("counter", { current: formatNumber(value.trim().length, locale, NO_GROUPING), max: formatNumber(max, locale, NO_GROUPING) });

  return (
    <form ref={formRef} onSubmit={onSubmit} noValidate className="flex flex-col gap-8">
      {/* Category */}
      <fieldset aria-describedby={errors.category ? fieldId("category-error") : undefined}>
        <legend className="text-base font-semibold">{t("categoryLegend")}</legend>
        <p className="mt-1 text-sm text-muted-foreground">{t("categoryHint")}</p>
        <div className="mt-4 grid grid-cols-1 gap-2.5 min-[420px]:grid-cols-2 lg:grid-cols-3">
          {TICKET_CATEGORIES.map((value, index) => {
            const Icon = ticketCategoryIcons[value];
            const checked = category === value;
            const scam = value === "SCAM_REPORT";
            return (
              <label
                key={value}
                className={cn(
                  "group relative flex cursor-pointer items-start gap-3 rounded-2xl border bg-card p-3.5 shadow-card transition-colors hover:border-primary/40",
                  "has-[:focus-visible]:ring-3 has-[:focus-visible]:ring-ring/50",
                  checked && "border-primary bg-secondary ring-1 ring-primary",
                  scam && !checked && "border-terracotta/40",
                  scam && checked && "border-terracotta bg-accent ring-terracotta",
                )}
              >
                <input
                  type="radio"
                  name="category"
                  value={value}
                  checked={checked}
                  data-field={index === 0 ? "category" : undefined}
                  onChange={() => {
                    setCategory(value);
                    clearError("category");
                  }}
                  className="sr-only"
                />
                <span
                  aria-hidden="true"
                  className={cn(
                    "relative flex size-10 shrink-0 items-center justify-center rounded-xl",
                    scam ? "bg-terracotta text-terracotta-foreground" : "bg-secondary text-primary",
                    checked && !scam && "bg-primary text-primary-foreground",
                  )}
                >
                  <Icon className="size-5" />
                  {checked ? (
                    <CircleCheck className="absolute -end-1.5 -bottom-1.5 size-5 rounded-full bg-card fill-card text-primary" />
                  ) : null}
                </span>
                <span className="min-w-0">
                  <span className="flex flex-wrap items-center gap-x-2 gap-y-1 font-semibold">
                    {tCat(`${value}.label`)}
                    {scam ? (
                      <span className="rounded-full bg-terracotta px-2 py-0.5 text-[0.7rem] font-semibold text-terracotta-foreground">
                        {t("urgentTag")}
                      </span>
                    ) : null}
                  </span>
                  <span className="mt-0.5 block text-sm leading-snug text-muted-foreground">{tCat(`${value}.hint`)}</span>
                </span>
              </label>
            );
          })}
        </div>
        {errorText("category") ? (
          <p id={fieldId("category-error")} role="alert" className="mt-2 text-sm text-destructive">
            {errorText("category")}
          </p>
        ) : null}
      </fieldset>

      {category === "SCAM_REPORT" ? (
        <div className="flex gap-3 rounded-2xl border border-terracotta/40 bg-accent p-4 text-accent-foreground">
          <ShieldAlert aria-hidden="true" className="mt-0.5 size-5 shrink-0 text-terracotta" />
          <div className="text-sm leading-relaxed">
            <p className="font-semibold">{t("scam.title")}</p>
            <ul className="mt-1.5 list-disc space-y-1 ps-5">
              <li>{t("scam.stopPaying")}</li>
              <li>{t("scam.bank")}</li>
              <li>{t("scam.evidence")}</li>
              <li>{t("scam.danger")}</li>
            </ul>
          </div>
        </div>
      ) : null}

      {/* Subject */}
      <div className="flex flex-col gap-2">
        <label htmlFor={fieldId("subject")} className="text-base font-semibold">
          {t("subject")}
        </label>
        <Input
          id={fieldId("subject")}
          data-field="subject"
          dir={subject ? "auto" : undefined}
          value={subject}
          maxLength={TICKET_LIMITS.subjectMax}
          autoComplete="off"
          placeholder={t("subjectPlaceholder")}
          aria-invalid={!!errors.subject}
          aria-describedby={errors.subject ? fieldId("subject-error") : undefined}
          onChange={(e) => {
            setSubject(e.target.value);
            clearError("subject");
          }}
          className={inputClass}
        />
        {errorText("subject") ? (
          <p id={fieldId("subject-error")} role="alert" className="text-sm text-destructive">
            {errorText("subject")}
          </p>
        ) : null}
      </div>

      {/* Message */}
      <div className="flex flex-col gap-2">
        <div className="flex items-end justify-between gap-3">
          <label htmlFor={fieldId("message")} className="text-base font-semibold">
            {t("message")}
          </label>
          <span aria-hidden="true" className="text-xs text-muted-foreground">
            {counter(message, TICKET_LIMITS.messageMax)}
          </span>
        </div>
        <Textarea
          id={fieldId("message")}
          data-field="message"
          dir={message ? "auto" : undefined}
          value={message}
          rows={7}
          maxLength={TICKET_LIMITS.messageMax}
          placeholder={t("messagePlaceholder")}
          aria-invalid={!!errors.message}
          aria-describedby={[fieldId("message-hint"), errors.message ? fieldId("message-error") : ""].join(" ").trim()}
          onChange={(e) => {
            setMessage(e.target.value);
            clearError("message");
          }}
          className={textareaClass}
        />
        <p id={fieldId("message-hint")} className="text-sm text-muted-foreground">
          {t("messageHint")}
        </p>
        {errorText("message") ? (
          <p id={fieldId("message-error")} role="alert" className="text-sm text-destructive">
            {errorText("message")}
          </p>
        ) : null}
      </div>

      {/* Linked listing */}
      <div className="flex flex-col gap-2">
        <label htmlFor={fieldId("listing")} className="text-base font-semibold">
          {t("listing")} <span className="font-normal text-muted-foreground">{t("optional")}</span>
        </label>
        {/* Listing numbers and links are left-to-right, so the whole field is too. */}
        <div className="relative" dir="ltr">
          <Link2
            aria-hidden="true"
            className="pointer-events-none absolute top-1/2 start-3.5 size-4 -translate-y-1/2 text-muted-foreground"
          />
          <Input
            id={fieldId("listing")}
            data-field="listingRef"
            dir="ltr"
            inputMode="url"
            autoComplete="off"
            value={listingRef}
            placeholder={t("listingPlaceholder")}
            aria-invalid={!!errors.listingRef || listing.kind === "error"}
            aria-describedby={`${fieldId("listing-hint")} ${fieldId("listing-status")}`}
            onChange={(e) => {
              setListingRef(e.target.value);
              clearError("listingRef");
              if (listing.kind !== "idle") setListing({ kind: "idle" });
            }}
            onBlur={(e) => void checkListing(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") {
                e.preventDefault();
                void checkListing(e.currentTarget.value);
              }
            }}
            className={cn(inputClass, "ps-10 text-start placeholder:text-start")}
          />
        </div>
        <p id={fieldId("listing-hint")} className="text-sm text-muted-foreground">
          {t("listingHint")}
        </p>
        <div id={fieldId("listing-status")} aria-live="polite">
          {listing.kind === "checking" ? (
            <p className="flex items-center gap-2 text-sm text-muted-foreground">
              <Search aria-hidden="true" className="size-4 animate-pulse" />
              {t("listingChecking")}
            </p>
          ) : null}
          {listing.kind === "found" ? (
            <p className="flex items-start gap-2 rounded-xl border border-verified/30 bg-verified-soft px-3 py-2 text-sm">
              <CircleCheck aria-hidden="true" className="mt-0.5 size-4 shrink-0 text-verified" />
              <span className="min-w-0">
                <span className="font-medium">
                  {t.rich("listingFound", {
                    id: String(listing.listing.publicId),
                    ltr: (chunks) => <Ltr>{chunks}</Ltr>,
                  })}
                </span>
                {listing.listing.title ? (
                  <span dir="auto" className="block truncate text-muted-foreground">
                    {listing.listing.title}
                  </span>
                ) : null}
              </span>
            </p>
          ) : null}
          {listing.kind === "error" ? (
            <p role="alert" className="flex items-center gap-2 text-sm text-destructive">
              <TriangleAlert aria-hidden="true" className="size-4 shrink-0" />
              {listing.code === "listing_invalid" || listing.code === "listing_not_found"
                ? tField(listing.code)
                : errorMessage(listing.code)}
            </p>
          ) : null}
        </div>
      </div>

      {/* Screenshots */}
      <div className="flex flex-col gap-2" data-field="attachments" tabIndex={-1}>
        <p className="text-base font-semibold">
          {t("screenshots")} <span className="font-normal text-muted-foreground">{t("optional")}</span>
        </p>
        <p id={fieldId("shots-hint")} className="text-sm text-muted-foreground">
          {t("screenshotsHint", { max: formatNumber(TICKET_LIMITS.maxAttachments, locale) })}
        </p>
        <ScreenshotPicker
          onChange={setAttachments}
          onBusyChange={setUploading}
          disabled={pending}
          describedBy={fieldId("shots-hint")}
        />
        {errorText("attachments") ? (
          <p role="alert" className="text-sm text-destructive">
            {errorText("attachments")}
          </p>
        ) : null}
      </div>

      <Turnstile
        ref={captcha}
        action="ticket"
        onToken={setToken}
        onExpire={() => setToken(null)}
        onError={() => setToken(null)}
      />

      {shabbat ? <ShabbatPauseNotice endsAt={shabbat.endsAt} compact /> : null}
      {formError ? (
        <p role="alert" className="flex items-start gap-2 rounded-xl border border-destructive/30 bg-destructive/5 p-3 text-sm text-destructive">
          <TriangleAlert aria-hidden="true" className="mt-0.5 size-4 shrink-0" />
          {formError}
        </p>
      ) : null}

      <div className="flex flex-col-reverse gap-3 border-t pt-6 sm:flex-row sm:items-center sm:justify-between">
        <p className="text-sm text-muted-foreground">{t("privacy")}</p>
        <Button type="submit" disabled={busy} className="h-12 rounded-xl px-6 text-base sm:min-w-44">
          <Send aria-hidden="true" className="size-5 rtl:-scale-x-100" />
          {pending ? t("sending") : uploading ? t("waitUploads") : t("submit")}
        </Button>
      </div>
    </form>
  );
}
