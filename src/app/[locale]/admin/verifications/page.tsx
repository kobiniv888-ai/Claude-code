import { BadgeCheck, Info } from "lucide-react";
import type { Metadata } from "next";
import { getTranslations, setRequestLocale } from "next-intl/server";
import { AccountMarkers, VerificationStatusBadge } from "@/components/admin/badges";
import { AdminFilterBar } from "@/components/admin/filter-bar";
import { PublicId, WhenText } from "@/components/admin/listing-bits";
import { AdminPageHeader } from "@/components/admin/page-header";
import { AdminPagination } from "@/components/admin/pagination";
import { TabLinks } from "@/components/admin/tab-links";
import { EmptyState } from "@/components/common/states";
import { documentChecksOn } from "@/config/verification";
import { Link } from "@/i18n/navigation";
import { enumParam, pageParam, withParams } from "@/lib/admin/params";
import { ADMIN_PAGE_SIZE } from "@/lib/admin/server/shared";
import { listVerifications, VERIFICATION_STATUS_FILTERS, VERIFICATION_TYPES } from "@/lib/admin/server/verifications";
import { requireStaff } from "@/lib/auth/session";
import { formatRelativeTime } from "@/lib/format";

export async function generateMetadata({ params }: PageProps<"/[locale]/admin/verifications">): Promise<Metadata> {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: "admin.verifications" });
  return { title: t("title"), robots: { index: false, follow: false } };
}

export default async function VerificationsPage({ params, searchParams }: PageProps<"/[locale]/admin/verifications">) {
  const { locale } = await params;
  setRequestLocale(locale);
  await requireStaff("verifications");
  const query = await searchParams;
  const filters = {
    status: enumParam(query, "status", VERIFICATION_STATUS_FILTERS, "PENDING"),
    type: enumParam(query, "type", VERIFICATION_TYPES),
  };
  const [t, tAdmin, result] = await Promise.all([
    getTranslations("admin.verifications"),
    getTranslations("admin"),
    listVerifications(filters, pageParam(query)),
  ]);

  return (
    <>
      <AdminPageHeader title={t("title")} description={t("description")} />
      {documentChecksOn() ? null : (
        <p className="mb-4 flex items-start gap-2 rounded-xl border border-primary/20 bg-secondary/60 p-3 text-sm">
          <Info aria-hidden className="mt-0.5 size-4 shrink-0 text-primary" />
          <span>
            <span className="block font-medium">{t("paused.title")}</span>
            <span className="block text-muted-foreground">{t("paused.body")}</span>
          </span>
        </p>
      )}
      <TabLinks
        label={t("statusTabs")}
        active={filters.status}
        items={VERIFICATION_STATUS_FILTERS.map((s) => ({
          key: s,
          href: `/admin/verifications${withParams(query, { status: s === "PENDING" ? null : s })}`,
          label: s === "all" ? tAdmin("filters.all") : tAdmin(`verificationStatus.${s}`),
        }))}
      />
      <AdminFilterBar
        fields={[
          {
            type: "select",
            name: "type",
            label: t("typeFilter"),
            allLabel: tAdmin("filters.all"),
            options: VERIFICATION_TYPES.map((v) => ({ value: v, label: tAdmin(`verificationType.${v}`) })),
          },
        ]}
      />
      {result.rows.length === 0 ? (
        <EmptyState
          bordered
          icon={BadgeCheck}
          title={filters.status === "PENDING" ? t("emptyPending") : t("empty")}
          description={filters.status === "PENDING" ? t("emptyPendingDescription") : t("emptyDescription")}
        />
      ) : (
        <ul className="divide-y overflow-hidden rounded-xl border bg-card shadow-xs">
          {result.rows.map((row) => (
            <li key={row.id} className="relative flex flex-wrap items-center gap-x-3 gap-y-1.5 p-3 transition-colors hover:bg-muted/40 sm:p-4">
              <div className="flex min-w-0 flex-1 flex-col gap-1">
                <div className="flex flex-wrap items-center gap-2">
                  <Link
                    href={`/admin/verifications/${row.id}`}
                    className="font-medium outline-none after:absolute after:inset-0 after:content-[''] hover:underline focus-visible:after:ring-3 focus-visible:after:ring-ring/50"
                  >
                    {tAdmin(`verificationType.${row.type}`)}
                  </Link>
                  <VerificationStatusBadge status={row.status} />
                </div>
                <p className="flex flex-wrap items-center gap-x-2 gap-y-1 text-sm">
                  <span dir="auto">{row.user.businessName || row.user.name}</span>
                  <AccountMarkers user={row.user} />
                  <span className="text-xs text-muted-foreground">
                    {t("accountAge", { age: formatRelativeTime(row.user.createdAt, locale) })}
                  </span>
                </p>
                {row.listing ? (
                  <p className="flex items-center gap-1.5 text-xs text-muted-foreground">
                    <PublicId id={row.listing.publicId} />
                    <span dir="auto" className="truncate">
                      {row.listing.title}
                    </span>
                  </p>
                ) : null}
              </div>
              <div className="flex flex-col items-end gap-1 text-xs text-muted-foreground">
                <span>{row.documentsDeletedAt ? t("documentsDeleted") : t("documentCount", { count: row.documentCount })}</span>
                <span>
                  {row.reviewedAt ? (
                    <>
                      {row.reviewedBy?.name ?? "—"} · <WhenText date={row.reviewedAt} />
                    </>
                  ) : (
                    <>
                      {t("sent")} <WhenText date={row.createdAt} />
                    </>
                  )}
                </span>
              </div>
            </li>
          ))}
        </ul>
      )}
      <AdminPagination pathname="/admin/verifications" searchParams={query} page={result.page} pageSize={ADMIN_PAGE_SIZE} total={result.total} />
    </>
  );
}
