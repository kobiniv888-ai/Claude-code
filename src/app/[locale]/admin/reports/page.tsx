import { Flag, ImageIcon, ShieldAlert, Star, UserRound } from "lucide-react";
import type { Metadata } from "next";
import { getTranslations, setRequestLocale } from "next-intl/server";
import { ListingStatusBadge, ReportStatusBadge, UserStatusBadge } from "@/components/admin/badges";
import { AdminFilterBar } from "@/components/admin/filter-bar";
import { ListingThumb, PublicId, WhenText } from "@/components/admin/listing-bits";
import { AdminPageHeader } from "@/components/admin/page-header";
import { AdminPagination } from "@/components/admin/pagination";
import { TabLinks } from "@/components/admin/tab-links";
import { Ltr } from "@/components/common/ltr";
import { EmptyState } from "@/components/common/states";
import { Link } from "@/i18n/navigation";
import { enumParam, pageParam, param } from "@/lib/admin/params";
import { listReports, REPORT_REASON_FILTERS, REPORT_STATUS_FILTERS, REPORT_TABS, type ReportTab } from "@/lib/admin/server/reports";
import { ADMIN_PAGE_SIZE, coverUrl, localizedTitle } from "@/lib/admin/server/shared";
import { requireStaff } from "@/lib/auth/session";
import { dateToDay } from "@/lib/booking/dates";
import { formatDate, isolate } from "@/lib/format";
import { getRecentReviews } from "@/lib/reviews/queries";
import { cn } from "@/lib/utils";
import type { AppLocale } from "@/config/site";
import { StaffReviewList } from "./_components/staff-review-list";

export async function generateMetadata({ params }: PageProps<"/[locale]/admin/reports">): Promise<Metadata> {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: "admin.reports" });
  return { title: t("title"), robots: { index: false, follow: false } };
}

/**
 * /admin/reports — the report queue (brief 8.2 and 9): turned-away reports (urgent, first),
 * listing and profile reports, review reports. Reports are never public: staff only. The
 * "ביקורות" tab also lists the newest reviews, reported or not (reviews-2): staff can open any
 * review and hide it.
 */
