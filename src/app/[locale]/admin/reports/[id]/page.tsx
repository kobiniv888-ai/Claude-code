import { ExternalLink, Eye } from "lucide-react";
import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { getTranslations, setRequestLocale } from "next-intl/server";
import { AccountMarkers, ListingStatusBadge, ReportStatusBadge, RoleBadge, UserStatusBadge } from "@/components/admin/badges";
import { AdminPrice, ListingThumb, PublicId, WhenText } from "@/components/admin/listing-bits";
import { AdminPageHeader, AdminSection, FactList } from "@/components/admin/page-header";
import { ReportActions } from "@/components/admin/report-actions";
import { Ltr } from "@/components/common/ltr";
import { Link } from "@/i18n/navigation";
import { getReportDetail } from "@/lib/admin/server/reports";
import { cityName, coverUrl, localizedTitle } from "@/lib/admin/server/shared";
import { can } from "@/lib/auth/permissions";
import { requireStaff } from "@/lib/auth/session";
import { formatDate, formatNumber, formatRelativeTime } from "@/lib/format";
import { listingPath } from "@/lib/listing/urls";

export async function generateMetadata({ params }: PageProps<"/[locale]/admin/reports/[id]">): Promise<Metadata> {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: "admin.reports" });
  return { title: t("detailTitle"), robots: { index: false, follow: false } };
}

