"use client";

import { CircleCheck, ShieldAlert, TriangleAlert } from "lucide-react";
import { useLocale, useTranslations } from "next-intl";
import { useEffect, useId, useRef, useState, useTransition, type FormEvent } from "react";
import { z } from "zod";
import { Turnstile, type TurnstileHandle } from "@/components/common/turnstile";
import { inputClass, textareaClass } from "@/components/tickets/form-styles";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Link } from "@/i18n/navigation";
import { errorMessageKey } from "@/lib/errors";
import { createScamReport } from "@/lib/reports/scam-actions";
import { SCAM_DETAILS_MAX, SCAM_FIELD_ERRORS, SCAM_KINDS, SCAM_SITE_MAX, scamReportSchema, type ScamKind } from "@/lib/reports/scam";
import { cn } from "@/lib/utils";

const FIELD_ORDER = ["kind", "site", "details", "name", "email"] as const;

type Props = {
  /** Signed in (with the 2-step code entered): no name or email asked, answered in the account. */
  signedIn: boolean;
  /** The listing the button was on (its number), if any. */
  listing: number | null;
  /** The guest's booking code, from a trip page or a booking email. */
  booking: string | null;
  initialKind: ScamKind;
};

/**
 * "דיווח על הונאה" (SECURITY_REPORT 14.2.c): the form behind the one-tap button. "Scam" is chosen
 * already (the button's reason); what happened, a few words, and for visitors a name and email.
 */
