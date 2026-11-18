"use client";

import { useId, useRef, useState, type FormEvent } from "react";
import { useTranslations } from "next-intl";
import { LoaderCircleIcon, MailIcon } from "lucide-react";
import { Ltr } from "@/components/common/ltr";
import { Turnstile, type TurnstileHandle } from "@/components/common/turnstile";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { authClient } from "@/lib/auth/client";
import { authErrorKey, authFailure, type AuthErrorKey, type AuthFailure } from "@/lib/auth/error-codes";
import { cn } from "@/lib/utils";
import { CodeStep, useResendTimer } from "./code-step";
import { DevHint } from "./phone-code-form";
import { useAuthDevHint, useAuthErrorMessage, useAuthFailureMessage } from "./use-auth-messages";

/**
 * Email → 6-digit code (Better Auth email OTP). Signs in, or creates the account on first use.
 * The code is emailed (Resend); in test mode it is also shown in the form. The waits between codes
 * and the daily caps are the SERVER's (src/lib/auth/code-rules.ts); the form shows them.
 */

const EMAIL_PATTERN = /^[^\s@<>()[\]\\,;:"]+@[^\s@<>()[\]\\,;:"]+\.[^\s@<>()[\]\\,;:"]+$/;

type Step = "email" | "code";

export function EmailCodeForm({
  devHints,
  onVerified,
  autoFocus,
  onStepChange,
}: {
  /** Codes may be shown on screen (development / test mode). */
  devHints: boolean;
  onVerified: () => void | Promise<void>;
  autoFocus?: boolean;
  onStepChange?: (step: Step) => void;
}) {
  const t = useTranslations("auth.email");
  const tCodes = useTranslations("auth.codes");
  const errorMessage = useAuthErrorMessage();
  const failureMessage = useAuthFailureMessage();
  const devHint = useAuthDevHint();
  const id = useId();

  const [step, setStepState] = useState<Step>("email");
  const setStep = (next: Step) => {
    setStepState(next);
    onStepChange?.(next);
  };
  const [email, setEmail] = useState("");
  const [emailError, setEmailError] = useState<string | null>(null);
  const [emailErrorKey, setEmailErrorKey] = useState<AuthErrorKey | null>(null);
  const [code, setCode] = useState("");
  const [codeError, setCodeError] = useState<AuthFailure | null>(null);
  const [pending, setPending] = useState<"send" | "verify" | "resend" | null>(null);
  const timer = useResendTimer();
  const [notice, setNotice] = useState<string | null>(null);
  const [screenCode, setScreenCode] = useState<string | null>(null);

  const [captchaToken, setCaptchaToken] = useState<string | null>(null);
  const [captchaFailed, setCaptchaFailed] = useState(false);
  const captcha = useRef<TurnstileHandle>(null);

  const address = email.trim().toLowerCase();

  async function fetchScreenCode(value: string): Promise<string | null> {
    if (!devHints) return null;
    try {
      const response = await fetch(`/api/dev/last-otp?email=${encodeURIComponent(value)}`, { cache: "no-store" });
      if (!response.ok) return null;
      return ((await response.json()) as { code?: string | null }).code ?? null;
    } catch {
      return null;
    }
  }

  async function sendCode(value: string): Promise<AuthFailure | null> {
    const token = captchaToken;
    setCaptchaToken(null);
    captcha.current?.reset();
    const { error } = await authClient.emailOtp.sendVerificationOtp({
      email: value,
      type: "sign-in",
      fetchOptions: token ? { headers: { "x-captcha-response": token } } : undefined,
    });
    return error ? authFailure(error) : null;
  }

  /** The code step, after a code was sent now or a moment ago. */
  async function showCodeStep(notice: string | null) {
    setStep("code");
    setCode("");
    setCodeError(null);
    setNotice(notice);
    setScreenCode(await fetchScreenCode(address));
  }

  async function onSubmitEmail(event: FormEvent) {
    event.preventDefault();
    if (pending) return;
    const problem = !address ? t("required") : EMAIL_PATTERN.test(address) ? null : errorMessage("invalid_email");
    setEmailError(problem);
    setEmailErrorKey(null);
    if (problem) return;

    setPending("send");
    const error = await sendCode(address);
    setPending(null);
    if (error) {
      // A code went to this address a moment ago (the server's wait): it still works, so ask for it.
      if (error.key === "code_wait" && error.retryAfter) {
        timer.waitFor(error.retryAfter);
        await showCodeStep(tCodes("alreadySent"));
        return;
      }
      setEmailError(failureMessage(error));
      setEmailErrorKey(error.key as AuthErrorKey);
      return;
    }
    timer.restart();
    await showCodeStep(null);
  }

  async function verify(value: string) {
    if (pending || value.length !== 6) return;
    setPending("verify");
    setCodeError(null);
    setNotice(null);
    const { error } = await authClient.signIn.emailOtp({ email: address, otp: value });
    if (error) {
      setPending(null);
      const key = authErrorKey(error);
      setCodeError({ key, retryAfter: null });
      setCode("");
      if (key === "too_many_attempts" || key === "code_expired") timer.allowNow();
      return;
    }
    try {
      await onVerified();
    } finally {
      setPending(null);
    }
  }

  async function resend() {
    if (pending || timer.secondsLeft > 0) return;
    setPending("resend");
    setCodeError(null);
    setNotice(null);
    const error = await sendCode(address);
    setPending(null);
    if (error) {
      // The server's wait: the countdown shows it (no error text needed).
      if (error.key === "code_wait" && error.retryAfter) {
        timer.waitFor(error.retryAfter);
        return;
      }
      setCodeError(error);
      return;
    }
    setCode("");
    setScreenCode(await fetchScreenCode(address));
    setNotice(tCodes("resent"));
    timer.restart();
  }

  const captchaReady = captchaToken !== null;
  const inputId = `${id}-email`;
  const hintId = `${id}-email-hint`;
  const errorId = `${id}-email-error`;

  return (
    <div className="grid gap-4">
      {step === "email" ? (
        <form onSubmit={onSubmitEmail} noValidate className="grid gap-4">
          <div className="grid gap-1.5">
            <label htmlFor={inputId} className="text-sm font-medium">
              {t("label")}
            </label>
            <Input
              id={inputId}
              type="email"
              inputMode="email"
              autoComplete="email"
              dir="ltr"
              spellCheck={false}
              autoCapitalize="none"
              placeholder={t("placeholder")}
              value={email}
              onChange={(event) => {
                setEmail(event.target.value);
                if (emailError) setEmailError(null);
                if (emailErrorKey) setEmailErrorKey(null);
              }}
              autoFocus={autoFocus}
              required
              aria-invalid={!!emailError}
              aria-describedby={emailError ? `${hintId} ${errorId}` : hintId}
              className={cn("h-12 bg-card text-base", emailError && "border-destructive")}
            />
            <p id={hintId} className="text-xs text-muted-foreground">
              {t("hint")}
            </p>
            {emailError && (
              <p id={errorId} role="alert" className="text-sm font-medium text-destructive">
                {emailError}
              </p>
            )}
          </div>
          <DevHint text={devHint(emailErrorKey)} />
          <Button
            type="submit"
            size="lg"
            className="h-12 w-full rounded-button text-base font-semibold"
            disabled={pending !== null || !captchaReady}
            aria-busy={pending === "send" || undefined}
          >
            {pending === "send" || (!captchaReady && !captchaFailed) ? (
              <LoaderCircleIcon className="size-5 animate-spin" aria-hidden />
            ) : (
              <MailIcon className="size-5" aria-hidden />
            )}
            {pending === "send" ? t("sending") : !captchaReady && !captchaFailed ? t("captchaPending") : t("sendCode")}
          </Button>
        </form>
      ) : (
        <CodeStep
          sentText={
            <>
              {t("codeSentTo")}
              <Ltr className="block font-semibold break-all text-foreground">{address}</Ltr>
              <span className="mt-1 block">{t("checkSpam")}</span>
            </>
          }
          code={code}
          onCodeChange={(value) => {
            setCode(value);
            if (codeError) setCodeError(null);
          }}
          onVerify={(value) => void verify(value)}
          verifying={pending === "verify"}
          resending={pending === "resend"}
          error={failureMessage(codeError)}
          extra={<DevHint text={devHint(codeError?.key)} />}
          notice={notice}
          screenCode={screenCode}
          backLabel={t("change")}
          onBack={() => {
            setStep("email");
            setCode("");
            setCodeError(null);
            setNotice(null);
            setScreenCode(null);
          }}
          secondsLeft={timer.secondsLeft}
          onResend={() => void resend()}
          resendDisabled={!captchaReady}
        />
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
