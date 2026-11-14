"use client";

import { useState, type ReactNode } from "react";
import { useLocale, useTranslations } from "next-intl";
import { CircleAlertIcon, LoaderCircleIcon, MailIcon, SmartphoneIcon } from "lucide-react";
import { Button } from "@/components/ui/button";
import { getPathname, Link, useRouter } from "@/i18n/navigation";
import { getLoginState } from "@/lib/auth/actions";
import { signIn, signOut } from "@/lib/auth/client";
import type { LoginConfig } from "@/lib/auth/config";
import { authErrorKey, type AuthErrorKey } from "@/lib/auth/error-codes";
import { safeNextPath } from "@/lib/auth/next-path";
import { EmailCodeForm } from "./email-code-form";
import { FirstNameForm } from "./first-name-form";
import { AccountEmailStep } from "./account-email-step";
import { TermsStep } from "@/components/legal/terms-step";
import { PhoneCodeForm } from "./phone-code-form";
import { AppleIcon, GoogleIcon } from "./provider-icons";
import { TestModeStrip } from "./test-mode-strip";
import { TwoFactorChallenge } from "./two-factor-challenge";
import { useAuthErrorMessage } from "./use-auth-messages";

type Provider = "google" | "apple";

/**
 * Where the visitor is in the login: the first screen, the 6-digit code, the 2-step code, the
 * first name (new accounts), or done.
 */
export type LoginStage = "start" | "code" | "two-factor" | "email" | "terms" | "name" | "done";

/**
 * The login UI (founder request, round 2), in this order: Google (and Apple) when configured, a code
 * by email (always), and — in development / test mode only — a code by phone, so testers can sign
 * in as the demo accounts. Then, in place: the 2-step check when the account has it on, the "add
 * your email" step for an account without a real email (founder's answer (5): phone sign-ups and
 * existing phone-only accounts, before continuing), and the first-name step for a new account. Used by the /login page and the login dialog.
 *
 * Without `onSuccess`, it navigates to `next` after logging in.
 */
export function LoginPanel({
  config,
  next,
  variant = "page",
  initialError,
  initialStage = "start",
  onSuccess,
  onStageChange,
  autoFocus,
}: {
  config: LoginConfig;
  /** Locale-less path to return to (validated again here). */
  next?: string;
  variant?: "page" | "dialog";
  initialError?: AuthErrorKey | null;
  /** "name" / "email" / "terms": already signed in, the first name, a real email or the Terms acceptance is still missing (the /login page). */
  initialStage?: "start" | "name" | "email" | "terms";
  onSuccess?: () => void | Promise<void>;
  /** Lets the sheet or page shrink its welcome block while a code is being entered. */
  onStageChange?: (stage: LoginStage) => void;
  /** Focus the email field at once (default: in the dialog when there is no Google/Apple). */
  autoFocus?: boolean;
}) {
  const t = useTranslations("auth.login");
  const locale = useLocale();
  const router = useRouter();
  const errorMessage = useAuthErrorMessage();
  const target = safeNextPath(next);

  const [step, setStepState] = useState<"start" | "two-factor" | "email" | "terms" | "name" | "done">(initialStage);
  const setStep = (next: "start" | "two-factor" | "email" | "terms" | "name" | "done") => {
    setStepState(next);
    onStageChange?.(next);
  };
  const [method, setMethod] = useState<"email" | "phone">("email");
  /** The email or phone form is on its 6-digit code step (hide the switch between them). */
  const [enteringCode, setEnteringCode] = useState(false);
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

  /** After a code login or the 2-step code: the 2-step check, the first name, or done. */
  async function afterSignIn() {
    setError(null);
    const state = await getLoginState().catch(() => null);
    if (state?.twoFactorRequired) {
      setStep("two-factor");
      return;
    }
    if (state?.needsAccountEmail) {
      setStep("email");
      return;
    }
    // SECURITY_REPORT 15.11.b/c: a new account says it is 18 or older and accepts the Terms (logged).
    if (state?.needsTerms) {
      setStep("terms");
      return;
    }
    if (state?.needsFirstName) {
      setStep("name");
      return;
    }
    await finish();
  }

  async function continueWith(provider: Provider) {
    setError(null);
    setRedirecting(provider);
    // Google/Apple come back to /login, which asks for the authenticator code (2-step login on)
    // or the first name (new account) and otherwise forwards to `next`.
    const callbackURL = getPathname({ href: { pathname: "/login", query: { next: target } }, locale });
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
        <TwoFactorChallenge onVerified={afterSignIn} />
        <Button
          type="button"
          variant="link"
          className="mx-auto h-auto"
          onClick={async () => {
            // The session must really end on the server (SECURITY_REPORT 3.5.d), then the library resets.
            const { logOutHere } = await import("@/lib/auth/logout-actions");
            const ended = await logOutHere().catch(() => null);
            if (!ended?.ok) {
              setError("server_unavailable");
              return;
            }
            await signOut();
            setStep("start");
            router.refresh();
          }}
        >
          {t("useAnotherAccount")}
        </Button>
        {error ? (
          <p role="alert" className="text-center text-sm font-medium text-destructive">
            {errorMessage(error)}
          </p>
        ) : null}
      </div>
    );
  }

  if (step === "email") {
    return <AccountEmailStep onDone={afterSignIn} />;
  }

  if (step === "terms") {
    return <TermsStep onDone={afterSignIn} />;
  }

  if (step === "name") {
    return <FirstNameForm onSaved={finish} />;
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
      <TestModeStrip mode={config.codeDisplay} />
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
              className="relative h-12 w-full rounded-button border-input bg-card text-base font-semibold"
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
              className="relative h-12 w-full rounded-button bg-foreground text-base font-semibold text-background hover:bg-foreground/90"
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

      {method === "email" || !config.phone.login ? (
        config.email.available ? (
          <EmailCodeForm
            devHints={config.phone.devHints}
            onVerified={afterSignIn}
            autoFocus={autoFocus ?? (variant === "dialog" && !hasSocial)}
            onStepChange={(emailStep) => {
              setEnteringCode(emailStep === "code");
              onStageChange?.(emailStep === "code" ? "code" : "start");
            }}
          />
        ) : (
          <div role="status" className="flex items-start gap-2.5 rounded-input border border-border bg-surface-muted px-3.5 py-3 text-sm">
            <MailIcon className="mt-0.5 size-4 shrink-0 text-primary-text" aria-hidden />
            <p>{t(hasSocial ? "emailUnavailable" : "emailUnavailableNoSocial")}</p>
          </div>
        )
      ) : (
        <PhoneCodeForm
          purpose="sign-in"
          config={config.phone}
          onVerified={afterSignIn}
          autoFocus
          onStepChange={(phoneStep) => {
            setEnteringCode(phoneStep === "code");
            onStageChange?.(phoneStep === "code" ? "code" : "start");
          }}
        />
      )}

      {config.phone.login && !enteringCode && (
        <Button
          type="button"
          variant="link"
          className="mx-auto min-h-tap h-auto max-w-full whitespace-normal text-center"
          onClick={() => {
            setError(null);
            setMethod(method === "email" ? "phone" : "email");
            onStageChange?.("start");
          }}
        >
          {method === "email" ? <SmartphoneIcon aria-hidden /> : <MailIcon aria-hidden />}
          {t(method === "email" ? "usePhone" : "useEmail")}
        </Button>
      )}

      <p className="text-center text-xs leading-relaxed text-muted-foreground">
        {t.rich("consent", { terms: legalLink("/legal/terms"), privacy: legalLink("/legal/privacy") })}
      </p>
    </div>
  );
}
