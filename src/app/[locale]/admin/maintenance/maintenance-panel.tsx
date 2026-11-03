"use client";

import {
  AtSign,
  CheckCircle2,
  DatabaseBackup,
  FileX2,
  Info,
  Loader2,
  MousePointerClick,
  Phone,
  Play,
  ScanSearch,
  ShieldAlert,
  TriangleAlert,
  type LucideIcon,
} from "lucide-react";
import { useLocale, useTranslations } from "next-intl";
import { useState } from "react";
import { ActionDialog } from "@/components/admin/action-dialog";
import { Pill } from "@/components/admin/content/pill";
import { useAdminAction } from "@/components/admin/use-admin-action";
import { Ltr } from "@/components/common/ltr";
import { Button } from "@/components/ui/button";
import { createBackupAction, dryRunCleanupAction, runCleanupAction } from "@/lib/admin/maintenance/actions";
import type { BackupSummary } from "@/lib/admin/maintenance/backup-format";
import type { CleanupReport, MaintenanceHistory } from "@/lib/admin/maintenance/cleanups";
import type { CleanupName } from "@/lib/admin/maintenance/plan";
import { formatDate, formatNumber } from "@/lib/format";
import { toast } from "@/lib/toast";
import { cn } from "@/lib/utils";

/** Message keys and icons per clean-up (admin.maintenance.names.<key>). */
const NAME_KEY: Record<CleanupName, "phones" | "titleEmoji" | "contactTaps" | "verificationFiles"> = {
  phones: "phones",
  "title-emoji": "titleEmoji",
  "contact-taps": "contactTaps",
  "verification-files": "verificationFiles",
};
const NAME_ICON: Record<CleanupName, LucideIcon> = {
  phones: Phone,
  "title-emoji": AtSign,
  "contact-taps": MousePointerClick,
  "verification-files": FileX2,
};

const card = "rounded-xl border bg-card p-4 shadow-xs sm:p-5";

function useDateTime() {
  const locale = useLocale();
  return (iso: string) => formatDate(iso, locale, { dateStyle: "medium", timeStyle: "short" });
}

function BackupCard({
  backups,
  fresh,
  onBackup,
}: {
  backups: BackupSummary[];
  fresh: boolean;
  onBackup: (backups: BackupSummary[]) => void;
}) {
  const t = useTranslations("admin.maintenance.backup");
  const locale = useLocale();
  const when = useDateTime();
  const { run, pending } = useAdminAction();

  return (
    <section aria-labelledby="backup-title" className={card}>
      <div className="flex items-start gap-3">
        <span className="inline-flex size-10 shrink-0 items-center justify-center rounded-full bg-primary/10 text-primary">
          <DatabaseBackup aria-hidden className="size-5" />
        </span>
        <div className="grid min-w-0 flex-1 gap-1">
          <h2 id="backup-title" className="text-base font-semibold">
            {t("title")}
          </h2>
          <p className="text-sm text-muted-foreground">{t("lead")}</p>
        </div>
      </div>

      <Button
        type="button"
        className="mt-4 h-11 w-full rounded-xl sm:w-auto sm:px-6"
        disabled={pending}
        aria-busy={pending}
        onClick={() => run(() => createBackupAction(), { success: t("done"), onSuccess: (data) => onBackup(data.backups) })}
      >
        {pending ? <Loader2 aria-hidden className="animate-spin" /> : <DatabaseBackup aria-hidden />}
        {pending ? t("running") : t("cta")}
      </Button>

      <p
        role="status"
        className={cn(
          "mt-3 flex items-start gap-2 rounded-lg px-3 py-2 text-sm",
          fresh ? "bg-primary-tint text-foreground" : "bg-surface-muted text-foreground",
        )}
      >
        {fresh ? (
          <CheckCircle2 aria-hidden className="mt-0.5 size-4 shrink-0 text-success" />
        ) : (
          <Info aria-hidden className="mt-0.5 size-4 shrink-0 text-muted-foreground" />
        )}
        {fresh ? t("fresh") : t("stale")}
      </p>

      <h3 className="mt-5 text-sm font-semibold">{t("latest")}</h3>
      {backups.length === 0 ? (
        <p className="mt-2 text-sm text-muted-foreground">{t("none")}</p>
      ) : (
        <ul className="mt-2 divide-y rounded-lg border">
          {backups.map((b) => (
            <li key={b.id} className="flex flex-wrap items-center gap-x-3 gap-y-1 px-3 py-2.5 text-sm">
              <span className="font-medium">{when(b.createdAt)}</span>
              <span className="text-muted-foreground">
                {t("size", { size: formatNumber(b.totalBytes / 1024 / 1024, locale, { maximumFractionDigits: 2, minimumFractionDigits: 2 }) })}
              </span>
              <span className="text-muted-foreground">{t("rows", { count: b.totalRows, countText: formatNumber(b.totalRows, locale) })}</span>
              <span className="flex flex-wrap gap-1.5">
                <Pill tone="muted">{b.via === "cli" ? t("viaCli") : t("viaAdmin")}</Pill>
                {b.pgDump ? <Pill tone="success">{t("pgDump")}</Pill> : null}
              </span>
            </li>
          ))}
        </ul>
      )}
      <div className="mt-3 grid gap-1 text-xs text-muted-foreground">
        <span>{t("restore")}</span>
        <code dir="ltr" className="block rounded-md bg-muted px-2 py-1.5 font-mono text-start break-all text-foreground">
          {t("restoreCommand")}
        </code>
      </div>
      <p className="mt-1 text-xs text-muted-foreground">{t("hostNote")}</p>
    </section>
  );
}

