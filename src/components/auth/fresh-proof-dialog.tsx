"use client";

import { useCallback, useEffect, useId, useRef, useState, type FormEvent } from "react";
import { useTranslations } from "next-intl";
import { KeyRoundIcon, LoaderCircleIcon, MailIcon, RefreshCwIcon, ShieldCheckIcon, TriangleAlertIcon } from "lucide-react";
import { Ltr } from "@/components/common/ltr";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Skeleton } from "@/components/ui/skeleton";
import { confirmProof, getProofOptions, sendProofCode, type ProofOptions } from "@/lib/auth/fresh-proof-actions";
import { cn } from "@/lib/utils";
import { CodeInput } from "./code-input";
import { formatCountdown } from "./use-auth-messages";
import { useSecurityErrorMessage } from "./use-security-messages";

/**
 * "Confirm it's you" (SECURITY_REPORT 3.6): a fresh code before a sensitive change — the
 * authenticator code, or a 6-digit code we email to the login address. Opened by
 * useFreshProof() (./use-fresh-proof.tsx); `onDone(true)` once this session has a fresh proof
 * (valid 5 minutes on the server), `onDone(false)` when the person closes it.
 */
export function FreshProofDialog({ open, onDone }: { open: boolean; onDone: (proven: boolean) => void }) {
  const t = useTranslations("security.freshProof");
  const errorText = useSecurityErrorMessage();
  const id = useId();
  const [options, setOptions] = useState<ProofOptions | null>(null);
  const [loadFailed, setLoadFailed] = useState(false);
  const [method, setMethod] = useState<"totp" | "email">("email");
  const [sentTo, setSentTo] = useState<string | null>(null);
  const [screenCode, setScreenCode] = useState<string | null>(null);
  const [waitUntil, setWaitUntil] = useState(0);
  const [now, setNow] = useState(() => Date.now());
  const [code, setCode] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);
  const loading = useRef(false);

  // Mounted afresh for every request (useFreshProof gives it a new key), so no state carries over.
  const load = useCallback(async () => {
    if (loading.current) return;
    loading.current = true;
    const result = await getProofOptions().catch(() => null);
    loading.current = false;
    if (!result?.ok) {
      setLoadFailed(true);
      return;
    }
    setLoadFailed(false);
    setOptions(result.data);
    setMethod(result.data.totp ? "totp" : "email");
  }, []);

  const started = useRef(false);
  useEffect(() => {
    // Once per mount (React strict mode runs effects twice in development).
    if (started.current) return;
    started.current = true;
    void load();
  }, [load]);

  // The resend countdown.
  useEffect(() => {
    if (waitUntil <= Date.now()) return;
    const timer = window.setInterval(() => setNow(Date.now()), 1000);
    return () => window.clearInterval(timer);
  }, [waitUntil]);
  const secondsLeft = Math.max(0, Math.ceil((waitUntil - now) / 1000));

  async function send() {
    if (pending) return;
    setPending(true);
    setError(null);
    const result = await sendProofCode().catch(() => null);
    setPending(false);
    if (!result) return setError("network");
    if (!result.ok) return setError(result.error);
    setSentTo(result.data.sentTo);
    setScreenCode(result.data.screenCode ?? null);
    setNow(Date.now());
    setWaitUntil(Date.now() + result.data.retryAfterSeconds * 1000);
    if (!result.data.sent) setError("code_wait");
  }

  async function confirm(value: string) {
    if (pending || value.length !== 6) return;
    setPending(true);
    setError(null);
    const result = await confirmProof({ method, code: value }).catch(() => null);
    setPending(false);
    if (!result?.ok) {
      setCode("");
      setError(result ? result.error : "network");
      return;
    }
    onDone(true);
  }

  function onSubmit(event: FormEvent) {
    event.preventDefault();
    void confirm(code);
  }

  const noMethod = options && !options.totp && !options.email;
  const showCode = method === "totp" || sentTo !== null;

  return (
    <Dialog open={open} onOpenChange={(next) => !next && !pending && onDone(false)}>
      <DialogContent className="gap-5 rounded-2xl p-5 sm:max-w-md sm:p-6">
        <DialogHeader className="text-start">
          <span className="mb-1 flex size-11 items-center justify-center rounded-full bg-secondary text-secondary-foreground">
            <ShieldCheckIcon className="size-5" aria-hidden />
          </span>
          <DialogTitle className="text-lg font-semibold">{t("title")}</DialogTitle>
          <DialogDescription id={`${id}-desc`}>{t("description")}</DialogDescription>
        </DialogHeader>

        {loadFailed ? (
          <div role="alert" className="grid justify-items-center gap-3 py-2 text-center">
            <TriangleAlertIcon className="size-6 text-destructive" aria-hidden />
            <p className="text-sm">{t("loadFailed")}</p>
            <Button variant="outline" className="h-11 rounded-xl" onClick={() => void load()}>
              <RefreshCwIcon aria-hidden />
              {t("retry")}
            </Button>
          </div>
        ) : !options ? (
          <div className="grid gap-3" aria-busy="true" aria-label={t("loading")}>
            <Skeleton className="h-11 w-full rounded-xl" />
            <Skeleton className="h-12 w-full rounded-xl" />
          </div>
        ) : noMethod ? (
          <p role="status" className="rounded-xl bg-surface-muted px-3.5 py-3 text-sm">
            {t("noMethod")}
          </p>
        ) : (
          <form onSubmit={onSubmit} noValidate className="grid gap-4">
            {options.totp && options.email ? (
              <div role="radiogroup" aria-label={t("methodLabel")} className="grid grid-cols-2 gap-2">
                {(["totp", "email"] as const).map((value) => (
                  <button
                    key={value}
                    type="button"
                    role="radio"
                    aria-checked={method === value}
                    onClick={() => {
                      setMethod(value);
                      setCode("");
                      setError(null);
                    }}
                    className={cn(
                      "flex min-h-11 items-center justify-center gap-2 rounded-xl border px-3 text-sm font-medium transition-colors focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none",
                      method === value ? "border-primary bg-primary-tint text-foreground" : "border-border bg-background text-muted-foreground hover:bg-muted",
                    )}
                  >
                    {value === "totp" ? <KeyRoundIcon className="size-4" aria-hidden /> : <MailIcon className="size-4" aria-hidden />}
                    {value === "totp" ? t("methodTotp") : t("methodEmail")}
                  </button>
                ))}
              </div>
            ) : null}

            {method === "email" && options.email ? (
              <div className="grid gap-2">
                <p className="text-sm text-muted-foreground">
                  {t.rich(sentTo ? "emailSent" : "emailIntro", { email: options.email, ltr: (chunks) => <Ltr className="font-medium text-foreground">{chunks}</Ltr> })}
                </p>
                {!sentTo ? (
                  <Button type="button" className="h-12 w-full rounded-xl text-base" onClick={() => void send()} disabled={pending} aria-busy={pending || undefined}>
                    {pending ? <LoaderCircleIcon className="size-5 animate-spin" aria-hidden /> : <MailIcon className="size-5" aria-hidden />}
                    {t("sendCode")}
                  </Button>
                ) : null}
                {screenCode ? (
                  <p className="rounded-lg bg-amber-50 px-3 py-2 text-sm text-amber-900 dark:bg-amber-950/40 dark:text-amber-100">
                    {t.rich("screenCode", { code: screenCode, ltr: (chunks) => <Ltr className="font-mono font-semibold tracking-widest">{chunks}</Ltr> })}
                  </p>
                ) : null}
              </div>
            ) : null}

            {showCode ? (
              <CodeInput
                id={`${id}-code`}
                label={method === "totp" ? t("totpLabel") : t("emailCodeLabel")}
                value={code}
                onChange={(value) => {
                  setCode(value);
                  if (error) setError(null);
                }}
                onComplete={(value) => void confirm(value)}
                disabled={pending}
                invalid={!!error && error !== "code_wait"}
                autoFocus
                autoComplete="one-time-code"
                describedBy={[`${id}-desc`, error ? `${id}-error` : null].filter(Boolean).join(" ")}
              />
            ) : null}

            {error ? (
              <p id={`${id}-error`} role="alert" className="text-center text-sm font-medium text-destructive">
                {error === "code_wait" ? t("wait", { time: formatCountdown(secondsLeft) }) : errorText(error)}
              </p>
            ) : null}

            {showCode ? (
              <Button type="submit" size="lg" className="h-12 w-full rounded-xl text-base" disabled={pending || code.length !== 6} aria-busy={pending || undefined}>
                {pending && <LoaderCircleIcon className="size-5 animate-spin" aria-hidden />}
                {pending ? t("checking") : t("confirm")}
              </Button>
            ) : null}

            {method === "email" && sentTo ? (
              <Button type="button" variant="link" className="mx-auto h-auto min-h-tap" disabled={pending || secondsLeft > 0} onClick={() => void send()}>
                {secondsLeft > 0 ? t("resendIn", { time: formatCountdown(secondsLeft) }) : t("resend")}
              </Button>
            ) : null}
          </form>
        )}
      </DialogContent>
    </Dialog>
  );
}
