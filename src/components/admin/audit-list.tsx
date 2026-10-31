import { getLocale, getTranslations } from "next-intl/server";
import { Link } from "@/i18n/navigation";
import { auditActionKey, auditTargetHref } from "@/lib/admin/audit-labels";
import type { AuditRow } from "@/lib/admin/server/audit";
import { formatDate, formatTime } from "@/lib/format";
import { RoleBadge } from "./badges";

/** Audit entries, newest first, with the details as pretty JSON. */
export async function AuditList({ rows, compact = false }: { rows: AuditRow[]; compact?: boolean }) {
  const t = await getTranslations("admin.audit");
  const locale = await getLocale();
  if (rows.length === 0) return <p className="py-6 text-center text-sm text-muted-foreground">{t("empty")}</p>;
  return (
    <ol className="divide-y">
      {rows.map((row) => {
        const href = auditTargetHref(row.targetType, row.targetId);
        const label = t.has(auditActionKey(row.action)) ? t(auditActionKey(row.action)) : null;
        const hasDetails = !compact && row.details && typeof row.details === "object" && Object.keys(row.details).length > 0;
        return (
          <li key={row.id} className="flex flex-col gap-1.5 py-2.5 first:pt-0 last:pb-0">
            <div className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1">
              <div className="flex min-w-0 flex-wrap items-baseline gap-x-2 gap-y-1">
                <span className="text-sm font-medium">{label ?? row.action}</span>
                <code dir="ltr" className="rounded bg-muted px-1.5 py-0.5 font-mono text-[11px] text-muted-foreground">
                  {row.action}
                </code>
              </div>
              <time dateTime={row.createdAt.toISOString()} className="text-xs text-muted-foreground tabular-nums">
                {formatDate(row.createdAt, locale)} {formatTime(row.createdAt, locale)}
              </time>
            </div>
            <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-muted-foreground">
              <span className="inline-flex items-center gap-1.5">
                {row.actor ? (
                  <>
                    <Link href={`/admin/users/${row.actor.id}`} className="font-medium text-foreground hover:underline" dir="auto">
                      {row.actor.name}
                    </Link>
                    <RoleBadge role={row.actor.role} className="h-5" />
                  </>
                ) : (
                  t("system")
                )}
              </span>
              {row.targetType ? (
                <span>
                  {t.has(`targets.${row.targetType}`) ? t(`targets.${row.targetType}`) : row.targetType}{" "}
                  {href ? (
                    <Link href={href} className="font-mono text-foreground hover:underline">
                      <bdi dir="ltr">{row.targetId}</bdi>
                    </Link>
                  ) : row.targetId ? (
                    <bdi dir="ltr" className="font-mono">
                      {row.targetId}
                    </bdi>
                  ) : null}
                </span>
              ) : null}
            </div>
            {hasDetails ? (
              <details className="group text-xs">
                <summary className="w-fit cursor-pointer rounded text-primary outline-none select-none hover:underline focus-visible:ring-3 focus-visible:ring-ring/50">
                  {t("details")}
                </summary>
                <pre
                  dir="ltr"
                  className="mt-1.5 max-h-80 overflow-auto rounded-lg border bg-muted/50 p-3 text-start font-mono text-[11px] leading-relaxed whitespace-pre-wrap break-all"
                >
                  {JSON.stringify(row.details, null, 2)}
                </pre>
              </details>
            ) : null}
          </li>
        );
      })}
    </ol>
  );
}
