"use client";

import { useEffect, useId, useRef, useState, type FormEvent, type ReactNode } from "react";
import { useTranslations } from "next-intl";
import { ArrowLeftIcon, LoaderCircleIcon, MessageSquareTextIcon, RotateCcwIcon, TerminalIcon } from "lucide-react";
import { formatPhoneNumberIntl, isValidPhoneNumber, parsePhoneNumber, type Country } from "react-phone-number-input";
import { Ltr } from "@/components/common/ltr";
import { Turnstile, type TurnstileHandle } from "@/components/common/turnstile";
import { PhoneInput } from "@/components/forms/phone-input";
import { Button } from "@/components/ui/button";
import { authClient } from "@/lib/auth/client";
import type { LoginConfig } from "@/lib/auth/config";
import { authErrorKey, type AuthErrorKey } from "@/lib/auth/error-codes";
import { cn } from "@/lib/utils";
import { CodeInput } from "./code-input";
import { formatCountdown, useAuthDevHint, useAuthErrorMessage } from "./use-auth-messages";

/**
 * Phone number → 6-digit code. Used to log in (creates the account on first use) and to add
 * a phone number to a Google/Apple account (`mode="add-phone"`).
 */

const RESEND_AFTER_SECONDS = 60;

type Step = "phone" | "code";

