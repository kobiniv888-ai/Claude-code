"use client";

import { MessageSquareWarning, Play, RotateCcw } from "lucide-react";
import { useLocale, useTranslations } from "next-intl";
import type { AppLocale } from "@/config/site";
import { useState } from "react";
import { useAdminAction } from "@/components/admin/use-admin-action";
import { Ltr } from "@/components/common/ltr";
import { Button } from "@/components/ui/button";
import { formatNumber, formatTime } from "@/lib/format";
import { resetSmsBudgetAction, resumeSmsCountryAction } from "@/lib/auth/sms-control-actions";

/** The SMS state the page reads on the server (src/lib/auth/sms-guard.ts smsControlState), as plain data. */
export type SmsControlsState = {
  budget: { used: number; limit: number; untrustedLimit: number; resetAt: string | null };
  paused: { country: string; until: string }[];
};

/**
 * Admin → Maintenance → SMS codes (ADMIN only; SECURITY_REPORT 3.2.c/d): today's code-text budget
 * and the countries whose texts are paused (too few codes confirmed), with "resume" and "reset
 * today's budget". Each asks for a fresh authenticator code and is written to the audit log. The
 * founder alerts link here (#sms).
 */
export function SmsControls({ initial }: { initial: SmsControlsState }) {
  const t = useTranslations("security.smsControls");
  const locale = useLocale() as AppLocale;
  const { run, pending } = useAdminAction();
  const [state, setState] = useState(initial);
  const apply = (next: { budget: { used: number; limit: number; untrustedLimit: number; resetAt: Date | string | null }; paused: { country: string; until: Date | string }[] }) =>
    setState({
      budget: { ...next.budget, resetAt: next.budget.resetAt ? new Date(next.budget.resetAt).toISOString() : null },
      paused: next.paused.map((p) => ({ country: p.country, until: new Date(p.until).toISOString() })),
    });

  return (
    <section id="sms" aria-labelledby="sms-controls-title" className="grid gap-4 rounded-card border border-border bg-card p-4">
      <div className="flex items-start gap-3">
        <MessageSquareWarning className="mt-0.5 size-5 shrink-0 text-primary-text" aria-hidden />
        <div className="grid gap-1">
          <h2 id="sms-controls-title" className="text-base font-semibold">
            {t("title")}
          </h2>
          <p className="text-sm text-muted-foreground">{t("description")}</p>
        </div>
      </div>

      <div className="grid gap-2">
        <p className="text-sm">
          {t.rich("budget", {
            used: () => <Ltr>{formatNumber(state.budget.used, locale)}</Ltr>,
            limit: () => <Ltr>{formatNumber(state.budget.limit, locale)}</Ltr>,
          })}
        </p>
        <p className="text-xs text-muted-foreground">{t("reserve", { untrusted: formatNumber(state.budget.untrustedLimit, locale) })}</p>
        <Button
          variant="outline"
          className="min-h-11 w-full justify-center sm:w-auto"
          disabled={pending || state.budget.used === 0}
          onClick={() => run(() => resetSmsBudgetAction(), { success: t("budgetReset"), onSuccess: apply })}
        >
          <RotateCcw className="size-4" aria-hidden />
          {t("resetBudget")}
        </Button>
      </div>

      <div className="grid gap-2">
        {state.paused.length === 0 ? (
          <p className="text-sm text-muted-foreground">{t("noPause")}</p>
        ) : (
          <ul className="grid gap-2">
            {state.paused.map((pause) => (
              <li key={pause.country} className="flex flex-wrap items-center justify-between gap-2 rounded-lg bg-surface-muted p-3 text-sm">
                <span>
                  {t.rich("paused", {
                    country: () => <Ltr>{pause.country}</Ltr>,
                    time: () => <Ltr>{formatTime(new Date(pause.until), locale)}</Ltr>,
                  })}
                </span>
                <Button
                  className="min-h-11"
                  disabled={pending}
                  onClick={() => run(() => resumeSmsCountryAction({ country: pause.country }), { success: t("resumed"), onSuccess: apply })}
                >
                  <Play className="size-4 rtl:-scale-x-100" aria-hidden />
                  {t("resume")}
                </Button>
              </li>
            ))}
          </ul>
        )}
        <p className="text-xs text-muted-foreground">{t("proofNote")}</p>
      </div>
    </section>
  );
}
