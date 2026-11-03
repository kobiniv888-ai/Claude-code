"use client";

import { useRef, useState, type FormEvent, type ReactNode } from "react";
import { useTranslations } from "next-intl";
import { LoaderCircleIcon, MessageSquareTextIcon, TerminalIcon } from "lucide-react";
import { formatPhoneNumberIntl, isValidPhoneNumber, parsePhoneNumber, type Country } from "react-phone-number-input/input";
import { Ltr } from "@/components/common/ltr";
import { Turnstile, type TurnstileHandle } from "@/components/common/turnstile";
import { PhoneInput } from "@/components/forms/phone-input";
import { Button } from "@/components/ui/button";
import { authClient } from "@/lib/auth/client";
import type { LoginConfig } from "@/lib/auth/config";
import { authErrorKey, type AuthErrorKey } from "@/lib/auth/error-codes";
import { confirmPhoneCheckCode, sendPhoneCheckCode } from "@/lib/auth/phone-check-actions";
import { CodeStep, useResendTimer } from "./code-step";
import { useAuthDevHint, useAuthErrorMessage } from "./use-auth-messages";

/**
 * Phone number → 6-digit code.
 * - `purpose="sign-in"`: the phone LOGIN (development / test mode only; creates the account on
 *   first use) through the Better Auth API.
 * - `purpose="check"`: a signed-in account verifies a number (booking, posting) through the server
 *   actions in @/lib/auth/phone-check-actions — once per number: a number the account already has
 *   verified is accepted without a code. Use <PhoneCheck> rather than this directly.
 */

type Step = "phone" | "code";

