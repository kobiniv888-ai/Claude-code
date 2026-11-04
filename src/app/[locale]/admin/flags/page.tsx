import { CalendarX2, CheckCheck, UserRoundX, UserX } from "lucide-react";
import type { Metadata } from "next";
import { getTranslations, setRequestLocale } from "next-intl/server";
import { UserStatusBadge } from "@/components/admin/badges";
import { Pill, type PillTone } from "@/components/admin/content/pill";
import { AdminPageHeader } from "@/components/admin/page-header";
import { AdminPagination } from "@/components/admin/pagination";
import { TabLinks } from "@/components/admin/tab-links";
import { Ltr } from "@/components/common/ltr";
import { EmptyState } from "@/components/common/states";
import type { AppLocale } from "@/config/site";
import type { BookingStatus, UserStatus } from "@/generated/prisma/enums";
import { Link } from "@/i18n/navigation";
import { HOST_REPORT_FLAG_MIN } from "@/lib/admin/flags";
import { enumParam, pageParam } from "@/lib/admin/params";
import { FLAG_STATES, FLAG_VIEWS, FLAGS_PAGE_SIZE, listFlags, type FlagState, type FlagView } from "@/lib/admin/server/flags";
import { requireStaff } from "@/lib/auth/session";
import { formatDate, formatDateRange, formatMoney, formatNumber, formatTime } from "@/lib/format";
import { FlagReviewButton } from "./_components/flag-review-button";

const STATUS_TONE: Record<BookingStatus, PillTone> = {
  CONFIRMED: "success",
  COMPLETED: "muted",
  CANCELLED_BY_GUEST: "muted",
  CANCELLED_BY_HOST: "warning",
  NO_SHOW: "warning",
};
const EMPTY_ICON = { cancellations: CalendarX2, noShows: UserX, hosts: UserRoundX } as const;

type Props = {
  params: Promise<{ locale: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
};

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: "admin.flags" });
  return { title: t("title"), robots: { index: false, follow: false } };
}

function hrefFor(view: FlagView, state: FlagState): string {
  const query = new URLSearchParams();
  if (view !== "cancellations") query.set("view", view);
  if (state !== "open") query.set("state", state);
  const qs = query.toString();
  return qs ? `/admin/flags?${qs}` : "/admin/flags";
}

/**
 * /admin/flags ("moderation"): host cancellations within 48 hours of the booking, no-shows (listed
 * only) and hosts with several reports (src/lib/admin/flags.ts), each with "mark reviewed" and
 * links to the booking, the listing and the actions on the host's page.
 */
