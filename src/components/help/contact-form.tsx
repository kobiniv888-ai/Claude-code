"use client";

import { ChevronDown, CircleCheck, Send, TriangleAlert } from "lucide-react";
import { useLocale, useTranslations } from "next-intl";
import { useEffect, useId, useRef, useState, useTransition, type FormEvent } from "react";
import { z } from "zod";
import { Ltr } from "@/components/common/ltr";
import { Turnstile, type TurnstileHandle } from "@/components/common/turnstile";
import { inputClass, NO_GROUPING, textareaClass } from "@/components/tickets/form-styles";
import { ShabbatPauseNotice } from "@/components/tickets/shabbat-pause-notice";
import { useTicketErrorMessage } from "@/components/tickets/use-ticket-error";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import type { TicketCategory } from "@/generated/prisma/enums";
import { Link } from "@/i18n/navigation";
import { formatNumber } from "@/lib/format";
import { submitContactForm } from "@/lib/tickets/actions";
import { TICKET_CATEGORIES, TICKET_LIMITS } from "@/lib/tickets/constants";
import { contactFormSchema, fieldErrorKey, firstFieldErrors } from "@/lib/tickets/schemas";
import { cn } from "@/lib/utils";

const FIELD_ORDER = ["name", "email", "category", "message"] as const;

type Sent = { number: number | null; name: string; email: string };

