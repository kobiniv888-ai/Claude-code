"use client";

import { useId, useState } from "react";
import { useTranslations } from "next-intl";
import { CheckIcon, HeartHandshakeIcon, LoaderCircleIcon, UsersIcon } from "lucide-react";
import { BayitBadge } from "@/components/ds/badges";
import { Button } from "@/components/ds/button";
import { WelcomeHomeIcon } from "@/components/ds/jewish-icons";
import { PledgeAccepted } from "@/components/pledge/pledge-form";
import { useRouter } from "@/i18n/navigation";
import { pledgeVersionKey } from "@/lib/pledge";
import { acceptPledge } from "@/lib/pledge/actions";
import { toast } from "@/lib/toast";
import { cn } from "@/lib/utils";
import type { StepProps } from "../step-props";

/** The pop-in of the house icon and the accepted check (transform/opacity only, off with reduced motion). */
const PLEDGE_MOTION_CSS = `
.bw-pop {
  animation: bw-pop 0.55s var(--ease-pop) both;
}
.bw-glow {
  animation: bw-glow 4s ease-in-out infinite alternate;
}
@keyframes bw-pop {
  from {
    opacity: 0;
    transform: scale(0.6);
  }
  to {
    opacity: 1;
    transform: none;
  }
}
@keyframes bw-glow {
  from {
    opacity: 0.5;
    transform: scale(1);
  }
  to {
    opacity: 0.85;
    transform: scale(1.1);
  }
}
@media (prefers-reduced-motion: reduce) {
  .bw-pop,
  .bw-glow {
    animation: none;
  }
}
`;

/**
 * The Bayit welcome pledge (required before publishing) as a warm, clear moment: the promise in
 * big letters, why it matters (with the badge guests will see), and one accept button.
 * It is saved on the account, not on the listing (acceptPledge stores the accepted version):
 * once the current version is accepted, every later listing shows the confirmed state.
 */
