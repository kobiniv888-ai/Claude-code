import { Flag, UserRound } from "lucide-react";
import type { Metadata } from "next";
import { getTranslations, setRequestLocale } from "next-intl/server";
import { ListingStatusBadge, ReportStatusBadge, UserStatusBadge } from "@/components/admin/badges";
import { AdminFilterBar } from "@/components/admin/filter-bar";
import { ListingThumb, PublicId, WhenText } from "@/components/admin/listing-bits";
import { AdminPageHeader } from "@/components/admin/page-header";
import { AdminPagination } from "@/components/admin/pagination";
import { EmptyState } from "@/components/common/states";
import { Link } from "@/i18n/navigation";
import { enumParam, pageParam } from "@/lib/admin/params";
import {
  listReports,
  REPORT_REASONS,
  REPORT_STATUS_FILTERS,
  REPORT_TARGETS,
} from "@/lib/admin/server/reports";
import { ADMIN_PAGE_SIZE, coverUrl, localizedTitle } from "@/lib/admin/server/shared";
import { requireStaff } from "@/lib/auth/session";

export async function generateMetadata({ params }: PageProps<"/[locale]/admin/reports">): Promise<Metadata> {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: "admin.reports" });
  return { title: t("title"), robots: { index: false, follow: false } };
}

export default async function ReportsPage({ params, searchParams }: PageProps<"/[locale]/admin/reports">) {
  const { locale } = await params;
  setRequestLocale(locale);
  await requireStaff("reports.view");
  const query = await searchParams;
  const filters = {
    status: enumParam(query, "status", REPORT_STATUS_FILTERS, "OPEN"),
    targetType: enumParam(query, "target", REPORT_TARGETS),
    reason: enumParam(query, "reason", REPORT_REASONS),
  };
  const [t, tAdmin, tFields, result] = await Promise.all([
    getTranslations("admin.reports"),
    getTranslations("admin"),
    getTranslations("listingFields"),
    listReports(filters, pageParam(query), locale),
  ]);

  return (
    <>
      <AdminPageHeader title={t("title")} description={t("description")} />
      <AdminFilterBar
        fields={[
          {
            type: "select",
            name: "status",
            label: t("filters.status"),
            defaultValue: "OPEN",
            options: REPORT_STATUS_FILTERS.map((s) => ({ value: s, label: s === "all" ? tAdmin("filters.all") : tAdmin(`reportStatus.${s}`) })),
          },
          {
            type: "select",
            name: "target",
            label: t("filters.target"),
            allLabel: tAdmin("filters.all"),
            options: REPORT_TARGETS.map((s) => ({ value: s, label: tAdmin(`reportTarget.${s}`) })),
          },
          {
            type: "select",
            name: "reason",
            label: t("filters.reason"),
            allLabel: tAdmin("filters.all"),
            options: REPORT_REASONS.map((r) => ({ value: r, label: tFields(`reportReason.${r}`) })),
          },
        ]}
      />
      {result.rows.length === 0 ? (
        <EmptyState
          bordered
          icon={Flag}
          title={filters.status === "OPEN" ? t("emptyOpen") : t("empty")}
          description={filters.status === "OPEN" ? t("emptyOpenDescription") : t("emptyDescription")}
        />
      ) : (
        <ul className="divide-y overflow-hidden rounded-xl border bg-card shadow-xs">
          {result.rows.map((row) => (
            <li key={row.id} className="relative flex gap-3 p-3 transition-colors hover:bg-muted/40 sm:p-4">
              {row.listing ? (
                <ListingThumb src={coverUrl(row.listing.photos)} alt="" />
              ) : (
                <span className="flex size-12 shrink-0 items-center justify-center rounded-lg bg-muted text-muted-foreground">
                  <UserRound aria-hidden className="size-5" />
                </span>
              )}
              <div className="flex min-w-0 flex-1 flex-col gap-1">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <Link
                    href={`/admin/reports/${row.id}`}
                    className="font-medium outline-none after:absolute after:inset-0 after:content-[''] hover:underline focus-visible:after:ring-3 focus-visible:after:ring-ring/50"
                  >
                    {tFields(`reportReason.${row.reason}`)}
                  </Link>
                  <ReportStatusBadge status={row.status} />
                </div>
                <p className="flex flex-wrap items-center gap-x-2 gap-y-1 text-sm">
                  <span className="text-xs text-muted-foreground">{tAdmin(`reportTarget.${row.targetType}`)}:</span>
                  {row.listing ? (
                    <>
                      <PublicId id={row.listing.publicId} />
                      <span dir="auto" className="min-w-0 truncate">
                        {localizedTitle(row.listing, t("untitled"))}
                      </span>
                      <ListingStatusBadge status={row.listing.status} className="h-5" />
                    </>
                  ) : row.targetUser ? (
                    <>
                      <span dir="auto">{row.targetUser.name}</span>
                      <UserStatusBadge status={row.targetUser.status} className="h-5" />
                    </>
                  ) : (
                    <span className="text-muted-foreground">{t("targetGone")}</span>
                  )}
                </p>
                {row.details ? (
                  <p className="line-clamp-2 text-sm text-muted-foreground" dir="auto">
                    {row.details}
                  </p>
                ) : null}
                <p className="text-xs text-muted-foreground">
                  {t("reportedBy", { name: row.reporter?.name ?? tAdmin("common.guest") })} · <WhenText date={row.createdAt} />
                  {row.handledBy ? <> · {t("handledBy", { name: row.handledBy.name })}</> : null}
                </p>
              </div>
            </li>
          ))}
        </ul>
      )}
      <AdminPagination pathname="/admin/reports" searchParams={query} page={result.page} pageSize={ADMIN_PAGE_SIZE} total={result.total} />
    </>
  );
}