export function PhoneCodeForm({
  purpose,
  config,
  onVerified,
  autoFocus,
  initialPhone,
  onStepChange,
}: {
  purpose: "sign-in" | "check";
  config: LoginConfig["phone"];
  onVerified: (phoneNumber: string) => void | Promise<void>;
  autoFocus?: boolean;
  initialPhone?: string;
  /** Told when the form moves between the phone number and the 6-digit code. */
  onStepChange?: (step: Step) => void;
}) {
  const t = useTranslations("auth.phone");
  const tCodes = useTranslations("auth.codes");
  // Phone checks happen while signed in: never suggest other ways to log in there.
  const errorMessage = useAuthErrorMessage({ phoneOnly: purpose === "check" });
  const devHint = useAuthDevHint();

  const [step, setStepState] = useState<Step>("phone");
  const setStep = (next: Step) => {
    setStepState(next);
    onStepChange?.(next);
  };
  const [phone, setPhone] = useState<string | undefined>(initialPhone);
  const [country, setCountry] = useState<Country | undefined>(config.defaultCountry as Country);
  const [phoneError, setPhoneError] = useState<string | null>(null);
  /** The error key behind phoneError, for the development-only hint. */
  const [phoneErrorKey, setPhoneErrorKey] = useState<AuthErrorKey | string | null>(null);
  const [code, setCode] = useState("");
  const [codeError, setCodeError] = useState<AuthErrorKey | string | null>(null);
  const [pending, setPending] = useState<"send" | "verify" | "resend" | null>(null);
  const timer = useResendTimer();
  const [notice, setNotice] = useState<string | null>(null);
  const [screenCode, setScreenCode] = useState<string | null>(null);

  const [captchaToken, setCaptchaToken] = useState<string | null>(null);
  const [captchaFailed, setCaptchaFailed] = useState(false);
  const captcha = useRef<TurnstileHandle>(null);

  function validatePhone(value: string | undefined): string | null {
    if (!value) return t("required");
    if (!isValidPhoneNumber(value)) return errorMessage("invalid_phone");
    const numberCountry = parsePhoneNumber(value)?.country ?? country;
    if (!numberCountry || !config.allowedCountries.includes(numberCountry)) {
      return errorMessage("country_not_supported");
    }
    return null;
  }

  async function fetchScreenCode(phoneNumber: string): Promise<string | null> {
    if (!config.devHints) return null;
    try {
      const response = await fetch(`/api/dev/last-otp?phone=${encodeURIComponent(phoneNumber)}`, { cache: "no-store" });
      if (!response.ok) return null;
      const data = (await response.json()) as { code?: string | null };
      return data.code ?? null;
    } catch {
      return null;
    }
  }

  type Sent = { error: AuthErrorKey | string } | { alreadyVerified: true } | { screenCode: string | null };

  /** Sends a code (or, for a number this account already verified, nothing). */
  async function sendCode(phoneNumber: string): Promise<Sent> {
    const token = captchaToken;
    // Turnstile tokens are single-use.
    setCaptchaToken(null);
    captcha.current?.reset();
    if (purpose === "check") {
      const result = await sendPhoneCheckCode({ phoneNumber, captchaToken: token }).catch(() => null);
      if (!result) return { error: "network" };
      if (!result.ok) return { error: result.error };
      if (result.data.status === "already_verified") return { alreadyVerified: true };
      return { screenCode: result.data.screenCode };
    }
    const { error } = await authClient.phoneNumber.sendOtp({
      phoneNumber,
      fetchOptions: token ? { headers: { "x-captcha-response": token } } : undefined,
    });
    if (error) return { error: authErrorKey(error) };
    return { screenCode: await fetchScreenCode(phoneNumber) };
  }

  async function checkCode(phoneNumber: string, value: string): Promise<AuthErrorKey | string | null> {
    if (purpose === "check") {
      const result = await confirmPhoneCheckCode({ phoneNumber, code: value }).catch(() => null);
      if (!result) return "network";
      return result.ok ? null : result.error;
    }
    const { error } = await authClient.phoneNumber.verify({ phoneNumber, code: value });
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
    const sent = await sendCode(phone);
    if ("error" in sent) {
      setPending(null);
      setPhoneError(errorMessage(sent.error));
      setPhoneErrorKey(sent.error);
      return;
    }
    if ("alreadyVerified" in sent) {
      try {
        await onVerified(phone);
      } finally {
        setPending(null);
      }
      return;
    }
    setPending(null);
    setStep("code");
    setCode("");
    setCodeError(null);
    setNotice(null);
    setScreenCode(sent.screenCode);
    timer.restart();
  }

  async function verify(value: string) {
    if (!phone || pending || value.length !== 6) return;
    setPending("verify");
    setCodeError(null);
    setNotice(null);
    const error = await checkCode(phone, value);
    if (error) {
      setPending(null);
      setCodeError(error);
      setCode("");
      if (error === "too_many_attempts" || error === "code_expired") timer.allowNow();
      return;
    }
    try {
      await onVerified(phone);
    } finally {
      setPending(null);
    }
  }

  async function resend() {
    if (!phone || pending || timer.secondsLeft > 0) return;
    setPending("resend");
    setCodeError(null);
    setNotice(null);
    const sent = await sendCode(phone);
    setPending(null);
    if ("error" in sent) {
      setCodeError(sent.error);
      return;
    }
    if ("alreadyVerified" in sent) return;
    setCode("");
    setScreenCode(sent.screenCode);
    setNotice(tCodes("resent"));
    timer.restart();
  }

  function changeNumber() {
    setStep("phone");
    setCode("");
    setCodeError(null);
    setNotice(null);
    setScreenCode(null);
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
            className="h-12 w-full rounded-button text-base font-semibold"
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
        <CodeStep
          sentText={
            config.channel === "whatsapp"
              ? t.rich("codeSentWhatsapp", { phone: displayPhone, ltr })
              : t.rich("codeSentSms", { phone: displayPhone, ltr })
          }
          code={code}
          onCodeChange={(value) => {
            setCode(value);
            if (codeError) setCodeError(null);
          }}
          onVerify={(value) => void verify(value)}
          verifying={pending === "verify"}
          resending={pending === "resend"}
          error={errorMessage(codeError)}
          extra={<DevHint text={devHint(codeError)} />}
          notice={notice}
          screenCode={screenCode}
          backLabel={t("changeNumber")}
          onBack={changeNumber}
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

/** Development only: what to fix when sending a code fails (origin, proxy, server, SMS). */
export function DevHint({ text }: { text: string | null }) {
  if (!text) return null;
  return (
    <p className="flex items-start gap-2 rounded-input border border-dashed border-border-strong/50 bg-surface-muted px-3 py-2 text-xs text-foreground">
      <TerminalIcon className="mt-0.5 size-3.5 shrink-0 text-foreground" aria-hidden />
      <span>{text}</span>
    </p>
  );
}
