"use client";

import { useId, useState } from "react";
import { useLocale, useTranslations } from "next-intl";
import { CircleCheckBig, HeartHandshake, LoaderCircle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useRouter } from "@/i18n/navigation";
import { formatDate } from "@/lib/format";
import { pledgeVersionKey, type PledgeStatus } from "@/lib/pledge";
import { acceptPledge } from "@/lib/pledge/actions";
import { toast } from "@/lib/toast";
import { cn } from "@/lib/utils";

/** The pledge text of one version, in the visitor's language. */
export function PledgeStatement({ version, className }: { version: number; className?: string }) {
  const t = useTranslations("pledge");
  return (
    <figure className={cn("grid gap-3 rounded-2xl border border-primary/20 bg-primary-tint p-4 sm:p-5", className)}>
      <figcaption className="flex items-center gap-2.5 text-sm font-semibold text-primary-text">
        <span className="grid size-9 shrink-0 place-items-center rounded-full bg-background/80 dark:bg-background/40">
          <HeartHandshake className="size-5" aria-hidden />
        </span>
        {t("form.statementLabel")}
      </figcaption>
      <blockquote className="text-lg leading-relaxed font-semibold text-balance text-foreground sm:text-xl">
        {t(`${pledgeVersionKey(version)}.statement`)}
      </blockquote>
    </figure>
  );
}

/** "You accepted the Bayit pledge — version 1 · 2 Nov 2026". */
export function PledgeAccepted({ status, className }: { status: PledgeStatus; className?: string }) {
  const t = useTranslations("pledge");
  const locale = useLocale();
  return (
    <div className={cn("flex items-start gap-3 rounded-2xl border border-primary/20 bg-primary-tint p-4", className)} role="status">
      <CircleCheckBig className="mt-0.5 size-6 shrink-0 text-primary-text" aria-hidden />
      <div className="grid gap-1">
        <p className="font-semibold">{t("accepted.title")}</p>
        {status.version !== null && (
          <p className="text-sm text-muted-foreground">
            {t("accepted.meta", {
              version: status.version,
              date: status.acceptedAt ? formatDate(status.acceptedAt, locale, { day: "numeric", month: "long", year: "numeric" }) : "—",
            })}
          </p>
        )}
        <p className="text-sm">{t("accepted.badgeNote")}</p>
      </div>
    </div>
  );
}

type PledgeFormProps = {
  status: PledgeStatus;
  /** Called with the new status after the pledge was saved. */
  onAccepted?: (status: PledgeStatus) => void;
  /** Show "please accept" under the checkbox (e.g. after the owner tried to continue). */
  showRequiredError?: boolean;
  className?: string;
};

/**
 * The pledge in the visitor's language, a short "why", an "I accept" checkbox and a button.
 * Shows the confirmed state when the current version is already accepted.
 */
export function PledgeForm({ status, onAccepted, showRequiredError = false, className }: PledgeFormProps) {
  const t = useTranslations("pledge");
  const router = useRouter();
  const id = useId();
  const [checked, setChecked] = useState(false);
  const [error, setError] = useState(false);
  const [saving, setSaving] = useState(false);
  const checkboxId = `${id}-accept`;
  const errorId = `${id}-error`;
  const invalid = (error || showRequiredError) && !checked;

  if (status.isCurrent) {
    return (
      <div className={cn("grid gap-4", className)}>
        <PledgeStatement version={status.currentVersion} />
        <PledgeAccepted status={status} />
      </div>
    );
  }

  const submit = async () => {
    if (!checked) {
      setError(true);
      document.getElementById(checkboxId)?.focus();
      return;
    }
    setSaving(true);
    const result = await acceptPledge({ version: status.currentVersion, accepted: true }).catch(() => null);
    setSaving(false);
    if (result?.ok) {
      toast.success(t("form.success"));
      onAccepted?.(result.data);
      return;
    }
    const code = result ? result.error : "network";
    toast.error(t.has(`errors.${code}`) ? t(`errors.${code}`) : t("errors.server_error"));
    if (code === "pledge_outdated") router.refresh();
  };

  return (
    <div className={cn("grid gap-4", className)}>
      {status.mustReaccept && (
        <p className="rounded-xl border border-border-strong/40 bg-surface-muted p-3.5 text-sm font-medium dark:bg-surface-muted/10">
          {t("reaccept.updatedBody")}
        </p>
      )}
      <PledgeStatement version={status.currentVersion} />
      <p className="text-pretty text-muted-foreground">{t("why")}</p>
      <div className="grid gap-2">
        <label
          htmlFor={checkboxId}
          className={cn(
            "flex min-h-11 cursor-pointer items-start gap-3 rounded-xl border bg-card p-3.5 has-[:focus-visible]:ring-3 has-[:focus-visible]:ring-ring/50",
            invalid ? "border-destructive" : "border-border",
          )}
        >
          <input
            id={checkboxId}
            type="checkbox"
            checked={checked}
            onChange={(event) => {
              setChecked(event.target.checked);
              if (event.target.checked) setError(false);
            }}
            aria-invalid={invalid ? true : undefined}
            aria-describedby={invalid ? errorId : undefined}
            className="mt-0.5 size-5 shrink-0 accent-primary"
          />
          <span className="font-medium">{t("form.checkbox")}</span>
        </label>
        {invalid && (
          <p id={errorId} className="text-sm font-medium text-destructive" role="alert">
            {t("form.required")}
          </p>
        )}
      </div>
      <Button
        type="button"
        className="h-12 w-full text-base sm:w-auto sm:justify-self-start sm:px-8"
        onClick={() => void submit()}
        disabled={saving}
      >
        {saving ? <LoaderCircle className="animate-spin motion-reduce:animate-none" aria-hidden /> : <HeartHandshake aria-hidden />}
        {saving ? t("form.accepting") : t("form.accept")}
      </Button>
    </div>
  );
}
