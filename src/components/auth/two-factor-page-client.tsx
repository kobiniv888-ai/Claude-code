"use client";

import { useEffect, useId, useState, type FormEvent } from "react";
import { useLocale, useTranslations } from "next-intl";
import { KeyRoundIcon, LifeBuoyIcon, LoaderCircleIcon, LockKeyholeIcon, MailIcon } from "lucide-react";
import { Ltr } from "@/components/common/ltr";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { getPathname, useRouter } from "@/i18n/navigation";
import { verifyRecoveryCodeForSession } from "@/lib/auth/actions";
import { confirmUnlockCode, sendUnlockCode } from "@/lib/auth/fresh-proof-actions";
import { toast } from "@/lib/toast";
import { CodeInput } from "./code-input";
import { TwoFactorChallenge } from "./two-factor-challenge";
import { formatCountdown } from "./use-auth-messages";
import { useSecurityErrorMessage } from "./use-security-messages";

type Mode = "code" | "recovery" | "locked";

/**
 * /two-factor: the authenticator code (or a recovery code, for a lost phone), then on to `next`.
 * After 20 wrong codes in a day the account is locked (SECURITY_REPORT 3.7.a): an email code then
 * only resets the counter (founder's decision 5), and the code is still needed.
 */
export function TwoFactorPageClient({ next, initiallyLocked = false }: { next: string; initiallyLocked?: boolean }) {
  const t = useTranslations("auth.twoFactor");
  const ts = useTranslations("security.challenge");
  const router = useRouter();
  const locale = useLocale();
  const [mode, setMode] = useState<Mode>(initiallyLocked ? "locked" : "code");
  const [signingOut, setSigningOut] = useState(false);

  const done = () => {
    router.replace(next);
    router.refresh();
  };

  async function signOut() {
    setSigningOut(true);
    const { logOut } = await import("@/lib/auth/logout");
    const result = await logOut({ homeHref: getPathname({ href: "/login", locale }), keepLists: false });
    if (result.ok) return; // the page is leaving
    setSigningOut(false);
    toast.error(ts("logoutError"));
  }

  return (
    <div className="grid gap-4">
      {mode === "code" ? (
        <TwoFactorChallenge showIntro={false} onVerified={done} onLocked={() => setMode("locked")} />
      ) : mode === "recovery" ? (
        <RecoveryCodeForm onVerified={done} onLocked={() => setMode("locked")} />
      ) : (
        <UnlockPanel onReset={() => setMode("code")} />
      )}

      {mode !== "locked" ? (
        <Button type="button" variant="link" className="mx-auto h-auto min-h-tap" onClick={() => setMode(mode === "code" ? "recovery" : "code")}>
          {mode === "code" ? (
            <>
              <LifeBuoyIcon aria-hidden />
              {ts("useRecovery")}
            </>
          ) : (
            <>
              <KeyRoundIcon aria-hidden />
              {ts("useApp")}
            </>
          )}
        </Button>
      ) : null}

      <Button type="button" variant="link" className="mx-auto h-auto min-h-tap text-muted-foreground" disabled={signingOut} onClick={() => void signOut()}>
        {signingOut && <LoaderCircleIcon className="animate-spin" aria-hidden />}
        {t("signOut")}
      </Button>
    </div>
  );
}

/** A recovery code instead of the app: "XXXXX-XXXXX", used once. */
function RecoveryCodeForm({ onVerified, onLocked }: { onVerified: () => void; onLocked: () => void }) {
  const t = useTranslations("security.challenge");
  const errorText = useSecurityErrorMessage();
  const id = useId();
  const [value, setValue] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);

  async function onSubmit(event: FormEvent) {
    event.preventDefault();
    if (pending || value.trim().length < 10) return;
    setPending(true);
    setError(null);
    const result = await verifyRecoveryCodeForSession({ code: value }).catch(() => null);
    setPending(false);
    if (!result?.ok) {
      if (result?.error === "totp_locked") return onLocked();
      setError(result ? result.error : "network");
      return;
    }
    toast.success(t("recoveryLeft", { count: result.data.left }));
    onVerified();
  }

  return (
    <form onSubmit={onSubmit} noValidate className="grid gap-3">
      <p id={`${id}-help`} className="text-sm text-muted-foreground">
        {t("recoveryIntro")}
      </p>
      <label htmlFor={`${id}-code`} className="text-sm font-medium">
        {t("recoveryLabel")}
      </label>
      <Input
        id={`${id}-code`}
        dir="ltr"
        value={value}
        onChange={(event) => {
          setValue(event.target.value);
          if (error) setError(null);
        }}
        autoComplete="off"
        autoCapitalize="characters"
        spellCheck={false}
        maxLength={20}
        placeholder="XXXXX-XXXXX"
        aria-invalid={!!error}
        aria-describedby={[`${id}-help`, error ? `${id}-error` : null].filter(Boolean).join(" ")}
        className="h-12 rounded-xl text-center font-mono text-base tracking-widest"
        autoFocus
      />
      {error ? (
        <p id={`${id}-error`} role="alert" className="text-center text-sm font-medium text-destructive">
          {errorText(error)}
        </p>
      ) : null}
      <Button type="submit" size="lg" className="h-12 w-full rounded-xl text-base" disabled={pending || value.trim().length < 10} aria-busy={pending || undefined}>
        {pending && <LoaderCircleIcon className="size-5 animate-spin" aria-hidden />}
        {pending ? t("checking") : t("recoverySubmit")}
      </Button>
    </form>
  );
}