export default async function FlagsPage({ params, searchParams }: Props) {
  const { locale } = await params;
  setRequestLocale(locale);
  await requireStaff("moderation");
  const query = await searchParams;
  const view = enumParam(query, "view", FLAG_VIEWS, "cancellations");
  const state = enumParam(query, "state", FLAG_STATES, "open");
  const [t, tb, result] = await Promise.all([
    getTranslations("admin.flags"),
    getTranslations("booking"),
    listFlags(view, state, pageParam(query), locale as AppLocale),
  ]);
  const n = (v: number) => formatNumber(v, locale);
  const when = (d: Date) => t("at", { date: formatDate(d, locale), time: formatTime(d, locale) });
  const reasonLabel = (status: BookingStatus, code: string | null) => {
    if (!code) return null;
    const key = status === "CANCELLED_BY_HOST" ? `hostReason.${code}` : `guestReason.${code}`;
    return tb.has(key) ? tb(key) : code;
  };

  return (
    <>
      <AdminPageHeader title={t("title")} description={t("description", { min: n(HOST_REPORT_FLAG_MIN) })} />
      <TabLinks
        label={t("viewsLabel")}
        active={view}
        items={FLAG_VIEWS.map((key) => ({
          key,
          href: hrefFor(key, state),
          label: t(`views.${key}`),
          count: result.counts[key],
          urgent: state === "open" && key !== "noShows",
        }))}
      />
      <nav aria-label={t("stateLabel")} className="mb-4 flex flex-wrap gap-2 text-sm">
        {FLAG_STATES.map((key) => (
          <Link
            key={key}
            href={hrefFor(view, key)}
            aria-current={key === state ? "page" : undefined}
            className={
              key === state
                ? "rounded-full bg-foreground px-3 py-1 font-medium text-background"
                : "rounded-full border px-3 py-1 text-muted-foreground hover:bg-muted hover:text-foreground"
            }
          >
            {t(`states.${key}`)}
          </Link>
        ))}
      </nav>
      <p className="mb-4 text-sm text-muted-foreground">{t(`viewHints.${view}`, { min: n(HOST_REPORT_FLAG_MIN) })}</p>

      {(view === "hosts" ? result.hosts.length : result.bookings.length) === 0 ? (
        <EmptyState bordered icon={state === "reviewed" ? CheckCheck : EMPTY_ICON[view]} title={t(`empty.${state}.${view}`)} description={t("emptyHint")} />
      ) : view === "hosts" ? (
        <ul className="divide-y rounded-xl border bg-card shadow-xs">
          {result.hosts.map((host) => (
            <li key={host.id} className="grid gap-2 p-3 sm:px-4">
              <div className="flex flex-wrap items-center gap-2">
                <Link href={`/admin/users/${host.id}`} className="font-medium underline-offset-4 hover:underline">
                  <span dir="auto">{host.name || t("noName")}</span>
                </Link>
                <UserStatusBadge status={host.status as UserStatus} className="h-5" />
                {host.turnedAway > 0 ? <Pill tone="danger">{t("turnedAway", { count: host.turnedAway })}</Pill> : null}
              </div>
              <p className="text-sm">
                {t("hostReports", { count: host.reports, open: n(host.openReports) })}
                {host.openCancellations > 0 ? <> · {t("hostCancellations", { count: host.openCancellations })}</> : null}
                {" · "}
                {t("hostListings", { count: host.listings })}
              </p>
              <p className="text-xs text-muted-foreground">
                {t("latestReport", { when: when(host.latestReportAt) })}
                {host.reviewedAt ? <> · {t("lastReviewed", { when: when(host.reviewedAt) })}</> : null}
              </p>
              <div className="flex flex-wrap items-center gap-2">
                {state === "open" ? <FlagReviewButton target={{ userId: host.id }} label={host.name} /> : null}
                <Link href={`/admin/users/${host.id}#reports`} className="inline-flex h-8 items-center rounded-md px-2 text-sm font-medium text-primary hover:underline">
                  {t("openReports")}
                </Link>
                <Link href={`/admin/users/${host.id}#actions`} className="inline-flex h-8 items-center rounded-md px-2 text-sm font-medium text-primary hover:underline">
                  {t("hostActions")}
                </Link>
              </div>
            </li>
          ))}
        </ul>
      ) : (
        <ul className="divide-y rounded-xl border bg-card shadow-xs">
          {result.bookings.map((row) => {
            const reason = reasonLabel(row.status, row.cancelReasonCode);
            return (
              <li key={row.id} className="grid gap-2 p-3 sm:px-4">
                <div className="flex flex-wrap items-center gap-2">
                  <Link href={`/admin/bookings/${row.id}`} className="font-mono text-sm font-semibold underline-offset-4 hover:underline">
                    <Ltr>{row.code}</Ltr>
                  </Link>
                  <Pill tone={STATUS_TONE[row.status]}>{tb(`status.${row.status}`)}</Pill>
                  {row.reportCount > 0 ? <Pill tone="danger">{t("bookingReports", { count: row.reportCount })}</Pill> : null}
                  <span className="ms-auto text-xs text-muted-foreground">{t("bookedAt", { when: when(row.createdAt) })}</span>
                </div>
                <p className="text-sm">
                  <Link href={`/admin/moderation/${row.listing.id}`} className="font-medium underline-offset-4 hover:underline">
                    <span dir="auto">{row.listing.title}</span>
                  </Link>{" "}
                  <span className="whitespace-nowrap text-muted-foreground">
                    · {t("listingId")} <Ltr>{row.listing.publicId}</Ltr>
                  </span>
                </p>
                <p className="flex flex-wrap gap-x-4 gap-y-1 text-sm">
                  <span>
                    {t("host")}{" "}
                    <Link href={`/admin/users/${row.host.id}`} className="font-medium underline-offset-4 hover:underline">
                      <span dir="auto">{row.host.name || t("noName")}</span>
                    </Link>
                  </span>
                  <span>
                    {t("guest")}{" "}
                    <Link href={`/admin/users/${row.guest.id}`} className="font-medium underline-offset-4 hover:underline">
                      <span dir="auto">{row.guest.name || t("noName")}</span>
                    </Link>
                  </span>
                </p>
                <p className="text-sm text-muted-foreground">
                  {formatDateRange(row.checkIn, row.checkOut, locale)} · {tb("nights", { count: row.nights })} ·{" "}
                  <Ltr>{formatMoney(row.total, row.currency, locale)}</Ltr>
                </p>
                {row.cancelledAt ? (
                  <div className="grid gap-1 rounded-lg bg-muted/60 p-2.5 text-sm">
                    <p>
                      {t("cancelledAt", { when: when(row.cancelledAt) })}{" "}
                      <span className="font-medium">{t("hoursAfter", { count: row.hoursToCancel ?? 0 })}</span>
                    </p>
                    {reason ? <p>{t("reason", { reason })}</p> : null}
                    {row.cancelReason ? (
                      <p className="whitespace-pre-line text-muted-foreground" dir="auto">
                        {row.cancelReason}
                      </p>
                    ) : null}
                  </div>
                ) : null}
                {row.noShowReportedAt ? <p className="text-sm">{t("noShowAt", { when: when(row.noShowReportedAt) })}</p> : null}
                <div className="flex flex-wrap items-center gap-2">
                  {row.flagReviewedAt ? (
                    <span className="text-xs text-muted-foreground">{t("reviewedBy", { name: row.reviewedBy ?? "—", when: when(row.flagReviewedAt) })}</span>
                  ) : (
                    <FlagReviewButton target={{ bookingId: row.id }} label={row.code} />
                  )}
                  <Link href={`/admin/bookings/${row.id}`} className="inline-flex h-8 items-center rounded-md px-2 text-sm font-medium text-primary hover:underline">
                    {t("openBooking")}
                  </Link>
                  {row.kind === "host_cancellation" ? (
                    <Link href={`/admin/users/${row.host.id}#actions`} className="inline-flex h-8 items-center rounded-md px-2 text-sm font-medium text-primary hover:underline">
                      {t("hostActions")}
                    </Link>
                  ) : null}
                </div>
              </li>
            );
          })}
        </ul>
      )}
      <AdminPagination pathname="/admin/flags" searchParams={query} page={result.page} pageSize={FLAGS_PAGE_SIZE} total={result.total} />
    </>
  );
}