export function PhoneCodeForm({
  mode,
  config,
  onVerified,
  autoFocus,
  initialPhone,
  onStepChange,
}: {
  mode: "sign-in" | "add-phone";
  config: LoginConfig["phone"];
  onVerified: (phoneNumber: string) => void | Promise<void>;
  autoFocus?: boolean;
  initialPhone?: string;
  /** Told when the form moves between the phone number and the 6-digit code. */
  onStepChange?: (step: Step) => void;
}) {
  const t = useTranslations("auth.phone");
  // Signed-in users adding a phone, or no Google/Apple configured: never suggest Google/Apple.
  const errorMessage = useAuthErrorMessage({ phoneOnly: mode === "add-phone" || !config.socialLogin });
  const devHint = useAuthDevHint();
  const formId = useId();
  const codeId = `${formId}-code`;
  const codeHelpId = `${formId}-code-help`;
  const codeErrorId = `${formId}-code-error`;

  const [step, setStepState] = useState<Step>("phone");
  const setStep = (next: Step) => {
    setStepState(next);
    onStepChange?.(next);
  };
  const [phone, setPhone] = useState<string | undefined>(initialPhone);
  const [country, setCountry] = useState<Country | undefined>(config.defaultCountry as Country);
  const [phoneError, setPhoneError] = useState<string | null>(null);
  /** The error key behind phoneError, for the development-only hint. */
  const [phoneErrorKey, setPhoneErrorKey] = useState<AuthErrorKey | null>(null);
  const [code, setCode] = useState("");
  const [codeError, setCodeError] = useState<AuthErrorKey | null>(null);
  const [pending, setPending] = useState<"send" | "verify" | "resend" | null>(null);
  const [resendAt, setResendAt] = useState(0);
  const [now, setNow] = useState(() => Date.now());
  const [notice, setNotice] = useState<string | null>(null);
  const [devCode, setDevCode] = useState<string | null>(null);

  const [captchaToken, setCaptchaToken] = useState<string | null>(null);
  const [captchaFailed, setCaptchaFailed] = useState(false);
  const captcha = useRef<TurnstileHandle>(null);

  // Countdown for "send a new code".
  useEffect(() => {
    if (step !== "code" || resendAt <= Date.now()) return;
    const timer = window.setInterval(() => {
      const current = Date.now();
      setNow(current);
      if (current >= resendAt) window.clearInterval(timer);
    }, 1000);
    return () => window.clearInterval(timer);
  }, [step, resendAt]);

  const secondsLeft = Math.max(0, Math.ceil((resendAt - now) / 1000));

  function validatePhone(value: string | undefined): string | null {
    if (!value) return t("required");
    if (!isValidPhoneNumber(value)) return errorMessage("invalid_phone");
    const numberCountry = parsePhoneNumber(value)?.country ?? country;
    if (!numberCountry || !config.allowedCountries.includes(numberCountry)) {
      return errorMessage("country_not_supported");
    }
    return null;
  }

  async function fetchDevCode(phoneNumber: string) {
    if (!config.devHints) return;
    try {
      const response = await fetch(`/api/dev/last-otp?phone=${encodeURIComponent(phoneNumber)}`, {
        cache: "no-store",
      });
      if (!response.ok) return;
      const data = (await response.json()) as { code?: string | null };
      setDevCode(data.code ?? null);
    } catch {
      setDevCode(null);
    }
  }

  /** Sends a code; returns an error key or null. */
  async function sendCode(phoneNumber: string): Promise<AuthErrorKey | null> {
    const { error } = await authClient.phoneNumber.sendOtp({
      phoneNumber,
      fetchOptions: captchaToken ? { headers: { "x-captcha-response": captchaToken } } : undefined,
    });
    // Turnstile tokens are single-use.
    setCaptchaToken(null);
    captcha.current?.reset();
    return error ? authErrorKey(error) : null;
  }

  async function onSubmitPhone(event: FormEvent) {
    event.preventDefault();
    if (pending) return;
    const problem = validatePhone(phone);
    setPhoneError(problem);
    setPhoneErrorKey(null);
    if (problem || !phone) return;

    setPending("send");
    const error = await sendCode(phone);
    setPending(null);
    if (error) {
      setPhoneError(errorMessage(error));
      setPhoneErrorKey(error);
      return;
    }
    setStep("code");
    setCode("");
    setCodeError(null);
    setNotice(null);
    setDevCode(null);
    setNow(Date.now());
    setResendAt(Date.now() + RESEND_AFTER_SECONDS * 1000);
    void fetchDevCode(phone);
  }

  async function verify(value: string) {
    if (!phone || pending || value.length !== 6) return;
    setPending("verify");
    setCodeError(null);
    setNotice(null);
    const { error } = await authClient.phoneNumber.verify({
      phoneNumber: phone,
      code: value,
      ...(mode === "add-phone" && { updatePhoneNumber: true }),
    });
    if (error) {
      setPending(null);
      const key = authErrorKey(error);
      setCodeError(key);
      setCode("");
      // The code is gone after too many attempts or when it expired: allow a new one now.
      if (key === "too_many_attempts" || key === "code_expired") setResendAt(0);
      return;
    }
    try {
      await onVerified(phone);
    } finally {
      setPending(null);
    }
  }

  async function onSubmitCode(event: FormEvent) {
    event.preventDefault();
    await verify(code);
  }

  async function resend() {
    if (!phone || pending || secondsLeft > 0) return;
    setPending("resend");
    setCodeError(null);
    setNotice(null);
    const error = await sendCode(phone);
    setPending(null);
    if (error) {
      setCodeError(error);
      return;
    }
    setCode("");
    setDevCode(null);
    setNotice(t("resent"));
    setNow(Date.now());
    setResendAt(Date.now() + RESEND_AFTER_SECONDS * 1000);
    void fetchDevCode(phone);
  }

  function changeNumber() {
    setStep("phone");
    setCode("");
    setCodeError(null);
    setNotice(null);
    setDevCode(null);
  }

  const captchaReady = captchaToken !== null;
  const displayPhone = phone ? formatPhoneNumberIntl(phone) || phone : "";
  const ltr = (chunks: ReactNode) => <Ltr className="font-medium text-foreground">{chunks}</Ltr>;

  return (
    <div className="grid gap-4">
      {step === "phone" ? (
        <form onSubmit={onSubmitPhone} noValidate className="grid gap-4">
          <PhoneInput
            label={t("label")}
            description={config.channel === "whatsapp" ? t("hintWhatsapp") : t("hintSms")}
            value={phone}
            onChange={(value) => {
              setPhone(value);
              if (phoneError) setPhoneError(null);
              if (phoneErrorKey) setPhoneErrorKey(null);
            }}
            onCountryChange={setCountry}
            defaultCountry={config.defaultCountry as Country}
            rememberAs="login"
            error={phoneError}
            autoFocus={autoFocus}
            required
            size="lg"
          />
          <DevHint text={devHint(phoneErrorKey)} />
          <Button
            type="submit"
            size="lg"
            className="h-12 w-full rounded-full text-base font-semibold"
            disabled={pending !== null || !captchaReady}
            aria-busy={pending === "send" || undefined}
          >
            {pending === "send" || (!captchaReady && !captchaFailed) ? (
              <LoaderCircleIcon className="size-5 animate-spin" aria-hidden />
            ) : (
              <MessageSquareTextIcon className="size-5" aria-hidden />
            )}
            {pending === "send" ? t("sending") : !captchaReady && !captchaFailed ? t("captchaPending") : t("sendCode")}
          </Button>
        </form>
      ) : (
        <form onSubmit={onSubmitCode} noValidate className="grid gap-4">
          <div className="grid gap-1 text-center">
            <p className="text-base font-semibold" id={`${formId}-code-title`}>
              {t("codeTitle")}
            </p>
            <p id={codeHelpId} className="text-sm text-muted-foreground">
              {config.channel === "whatsapp"
                ? t.rich("codeSentWhatsapp", { phone: displayPhone, ltr })
                : t.rich("codeSentSms", { phone: displayPhone, ltr })}
            </p>
          </div>

          <CodeInput
            id={codeId}
            label={t("codeLabel")}
            value={code}
            onChange={(value) => {
              setCode(value);
              if (codeError) setCodeError(null);
            }}
            onComplete={(value) => void verify(value)}
            disabled={pending === "verify"}
            invalid={!!codeError}
            autoFocus
            describedBy={[codeHelpId, codeError ? codeErrorId : null].filter(Boolean).join(" ")}
          />

          {codeError && (
            <p id={codeErrorId} role="alert" className="text-center text-sm font-medium text-destructive">
              {errorMessage(codeError)}
            </p>
          )}
          <DevHint text={devHint(codeError)} />
          {notice && !codeError && (
            <p role="status" className="text-center text-sm text-success">
              {notice}
            </p>
          )}

          {devCode && (
            <div className="flex items-center gap-2 rounded-lg border border-dashed border-border-strong/50 bg-surface-muted px-3 py-2 text-sm text-foreground">
              <TerminalIcon className="size-4 shrink-0 text-foreground" aria-hidden />
              <span>
                {t.rich("devCode", {
                  code: devCode,
                  value: (chunks) => (
                    <button
                      type="button"
                      className="rounded px-1 font-mono font-semibold tracking-widest underline-offset-2 hover:underline focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
                      onClick={() => {
                        setCode(devCode);
                        void verify(devCode);
                      }}
                      dir="ltr"
                    >
                      {chunks}
                    </button>
                  ),
                })}
              </span>
            </div>
          )}

          <Button
            type="submit"
            size="lg"
            className="h-12 w-full rounded-full text-base font-semibold"
            disabled={pending !== null || code.length !== 6}
            aria-busy={pending === "verify" || undefined}
          >
            {pending === "verify" && <LoaderCircleIcon className="size-5 animate-spin" aria-hidden />}
            {pending === "verify" ? t("verifying") : t("verify")}
          </Button>

          <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-2 text-sm">
            <Button type="button" variant="link" className="h-auto px-0" onClick={changeNumber}>
              <ArrowLeftIcon className="rtl:-scale-x-100" aria-hidden />
              {t("changeNumber")}
            </Button>
            {secondsLeft > 0 ? (
              <span className="text-muted-foreground" aria-live="off">
                {t.rich("resendIn", { time: formatCountdown(secondsLeft), ltr: (c) => <Ltr>{c}</Ltr> })}
              </span>
            ) : (
              <Button
                type="button"
                variant="link"
                className="h-auto px-0"
                onClick={() => void resend()}
                disabled={pending !== null || !captchaReady}
              >
                <RotateCcwIcon className={cn(pending === "resend" && "animate-spin")} aria-hidden />
                {t("resend")}
              </Button>
            )}
          </div>
        </form>
      )}

      <Turnstile
        ref={captcha}
        action="login"
        onToken={(token) => {
          setCaptchaToken(token);
          setCaptchaFailed(false);
        }}
        onExpire={() => setCaptchaToken(null)}
        onError={() => {
          setCaptchaToken(null);
          setCaptchaFailed(true);
        }}
      />
      {captchaFailed && (
        <p role="alert" className="text-center text-sm font-medium text-destructive">
          {errorMessage("captcha_failed")}
        </p>
      )}
    </div>
  );
}

/** Development only: what to fix when sending a code fails (origin, proxy, server, SMS). */
function DevHint({ text }: { text: string | null }) {
  if (!text) return null;
  return (
    <p className="flex items-start gap-2 rounded-lg border border-dashed border-border-strong/50 bg-surface-muted px-3 py-2 text-xs text-foreground">
      <TerminalIcon className="mt-0.5 size-3.5 shrink-0 text-foreground" aria-hidden />
      <span>{text}</span>
    </p>
  );
}