/** Locked after 20 wrong codes today: an email code resets the counter, nothing more. */
function UnlockPanel({ onReset }: { onReset: () => void }) {
  const t = useTranslations("security.challenge");
  const errorText = useSecurityErrorMessage();
  const id = useId();
  const [sentTo, setSentTo] = useState<string | null>(null);
  const [screenCode, setScreenCode] = useState<string | null>(null);
  const [code, setCode] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);
  const [waitUntil, setWaitUntil] = useState(0);
  const [now, setNow] = useState(() => Date.now());

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
    const result = await sendUnlockCode().catch(() => null);
    setPending(false);
    if (!result) return setError("network");
    if (!result.ok) {
      // Not locked (any more): back to the code.
      if (result.error === "not_locked") return onReset();
      return setError(result.error);
    }
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
    const result = await confirmUnlockCode({ code: value }).catch(() => null);
    setPending(false);
    if (!result?.ok) {
      setCode("");
      setError(result ? result.error : "network");
      return;
    }
    toast.success(t("unlocked"));
    onReset();
  }

  return (
    <div className="grid gap-4">
      <div role="status" className="flex items-start gap-3 rounded-xl border border-destructive/30 bg-destructive/5 px-3.5 py-3 text-sm">
        <LockKeyholeIcon className="mt-0.5 size-5 shrink-0 text-destructive" aria-hidden />
        <div className="grid gap-1">
          <p className="font-semibold">{t("lockedTitle")}</p>
          <p className="text-muted-foreground">{t("lockedText")}</p>
        </div>
      </div>
      {!sentTo ? (
        <Button type="button" size="lg" className="h-12 w-full rounded-xl text-base" disabled={pending} aria-busy={pending || undefined} onClick={() => void send()}>
          {pending ? <LoaderCircleIcon className="size-5 animate-spin" aria-hidden /> : <MailIcon className="size-5" aria-hidden />}
          {t("unlockSend")}
        </Button>
      ) : (
        <form
          noValidate
          className="grid gap-3"
          onSubmit={(event) => {
            event.preventDefault();
            void confirm(code);
          }}
        >
          <p id={`${id}-help`} className="text-sm text-muted-foreground">
            {t.rich("unlockSent", { email: sentTo, ltr: (chunks) => <Ltr className="font-medium text-foreground">{chunks}</Ltr> })}
          </p>
          {screenCode ? (
            <p className="rounded-lg bg-amber-50 px-3 py-2 text-sm text-amber-900 dark:bg-amber-950/40 dark:text-amber-100">
              {t.rich("screenCode", { code: screenCode, ltr: (chunks) => <Ltr className="font-mono font-semibold tracking-widest">{chunks}</Ltr> })}
            </p>
          ) : null}
          <CodeInput
            id={`${id}-code`}
            label={t("unlockCodeLabel")}
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
            describedBy={[`${id}-help`, error ? `${id}-error` : null].filter(Boolean).join(" ")}
          />
          <Button type="submit" size="lg" className="h-12 w-full rounded-xl text-base" disabled={pending || code.length !== 6} aria-busy={pending || undefined}>
            {pending && <LoaderCircleIcon className="size-5 animate-spin" aria-hidden />}
            {t("unlockConfirm")}
          </Button>
          <Button type="button" variant="link" className="mx-auto h-auto min-h-tap" disabled={pending || secondsLeft > 0} onClick={() => void send()}>
            {secondsLeft > 0 ? t("resendIn", { time: formatCountdown(secondsLeft) }) : t("resend")}
          </Button>
        </form>
      )}
      {error ? (
        <p id={`${id}-error`} role="alert" className="text-center text-sm font-medium text-destructive">
          {error === "code_wait" ? t("wait", { time: formatCountdown(secondsLeft) }) : errorText(error)}
        </p>
      ) : null}
    </div>
  );
}
