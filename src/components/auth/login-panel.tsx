"use client";

import { useState, type ReactNode } from "react";
import { useLocale, useTranslations } from "next-intl";
import { CircleAlertIcon, LoaderCircleIcon } from "lucide-react";
import { Button } from "@/components/ui/button";
import { getPathname, Link, useRouter } from "@/i18n/navigation";
import { getLoginState } from "@/lib/auth/actions";
import { signIn, signOut } from "@/lib/auth/client";
import type { LoginConfig } from "@/lib/auth/config";
import { authErrorKey, type AuthErrorKey } from "@/lib/auth/error-codes";
import { safeNextPath } from "@/lib/auth/next-path";
import { PhoneCodeForm } from "./phone-code-form";
import { AppleIcon, GoogleIcon } from "./provider-icons";
import { TwoFactorChallenge } from "./two-factor-challenge";
import { useAuthErrorMessage } from "./use-auth-messages";

type Provider = "google" | "apple";

/** Where the visitor is in the login: the first screen, the 6-digit code, the 2-step code, or done. */
export type LoginStage = "start" | "code" | "two-factor" | "done";

/**
 * The login UI: Google, Apple (when configured) and a phone code — then the 2-step check
 * in place when the account has it on. Used by the /login page and the login dialog.
 *
 * Without `onSuccess`, it navigates to `next` after logging in.
 */
export function LoginPanel({
  config,
  next,
  variant = "page",
  initialError,
  onSuccess,
  onStageChange,
  autoFocus,
}: {
  config: LoginConfig;
  /** Locale-less path to return to (validated again here). */
  next?: string;
  variant?: "page" | "dialog";
  initialError?: AuthErrorKey | null;
  onSuccess?: () => void | Promise<void>;
  /** Lets the sheet or page shrink its welcome block while a code is being entered. */
  onStageChange?: (stage: LoginStage) => void;
  /** Focus the phone field at once (default: in the dialog when there is no Google/Apple). */
  autoFocus?: boolean;
}) {
  const t = useTranslations("auth.login");
  const locale = useLocale();
  const router = useRouter();
  const errorMessage = useAuthErrorMessage();
  const target = safeNextPath(next);

  const [step, setStepState] = useState<"start" | "two-factor" | "done">("start");
  const setStep = (next: "start" | "two-factor" | "done") => {
    setStepState(next);
    onStageChange?.(next);
  };
  const [redirecting, setRedirecting] = useState<Provider | null>(null);
  const [error, setError] = useState<AuthErrorKey | string | null>(initialError ?? null);

  async function finish() {
    setStep("done");
    if (onSuccess) {
      await onSuccess();
      return;
    }
    router.replace(target);
    router.refresh();
  }

  async function afterPhoneLogin() {
    setError(null);
    const state = await getLoginState().catch(() => null);
    if (state?.twoFactorRequired) {
      setStep("two-factor");
      return;
    }
    await finish();
  }

  async function continueWith(provider: Provider) {
    setError(null);
    setRedirecting(provider);
    // Google/Apple come back through /two-factor, which asks for the authenticator code when
    // the account has 2-step login on and otherwise forwards to `next`.
    const callbackURL = getPathname({ href: { pathname: "/two-factor", query: { next: target } }, locale });
    const errorCallbackURL = getPathname({ href: { pathname: "/login", query: { next: target } }, locale });
    const { error: signInError } = await signIn.social({ provider, callbackURL, errorCallbackURL });
    if (signInError) {
      setRedirecting(null);
      setError(authErrorKey(signInError));
    }
  }

  if (step === "two-factor") {
    return (
      <div className="grid gap-5">
        <div className="grid gap-1 text-center">
          <p className="text-h3">{t("twoFactorTitle")}</p>
        </div>
        <TwoFactorChallenge onVerified={finish} />
        <Button
          type="button"
          variant="link"
          className="mx-auto h-auto"
          onClick={async () => {
            await signOut();
            setStep("start");
            router.refresh();
          }}
        >
          {t("useAnotherAccount")}
        </Button>
      </div>
    );
  }

  if (step === "done") {
    return (
      <div role="status" className="flex flex-col items-center gap-3 py-8 text-center">
        <LoaderCircleIcon className="size-8 animate-spin text-primary" aria-hidden />
        <p className="text-base font-medium">{t("success")}</p>
      </div>
    );
  }

  const hasSocial = config.providers.google || config.providers.apple;
  const legalLink = (href: "/legal/terms" | "/legal/privacy") =>
    function LegalLink(chunks: ReactNode) {
      return (
        <Link
          href={href}
          className="font-medium text-foreground underline underline-offset-2 hover:text-primary"
          {...(variant === "dialog" && { target: "_blank", rel: "noopener" })}
        >
          {chunks}
        </Link>
      );
    };

  return (
    <div className="grid gap-5">
      {error && (
        <div
          role="alert"
          className="flex items-start gap-2.5 rounded-input border border-destructive/30 bg-destructive/5 px-3.5 py-3 text-small font-medium text-destructive"
        >
          <CircleAlertIcon className="mt-0.5 size-4 shrink-0" aria-hidden />
          <p>{errorMessage(error)}</p>
        </div>
      )}

      {hasSocial && (
        <div className="grid gap-3">
          {config.providers.google && (
            <Button
              type="button"
              variant="outline"
              size="lg"
              className="relative h-12 w-full rounded-full border-input bg-card text-base font-semibold"
              onClick={() => void continueWith("google")}
              disabled={redirecting !== null}
              aria-busy={redirecting === "google" || undefined}
            >
              {redirecting === "google" ? (
                <LoaderCircleIcon className="absolute start-4 size-5 animate-spin" aria-hidden />
              ) : (
                <GoogleIcon className="absolute start-4 size-5" />
              )}
              {t("google")}
            </Button>
          )}
          {config.providers.apple && (
            <Button
              type="button"
              size="lg"
              className="relative h-12 w-full rounded-full bg-foreground text-base font-semibold text-background hover:bg-foreground/90"
              onClick={() => void continueWith("apple")}
              disabled={redirecting !== null}
              aria-busy={redirecting === "apple" || undefined}
            >
              {redirecting === "apple" ? (
                <LoaderCircleIcon className="absolute start-4 size-5 animate-spin" aria-hidden />
              ) : (
                <AppleIcon className="absolute start-4 size-5" />
              )}
              {t("apple")}
            </Button>
          )}
        </div>
      )}

      {hasSocial && (
        <div className="flex items-center gap-3 text-xs font-medium tracking-wide text-muted-foreground uppercase">
          <span className="h-px flex-1 bg-border" aria-hidden />
          {t("or")}
          <span className="h-px flex-1 bg-border" aria-hidden />
        </div>
      )}

      <PhoneCodeForm
        mode="sign-in"
        config={config.phone}
        onVerified={afterPhoneLogin}
        autoFocus={autoFocus ?? (variant === "dialog" && !hasSocial)}
        onStepChange={(phoneStep) => onStageChange?.(phoneStep === "code" ? "code" : "start")}
      />

      <p className="text-center text-xs leading-relaxed text-muted-foreground">
        {t.rich("consent", { terms: legalLink("/legal/terms"), privacy: legalLink("/legal/privacy") })}
      </p>
    </div>
  );
}
