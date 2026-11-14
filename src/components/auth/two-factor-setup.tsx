"use client";

import { useCallback, useEffect, useId, useRef, useState, type FormEvent, type ReactNode } from "react";
import { useTranslations } from "next-intl";
import {
  CheckIcon,
  CircleCheckBigIcon,
  CopyIcon,
  LoaderCircleIcon,
  RefreshCwIcon,
  TriangleAlertIcon,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { useRouter } from "@/i18n/navigation";
import { confirmTotpEnrollment, startTotpEnrollment } from "@/lib/auth/actions";
import { CodeInput } from "./code-input";
import { RecoveryCodesView } from "./recovery-codes-view";
import { useAuthErrorMessage } from "./use-auth-messages";
import { useFreshProof } from "./use-fresh-proof";

type Enrollment = { otpauthUrl: string; qrDataUrl: string; secret: string };

/** "ABCD EFGH …" — easier to type into an app by hand. */
function groupKey(secret: string): string {
  return secret.replace(/(.{4})/g, "$1 ").trim();
}

/**
 * Turn on 2-step login: QR code + manual key, then the first code from the app, then the 10
 * recovery codes (shown once). `replace`: move 2-step login to a new phone (the old app stops
 * working). Both need a fresh code first (SECURITY_REPORT 3.6): asked here when the server says so.
 */
export function TwoFactorSetup({ next, replace = false }: { next: string; replace?: boolean }) {
  const t = useTranslations("auth.setup");
  const errorMessage = useAuthErrorMessage();
  const router = useRouter();
  const id = useId();

  const [enrollment, setEnrollment] = useState<Enrollment | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [code, setCode] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);
  const [copied, setCopied] = useState(false);
  const [enabled, setEnabled] = useState(false);
  const [recoveryCodes, setRecoveryCodes] = useState<string[] | null>(null);
  const started = useRef(false);
  const proof = useFreshProof();
  const { ask } = proof;

  const load = useCallback(async () => {
    setLoading(true);
    setLoadError(null);
    let result = await startTotpEnrollment({ replace }).catch(() => null);
    // A fresh code first (the email-code login counts for 5 minutes).
    if (result && !result.ok && result.error === "fresh_proof_required" && (await ask())) {
      result = await startTotpEnrollment({ replace }).catch(() => null);
    }
    setLoading(false);
    if (!result) {
      setLoadError("network");
      return;
    }
    if (!result.ok) {
      if (result.error === "totp_already_enabled") {
        setEnabled(true);
        return;
      }
      setLoadError(result.error);
      return;
    }
    setEnrollment(result.data);
    setCode("");
  }, [ask, replace]);

  useEffect(() => {
    // Once per mount (React strict mode runs effects twice in development).
    if (started.current) return;
    started.current = true;
    void load();
  }, [load]);

  async function confirm(value: string) {
    if (pending || value.length !== 6) return;
    setPending(true);
    setError(null);
    const result = await confirmTotpEnrollment({ code: value }).catch(() => null);
    setPending(false);
    if (!result) {
      setError("network");
      return;
    }
    if (!result.ok) {
      setCode("");
      setError(result.error);
      // The pending secret expired: make a new QR code right away.
      if (result.error === "totp_setup_expired") void load();
      return;
    }
    setRecoveryCodes(result.data.recoveryCodes);
  }

  async function copyKey() {
    if (!enrollment) return;
    try {
      await navigator.clipboard.writeText(enrollment.secret);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 2000);
    } catch {
      setCopied(false);
    }
  }

  function onSubmit(event: FormEvent) {
    event.preventDefault();
    void confirm(code);
  }

  if (recoveryCodes) {
    return (
      <div role="status" className="grid gap-4">
        <div className="flex items-center gap-3">
          <span className="flex size-10 shrink-0 items-center justify-center rounded-full bg-primary-tint text-success">
            <CircleCheckBigIcon className="size-5" aria-hidden />
          </span>
          <p className="font-semibold">{replace ? t("replacedTitle") : t("enabledTitle")}</p>
        </div>
        <RecoveryCodesView
          codes={recoveryCodes}
          doneLabel={t("continue")}
          onDone={() => {
            setRecoveryCodes(null);
            setEnabled(true);
          }}
        />
      </div>
    );
  }

  if (enabled) {
    return (
      <div role="status" className="flex flex-col items-center gap-4 py-4 text-center">
        <span className="flex size-14 items-center justify-center rounded-full bg-primary-tint text-success">
          <CircleCheckBigIcon className="size-7" aria-hidden />
        </span>
        <div className="grid gap-1">
          <p className="text-lg font-semibold">{t("enabledTitle")}</p>
          <p className="text-sm text-muted-foreground">{t("enabledText")}</p>
        </div>
        <Button
          size="lg"
          className="h-12 w-full rounded-xl text-base"
          onClick={() => {
            router.replace(next);
            router.refresh();
          }}
        >
          {t("continue")}
        </Button>
      </div>
    );
  }

  if (loadError) {
    return (
      <div role="alert" className="flex flex-col items-center gap-4 py-4 text-center">
        <span className="flex size-12 items-center justify-center rounded-full bg-destructive/10 text-destructive">
          <TriangleAlertIcon className="size-6" aria-hidden />
        </span>
        <div className="grid gap-1">
          <p className="font-semibold">{t("loadFailed")}</p>
          <p className="text-sm text-muted-foreground">{errorMessage(loadError)}</p>
        </div>
        <Button variant="outline" size="lg" className="h-11 rounded-xl" onClick={() => void load()}>
          <RefreshCwIcon aria-hidden />
          {t("retry")}
        </Button>
        {proof.dialog}
      </div>
    );
  }

  return (
    <form onSubmit={onSubmit} noValidate className="grid gap-6">
      <ol className="grid gap-6">
        <li className="grid gap-3">
          <StepHeading n={1}>{t("step1")}</StepHeading>
        </li>
        <li className="grid gap-3">
          <StepHeading n={2}>{t("step2")}</StepHeading>
          <div className="flex justify-center rounded-xl border border-border bg-white p-3">
            {loading || !enrollment ? (
              <Skeleton className="size-[200px] rounded-lg" aria-label={t("loading")} />
            ) : (
              // A data: URL generated on the server — next/image adds nothing here.
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={enrollment.qrDataUrl}
                alt={t("qrAlt")}
                width={200}
                height={200}
                className="size-[200px] [image-rendering:pixelated]"
              />
            )}
          </div>
          <div className="grid gap-1.5">
            <p className="text-xs text-muted-foreground">{t("manualKey")}</p>
            <div className="flex items-center gap-2">
              {enrollment ? (
                <code
                  dir="ltr"
                  className="min-w-0 flex-1 rounded-lg bg-muted px-3 py-2 font-mono text-sm tracking-wider select-all"
                >
                  {groupKey(enrollment.secret)}
                </code>
              ) : (
                <Skeleton className="h-9 flex-1 rounded-lg" />
              )}
              <Button
                type="button"
                variant="outline"
                size="icon-lg"
                className="shrink-0 rounded-lg"
                onClick={() => void copyKey()}
                disabled={!enrollment}
                aria-label={copied ? t("copied") : t("copy")}
              >
                {copied ? <CheckIcon className="text-success" aria-hidden /> : <CopyIcon aria-hidden />}
              </Button>
            </div>
            <span className="sr-only" aria-live="polite">
              {copied ? t("copied") : ""}
            </span>
          </div>
        </li>
        <li className="grid gap-3">
          <StepHeading n={3} htmlFor={`${id}-code`}>
            {t("step3")}
          </StepHeading>
          <CodeInput
            id={`${id}-code`}
            label={t("codeLabel")}
            value={code}
            onChange={(value) => {
              setCode(value);
              if (error) setError(null);
            }}
            onComplete={(value) => void confirm(value)}
            disabled={pending || !enrollment}
            invalid={!!error}
            describedBy={error ? `${id}-error` : undefined}
          />
          {error && (
            <p id={`${id}-error`} role="alert" className="text-center text-sm font-medium text-destructive">
              {errorMessage(error)}
            </p>
          )}
        </li>
      </ol>

      <Button
        type="submit"
        size="lg"
        className="h-12 w-full rounded-xl text-base"
        disabled={pending || !enrollment || code.length !== 6}
        aria-busy={pending || undefined}
      >
        {pending && <LoaderCircleIcon className="size-5 animate-spin" aria-hidden />}
        {pending ? t("confirming") : replace ? t("confirmReplace") : t("confirm")}
      </Button>
      {proof.dialog}
    </form>
  );
}

function StepHeading({ n, htmlFor, children }: { n: number; htmlFor?: string; children: ReactNode }) {
  const Text = htmlFor ? "label" : "p";
  return (
    <div className="flex items-start gap-3">
      <span
        aria-hidden
        className="flex size-7 shrink-0 items-center justify-center rounded-full bg-secondary text-sm font-semibold text-secondary-foreground"
      >
        {n}
      </span>
      <Text htmlFor={htmlFor} className="pt-1 text-sm">
        {children}
      </Text>
    </div>
  );
}
