"use client";

import { useEffect, useId, useRef, useState, type ReactNode } from "react";
import { useTranslations } from "next-intl";
import { ArrowLeftIcon, FlaskConicalIcon, LoaderCircleIcon, RotateCcwIcon } from "lucide-react";
import { Ltr } from "@/components/common/ltr";
import { Button } from "@/components/ui/button";
import { resendWaitSeconds } from "@/lib/auth/code-rules";
import { cn } from "@/lib/utils";
import { CodeInput } from "./code-input";
import { formatCountdown } from "./use-auth-messages";

/**
 * The "enter the 6-digit code" step shared by the email code, the phone login (test mode) and the
 * phone check (<PhoneCheck>). Texts: `auth.codes.*`.
 */

/**
 * Seconds until "send a new code" may be used again. The SERVER enforces the waits (60, 120, 300,
 * then 900 s: src/lib/auth/code-rules.ts); this timer only shows them. `restart()` after each code
 * sent from this form (the next wait grows); `waitFor(seconds)` when the server named the wait.
 */
export function useResendTimer() {
  const [resendAt, setResendAt] = useState(0);
  const [now, setNow] = useState(() => Date.now());
  const sent = useRef(0);
  useEffect(() => {
    if (resendAt <= Date.now()) return;
    const timer = window.setInterval(() => {
      const current = Date.now();
      setNow(current);
      if (current >= resendAt) window.clearInterval(timer);
    }, 1000);
    return () => window.clearInterval(timer);
  }, [resendAt]);
  return {
    secondsLeft: Math.max(0, Math.ceil((resendAt - now) / 1000)),
    restart: () => {
      const current = Date.now();
      sent.current += 1;
      setNow(current);
      setResendAt(current + resendWaitSeconds(sent.current) * 1000);
    },
    /** The server said how long to wait (a code was sent recently, maybe from another tab). */
    waitFor: (seconds: number) => {
      const current = Date.now();
      setNow(current);
      setResendAt(current + Math.max(0, seconds) * 1000);
    },
    /** The code is gone (too many attempts, expired): allow a new one now. */
    allowNow: () => setResendAt(0),
  };
}

/** Development / test mode only: the code itself, tap to use it. */
export function ScreenCode({ code, onUse }: { code: string; onUse: (code: string) => void }) {
  const t = useTranslations("auth.codes");
  return (
    <div className="flex items-center gap-2 rounded-input border border-dashed border-border-strong/60 bg-surface-muted px-3 py-2 text-sm text-foreground">
      <FlaskConicalIcon className="size-4 shrink-0" aria-hidden />
      <span>
        {t.rich("screenCode", {
          code,
          value: (chunks) => (
            <button
              type="button"
              className="min-h-tap rounded px-1 font-mono font-semibold tracking-widest underline underline-offset-2 focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
              onClick={() => onUse(code)}
              dir="ltr"
            >
              {chunks}
            </button>
          ),
        })}
      </span>
    </div>
  );
}

export function CodeStep({
  sentText,
  code,
  onCodeChange,
  onVerify,
  verifying,
  resending,
  error,
  extra,
  notice,
  screenCode,
  backLabel,
  onBack,
  secondsLeft,
  onResend,
  resendDisabled,
}: {
  /** "We sent a code to …" (with the address or number in <Ltr>). */
  sentText: ReactNode;
  code: string;
  onCodeChange: (value: string) => void;
  onVerify: (value: string) => void;
  verifying: boolean;
  resending: boolean;
  /** Already translated. */
  error: string | null;
  /** Under the error (e.g. a development hint). */
  extra?: ReactNode;
  notice: string | null;
  screenCode: string | null;
  backLabel: string;
  onBack: () => void;
  secondsLeft: number;
  onResend: () => void;
  resendDisabled?: boolean;
}) {
  const t = useTranslations("auth.codes");
  const id = useId();
  const helpId = `${id}-help`;
  const errorId = `${id}-error`;

  return (
    <form
      onSubmit={(event) => {
        event.preventDefault();
        onVerify(code);
      }}
      noValidate
      className="grid gap-4"
    >
      <div className="grid gap-1 text-center">
        <p className="text-base font-semibold">{t("title")}</p>
        <p id={helpId} className="text-sm text-muted-foreground">
          {sentText}
        </p>
      </div>

      <CodeInput
        id={`${id}-code`}
        label={t("label")}
        value={code}
        onChange={onCodeChange}
        onComplete={onVerify}
        disabled={verifying}
        invalid={!!error}
        autoFocus
        describedBy={[helpId, error ? errorId : null].filter(Boolean).join(" ")}
      />

      {error && (
        <p id={errorId} role="alert" className="text-center text-sm font-medium text-destructive">
          {error}
        </p>
      )}
      {extra}
      {notice && !error && (
        <p role="status" className="text-center text-sm text-muted-foreground">
          {notice}
        </p>
      )}
      {screenCode && (
        <ScreenCode
          code={screenCode}
          onUse={(value) => {
            onCodeChange(value);
            onVerify(value);
          }}
        />
      )}

      <Button
        type="submit"
        size="lg"
        className="h-12 w-full rounded-button text-base font-semibold"
        disabled={verifying || resending || code.length !== 6}
        aria-busy={verifying || undefined}
      >
        {verifying && <LoaderCircleIcon className="size-5 animate-spin" aria-hidden />}
        {verifying ? t("verifying") : t("verify")}
      </Button>

      <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-1 text-sm">
        <Button type="button" variant="link" className="min-h-tap h-auto max-w-full px-0 whitespace-normal text-start" onClick={onBack}>
          <ArrowLeftIcon className="rtl:-scale-x-100" aria-hidden />
          {backLabel}
        </Button>
        {secondsLeft > 0 ? (
          <span className="text-muted-foreground" aria-live="off">
            {t.rich("resendIn", { time: formatCountdown(secondsLeft), ltr: (chunks) => <Ltr>{chunks}</Ltr> })}
          </span>
        ) : (
          <Button
            type="button"
            variant="link"
            className="min-h-tap h-auto max-w-full px-0 whitespace-normal text-start"
            onClick={onResend}
            disabled={verifying || resending || resendDisabled}
          >
            <RotateCcwIcon className={cn(resending && "animate-spin")} aria-hidden />
            {t("resend")}
          </Button>
        )}
      </div>
    </form>
  );
}