function ReportView({ report }: { report: CleanupReport }) {
  const t = useTranslations("admin.maintenance");
  const locale = useLocale();
  const when = useDateTime();
  const lines = report.lines.filter((l) => l.count > 0);
  return (
    <div className="mt-4 grid gap-3" aria-live="polite">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h4 className="text-sm font-semibold">{report.mode === "run" ? t("cleanups.changed") : t("cleanups.willChange")}</h4>
        <span className="text-xs text-muted-foreground">{t("cleanups.checkedAt", { time: when(report.at) })}</span>
      </div>
      {lines.length === 0 ? (
        <p className="flex items-center gap-2 rounded-lg bg-primary-tint px-3 py-2 text-sm">
          <CheckCircle2 aria-hidden className="size-4 shrink-0 text-success" />
          {t("cleanups.nothing")}
        </p>
      ) : (
        <dl className="divide-y rounded-lg border text-sm">
          {lines.map((line) => (
            <div key={line.key} className={cn("flex items-start justify-between gap-3 px-3 py-2", line.warn && "bg-surface-muted")}>
              <dt className="flex min-w-0 items-start gap-1.5 [overflow-wrap:anywhere]">
                {line.warn ? <TriangleAlert aria-hidden className="mt-0.5 size-4 shrink-0 text-destructive" /> : null}
                {t(`lines.${line.key}` as "lines.phones.users")}
              </dt>
              <dd className="shrink-0 font-semibold tabular-nums">{formatNumber(line.count, locale)}</dd>
            </div>
          ))}
          <div className="flex items-center justify-between gap-3 bg-muted/50 px-3 py-2 font-semibold">
            <dt>{t("cleanups.total")}</dt>
            <dd className="tabular-nums">{formatNumber(report.changes, locale)}</dd>
          </div>
        </dl>
      )}
      {report.examples.length > 0 ? (
        <div>
          <h5 className="text-xs font-semibold text-muted-foreground">{t("cleanups.examples")}</h5>
          <ul className="mt-1.5 grid gap-1.5">
            {report.examples.map((example, i) => (
              <li key={i} className="grid gap-0.5 rounded-lg border px-3 py-2 text-sm">
                <span className="text-muted-foreground">
                  <span className="sr-only">{t("cleanups.before")}: </span>
                  <bdi dir="auto" className="line-through decoration-muted-foreground/60 [overflow-wrap:anywhere]">
                    {example.from}
                  </bdi>
                </span>
                {example.to !== null ? (
                  <span className="font-medium">
                    <span className="sr-only">{t("cleanups.after")}: </span>
                    <bdi dir="auto" className="[overflow-wrap:anywhere]">
                      {example.to}
                    </bdi>
                  </span>
                ) : null}
              </li>
            ))}
          </ul>
        </div>
      ) : null}
    </div>
  );
}

