import { CalendarRange, ExternalLink, Eye, History, ImageIcon, LockKeyhole, ShieldAlert, StickyNote } from "lucide-react";
import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { getTranslations, setRequestLocale } from "next-intl/server";
import { AccountMarkers, ListingStatusBadge, ReportStatusBadge, RoleBadge, UserStatusBadge } from "@/components/admin/badges";
import { AdminPrice, ListingThumb, PublicId, WhenText } from "@/components/admin/listing-bits";
import { AdminPageHeader, AdminSection, FactList } from "@/components/admin/page-header";
import { ReportActions } from "@/components/admin/report-actions";
import { Ltr } from "@/components/common/ltr";
import { Link } from "@/i18n/navigation";
import { auditActionKey } from "@/lib/admin/audit-labels";
import { isOwnItem } from "@/lib/admin/server/common";
import { hostFlagSummary } from "@/lib/admin/server/flags";
import { getReportDetail } from "@/lib/admin/server/reports";
import { cityName, coverUrl, localizedTitle } from "@/lib/admin/server/shared";
import { can } from "@/lib/auth/permissions";
import { requireStaff } from "@/lib/auth/session";
import { formatDate, formatNumber, formatRelativeTime, isolate } from "@/lib/format";
import { listingPath } from "@/lib/listing/urls";
import { canRevealReporter, reporterNameForHost } from "@/lib/reports/turned-away";
import { ReportNoteForm } from "../_components/report-note-form";
import { ReportScreenshotsViewer } from "../_components/report-screenshots-viewer";
import { AdminReviewPanel } from "../_components/review-panel";
import type { AppLocale } from "@/config/site";

export async function generateMetadata({ params }: PageProps<"/[locale]/admin/reports/[id]">): Promise<Metadata> {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: "admin.reports" });
  return { title: t("detailTitle"), robots: { index: false, follow: false } };
}

const HOST_REASONS = new Set(["DOUBLE_BOOKING", "PROPERTY_ISSUE", "OTHER"]);
const LONG_DAY = { day: "numeric", month: "long", year: "numeric" } as const;
const BOOKING_STATUSES = new Set(["CONFIRMED", "CANCELLED_BY_GUEST", "CANCELLED_BY_HOST", "COMPLETED", "NO_SHOW"]);

/**
 * /admin/reports/[id] — one report (brief 8.2 and 9): what the guest said, the linked booking,
 * the screenshots (staff with "reports" only, every opening audited), internal notes, the host's
 * history, everything done so far, and the decisions. SUPPORT sees it read-only.
 */
