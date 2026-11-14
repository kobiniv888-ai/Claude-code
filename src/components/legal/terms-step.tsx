"use client";

import { useState, type FormEvent, type ReactNode } from "react";
import { useTranslations } from "next-intl";
import { LoaderCircleIcon, ScrollTextIcon } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Link } from "@/i18n/navigation";
import { acceptTermsAction } from "@/lib/legal/actions";
import { TERMS_CONSENT } from "@/lib/legal/terms";
import { cn } from "@/lib/utils";

/**
 * The login's "terms" step (SECURITY_REPORT 15.11.b/c): right after a new account's first sign-in
 * (and once for accounts made before acceptances were logged), "I am 18 or older and I accept the
 * Terms of use". The server logs the acceptance with the version (acceptTermsAction).
 */
export function TermsStep({ onDone }: { onDone: () => void | Promise<void> }) {
  const t = useTranslations("auth.terms");
  const [checked, setChecked] = useState(false);
  const [error, setError] = useState<"required" | "rate_limited" | "unknown" | null>(null);
  const [pending, setPending] = useState(false);

  const link = (href: "/legal/terms" | "/legal/privacy") =>
    function LegalLink(chunks: ReactNode) {
      return (
        <Link href={href} target="_blank" rel="noopener" className="font-medium text-primary underline underline-offset-4">
          {chunks}
        </Link>
      );
    };

  async function onSubmit(event: FormEvent) {
    event.preventDefault();
    if (pending) return;
    if (!checked) {
      setError("required");
      document.getElementById("terms-signup")?.focus();
      return;
    }
    setPending(true);
    setError(null);
    const result = await acceptTermsAction(TERMS_CONSENT).catch(() => null);
    if (!result?.ok) {
      setPending(false);
      setError(result?.error === "rate_limited" ? "rate_limited" : result?.error === "terms_required" ? "required" : "unknown");
      return;
    }
    try {
      await onDone();
    } finally {
      setPending(false);
    }
  }

  return (
    <form onSubmit={onSubmit} noValidate className="grid gap-4">
      <div className="grid justify-items-center gap-2 text-center">
        <span aria-hidden className="inline-flex size-11 items-center justify-center rounded-full bg-primary/10 text-primary">
          <ScrollTextIcon className="size-5" />
        </span>
        <p className="text-h3">{t("title")}</p>
        <p className="text-sm text-muted-foreground">{t("subtitle")}</p>
      </div>
      <label
        className={cn(
          "flex cursor-pointer items-start gap-3 rounded-xl border p-3.5 has-[:focus-visible]:ring-3 has-[:focus-visible]:ring-ring/50",
          error === "required" ? "border-destructive" : "border-border",
        )}
      >
        <input
          id="terms-signup"
          type="checkbox"
          checked={checked}
          onChange={(event) => {
            setChecked(event.target.checked);
            if (event.target.checked) setError(null);
          }}
          aria-invalid={error === "required" ? true : undefined}
          aria-describedby="terms-signup-hint"
          className="mt-0.5 size-5 shrink-0 accent-primary"
        />
        <span className="grid gap-0.5">
          <span className="text-sm font-medium">{t.rich("label", { terms: link("/legal/terms") })}</span>
          <span id="terms-signup-hint" className="text-xs text-muted-foreground">
            {t.rich("hint", { privacy: link("/legal/privacy") })}
          </span>
        </span>
      </label>
      {error ? (
        <p role="alert" className="text-center text-sm font-medium text-destructive">
          {t(error === "required" ? "required" : error === "rate_limited" ? "errors.rate_limited" : "errors.unknown")}
        </p>
      ) : null}
      <Button type="submit" size="lg" className="h-12 w-full rounded-button text-base font-semibold" disabled={pending} aria-busy={pending || undefined}>
        {pending ? <LoaderCircleIcon className="size-5 animate-spin" aria-hidden /> : null}
        {t("continue")}
      </Button>
      <p className="text-center text-xs text-muted-foreground">{t("underage")}</p>
    </form>
  );
}
