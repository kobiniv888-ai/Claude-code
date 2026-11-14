"use client";

import { useEffect, useId, useRef, useState, type FormEvent } from "react";
import { useTranslations } from "next-intl";
import { LoaderCircleIcon, MailIcon } from "lucide-react";
import { Ltr } from "@/components/common/ltr";
import { Turnstile, type TurnstileHandle } from "@/components/common/turnstile";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { confirmAccountEmail, sendAccountEmailCode } from "@/lib/auth/account-email-actions";

/**
 * "Add your email" (founder's answer (5)): a phone-only account adds a real email, verified by a
 * 6-digit code, before it continues (the login panel shows this right after sign-in). The server
 * decides everything (src/lib/auth/account-email-actions.ts); this is the form.
 */
export function AccountEmailStep({ onDone }: { onDone: () => void | Promise<void> }) {
  const t = useTranslations("auth.accountEmail");
  const te = useTranslations("auth.errors");
  const id = useId();
  const captcha = useRef<TurnstileHandle>(null);
  const [captchaToken, setCaptchaToken] = useState<string | null>(null);
  const [email, setEmail] = useState("");
  const [sentTo, setSentTo] = useState<string | null>(null);
  const [code, setCode] = useState("");
  const [pending, setPending] = useState<"send" | "confirm" | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [wait, setWait] = useState(0);

  useEffect(() => {
    if (wait <= 0) return;
    const timer = setTimeout(() => setWait((s) => Math.max(0, s - 1)), 1000);
    return () => clearTimeout(timer);
  }, [wait]);

  const message = (code: string) => {
    const base = code.split(":")[0] ?? code;
    if (t.has(`errors.${base}`)) return t(`errors.${base}`);
    return te.has(base) ? te(base) : te("unknown");
  };

  async function send(event?: FormEvent) {
    event?.preventDefault();
    setPending("send");
    setError(null);
    const result = await sendAccountEmailCode({ email, captchaToken });
    captcha.current?.reset();
    setCaptchaToken(null);
    setPending(null);
    if (!result.ok) return setError(message(result.error));
    setSentTo(result.data.sentTo || email.trim().toLowerCase());
    setWait(result.data.retryAfterSeconds ?? 60);
  }

  async function confirm(event: FormEvent) {
    event.preventDefault();
    if (!sentTo) return;
    setPending("confirm");
    setError(null);
    const result = await confirmAccountEmail({ email: sentTo, code });
    setPending(null);
    if (!result.ok) return setError(message(result.error));
    await onDone();
  }

  return (
    <div className="grid gap-4">
      <div className="grid gap-1 text-center">
        <MailIcon className="mx-auto size-8 text-primary" aria-hidden />
        <p className="text-h3">{t("title")}</p>
        <p className="text-sm text-pretty text-muted-foreground">{t("lead")}</p>
      </div>
      {sentTo === null ? (
        <form onSubmit={send} className="grid gap-3">
          <label htmlFor={`${id}-email`} className="text-sm font-medium">
            {t("emailLabel")}
          </label>
          <Input
            id={`${id}-email`}
            type="email"
            inputMode="email"
            autoComplete="email"
            dir="ltr"
            required
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            aria-invalid={error ? true : undefined}
            aria-describedby={error ? `${id}-error` : undefined}
          />
          <Button type="submit" disabled={pending !== null || email.trim() === ""}>
            {pending === "send" ? <LoaderCircleIcon className="size-4 animate-spin" aria-hidden /> : null}
            {t("send")}
          </Button>
        </form>
      ) : (
        <form onSubmit={confirm} className="grid gap-3">
          <p className="text-sm">{t.rich("codeLead", { email: () => <Ltr>{sentTo}</Ltr> })}</p>
          <label htmlFor={`${id}-code`} className="text-sm font-medium">
            {t("codeLabel")}
          </label>
          <Input
            id={`${id}-code`}
            inputMode="numeric"
            autoComplete="one-time-code"
            dir="ltr"
            maxLength={6}
            pattern="\d{6}"
            required
            value={code}
            onChange={(e) => setCode(e.target.value.replace(/\D/g, "").slice(0, 6))}
            aria-invalid={error ? true : undefined}
            aria-describedby={error ? `${id}-error` : undefined}
          />
          <Button type="submit" disabled={pending !== null || code.length !== 6}>
            {pending === "confirm" ? <LoaderCircleIcon className="size-4 animate-spin" aria-hidden /> : null}
            {t("confirm")}
          </Button>
          <div className="flex flex-wrap justify-between gap-2">
            <Button type="button" variant="link" className="h-auto px-0" onClick={() => (setSentTo(null), setCode(""), setError(null))}>
              {t("change")}
            </Button>
            <Button type="button" variant="link" className="h-auto px-0" disabled={wait > 0 || pending !== null} onClick={() => void send()}>
              {wait > 0 ? t("resendIn", { seconds: wait }) : t("resend")}
            </Button>
          </div>
        </form>
      )}
      {error ? (
        <p id={`${id}-error`} role="alert" className="text-center text-sm font-medium text-destructive">
          {error}
        </p>
      ) : null}
      <Turnstile ref={captcha} action="contact_email" onToken={setCaptchaToken} onExpire={() => setCaptchaToken(null)} />
    </div>
  );
}