export default async function ReportDetailPage({ params }: PageProps<"/[locale]/admin/reports/[id]">) {
  const { locale, id } = await params;
  setRequestLocale(locale);
  const staff = await requireStaff("reports.view");
  const data = await getReportDetail(id, locale);
  if (!data) notFound();
  const { report, account, accountStats, otherReports, timeline } = data;
  const [t, tAdmin, tFields, tBooking, flag] = await Promise.all([
    getTranslations("admin.reports"),
    getTranslations("admin"),
    getTranslations("listingFields"),
    getTranslations("booking"),
    account ? hostFlagSummary(account.id) : Promise.resolve(null),
  ]);
  const canAct = can(staff.role, "reports");
  const n = (v: number) => formatNumber(v, locale);
  const reasonLabel = (reason: string) => (tFields.has(`reportReason.${reason}`) ? tFields(`reportReason.${reason}`) : reason);
  // "YYYY-MM-DD" calendar days (happenedOn) stay as they are; a moment (handledAt) is the day it
  // was in Georgia, the same day the facts list below shows.
  const day = (value: string | Date) => formatDate(value, locale, LONG_DAY);
  const listing = report.listing;
  const booking = report.booking;
  const turnedAway = report.kind === "TURNED_AWAY";
  const urgent = report.priority === "URGENT" && report.status === "OPEN";
  const blocked = !account || account.status === "BANNED" || account.status === "DELETED";
  const manageable = !!account && account.id !== staff.id && (account.role === "USER" || staff.role === "ADMIN");
  const hostName = account ? account.businessName || account.name : "";
  // About the staff member or sent by them: someone else decides (an ADMIN excepted).
  const own = isOwnItem(staff, [account?.id, report.reporter?.id]);
  // Null for a reporter who deleted their account (no name left to tell).
  const revealableName = turnedAway && !report.reporterRevealedAt && report.status !== "DISMISSED" && report.reporter
    ? reporterNameForHost({ reporterRevealedAt: new Date(), reporter: report.reporter })
    : null;
  // Telling the host who reported is the founder's decision (PLAN.md answer 10): ADMIN only.
  const revealName = revealableName && canRevealReporter(staff.role) ? revealableName : null;

  return (
    <>
      <AdminPageHeader
        back={{ href: turnedAway ? "/admin/reports?tab=turnedAway" : "/admin/reports", label: t("backToList") }}
        title={reasonLabel(report.reason)}
        meta={
          <>
            {urgent ? (
              <span className="inline-flex h-5 items-center gap-1 rounded-full bg-destructive px-2 text-[11px] font-semibold text-destructive-foreground">
                <ShieldAlert aria-hidden className="size-3" />
                {t("urgent")}
              </span>
            ) : null}
            <ReportStatusBadge status={report.status} />
            <span>{report.targetType === "REVIEW" ? t("tabs.reviews") : t(`kind.${report.kind}`)}</span>
            <span aria-hidden>·</span>
            <WhenText date={report.createdAt} />
          </>
        }
      />

      {canAct ? (
        <section aria-label={t("actions.title")} className="mb-5 rounded-xl border bg-card p-3 shadow-xs">
          {report.status !== "OPEN" ? (
            <p className="mb-3 text-sm">
              <span className="font-medium">{report.actionTaken ? t(`actionTaken.${report.actionTaken as "resolved"}`) : tAdmin(`reportStatus.${report.status}`)}</span>
              {report.handledAt ? <span className="text-muted-foreground"> · {t("handledValue", { name: isolate(report.handledBy?.name ?? "—"), date: day(report.handledAt) })}</span> : null}
            </p>
          ) : null}
          <ReportActions
            reportId={report.id}
            kind={report.kind}
            open={report.status === "OPEN"}
            listingStatus={report.kind === "GENERAL" ? (listing?.status ?? null) : null}
            host={
              account && manageable && !blocked
                ? {
                    name: hostName,
                    canWarn: account.status !== "SUSPENDED",
                    canAct: true,
                    liveListings: accountStats.liveListings,
                    upcomingBookings: accountStats.upcomingBookings,
                  }
                : null
            }
            canRemove={can(staff.role, "users.manage")}
            reveal={revealName ? { reporterName: revealName } : null}
            revealed={!!report.reporterRevealedAt}
            own={own}
            revealAdminOnly={!!revealableName && !revealName}
          />
          {listing?.status === "HIDDEN" && report.kind === "GENERAL" ? <p className="mt-2 text-xs text-muted-foreground">{t("restoreHint")}</p> : null}
        </section>
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
                { label: t("reason"), value: reasonLabel(report.reason) },
                ...(report.happenedOn ? [{ label: t("happenedOn"), value: day(report.happenedOn) }] : []),
                { label: t("created"), value: formatDate(report.createdAt, locale) },
                {
                  label: t("handled"),
                  value: report.handledAt ? t("handledValue", { name: isolate(report.handledBy?.name ?? "—"), date: formatDate(report.handledAt, locale) }) : "—",
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
            {turnedAway ? (
              <p className="mt-4 flex items-start gap-2 text-sm">
                <LockKeyhole aria-hidden className="mt-0.5 size-4 shrink-0 text-muted-foreground" />
                {report.reporterRevealedAt
                  ? t("reporterRevealed", { date: formatDate(report.reporterRevealedAt, locale) })
                  : canRevealReporter(staff.role)
                    ? t("reporterHidden")
                    : t("reporterHiddenStaff")}
              </p>
            ) : null}
          </AdminSection>

          {booking ? (
            <AdminSection
              title={
                <span className="inline-flex items-center gap-2">
                  <CalendarRange aria-hidden className="size-4 text-muted-foreground" />
                  {t("booking.title")}
                </span>
              }
              actions={
                can(staff.role, "moderation") ? (
                  <Link href={`/admin/bookings/${booking.id}`} className="text-sm font-medium text-primary hover:underline">
                    {t("booking.open")}
                  </Link>
                ) : null
              }
            >
              <FactList
                items={[
                  { label: t("booking.code"), value: <Ltr className="font-medium">{booking.code}</Ltr> },
                  { label: t("booking.status"), value: BOOKING_STATUSES.has(booking.status) ? tBooking(`status.${booking.status}`) : booking.status },
                  {
                    label: t("booking.dates"),
                    value: `${day(booking.checkIn)} – ${day(booking.checkOut)} · ${tBooking("nights", { count: booking.nights })}`,
                  },
                  { label: t("booking.made"), value: formatDate(booking.createdAt, locale) },
                  ...(booking.cancelledAt
                    ? [
                        {
                          label: t("booking.cancelled"),
                          value: (
                            <span className="inline-flex flex-wrap items-center gap-1.5">
                              {formatDate(booking.cancelledAt, locale)}
                              {booking.hoursToCancel !== null ? (
                                <span className="text-xs text-muted-foreground">{t("booking.hoursToCancel", { count: booking.hoursToCancel })}</span>
                              ) : null}
                              {booking.flaggedForReview ? (
                                <span className="inline-flex h-5 items-center rounded-full bg-destructive/10 px-2 text-[11px] font-medium text-destructive">{t("booking.flagged")}</span>
                              ) : null}
                            </span>
                          ),
                        },
                      ]
                    : []),
                  ...(booking.status === "CANCELLED_BY_HOST" && booking.cancelReasonCode
                    ? [
                        {
                          label: t("booking.cancelReason"),
                          value: (
                            <span dir="auto">
                              {HOST_REASONS.has(booking.cancelReasonCode) ? tBooking(`hostReason.${booking.cancelReasonCode}`) : booking.cancelReasonCode}
                              {booking.cancelReason ? `: ${booking.cancelReason}` : ""}
                            </span>
                          ),
                        },
                      ]
                    : []),
                ]}
              />
            </AdminSection>
          ) : null}

          {turnedAway || report.attachments.length > 0 || report.attachmentsDeletedAt ? (
            <AdminSection
              title={
                <span className="inline-flex items-center gap-2">
                  <ImageIcon aria-hidden className="size-4 text-muted-foreground" />
                  {t("screenshots.title")}
                </span>
              }
            >
              {report.attachmentsDeletedAt ? (
                <p className="text-sm text-muted-foreground">{t("screenshots.deleted", { date: formatDate(report.attachmentsDeletedAt, locale) })}</p>
              ) : report.attachments.length === 0 ? (
                <p className="text-sm text-muted-foreground">{t("screenshots.none")}</p>
              ) : canAct ? (
                <div className="flex flex-col gap-2">
                  <ReportScreenshotsViewer reportId={report.id} count={report.attachments.length} />
                  {report.screenshotsDeleteAt ? (
                    <p className="text-xs text-muted-foreground">{t("screenshots.deleteOn", { date: formatDate(report.screenshotsDeleteAt, locale) })}</p>
                  ) : (
                    <p className="text-xs text-muted-foreground">{t("screenshots.keptWhileOpen")}</p>
                  )}
                </div>
              ) : (
                <p className="text-sm text-muted-foreground">{t("screenshots.noAccess", { count: report.attachments.length })}</p>
              )}
            </AdminSection>
          ) : null}

          {listing ? (
            <AdminSection
              title={turnedAway ? t("listingFromTitle") : t("listingTitle")}
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
                      className="inline-flex min-h-9 items-center gap-1 text-sm text-muted-foreground hover:text-foreground"
                    >
                      <ExternalLink aria-hidden className="size-3.5 rtl:-scale-x-100" />
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
                  <p className="text-xs text-muted-foreground">{t("listingReports", { open: n(listing._count.reports), total: n(listing.reportCount) })}</p>
                </div>
              </div>
            </AdminSection>
          ) : report.targetType === "REVIEW" ? (
            // Round 3, brief 8.1: the reported review, and hide / show again (never edit).
            <AdminReviewPanel reviewId={report.reviewId} reportId={report.id} staff={staff} locale={locale as AppLocale} />
          ) : null}

          <AdminSection title={t("otherReports", { count: otherReports.length })}>
            {otherReports.length === 0 ? (
              <p className="text-sm text-muted-foreground">{t("noOtherReports")}</p>
            ) : (
              <ul className="divide-y">
                {otherReports.map((r) => (
                  <li key={r.id} className="flex flex-wrap items-center gap-2 py-2 text-sm first:pt-0 last:pb-0">
                    <Link href={`/admin/reports/${r.id}`} className="font-medium hover:underline">
                      {reasonLabel(r.reason)}
                    </Link>
                    <ReportStatusBadge status={r.status} className="h-5" />
                    <span className="text-xs text-muted-foreground">
                      {t(`kind.${r.kind}`)} · {r.reporter?.name ?? tAdmin("common.guest")} · <WhenText date={r.createdAt} />
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </AdminSection>

          <AdminSection
            title={
              <span className="inline-flex items-center gap-2">
                <History aria-hidden className="size-4 text-muted-foreground" />
                {t("timeline.title")}
              </span>
            }
          >
            <ol className="flex flex-col gap-2 text-sm">
              <li className="flex flex-wrap gap-x-2">
                <span className="font-medium">{t("timeline.sent")}</span>
                <span className="text-xs text-muted-foreground">
                  {report.reporter?.name ?? tAdmin("common.guest")} · {formatDate(report.createdAt, locale)}
                </span>
              </li>
              {timeline.map((entry) => (
                <li key={entry.id} className="flex flex-wrap gap-x-2">
                  <span className="font-medium">{tAdmin.has(`audit.${auditActionKey(entry.action)}`) ? tAdmin(`audit.${auditActionKey(entry.action)}`) : entry.action}</span>
                  <span className="text-xs text-muted-foreground">
                    {entry.actor?.name ?? tAdmin("audit.system")} · {formatDate(entry.createdAt, locale)}
                  </span>
                </li>
              ))}
            </ol>
          </AdminSection>
        </div>

        <aside className="flex min-w-0 flex-col gap-4">
          {/* A review report names no account (the review panel shows the guest and the host). */}
          {report.targetType !== "REVIEW" ? (
          <AdminSection
            title={turnedAway ? t("hostTitle") : report.targetUser ? t("reportedUser") : t("listingOwner")}
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
                    {hostName}
                  </span>
                  <UserStatusBadge status={account.status} className="h-5" />
                  <RoleBadge role={account.role} className="h-5" />
                </div>
                <AccountMarkers user={account} />
                {flag?.reportFlagOpen ? (
                  <Link href="/admin/flags?view=hosts" className="inline-flex items-center gap-1.5 self-start rounded-full bg-destructive/10 px-2.5 py-1 text-xs font-medium text-destructive hover:underline">
                    <ShieldAlert aria-hidden className="size-3.5" />
                    {t("hostFlagged", { count: flag.countingReports })}
                  </Link>
                ) : null}
                <FactList
                  className="sm:grid-cols-1"
                  items={[
                    { label: tAdmin("common.joined"), value: formatRelativeTime(account.createdAt, locale) },
                    { label: tAdmin("common.phone"), value: account.phoneNumber ? <Ltr>{account.phoneNumber}</Ltr> : "—" },
                    { label: t("liveListings"), value: n(accountStats.liveListings) },
                    { label: t("upcomingBookings"), value: n(accountStats.upcomingBookings) },
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
          ) : null}

          <AdminSection
            title={
              <span className="inline-flex items-center gap-2">
                <StickyNote aria-hidden className="size-4 text-muted-foreground" />
                {t("notes.title")}
              </span>
            }
          >
            <ReportNoteForm reportId={report.id} initial={report.adminNote ?? ""} readOnly={!canAct} />
          </AdminSection>
        </aside>
      </div>
    </>
  );
}