/** The public contact form: no account needed, answered by email. */
export function ContactForm({
  defaultName = "",
  defaultEmail = "",
}: {
  defaultName?: string;
  defaultEmail?: string;
}) {
  const t = useTranslations("contactPage.form");
  const tField = useTranslations("tickets.fieldErrors");
  const tCat = useTranslations("tickets.category");
  const errorMessage = useTicketErrorMessage();
  const locale = useLocale();
  const ids = useId();
  const formRef = useRef<HTMLFormElement>(null);
  const captcha = useRef<TurnstileHandle>(null);

  const [values, setValues] = useState({
    name: defaultName,
    email: defaultEmail,
    category: "" as TicketCategory | "",
    message: "",
    website: "",
  });
  const [token, setToken] = useState<string | null>(null);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [formError, setFormError] = useState<string | null>(null);
  const [shabbat, setShabbat] = useState<{ endsAt: string | null } | null>(null);
  const [sent, setSent] = useState<Sent | null>(null);
  const [pending, startTransition] = useTransition();
  const sentHeading = useRef<HTMLHeadingElement>(null);

  // Bring the confirmation into view and move focus to it (screen readers hear it first).
  useEffect(() => {
    if (!sent) return;
    const heading = sentHeading.current;
    heading?.scrollIntoView({ behavior: "smooth", block: "center" });
    heading?.focus({ preventScroll: true });
  }, [sent]);

  const id = (name: string) => `${ids}-${name}`;
  const set = (name: keyof typeof values, value: string) => {
    setValues((v) => ({ ...v, [name]: value }));
    setErrors((current) => {
      if (!current[name]) return current;
      const next = { ...current };
      delete next[name];
      return next;
    });
  };
  const errorFor = (name: string) => (errors[name] ? tField(fieldErrorKey(errors[name])) : null);
  const describedBy = (name: string, hint?: boolean) =>
    [hint ? id(`${name}-hint`) : "", errors[name] ? id(`${name}-error`) : ""].filter(Boolean).join(" ") || undefined;

  function focusFirst(fieldErrors: Record<string, string>) {
    const first = FIELD_ORDER.find((f) => fieldErrors[f]);
    if (first) formRef.current?.querySelector<HTMLElement>(`[name="${first}"]`)?.focus();
  }

  function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (pending) return;
    setFormError(null);
    setShabbat(null);
    const input = { ...values, category: values.category || undefined, turnstileToken: token, locale };
    const parsed = contactFormSchema.safeParse(input);
    if (!parsed.success) {
      const fieldErrors = firstFieldErrors(z.flattenError(parsed.error).fieldErrors);
      setErrors(fieldErrors);
      focusFirst(fieldErrors);
      return;
    }
    setErrors({});
    startTransition(async () => {
      const result = await submitContactForm(input);
      if (result.ok) {
        setSent({ number: result.data.number, name: parsed.data.name, email: parsed.data.email });
        return;
      }
      captcha.current?.reset();
      if (result.error === "shabbat_mode") {
        setShabbat({ endsAt: "shabbatEndsAt" in result ? (result.shabbatEndsAt ?? null) : null });
        return;
      }
      if (result.error === "invalid_input" && result.fieldErrors) {
        const fieldErrors = firstFieldErrors(result.fieldErrors);
        setErrors(fieldErrors);
        focusFirst(fieldErrors);
      }
      setFormError(errorMessage(result.error));
    });
  }

  if (sent) {
    return (
      <div role="status" className="flex flex-col items-start gap-4 rounded-card border border-verified/30 bg-verified-soft p-6 sm:p-8">
        <span aria-hidden="true" className="flex size-12 items-center justify-center rounded-full bg-card text-verified shadow-card">
          <CircleCheck className="size-6" />
        </span>
        <div>
          <h2 ref={sentHeading} tabIndex={-1} className="text-h2 outline-none">
            {t("sent.title", { name: sent.name.split(/\s+/)[0] ?? "" })}
          </h2>
          <p className="mt-2 text-base text-pretty">
            {t.rich("sent.body", { email: sent.email, ltr: (chunks) => <Ltr className="font-semibold">{chunks}</Ltr> })}
          </p>
          {sent.number ? (
            <p className="mt-2 text-sm text-muted-foreground">{t("sent.number", { number: String(sent.number) })}</p>
          ) : null}
          <p className="mt-2 text-sm text-muted-foreground">{t("sent.spam")}</p>
        </div>
        <div className="flex flex-col gap-2 sm:flex-row">
          <Link
            href="/help"
            className="inline-flex h-11 items-center justify-center rounded-full bg-primary px-5 text-sm font-semibold text-primary-foreground hover:bg-primary/90 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring"
          >
            {t("sent.help")}
          </Link>
          <Button
            type="button"
            variant="outline"
            className="h-11 rounded-full px-5"
            onClick={() => {
              setSent(null);
              setValues((v) => ({ ...v, message: "", category: "", website: "" }));
              captcha.current?.reset();
            }}
          >
            {t("sent.another")}
          </Button>
        </div>
      </div>
    );
  }

  const labelClass = "text-sm font-semibold";
  return (
    <form ref={formRef} onSubmit={onSubmit} noValidate className="relative flex flex-col gap-5">
      <div className="grid gap-5 sm:grid-cols-2">
        <div className="flex flex-col gap-2">
          <label htmlFor={id("name")} className={labelClass}>
            {t("name")}
          </label>
          <Input
            id={id("name")}
            name="name"
            dir={values.name ? "auto" : undefined}
            autoComplete="name"
            value={values.name}
            maxLength={TICKET_LIMITS.nameMax}
            aria-invalid={!!errors.name}
            aria-describedby={describedBy("name")}
            onChange={(e) => set("name", e.target.value)}
            className={inputClass}
          />
          {errorFor("name") ? (
            <p id={id("name-error")} role="alert" className="text-sm text-destructive">
              {errorFor("name")}
            </p>
          ) : null}
        </div>
        <div className="flex flex-col gap-2">
          <label htmlFor={id("email")} className={labelClass}>
            {t("email")}
          </label>
          <Input
            id={id("email")}
            name="email"
            type="email"
            dir="ltr"
            inputMode="email"
            autoComplete="email"
            value={values.email}
            maxLength={254}
            aria-invalid={!!errors.email}
            aria-describedby={describedBy("email", true)}
            onChange={(e) => set("email", e.target.value)}
            className={cn(inputClass, "text-start")}
          />
          <p id={id("email-hint")} className="text-xs text-muted-foreground">
            {t("emailHint")}
          </p>
          {errorFor("email") ? (
            <p id={id("email-error")} role="alert" className="text-sm text-destructive">
              {errorFor("email")}
            </p>
          ) : null}
        </div>
      </div>

      <div className="flex flex-col gap-2">
        <label htmlFor={id("category")} className={labelClass}>
          {t("category")}
        </label>
        <div className="relative">
          <select
            id={id("category")}
            name="category"
            value={values.category}
            aria-invalid={!!errors.category}
            aria-describedby={describedBy("category")}
            onChange={(e) => set("category", e.target.value)}
            className={cn(
              "w-full appearance-none border border-input pe-10 outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50 aria-invalid:border-destructive aria-invalid:ring-3 aria-invalid:ring-destructive/20",
              inputClass,
              !values.category && "text-muted-foreground",
            )}
          >
            <option value="" disabled>
              {t("categoryPlaceholder")}
            </option>
            {TICKET_CATEGORIES.map((c) => (
              <option key={c} value={c} className="text-foreground">
                {tCat(`${c}.label`)}
              </option>
            ))}
          </select>
          <ChevronDown
            aria-hidden="true"
            className="pointer-events-none absolute top-1/2 end-3.5 size-4 -translate-y-1/2 text-muted-foreground"
          />
        </div>
        {errorFor("category") ? (
          <p id={id("category-error")} role="alert" className="text-sm text-destructive">
            {errorFor("category")}
          </p>
        ) : null}
      </div>

      <div className="flex flex-col gap-2">
        <div className="flex items-end justify-between gap-3">
          <label htmlFor={id("message")} className={labelClass}>
            {t("message")}
          </label>
          <span aria-hidden="true" className="text-xs text-muted-foreground">
            {t("counter", {
              current: formatNumber(values.message.trim().length, locale, NO_GROUPING),
              max: formatNumber(TICKET_LIMITS.messageMax, locale, NO_GROUPING),
            })}
          </span>
        </div>
        <Textarea
          id={id("message")}
          name="message"
          dir={values.message ? "auto" : undefined}
          rows={6}
          value={values.message}
          maxLength={TICKET_LIMITS.messageMax}
          placeholder={t("messagePlaceholder")}
          aria-invalid={!!errors.message}
          aria-describedby={describedBy("message")}
          onChange={(e) => set("message", e.target.value)}
          className={textareaClass}
        />
        {errorFor("message") ? (
          <p id={id("message-error")} role="alert" className="text-sm text-destructive">
            {errorFor("message")}
          </p>
        ) : null}
      </div>

      {/* Honeypot — invisible to people and screen readers; bots fill it in. */}
      <div aria-hidden="true" className="absolute -start-[10000px] top-auto size-px overflow-hidden">
        <label htmlFor={id("website")}>{t("honeypot")}</label>
        <input
          id={id("website")}
          name="website"
          type="text"
          tabIndex={-1}
          autoComplete="off"
          value={values.website}
          onChange={(e) => set("website", e.target.value)}
        />
      </div>

      <Turnstile
        ref={captcha}
        action="contact"
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

      <div className="flex flex-col-reverse gap-3 sm:flex-row sm:items-center sm:justify-between">
        <p className="text-xs text-muted-foreground">{t("privacy")}</p>
        <Button type="submit" disabled={pending} className="h-12 rounded-full px-6 text-base font-semibold sm:min-w-40">
          <Send aria-hidden="true" className="size-5 rtl:-scale-x-100" />
          {pending ? t("sending") : t("submit")}
        </Button>
      </div>
    </form>
  );
}