export function ScamReportForm({ signedIn, listing, booking, initialKind }: Props) {
  const t = useTranslations("help.scamReport");
  const te = useTranslations("errors");
  const locale = useLocale();
  const ids = useId();
  const formRef = useRef<HTMLFormElement>(null);
  const captcha = useRef<TurnstileHandle>(null);
  const sentHeading = useRef<HTMLHeadingElement>(null);
  const [values, setValues] = useState({ kind: initialKind as ScamKind, details: "", site: "", name: "", email: "", website: "" });
  const [token, setToken] = useState<string | null>(null);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [formError, setFormError] = useState<string | null>(null);
  const [sent, setSent] = useState<"report" | "ticket" | null>(null);
  const [pending, startTransition] = useTransition();

  useEffect(() => {
    if (!sent) return;
    sentHeading.current?.scrollIntoView({ behavior: "smooth", block: "center" });
    sentHeading.current?.focus({ preventScroll: true });
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
  const fieldText = (code: string | undefined) =>
    code ? ((SCAM_FIELD_ERRORS as readonly string[]).includes(code) ? t(`fieldErrors.${code}`) : t("fieldErrors.invalid")) : null;
  const firstErrors = (fieldErrors: Record<string, string[] | undefined>) =>
    Object.fromEntries(Object.entries(fieldErrors).flatMap(([k, v]) => (v?.[0] ? [[k, v[0]]] : [])));
  const focusFirst = (fieldErrors: Record<string, string>) => {
    const first = FIELD_ORDER.find((f) => fieldErrors[f]);
    if (first) formRef.current?.querySelector<HTMLElement>(`[name="${first}"]`)?.focus();
  };

  function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (pending) return;
    setFormError(null);
    const input = {
      kind: values.kind,
      listing,
      booking,
      details: values.details,
      site: values.kind === "fake_site" ? values.site : null,
      name: signedIn ? null : values.name,
      email: signedIn ? null : values.email,
      website: values.website,
      turnstileToken: token,
      locale,
    };
    const parsed = scamReportSchema.safeParse(input);
    const local: Record<string, string> = parsed.success ? {} : firstErrors(z.flattenError(parsed.error).fieldErrors);
    if (!signedIn && values.name.trim().length < 2) local.name ??= "name_required";
    if (!signedIn && !values.email.trim()) local.email ??= "email_required";
    if (Object.keys(local).length > 0) {
      setErrors(local);
      focusFirst(local);
      return;
    }
    setErrors({});
    startTransition(async () => {
      const result = await createScamReport(input);
      if (result.ok) {
        setSent(result.data.sent);
        return;
      }
      captcha.current?.reset();
      if (result.error === "invalid_input" && result.fieldErrors) {
        const fieldErrors = firstErrors(result.fieldErrors);
        setErrors(fieldErrors);
        focusFirst(fieldErrors);
      }
      setFormError(t.has(`errors.${result.error}`) ? t(`errors.${result.error}` as never) : te(errorMessageKey(result.error)));
    });
  }

  if (sent) {
    return (
      <div role="status" className="flex flex-col items-start gap-4 rounded-card border border-success/30 bg-primary-tint p-6 sm:p-8">
        <span aria-hidden="true" className="flex size-12 items-center justify-center rounded-full bg-card text-success shadow-card">
          <CircleCheck className="size-6" />
        </span>
        <div>
          <h2 ref={sentHeading} tabIndex={-1} className="text-h2 outline-none">
            {t("sent.title")}
          </h2>
          <p className="mt-2 text-base text-pretty">{sent === "report" || signedIn ? t("sent.bodyAccount") : t("sent.bodyEmail")}</p>
          <p className="mt-2 text-sm text-pretty text-muted-foreground">{t("sent.meanwhile")}</p>
        </div>
        <Link
          href="/safety"
          className="inline-flex h-11 items-center justify-center rounded-full bg-primary px-5 text-sm font-semibold text-primary-foreground hover:bg-primary/90 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring"
        >
          {t("sent.safety")}
        </Link>
      </div>
    );
  }

  const labelClass = "text-sm font-semibold";
  const errorLine = (name: string) =>
    errors[name] ? (
      <p id={id(`${name}-error`)} role="alert" className="text-sm text-destructive">
        {fieldText(errors[name])}
      </p>
    ) : null;
  const describedBy = (name: string, hint?: boolean) =>
    [hint ? id(`${name}-hint`) : "", errors[name] ? id(`${name}-error`) : ""].filter(Boolean).join(" ") || undefined;

  return (
    <form ref={formRef} onSubmit={onSubmit} noValidate className="relative flex flex-col gap-5">
      <fieldset className="flex flex-col gap-2" aria-describedby={describedBy("kind")}>
        <legend className={cn(labelClass, "mb-2")}>{t("kindLabel")}</legend>
        <div className="grid gap-2">
          {SCAM_KINDS.map((kind) => (
            <label
              key={kind}
              className="flex min-h-12 cursor-pointer items-start gap-3 rounded-xl border bg-card px-3.5 py-3 has-[:checked]:border-primary has-[:checked]:bg-primary-tint has-[:focus-visible]:ring-3 has-[:focus-visible]:ring-ring/50"
            >
              <input
                type="radio"
                name="kind"
                value={kind}
                checked={values.kind === kind}
                onChange={() => set("kind", kind)}
                className="mt-1 size-4 shrink-0 accent-primary"
              />
              <span className="grid gap-0.5">
                <span className="text-sm font-semibold">{t(`kinds.${kind}.label`)}</span>
                <span className="text-xs text-pretty text-muted-foreground">{t(`kinds.${kind}.hint`)}</span>
              </span>
            </label>
          ))}
        </div>
        {errorLine("kind")}
      </fieldset>

      {values.kind === "fake_site" ? (
        <div className="flex flex-col gap-2">
          <label htmlFor={id("site")} className={labelClass}>
            {t("siteLabel")}
          </label>
          <Input
            id={id("site")}
            name="site"
            dir="ltr"
            inputMode="url"
            autoComplete="off"
            value={values.site}
            maxLength={SCAM_SITE_MAX}
            placeholder={t("sitePlaceholder")}
            aria-invalid={!!errors.site}
            aria-describedby={describedBy("site", true)}
            onChange={(e) => set("site", e.target.value)}
            className={cn(inputClass, "text-start")}
          />
          <p id={id("site-hint")} className="text-xs text-muted-foreground">
            {t("siteHint")}
          </p>
          {errorLine("site")}
        </div>
      ) : null}

      <div className="flex flex-col gap-2">
        <label htmlFor={id("details")} className={labelClass}>
          {t("detailsLabel")}
        </label>
        <Textarea
          id={id("details")}
          name="details"
          dir={values.details ? "auto" : undefined}
          rows={6}
          value={values.details}
          maxLength={SCAM_DETAILS_MAX}
          placeholder={t("detailsPlaceholder")}
          aria-invalid={!!errors.details}
          aria-describedby={describedBy("details", true)}
          onChange={(e) => set("details", e.target.value)}
          className={textareaClass}
        />
        <p id={id("details-hint")} className="text-xs text-pretty text-muted-foreground">
          {t("detailsHint")}
        </p>
        {errorLine("details")}
      </div>

      {signedIn ? null : (
        <div className="grid gap-5 sm:grid-cols-2">
          <div className="flex flex-col gap-2">
            <label htmlFor={id("name")} className={labelClass}>
              {t("nameLabel")}
            </label>
            <Input
              id={id("name")}
              name="name"
              dir={values.name ? "auto" : undefined}
              autoComplete="name"
              value={values.name}
              maxLength={80}
              aria-invalid={!!errors.name}
              aria-describedby={describedBy("name")}
              onChange={(e) => set("name", e.target.value)}
              className={inputClass}
            />
            {errorLine("name")}
          </div>
          <div className="flex flex-col gap-2">
            <label htmlFor={id("email")} className={labelClass}>
              {t("emailLabel")}
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
            {errorLine("email")}
          </div>
        </div>
      )}

      {/* Honeypot — invisible to people and screen readers; bots fill it in. */}
      <div aria-hidden="true" className="absolute -start-[10000px] top-auto size-px overflow-hidden">
        <label htmlFor={id("website")}>{t("honeypot")}</label>
        <input id={id("website")} name="website" type="text" tabIndex={-1} autoComplete="off" value={values.website} onChange={(e) => set("website", e.target.value)} />
      </div>

      <Turnstile ref={captcha} action="report" onToken={setToken} onExpire={() => setToken(null)} onError={() => setToken(null)} />

      {formError ? (
        <p role="alert" className="flex items-start gap-2 rounded-xl border border-destructive/30 bg-destructive/5 p-3 text-sm text-destructive">
          <TriangleAlert aria-hidden="true" className="mt-0.5 size-4 shrink-0" />
          {formError}
        </p>
      ) : null}

      <Button type="submit" disabled={pending} className="h-12 gap-2 self-stretch rounded-full px-6 text-base font-semibold sm:self-end sm:min-w-48">
        <ShieldAlert aria-hidden="true" className="size-5" />
        {pending ? t("sending") : t("submit")}
      </Button>
    </form>
  );
}
