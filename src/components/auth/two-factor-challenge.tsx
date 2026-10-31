"use client";

import { useId, useState, type FormEvent } from "react";
import { useTranslations } from "next-intl";
import { LoaderCircleIcon, ShieldCheckIcon } from "lucide-react";
import { Button } from "@/components/ui/button";
import { verifyTotpForSession } from "@/lib/auth/actions";
import { CodeInput } from "./code-input";
import { useAuthErrorMessage } from "./use-auth-messages";

/** "Enter the code from your authenticator app" — the second step of logging in. */
export function TwoFactorChallenge({
  onVerified,
  autoFocus = true,
  showIntro = true,
}: {
  onVerified: () => void | Promise<void>;
  autoFocus?: boolean;
  /** Icon + instructions (hide when the page heading already explains it). */
  showIntro?: boolean;
}) {
  const t = useTranslations("auth.twoFactor");
  const errorMessage = useAuthErrorMessage();
  const id = useId();
  const [code, setCode] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);

  async function verify(value: string) {
    if (pending || value.length !== 6) return;
    setPending(true);
    setError(null);
    const result = await verifyTotpForSession({ code: value }).catch(() => null);
    if (!result?.ok) {
      setPending(false);
      setCode("");
      setError(result ? result.error : "network");
      return;
    }
    try {
      await onVerified();
    } finally {
      setPending(false);
    }
  }

  function onSubmit(event: FormEvent) {
    event.preventDefault();
    void verify(code);
  }

  return (
    <form onSubmit={onSubmit} noValidate className="grid gap-4">
      {showIntro && (
        <div className="flex flex-col items-center gap-2 text-center">
          <span className="flex size-12 items-center justify-center rounded-full bg-secondary text-secondary-foreground">
            <ShieldCheckIcon className="size-6" aria-hidden />
          </span>
          <p id={`${id}-help`} className="text-sm text-muted-foreground">
            {t("instructions")}
          </p>
        </div>
      )}
      <CodeInput
        id={`${id}-code`}
        label={t("codeLabel")}
        value={code}
        onChange={(value) => {
          setCode(value);
          if (error) setError(null);
        }}
        onComplete={(value) => void verify(value)}
        disabled={pending}
        invalid={!!error}
        autoFocus={autoFocus}
        autoComplete="one-time-code"
        describedBy={[showIntro ? `${id}-help` : null, error ? `${id}-error` : null].filter(Boolean).join(" ") || undefined}
      />
      {error && (
        <p id={`${id}-error`} role="alert" className="text-center text-sm font-medium text-destructive">
          {errorMessage(error)}
        </p>
      )}
      <Button
        type="submit"
        size="lg"
        className="h-12 w-full rounded-xl text-base"
        disabled={pending || code.length !== 6}
        aria-busy={pending || undefined}
      >
        {pending && <LoaderCircleIcon className="size-5 animate-spin" aria-hidden />}
        {pending ? t("verifying") : t("verify")}
      </Button>
    </form>
  );
}
