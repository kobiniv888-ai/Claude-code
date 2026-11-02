import "server-only";
import { CalendarClock, CloudOff, Info, OctagonAlert, ShieldCheck, TriangleAlert, type LucideIcon } from "lucide-react";
import { connection } from "next/server";
import { getTranslations } from "next-intl/server";
import type { AlertSeverity } from "@/generated/prisma/enums";
import { pickLocalized } from "@/i18n/locale";
import { db } from "@/lib/db";
import { cn } from "@/lib/utils";
import { Skeleton } from "@/components/ui/skeleton";
import { formatContentDate, isoDate } from "./format";
import { IconCircle } from "./icon-circle";

const severityStyle: Record<AlertSeverity, { icon: LucideIcon; card: string; chip: string; iconWrap: string }> = {
  INFO: {
    icon: Info,
    card: "border-primary/20 bg-card",
    chip: "bg-primary/10 text-primary",
    iconWrap: "bg-primary/10 text-primary",
  },
  WARNING: {
    icon: TriangleAlert,
    card: "border-border-strong/35 bg-surface-muted",
    chip: "bg-surface-muted text-foreground",
    iconWrap: "bg-card text-foreground",
  },
  CRITICAL: {
    icon: OctagonAlert,
    card: "border-destructive/40 bg-destructive/5 ring-1 ring-destructive/15",
    chip: "bg-destructive text-destructive-foreground",
    iconWrap: "bg-destructive/10 text-destructive",
  },
};

async function getActiveAlerts() {
  const now = new Date();
  return db.scamAlert.findMany({
    where: {
      active: true,
      startsAt: { lte: now },
      OR: [{ endsAt: null }, { endsAt: { gt: now } }],
    },
    orderBy: [{ startsAt: "desc" }, { createdAt: "desc" }],
    take: 20,
    select: { id: true, title: true, body: true, severity: true, startsAt: true, endsAt: true },
  });
}

/** Current scam alerts posted by admins (active, started, not ended), newest first. */
export async function ScamAlertList({ locale }: { locale: string }) {
  await connection();
  const t = await getTranslations({ locale, namespace: "safety" });

  let alerts: Awaited<ReturnType<typeof getActiveAlerts>>;
  try {
    alerts = await getActiveAlerts();
  } catch (error) {
    console.error("[safety] could not load scam alerts", error);
    return (
      <AlertsState icon={CloudOff} tone="muted" title={t("alerts.errorTitle")} body={t("alerts.errorBody")} />
    );
  }

  if (alerts.length === 0) {
    return (
      <AlertsState icon={ShieldCheck} tone="verified" title={t("alerts.emptyTitle")} body={t("alerts.emptyBody")} />
    );
  }

  return (
    <ul className="grid gap-4">
      {alerts.map((alert) => {
        const style = severityStyle[alert.severity];
        const Icon = style.icon;
        const title = pickLocalized(alert.title, locale);
        const body = pickLocalized(alert.body, locale);
        return (
          <li key={alert.id}>
            <article
              aria-labelledby={`alert-${alert.id}`}
              className={cn("flex gap-3 rounded-2xl border p-4 shadow-card sm:gap-4 sm:p-6", style.card)}
            >
              <span
                aria-hidden="true"
                className={cn("inline-flex size-10 shrink-0 items-center justify-center rounded-full sm:size-11", style.iconWrap)}
              >
                <Icon className="size-5.5" strokeWidth={1.9} />
              </span>
              <div className="min-w-0 flex-1">
                <div className="flex flex-wrap items-center gap-x-3 gap-y-1.5">
                  <span className={cn("rounded-full px-2.5 py-0.5 text-xs font-semibold", style.chip)}>
                    {t(`alerts.severity.${alert.severity}`)}
                  </span>
                  <span className="flex flex-wrap items-center gap-x-1.5 gap-y-0.5 text-xs text-muted-foreground">
                    <CalendarClock aria-hidden="true" className="size-3.5 shrink-0" />
                    <time dateTime={isoDate(alert.startsAt)} className="whitespace-nowrap">
                      {t("alerts.posted", { date: formatContentDate(alert.startsAt, locale) })}
                    </time>
                    {alert.endsAt ? (
                      <>
                        <span aria-hidden="true">·</span>
                        <time dateTime={isoDate(alert.endsAt)} className="whitespace-nowrap">
                          {t("alerts.until", { date: formatContentDate(alert.endsAt, locale) })}
                        </time>
                      </>
                    ) : null}
                  </span>
                </div>
                <h3 id={`alert-${alert.id}`} dir="auto" className="mt-2 text-lg font-semibold text-balance text-foreground">
                  {title}
                </h3>
                {body ? (
                  <p dir="auto" className="mt-1.5 leading-relaxed whitespace-pre-line text-foreground/85">
                    {body}
                  </p>
                ) : null}
              </div>
            </article>
          </li>
        );
      })}
    </ul>
  );
}

function AlertsState({
  icon,
  tone,
  title,
  body,
}: {
  icon: LucideIcon;
  tone: "verified" | "muted";
  title: string;
  body: string;
}) {
  return (
    <div className="flex flex-col items-center rounded-2xl border border-dashed bg-card px-6 py-10 text-center sm:py-12">
      <IconCircle icon={icon} tone={tone} size="lg" />
      <h3 className="mt-4 text-lg font-semibold">{title}</h3>
      <p className="mt-2 max-w-md text-sm leading-relaxed text-pretty text-muted-foreground">{body}</p>
    </div>
  );
}

/** Loading state while the alerts stream in. */
export function ScamAlertListSkeleton({ label }: { label: string }) {
  return (
    <div role="status" aria-label={label} className="grid gap-4">
      {[0, 1].map((i) => (
        <div key={i} className="flex gap-4 rounded-2xl border bg-card p-5 shadow-card sm:p-6">
          <Skeleton className="size-11 shrink-0 rounded-full" />
          <div className="flex-1 space-y-3">
            <Skeleton className="h-4 w-32" />
            <Skeleton className="h-5 w-3/4" />
            <Skeleton className="h-4 w-full" />
          </div>
        </div>
      ))}
    </div>
  );
}
