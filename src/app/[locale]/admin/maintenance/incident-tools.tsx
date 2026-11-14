"use client";

import { LogOut, ShieldAlert, Wrench } from "lucide-react";
import { useLocale, useTranslations } from "next-intl";
import { useState } from "react";
import { ActionDialog } from "@/components/admin/action-dialog";
import { Pill } from "@/components/admin/content/pill";
import { useAdminAction } from "@/components/admin/use-admin-action";
import { endAllSessionsAction, setMaintenanceModeAction } from "@/lib/admin/maintenance/incident-actions";
import { formatDate } from "@/lib/format";
import { toast } from "@/lib/toast";

/**
 * Admin → Maintenance → "Emergency tools" (SECURITY_REPORT 12.5.c, 17.1): maintenance mode on/off and
 * "sign everyone out". Each asks for a fresh authenticator code (useAdminAction opens the dialog)
 * and the server checks everything again (src/lib/admin/maintenance/incident-actions.ts).
 */

export type IncidentToolsState = {
  on: boolean;
  /** "env": switched on at the hosting (MAINTENANCE_MODE); the button cannot turn that off. */
  source: "env" | "admin" | null;
  since: string | null;
};

const card = "rounded-xl border bg-card p-4 shadow-xs sm:p-5";

export function IncidentTools({ initial }: { initial: IncidentToolsState }) {
  const t = useTranslations("maintenance.admin");
  const locale = useLocale();
  const { run, pending } = useAdminAction();
  const [state, setState] = useState(initial);
  const fromEnv = state.source === "env";

  return (
    <section aria-labelledby="incident-title" className="grid gap-4">
      <div className="flex items-start gap-3">
        <span className="inline-flex size-10 shrink-0 items-center justify-center rounded-full bg-destructive/10 text-destructive">
          <ShieldAlert aria-hidden className="size-5" />
        </span>
        <div className="grid min-w-0 flex-1 gap-1">
          <h2 id="incident-title" className="text-base font-semibold">
            {t("title")}
          </h2>
          <p className="text-sm text-muted-foreground">{t("lead")}</p>
        </div>
      </div>

      <div className={card}>
        <div className="flex flex-wrap items-center gap-2">
          <Wrench aria-hidden className="size-5 text-muted-foreground" />
          <h3 className="text-sm font-semibold">{t("mode.title")}</h3>
          <Pill tone={state.on ? "danger" : "success"}>{state.on ? t("mode.pillOn") : t("mode.pillOff")}</Pill>
        </div>
        <p className="mt-2 text-sm" role="status">
          {state.on ? t("mode.on") : t("mode.off")}
        </p>
        {state.on && state.since && !fromEnv ? (
          <p className="mt-2 text-sm text-muted-foreground">
            {t("mode.since", { time: formatDate(state.since, locale, { dateStyle: "medium", timeStyle: "short" }) })}
          </p>
        ) : null}
        {fromEnv ? (
          <p className="mt-2 text-sm text-muted-foreground">{t("mode.env")}</p>
        ) : null}
        <p className="mt-2 text-sm text-muted-foreground">{t("mode.stays")}</p>
        {!fromEnv ? (
          <div className="mt-3">
            <ActionDialog
              triggerLabel={state.on ? t("mode.turnOff") : t("mode.turnOn")}
              triggerIcon={Wrench}
              triggerVariant={state.on ? "outline" : "destructive"}
              triggerClassName="h-11 rounded-xl sm:px-5"
              destructive={!state.on}
              disabled={pending}
              title={state.on ? t("mode.confirmOffTitle") : t("mode.confirmOnTitle")}
              description={state.on ? t("mode.confirmOffBody") : t("mode.confirmOnBody")}
              confirmLabel={state.on ? t("mode.turnOff") : t("mode.turnOn")}
              onConfirm={() =>
                run(() => setMaintenanceModeAction({ on: !state.on, confirm: true }), {
                  success: state.on ? t("mode.turnedOff") : t("mode.turnedOn"),
                  onSuccess: (data) => setState({ on: data.on, source: data.on ? "admin" : null, since: data.on ? new Date().toISOString() : null }),
                })
              }
            />
          </div>
        ) : null}
      </div>

      <div className={card}>
        <div className="flex flex-wrap items-center gap-2">
          <LogOut aria-hidden className="size-5 text-muted-foreground rtl:-scale-x-100" />
          <h3 className="text-sm font-semibold">{t("sessions.title")}</h3>
        </div>
        <p className="mt-2 text-sm text-muted-foreground">{t("sessions.lead")}</p>
        <div className="mt-3">
          <ActionDialog
            triggerLabel={t("sessions.button")}
            triggerIcon={LogOut}
            triggerVariant="destructive"
            triggerClassName="h-11 rounded-xl sm:px-5"
            destructive
            disabled={pending}
            title={t("sessions.confirmTitle")}
            description={t("sessions.confirmBody")}
            confirmLabel={t("sessions.button")}
            onConfirm={() =>
              run(() => endAllSessionsAction({ confirm: true }), {
                onSuccess: (data) => toast.success(t("sessions.done", { count: data.sessions })),
              })
            }
          />
        </div>
      </div>
    </section>
  );
}
