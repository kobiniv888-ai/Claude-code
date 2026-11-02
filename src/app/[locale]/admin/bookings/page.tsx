import type { Metadata } from "next";
import { getTranslations, setRequestLocale } from "next-intl/server";
import { CalendarCheck2, Flag, UserX } from "lucide-react";
import { Pill, type PillTone } from "@/components/admin/content/pill";
import { AdminPageHeader } from "@/components/admin/page-header";
import { AdminPagination } from "@/components/admin/pagination";
import { TabLinks } from "@/components/admin/tab-links";
import { Ltr } from "@/components/common/ltr";
import { EmptyState } from "@/components/common/states";
import type { AppLocale } from "@/config/site";
import type { BookingStatus } from "@/generated/prisma/enums";
import { Link } from "@/i18n/navigation";
import { enumParam, pageParam } from "@/lib/admin/params";
import { requireStaff } from "@/lib/auth/session";
import { ADMIN_BOOKING_VIEWS, ADMIN_BOOKINGS_PAGE_SIZE, listAdminBookings, type AdminBookingView } from "@/lib/booking/admin";
import { formatDate, formatDateRange, formatMoney, formatNumber, formatTime } from "@/lib/format";

type Props = {
  params: Promise<{ locale: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
};

const STATUS_TONE: Record<BookingStatus, PillTone> = {
  CONFIRMED: "success",
  COMPLETED: "muted",
  CANCELLED_BY_GUEST: "muted",
  CANCELLED_BY_HOST: "warning",
  NO_SHOW: "warning",
};

const EMPTY_ICON = { flagged: Flag, noShow: UserX, recent: CalendarCheck2 } as const;

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: "hostBooking.admin" });
  return { title: t("title"), robots: { index: false, follow: false } };
}

/**
 * /admin/bookings (staff with "moderation"): host cancellations flagged for review (within 48
 * hours of the booking, or "the host asked me to cancel"), no-show reports and the latest
 * bookings, with links to the listing, the host and the guest. Read-only for now.
 */
export default async function AdminBookingsPage({ params, searchParams }: Props) {
  const { locale } = await params;
  setRequestLocale(locale);
  await requireStaff("moderation");
  const query = await searchParams;
  const view: AdminBookingView = enumParam(query, "view", ADMIN_BOOKING_VIEWS, "flagged");
  const [t, tb, result] = await Promise.all([
    getTranslations("hostBooking.admin"),
    getTranslations("booking"),
    listAdminBookings(view, pageParam(query), locale as AppLocale),
  ]);
  const reasonLabel = (status: BookingStatus, code: string | null) => {
    if (!code) return null;
    const key = status === "CANCELLED_BY_HOST" ? `hostReason.${code}` : `guestReason.${code}`;
    return tb.has(key) ? tb(key) : code;
  };

  return (
    <>
      <AdminPageHeader title={t("title")} description={t("description")} />
      <TabLinks
        label={t("viewsLabel")}
        active={view}
        items={ADMIN_BOOKING_VIEWS.map((key) => ({
          key,
          href: key === "flagged" ? "/admin/bookings" : `/admin/bookings?view=${key}`,
          label: t(`views.${key}`),
          count: result.counts[key],
          urgent: key === "flagged",
        }))}
      />
      {result.rows.length === 0 ? (
        <EmptyState bordered icon={EMPTY_ICON[view]} title={t(`empty.${view}`)} />
      ) : (
        <ul className="divide-y rounded-xl border bg-card shadow-xs">
          {result.rows.map((row) => {
            const reason = reasonLabel(row.status, row.cancelReasonCode);
            return (
              <li key={row.id} className="grid gap-2 p-3 sm:px-4">
                <div className="flex flex-wrap items-center gap-2">
                  <Ltr className="font-mono text-sm font-semibold">{row.code}</Ltr>
                  <Pill tone={STATUS_TONE[row.status]}>{tb(`status.${row.status}`)}</Pill>
                  {row.flaggedForReview && <Pill tone="danger">{t("flagged")}</Pill>}
                  <span className="ms-auto text-xs text-muted-foreground">
                    {t("bookedAt", { date: formatDate(row.createdAt, locale), time: formatTime(row.createdAt, locale) })}
                  </span>
                </div>
                <p className="text-sm">
                  <Link href={`/admin/moderation/${row.listing.id}`} className="font-medium underline-offset-4 hover:underline">
                    <span dir="auto">{row.listing.title}</span>
                  </Link>{" "}
                  <span className="text-muted-foreground">
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
                  {tb("guests.total", { count: row.guests })} · <Ltr>{formatMoney(row.total, row.currency, locale)}</Ltr>
                </p>
                {row.cancelledAt && (
                  <div className="grid gap-1 rounded-lg bg-muted/60 p-2.5 text-sm">
                    <p>
                      {t("cancelledAt", { date: formatDate(row.cancelledAt, locale), time: formatTime(row.cancelledAt, locale) })}{" "}
                      <span className="font-medium">
                        {t("hoursAfter", { count: row.hoursToCancel ?? 0, hours: formatNumber(row.hoursToCancel ?? 0, locale) })}
                      </span>
                    </p>
                    {reason && <p>{t("reason", { reason })}</p>}
                    {row.cancelReason && (
                      <p className="whitespace-pre-line text-muted-foreground" dir="auto">
                        {row.cancelReason}
                      </p>
                    )}
                  </div>
                )}
                {row.noShowReportedAt && (
                  <p className="text-sm">{t("noShowAt", { date: formatDate(row.noShowReportedAt, locale) })}</p>
                )}
              </li>
            );
          })}
        </ul>
      )}
      <AdminPagination
        pathname="/admin/bookings"
        searchParams={query}
        page={result.page}
        pageSize={ADMIN_BOOKINGS_PAGE_SIZE}
        total={result.total}
      />
    </>
  );
}