export function PledgeStep({ pledge, setPledge, errors }: StepProps) {
  const t = useTranslations("wizard.pledge.moment");
  const tp = useTranslations("pledge");
  const router = useRouter();
  const id = useId();
  const [checked, setChecked] = useState(false);
  const [error, setError] = useState(false);
  const [saving, setSaving] = useState(false);
  const checkboxId = `${id}-accept`;
  const errorId = `${id}-error`;
  const accepted = pledge.isCurrent;
  const invalid = !accepted && (error || !!errors.pledge) && !checked;

  const submit = async () => {
    if (!checked) {
      setError(true);
      document.getElementById(checkboxId)?.focus();
      return;
    }
    setSaving(true);
    const result = await acceptPledge({ version: pledge.currentVersion, accepted: true }).catch(() => null);
    setSaving(false);
    if (result?.ok) {
      toast.success(tp("form.success"));
      setPledge(result.data);
      return;
    }
    const code = result ? result.error : "network";
    toast.error(tp.has(`errors.${code}`) ? tp(`errors.${code}`) : tp("errors.server_error"));
    if (code === "pledge_outdated") router.refresh();
  };

  const reasons = [
    { key: "guests", icon: HeartHandshakeIcon },
    { key: "everyone", icon: UsersIcon },
  ] as const;

  return (
    <div className="grid gap-5 [&>*]:min-w-0">
      <style href="bayit-wizard-pledge" precedence="medium">
        {PLEDGE_MOTION_CSS}
      </style>

      {!accepted && pledge.mustReaccept && (
        <p className="rounded-card border border-border-strong/40 bg-surface-muted p-3.5 text-small font-semibold dark:bg-surface-muted/10">
          {tp("reaccept.updatedBody")}
        </p>
      )}

      {/* The promise itself. */}
      <figure className="relative isolate grid justify-items-center gap-4 overflow-hidden rounded-card bg-linear-to-b from-primary-tint to-card px-5 pt-7 pb-6 text-center border border-border sm:px-10 sm:pt-9 sm:pb-8">
        <span
          aria-hidden
          className="bw-glow pointer-events-none absolute -top-20 start-1/2 -z-10 size-64 -translate-x-1/2 rounded-full bg-primary/15 blur-3xl rtl:translate-x-1/2"
        />
        <span
          aria-hidden
          className="bw-pop flex size-20 items-center justify-center rounded-full bg-card text-primary-text shadow-raised ring-1 ring-primary/20"
        >
          {accepted ? <CheckIcon className="size-10" strokeWidth={2.5} /> : <WelcomeHomeIcon className="size-10" />}
        </span>
        <figcaption className="text-small font-bold text-primary-text">{tp("form.statementLabel")}</figcaption>
        <blockquote className="max-w-xl min-w-0 text-h3 leading-snug text-balance break-words text-foreground sm:text-h2">
          {tp(`${pledgeVersionKey(pledge.currentVersion)}.statement`)}
        </blockquote>
      </figure>

      {/* Why it matters. */}
      <section aria-labelledby={`${id}-why`} className="grid gap-3 rounded-card bg-card p-4 shadow-card ring-1 ring-foreground/5 sm:p-6 [&>*]:min-w-0">
        <h2 id={`${id}-why`} className="text-h3">
          {t("whyTitle")}
        </h2>
        <p className="text-body text-pretty text-muted-foreground">{tp("why")}</p>
        <ul className="grid grid-cols-[minmax(0,1fr)] gap-3">
          {reasons.map(({ key, icon: Icon }) => (
            <li key={key} className="flex items-start gap-3">
              <span className="flex size-10 shrink-0 items-center justify-center rounded-full bg-primary-tint text-primary-text">
                <Icon className="size-5" aria-hidden />
              </span>
              <span className="min-w-0 pt-2 text-small font-semibold text-pretty">{t(`reasons.${key}`)}</span>
            </li>
          ))}
          <li className="flex items-start gap-3">
            <span className="flex size-10 shrink-0 items-center justify-center rounded-full bg-primary-tint text-primary-text">
              <WelcomeHomeIcon className="size-5" aria-hidden />
            </span>
            <span className="grid min-w-0 grid-cols-[minmax(0,1fr)] gap-2 pt-2">
              <span className="text-small font-semibold text-pretty">{t("reasons.badge")}</span>
              <BayitBadge kind="welcomes" size="md" variant="solid" className="w-fit max-w-full" />
            </span>
          </li>
        </ul>
      </section>

      {/* Accept (or: already accepted). */}
      {accepted ? (
        <PledgeAccepted status={pledge} className="bw-pop" />
      ) : (
        <div className="grid gap-3">
          <label
            htmlFor={checkboxId}
            className={cn(
              "flex min-h-14 cursor-pointer items-center gap-3 rounded-card border-2 bg-card p-4 transition-colors has-[:focus-visible]:ring-3 has-[:focus-visible]:ring-ring/50 has-[:focus-visible]:outline-none",
              invalid ? "border-destructive" : checked ? "border-primary bg-primary-tint/60" : "border-border hover:border-primary/50",
            )}
          >
            {/* A real, visible checkbox drawn as a big box (appearance-none), with the check on top. */}
            <span className="relative flex size-7 shrink-0">
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
                className="peer size-7 cursor-pointer appearance-none rounded-lg border-2 border-input bg-card transition-colors outline-none checked:border-primary checked:bg-primary"
              />
              <CheckIcon
                aria-hidden
                strokeWidth={3}
                className="pointer-events-none absolute inset-1 size-5 text-primary-foreground opacity-0 transition-opacity peer-checked:opacity-100"
              />
            </span>
            <span className="text-body font-semibold">{tp("form.checkbox")}</span>
          </label>
          {invalid && (
            <p id={errorId} className="text-small font-semibold text-destructive" role="alert">
              {tp("form.required")}
            </p>
          )}
          <Button
            type="button"
            size="lg"
            className="w-full sm:w-auto sm:justify-self-center sm:px-10"
            onClick={() => void submit()}
            disabled={saving}
          >
            {saving ? (
              <LoaderCircleIcon className="animate-spin motion-reduce:animate-none" aria-hidden />
            ) : (
              <HeartHandshakeIcon aria-hidden />
            )}
            {saving ? tp("form.accepting") : tp("form.accept")}
          </Button>
        </div>
      )}
    </div>
  );
}