function CleanupCard({
  name,
  fresh,
  latestBackupAt,
  lastRun,
}: {
  name: CleanupName;
  fresh: boolean;
  latestBackupAt: string | null;
  lastRun: MaintenanceHistory["runs"][CleanupName];
}) {
  const t = useTranslations("admin.maintenance");
  const locale = useLocale();
  const when = useDateTime();
  // The run refreshes the page (last run); the dry run only shows its result.
  const { run, pending: running, errorText } = useAdminAction();
  const [checking, setChecking] = useState(false);
  const [report, setReport] = useState<CleanupReport | null>(null);
  const busy = checking || running;
  const key = NAME_KEY[name];
  const Icon = NAME_ICON[name];
  const title = t(`names.${key}.title`);
  const canRun = fresh && report?.mode === "dry_run" && report.changes > 0;

  return (
    <section aria-labelledby={`cleanup-${name}`} className={card}>
      <div className="flex items-start gap-3">
        <span className="inline-flex size-10 shrink-0 items-center justify-center rounded-full bg-secondary text-primary">
          <Icon aria-hidden className="size-5" />
        </span>
        <div className="grid min-w-0 flex-1 gap-1">
          <h3 id={`cleanup-${name}`} className="text-base font-semibold">
            {title}
          </h3>
          <p className="text-sm text-muted-foreground">
            {t.rich(`names.${key}.lead`, { ltr: (chunks) => <Ltr>{chunks}</Ltr> })}
          </p>
          <p className="text-xs text-muted-foreground">
            {lastRun ? t("cleanups.lastRun", { date: when(lastRun.at) }) : t("cleanups.neverRun")}
          </p>
        </div>
      </div>

      <div className="mt-4 flex flex-col gap-2 sm:flex-row">
        <Button
          type="button"
          variant="outline"
          className="h-11 rounded-xl sm:px-5"
          disabled={busy}
          aria-busy={checking}
          onClick={async () => {
            setChecking(true);
            try {
              const result = await dryRunCleanupAction({ name });
              if (result.ok) setReport(result.data);
              else toast.error(errorText(result.error));
            } catch {
              toast.error(errorText("network"));
            } finally {
              setChecking(false);
            }
          }}
        >
          {checking ? <Loader2 aria-hidden className="animate-spin" /> : <ScanSearch aria-hidden />}
          {checking ? t("cleanups.checking") : t("cleanups.dryRun")}
        </Button>
        {report?.mode === "dry_run" && report.changes > 0 ? (
          <ActionDialog
            triggerLabel={t("cleanups.run")}
            triggerIcon={Play}
            triggerVariant="default"
            triggerClassName="h-11 rounded-xl sm:px-5"
            disabled={!canRun || busy}
            destructive={name === "verification-files"}
            title={t("cleanups.runTitle", { name: title })}
            description={
              <>
                {t("cleanups.runDescription", {
                  count: report.changes,
                  countText: formatNumber(report.changes, locale),
                  time: latestBackupAt ? when(latestBackupAt) : "—",
                })}
                {name === "verification-files" ? (
                  <span className="mt-2 flex items-start gap-1.5 font-medium text-destructive">
                    <ShieldAlert aria-hidden className="mt-0.5 size-4 shrink-0" />
                    {t("cleanups.filesWarning")}
                  </span>
                ) : null}
              </>
            }
            confirmLabel={t("cleanups.runConfirm")}
            onConfirm={() => run(() => runCleanupAction({ name, confirm: true }), { success: t("cleanups.done"), onSuccess: setReport })}
          />
        ) : null}
      </div>
      {report?.mode === "dry_run" && report.changes > 0 && !fresh ? (
        <p className="mt-2 flex items-center gap-1.5 text-xs font-medium text-destructive">
          <Info aria-hidden className="size-3.5 shrink-0" />
          {t("cleanups.needsBackup")}
        </p>
      ) : null}

      {report ? <ReportView report={report} /> : null}
    </section>
  );
}

export function MaintenancePanel({
  initialBackups,
  initialFresh,
  names,
  lastRuns,
}: {
  initialBackups: BackupSummary[];
  initialFresh: boolean;
  names: CleanupName[];
  lastRuns: MaintenanceHistory["runs"];
}) {
  const t = useTranslations("admin.maintenance.cleanups");
  const [backups, setBackups] = useState(initialBackups);
  const [fresh, setFresh] = useState(initialFresh);

  return (
    <div className="grid gap-5">
      <BackupCard
        backups={backups}
        fresh={fresh}
        onBackup={(list) => {
          setBackups(list);
          setFresh(true);
        }}
      />
      <section aria-labelledby="cleanups-title" className="grid gap-3">
        <div className="grid gap-1">
          <h2 id="cleanups-title" className="text-base font-semibold">
            {t("title")}
          </h2>
          <p className="text-sm text-muted-foreground">{t("lead")}</p>
        </div>
        <div className="grid gap-4 lg:grid-cols-2">
          {names.map((name) => (
            <CleanupCard key={name} name={name} fresh={fresh} latestBackupAt={backups[0]?.createdAt ?? null} lastRun={lastRuns[name]} />
          ))}
        </div>
      </section>
    </div>
  );
}