export default async function ReportsPage({ params, searchParams }: PageProps<"/[locale]/admin/reports">) {
  const { locale } = await params;
  setRequestLocale(locale);
  const staff = await requireStaff("reports.view");
  const query = await searchParams;
  // "?kind=TURNED_AWAY" (links from the admin home) is the turned-away tab.
  const tab: ReportTab = param(query, "kind") === "TURNED_AWAY" ? "turnedAway" : enumParam(query, "tab", REPORT_TABS, "all");
  const filters = {
    tab,
    status: enumParam(query, "status", REPORT_STATUS_FILTERS, "OPEN"),
    reason: enumParam(query, "reason", REPORT_REASON_FILTERS),
  };
  const [t, tAdmin, tFields, tReviews, result] = await Promise.all([
    getTranslations("admin.reports"),
    getTranslations("admin"),
    getTranslations("listingFields"),
    getTranslations("reviews"),
    listReports(filters, pageParam(query), locale, staff),
  ]);
  const recentReviews = tab === "reviews" ? await getRecentReviews(20) : [];
  const reasonLabel = (reason: string) => (tFields.has(`reportReason.${reason}`) ? tFields(`reportReason.${reason}`) : reason);
  const tabHref = (key: ReportTab) => {
    const next = new URLSearchParams();
    if (key !== "all") next.set("tab", key);
    if (filters.status !== "OPEN") next.set("status", filters.status);
    const qs = next.toString();
    return qs ? `/admin/reports?${qs}` : "/admin/reports";
  };
  const counts = { all: result.counts.total, turnedAway: result.counts.turnedAway, listings: result.counts.general, reviews: result.counts.reviews };

  return (
    <>
      <AdminPageHeader title={t("title")} description={t("description")} />
      <TabLinks
        label={t("tabs.label")}
        active={tab}
        items={REPORT_TABS.map((key) => ({
          key,
          href: tabHref(key),
          label: t(`tabs.${key}`),
          count: counts[key],
          urgent: key === "turnedAway" || (key === "all" && result.counts.urgent > 0),
        }))}
      />
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
            name: "reason",
            label: t("filters.reason"),
            allLabel: tAdmin("filters.all"),
            options: REPORT_REASON_FILTERS.map((r) => ({ value: r, label: reasonLabel(r) })),
          },
        ]}
      />
      {tab === "reviews" && result.rows.length === 0 ? (
        <EmptyState bordered icon={Flag} title={t("emptyReviews")} description={t("emptyReviewsDescription")} />
      ) : result.rows.length === 0 ? (
        <EmptyState
          bordered
          icon={Flag}
          title={filters.status === "OPEN" ? t("emptyOpen") : t("empty")}
          description={filters.status === "OPEN" ? t("emptyOpenDescription") : t("emptyDescription")}
        />
      ) : (
        <ul className="divide-y overflow-hidden rounded-xl border bg-card shadow-xs">
          {result.rows.map((row) => {
            const urgent = row.priority === "URGENT" && row.status === "OPEN";
            const host = row.targetUser ?? row.listing?.owner ?? null;
            return (
              <li
                key={row.id}
                className={cn("relative flex gap-3 p-3 transition-colors hover:bg-muted/40 sm:p-4", urgent && "border-s-4 border-s-destructive")}
              >
                {row.listing ? (
                  <ListingThumb src={coverUrl(row.listing.photos)} alt="" />
                ) : (
                  <span className="flex size-12 shrink-0 items-center justify-center rounded-lg bg-muted text-muted-foreground">
                    {row.targetType === "REVIEW" ? <Star aria-hidden className="size-5" /> : <UserRound aria-hidden className="size-5" />}
                  </span>
                )}
                <div className="flex min-w-0 flex-1 flex-col gap-1">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <span className="flex min-w-0 flex-wrap items-center gap-2">
                      {urgent ? (
                        <span className="inline-flex h-5 items-center gap-1 rounded-full bg-destructive px-2 text-[11px] font-semibold text-destructive-foreground">
                          <ShieldAlert aria-hidden className="size-3" />
                          {t("urgent")}
                        </span>
                      ) : null}
                      <Link
                        href={`/admin/reports/${row.id}`}
                        className="font-medium outline-none after:absolute after:inset-0 after:content-[''] hover:underline focus-visible:after:ring-3 focus-visible:after:ring-ring/50"
                      >
                        {reasonLabel(row.reason)}
                      </Link>
                    </span>
                    <ReportStatusBadge status={row.status} />
                  </div>
                  <p className="flex flex-wrap items-center gap-x-2 gap-y-1 text-sm">
                    {row.targetType === "REVIEW" ? null : <span className="text-xs text-muted-foreground">{t(`kind.${row.kind}`)}:</span>}
                    {row.kind === "TURNED_AWAY" && host ? (
                      <>
                        <span dir="auto" className="font-medium">
                          {host.businessName || host.name}
                        </span>
                        <UserStatusBadge status={host.status} className="h-5" />
                        {row.listing ? <PublicId id={row.listing.publicId} /> : null}
                      </>
                    ) : row.targetType === "REVIEW" ? (
                      <>
                        <span>{row.reviewPart === "reply" ? tReviews("admin.replyTarget") : t("reviewTarget")}</span>
                        {row.review ? (
                          <>
                            <span className="text-xs text-muted-foreground">{tReviews("stars.label", { count: row.review.rating })}</span>
                            <PublicId id={row.review.listing.publicId} />
                            {row.review.hidden ? <span className="text-xs font-medium text-destructive">{tReviews("admin.hiddenBadge")}</span> : null}
                          </>
                        ) : null}
                      </>
                    ) : row.listing ? (
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
                  {row.booking || row.happenedOn || row.screenshots > 0 ? (
                    <p className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-muted-foreground">
                      {/* A turned-away report's booking code names its sender: ADMIN only (Q12). */}
                      {row.booking?.code ? (
                        <span>
                          {t("bookingLabel")} <Ltr className="font-medium text-foreground">{row.booking.code}</Ltr>
                        </span>
                      ) : null}
                      {row.happenedOn ? <span>{t("happened", { date: formatDate(dateToDay(row.happenedOn), locale, { day: "numeric", month: "short", year: "numeric" }) })}</span> : null}
                      {row.screenshots > 0 ? (
                        <span className="inline-flex items-center gap-1">
                          <ImageIcon aria-hidden className="size-3.5" />
                          {t("screenshotsCount", { count: row.screenshots })}
                        </span>
                      ) : null}
                    </p>
                  ) : null}
                  {row.details ? (
                    <p className="line-clamp-2 text-sm text-muted-foreground" dir="auto">
                      {row.details}
                    </p>
                  ) : null}
                  <p className="text-xs text-muted-foreground">
                    {row.reporterWithheld ? t("reporterWithheld") : t("reportedBy", { name: isolate(row.reporter?.name ?? tAdmin("common.guest")) })} · <WhenText date={row.createdAt} />
                    {row.actionTaken ? <> · {t(`actionTaken.${row.actionTaken as "resolved"}`)}</> : null}
                    {row.handledBy ? <> · {t("handledBy", { name: isolate(row.handledBy.name) })}</> : null}
                  </p>
                </div>
              </li>
            );
          })}
        </ul>
      )}
      <AdminPagination pathname="/admin/reports" searchParams={query} page={result.page} pageSize={ADMIN_PAGE_SIZE} total={result.total} />
      {tab === "reviews" ? (
        <section aria-labelledby="recent-reviews" className="mt-8 grid gap-3">
          <div className="grid gap-1">
            <h2 id="recent-reviews" className="text-base font-semibold">
              {tReviews("admin.recentTitle")}
            </h2>
            <p className="text-sm text-muted-foreground">{tReviews("admin.recentHint")}</p>
          </div>
          <StaffReviewList rows={recentReviews} locale={locale as AppLocale} empty={tReviews("admin.recentEmpty")} />
        </section>
      ) : null}
    </>
  );
}