export default async function ReportDetailPage({ params }: PageProps<"/[locale]/admin/reports/[id]">) {
  const { locale, id } = await params;
  setRequestLocale(locale);
  const staff = await requireStaff("reports.view");
  const data = await getReportDetail(id, locale);
  if (!data) notFound();
  const { report, account, otherReports } = data;
  const [t, tAdmin, tFields] = await Promise.all([
    getTranslations("admin.reports"),
    getTranslations("admin"),
    getTranslations("listingFields"),
  ]);
  const canAct = can(staff.role, "reports");
  const n = (v: number) => formatNumber(v, locale);
  const listing = report.listing;
  const canWarn = !!account && account.id !== staff.id && account.status !== "BANNED" && account.status !== "SUSPENDED" && account.status !== "DELETED";

  return (
    <>
      <AdminPageHeader
        back={{ href: "/admin/reports", label: t("backToList") }}
        title={tFields(`reportReason.${report.reason}`)}
        meta={
          <>
            <ReportStatusBadge status={report.status} />
            <span>{tAdmin(`reportTarget.${report.targetType}`)}</span>
            <span aria-hidden>·</span>
            <WhenText date={report.createdAt} />
          </>
        }
      />

      {canAct ? (
        <div className="mb-5 rounded-xl border bg-card p-3 shadow-xs">
          <ReportActions
            reportId={report.id}
            open={report.status === "OPEN"}
            listingStatus={listing?.status ?? null}
            canWarn={canWarn}
            accountName={account ? account.businessName || account.name : null}
          />
          {listing?.status === "HIDDEN" ? <p className="mt-2 text-xs text-muted-foreground">{t("restoreHint")}</p> : null}
        </div>
      ) : (
        <p className="mb-5 flex items-center gap-2 rounded-xl border bg-card p-3 text-sm text-muted-foreground">
          <Eye aria-hidden className="size-4" />
          {t("readOnly")}
        </p>
      )}

      <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_22rem]">
        <div className="flex min-w-0 flex-col gap-4">
          <AdminSection title={t("reportTitle")}>
            <FactList
              items={[
                {
                  label: t("reporter"),
                  value: report.reporter ? (
                    <span className="inline-flex flex-wrap items-center gap-1.5">
                      <Link href={`/admin/users/${report.reporter.id}`} className="text-primary hover:underline" dir="auto">
                        {report.reporter.name}
                      </Link>
                      <UserStatusBadge status={report.reporter.status} className="h-5" />
                      <span className="text-xs text-muted-foreground">
                        {t("reporterStats", { count: report.reporter._count.reportsMade, age: formatRelativeTime(report.reporter.createdAt, locale) })}
                      </span>
                    </span>
                  ) : (
                    tAdmin("common.guest")
                  ),
                },
                { label: t("reason"), value: tFields(`reportReason.${report.reason}`) },
                { label: t("created"), value: formatDate(report.createdAt, locale) },
                {
                  label: t("handled"),
                  value: report.handledAt
                    ? t("handledValue", { name: report.handledBy?.name ?? "—", date: formatDate(report.handledAt, locale) })
                    : "—",
                },
              ]}
            />
            <div className="mt-4">
              <h3 className="mb-1 text-xs text-muted-foreground">{t("details")}</h3>
              <p className="rounded-lg border bg-background p-3 text-sm whitespace-pre-wrap" dir="auto">
                {report.details || t("noDetails")}
              </p>
            </div>
            {report.resolution ? (
              <div className="mt-4">
                <h3 className="mb-1 text-xs text-muted-foreground">{t("resolution")}</h3>
                <p className="rounded-lg border bg-background p-3 text-sm whitespace-pre-wrap" dir="auto">
                  {report.resolution}
                </p>
              </div>
            ) : null}
          </AdminSection>

          {listing ? (
            <AdminSection
              title={t("listingTitle")}
              actions={
                <span className="flex items-center gap-3">
                  {can(staff.role, "moderation") ? (
                    <Link href={`/admin/moderation/${listing.id}`} className="text-sm font-medium text-primary hover:underline">
                      {t("openReview")}
                    </Link>
                  ) : null}
                  {listing.status === "LIVE" ? (
                    <Link
                      href={listingPath(listing.publicId, listing.title)}
                      target="_blank"
                      rel="noopener"
                      className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground"
                    >
                      <ExternalLink aria-hidden className="size-3.5" />
                      <span className="sr-only">{t("viewOnSite")}</span>
                    </Link>
                  ) : null}
                </span>
              }
            >
              <div className="flex gap-3">
                <ListingThumb src={coverUrl(listing.photos, "md")} alt="" className="size-20" />
                <div className="flex min-w-0 flex-col gap-1 text-sm">
                  <p className="font-medium" dir="auto">
                    {localizedTitle(listing, t("untitled"))}
                  </p>
                  <p className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
                    <PublicId id={listing.publicId} />
                    <ListingStatusBadge status={listing.status} className="h-5" />
                    <span>{tFields(`dealType.${listing.dealType}`)}</span>
                    {cityName(listing.city, locale) ? <span>· {cityName(listing.city, locale)}</span> : null}
                  </p>
                  <AdminPrice amount={listing.price} currency={listing.currency} period={listing.pricePeriod} />
                  <p className="text-xs text-muted-foreground">
                    {t("listingReports", { open: n(listing._count.reports), total: n(listing.reportCount) })}
                  </p>
                </div>
              </div>
            </AdminSection>
          ) : null}

          <AdminSection title={t("otherReports", { count: otherReports.length })}>
            {otherReports.length === 0 ? (
              <p className="text-sm text-muted-foreground">{t("noOtherReports")}</p>
            ) : (
              <ul className="divide-y">
                {otherReports.map((r) => (
                  <li key={r.id} className="flex flex-wrap items-center gap-2 py-2 text-sm first:pt-0 last:pb-0">
                    <Link href={`/admin/reports/${r.id}`} className="font-medium hover:underline">
                      {tFields(`reportReason.${r.reason}`)}
                    </Link>
                    <ReportStatusBadge status={r.status} className="h-5" />
                    <span className="text-xs text-muted-foreground">
                      {tAdmin(`reportTarget.${r.targetType}`)} · {r.reporter?.name ?? tAdmin("common.guest")} · <WhenText date={r.createdAt} />
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </AdminSection>
        </div>

        <aside className="flex min-w-0 flex-col gap-4">
          <AdminSection
            title={report.targetUser ? t("reportedUser") : t("listingOwner")}
            actions={
              account ? (
                <Link href={`/admin/users/${account.id}`} className="text-sm font-medium text-primary hover:underline">
                  {t("openProfile")}
                </Link>
              ) : null
            }
          >
            {account ? (
              <div className="flex flex-col gap-2 text-sm">
                <div className="flex flex-wrap items-center gap-1.5">
                  <span className="font-medium" dir="auto">
                    {account.businessName || account.name}
                  </span>
                  <UserStatusBadge status={account.status} className="h-5" />
                  <RoleBadge role={account.role} className="h-5" />
                </div>
                <AccountMarkers user={account} />
                <FactList
                  className="sm:grid-cols-1"
                  items={[
                    { label: tAdmin("common.joined"), value: formatRelativeTime(account.createdAt, locale) },
                    { label: tAdmin("common.phone"), value: account.phoneNumber ? <Ltr>{account.phoneNumber}</Ltr> : "—" },
                    { label: t("accountListings"), value: n(account._count.listings) },
                    { label: t("accountReports"), value: n(account._count.reportsAgainst) },
                    ...(account.statusReason
                      ? [{ label: t("statusReason"), value: tAdmin.has(`userReasons.${account.statusReason}.label`) ? tAdmin(`userReasons.${account.statusReason}.label`) : account.statusReason }]
                      : []),
                  ]}
                />
              </div>
            ) : (
              <p className="text-sm text-muted-foreground">{t("targetGone")}</p>
            )}
          </AdminSection>
        </aside>
      </div>
    </>
  );
}
