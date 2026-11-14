"use client";

import { useCallback, useEffect, useMemo, useState, type ReactNode } from "react";
import { useTranslations } from "next-intl";
import { Link } from "@/i18n/navigation";
import { termsStatusAction } from "@/lib/legal/actions";
import { TERMS_CONSENT, type TermsPurpose } from "@/lib/legal/terms";
import { cn } from "@/lib/utils";

/**
 * The "I am 18 or older and I accept the Terms of use" box (SECURITY_REPORT 15.11.b/c) of the
 * booking review page and the listing publish step. The server decides (requireTermsFor): the box
 * shows when the account must accept (its first booking / publish, or the Terms changed since its
 * last acceptance), and the request then carries `{ termsAccepted: true, ageConfirmed: true }`.
 * A "terms_required" answer from the server shows the box too (`require()`), so the page and the
 * server can never disagree for long.
 *
 *   const consent = useTermsConsent("booking", { initialNeeded: user.termsNeeded });
 *   if (!consent.validate()) return focus(consent.id);
 *   await createBookingAction({ ...input, ...consent.payload() });
 *   <TermsConsentField consent={consent} />
 */

export type TermsConsentState = {
  /** The checkbox's id (for focus and scrolling). */
  id: string;
  /** True: the box shows and must be ticked; null: not known yet. */
  needed: boolean | null;
  checked: boolean;
  error: boolean;
  setChecked: (value: boolean) => void;
  /** The server answered "terms_required": show the box (with its error). */
  require: () => void;
  /** False (and the error shows) when the box is needed and not ticked. */
  validate: () => boolean;
  /** What the request adds: the consent when the box is ticked, nothing otherwise. */
  payload: () => Partial<typeof TERMS_CONSENT>;
};

export function useTermsConsent(
  purpose: Exclude<TermsPurpose, "signup">,
  opts: { initialNeeded?: boolean | null; id?: string; enabled?: boolean } = {},
): TermsConsentState {
  const id = opts.id ?? `terms-${purpose}`;
  const enabled = opts.enabled ?? true;
  const [needed, setNeeded] = useState<boolean | null>(opts.initialNeeded ?? null);
  const [checked, setCheckedState] = useState(false);
  const [error, setError] = useState(false);
  const known = opts.initialNeeded !== undefined && opts.initialNeeded !== null;

  useEffect(() => {
    if (known || !enabled) return;
    let alive = true;
    termsStatusAction(purpose)
      .then((result) => {
        // Unknown (signed out, a network error): show the box; the server decides anyway.
        if (alive) setNeeded(result.ok ? result.data.needed : true);
      })
      .catch(() => {
        if (alive) setNeeded(true);
      });
    return () => {
      alive = false;
    };
  }, [purpose, known, enabled]);

  const setChecked = useCallback((value: boolean) => {
    setCheckedState(value);
    if (value) setError(false);
  }, []);
  const require = useCallback(() => {
    setNeeded(true);
    setError(true);
  }, []);

  return useMemo(
    () => ({
      id,
      needed,
      checked,
      error,
      setChecked,
      require,
      validate: () => {
        if (needed !== false && !checked) {
          // Not known yet counts as needed: the server would refuse without the box.
          setNeeded(true);
          setError(true);
          return false;
        }
        return true;
      },
      payload: () => (checked ? TERMS_CONSENT : {}),
    }),
    [id, needed, checked, error, setChecked, require],
  );
}

function legalLink(href: "/legal/terms" | "/legal/privacy") {
  return function LegalLink(chunks: ReactNode) {
    return (
      <Link href={href} target="_blank" rel="noopener" className="font-medium text-primary underline underline-offset-4">
        {chunks}
      </Link>
    );
  };
}

/** The box itself; renders nothing while it is not needed. */
export function TermsConsentField({ consent, className }: { consent: TermsConsentState; className?: string }) {
  const t = useTranslations("auth.terms");
  if (consent.needed !== true) return null;
  const errorId = `${consent.id}-error`;
  const hintId = `${consent.id}-hint`;
  return (
    <div className={cn("grid gap-2", className)}>
      <label
        className={cn(
          "flex cursor-pointer items-start gap-3 rounded-xl border p-3.5 has-[:focus-visible]:ring-3 has-[:focus-visible]:ring-ring/50",
          consent.error ? "border-destructive" : "border-border",
        )}
        data-invalid={consent.error ? true : undefined}
      >
        <input
          id={consent.id}
          type="checkbox"
          checked={consent.checked}
          onChange={(event) => consent.setChecked(event.target.checked)}
          aria-invalid={consent.error ? true : undefined}
          aria-describedby={consent.error ? `${hintId} ${errorId}` : hintId}
          className="mt-0.5 size-5 shrink-0 accent-primary"
        />
        <span className="grid gap-0.5">
          <span className="text-sm font-medium">{t.rich("label", { terms: legalLink("/legal/terms") })}</span>
          <span id={hintId} className="text-xs text-muted-foreground">
            {t.rich("hint", { privacy: legalLink("/legal/privacy") })}
          </span>
        </span>
      </label>
      {consent.error ? (
        <p id={errorId} role="alert" className="text-sm font-medium text-destructive">
          {t("required")}
        </p>
      ) : null}
    </div>
  );
}
