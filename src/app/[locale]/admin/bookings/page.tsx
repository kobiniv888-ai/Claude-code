import { BellOff, CalendarCheck2, SearchX } from "lucide-react";
import type { Metadata } from "next";
import { getTranslations, setRequestLocale } from "next-intl/server";
import { Pill, type PillTone } from "@/components/admin/content/pill";
import { AdminFilterBar } from "@/components/admin/filter-bar";
import { AdminPageHeader } from "@/components/admin/page-header";
import { AdminPagination } from "@/components/admin/pagination";
import { TabLinks } from "@/components/admin/tab-links";
import { Ltr } from "@/components/common/ltr";
import { EmptyState } from "@/components/common/states";
import type { AppLocale } from "@/config/site";
import type { BookingStatus } from "@/generated/prisma/enums";
import { Link } from "@/i18n/navigation";
import { ADMIN_BOOKING_STATUSES, parseDay } from "@/lib/admin/booking-search";
import { ATTENTION_EVENT_DAYS } from "@/lib/admin/attention";
import { enumParam, pageParam, param } from "@/lib/admin/params";
import { ADMIN_BOOKING_VIEWS, ADMIN_BOOKINGS_PAGE_SIZE, listHostUnreachable, searchBookings } from "@/lib/admin/server/bookings";
import { requireStaff } from "@/lib/auth/session";
import { formatDate, formatDateRange, formatMoney, formatTime, isolate } from "@/lib/format";

const STATUS_TONE: Record<BookingStatus, PillTone> = {
  CONFIRMED: "success",
  COMPLETED: "muted",
  CANCELLED_BY_GUEST: "muted",
  CANCELLED_BY_HOST: "warning",
  NO_SHOW: "warning",
};

export async function generateMetadata({ params }: PageProps<"/[locale]/admin/bookings">): Promise<Metadata> {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: "admin.bookings" });
  return { title: t("title"), robots: { index: false, follow: false } };
}

/**
 * /admin/bookings ("moderation"): search by booking code, guest, host, listing number, stay dates
 * and status, with a link to each booking's staff page; and the booking attempts refused because
 * the host could not be told (phase 1). Flags (48-hour cancellations, no-shows) are in /admin/flags.
 */
export default async function AdminBookingsPage({ params, searchParams }: PageProps<"/[locale]/admin/bookings">) {
  const { locale } = await params;
  setRequestLocale(locale);
  await requireStaff("moderation");
  const query = await searchParams;
  const view = enumParam(query, "view", ADMIN_BOOKING_VIEWS, "all");
  const filters = {
    q: param(query, "q").slice(0, 120),
    status: enumParam(query, "status", ADMIN_BOOKING_STATUSES),
    from: parseDay(param(query, "from")),
    to: parseDay(param(query, "to")),
  };
  const page = pageParam(query);
  const [t, tb, result, unreachable] = await Promise.all([
    getTranslations("admin.bookings"),
    getTranslations("booking"),
    view === "all" ? searchBookings(filters, page, locale as AppLocale) : Promise.resolve(null),
    listHostUnreachable(view === "unreachable" ? page : 1),
  ]);
  const when = (d: Date) => t("at", { date: formatDate(d, locale), time: formatTime(d, locale) });
  const filtered = Boolean(filters.q || filters.status || filters.from || filters.to);

  return (
    <>
      <AdminPageHeader title={t("title")} description={t("description")} />
      <TabLinks
        label={t("viewsLabel")}
        active={view}
        items={[
          { key: "all", href: "/admin/bookings", label: t("views.all") },
          { key: "unreachable", href: "/admin/bookings?view=unreachable", label: t("views.unreachable"), count: unreachable.total, urgent: false },
        ]}
      />

      {view === "all" && result ? (
        <>
          <AdminFilterBar
            fields={[
              { type: "search", name: "q", label: t("searchLabel"), placeholder: t("searchPlaceholder"), wide: true },
              {
                type: "select",
                name: "status",
                label: t("filters.status"),
                allLabel: t("filters.all"),
                options: ADMIN_BOOKING_STATUSES.map((s) => ({ value: s, label: tb(`status.${s}`) })),
              },
              { type: "date", name: "from", label: t("filters.from") },
              { type: "date", name: "to", label: t("filters.to") },
            ]}
          />
          {result.rows.length === 0 ? (
            <EmptyState
              bordered
              icon={filtered ? SearchX : CalendarCheck2}
              title={filtered ? t("emptySearch") : t("empty")}
              description={filtered ? t("emptySearchHint") : t("emptyHint")}
            />
          ) : (
            <ul className="divide-y rounded-xl border bg-card shadow-xs">
              {result.rows.map((row) => (
                <li key={row.id} className="relative grid gap-1.5 p-3 sm:px-4">
                  <div className="flex flex-wrap items-center gap-2">
                    <Link
                      href={`/admin/bookings/${row.id}`}
                      className="font-mono text-sm font-semibold outline-none after:absolute after:inset-0 after:content-[''] hover:underline focus-visible:after:ring-3 focus-visible:after:ring-ring/50"
                    >
                      <Ltr>{row.code}</Ltr>
                    </Link>
                    <Pill tone={STATUS_TONE[row.status]}>{tb(`status.${row.status}`)}</Pill>
                    {row.flag && row.flagOpen ? <Pill tone="danger">{t(`flag.${row.flag}`)}</Pill> : null}
                    {row.reportCount > 0 ? <Pill tone="danger">{t("reports", { count: row.reportCount })}</Pill> : null}
                    <span className="ms-auto text-xs text-muted-foreground">{t("bookedAt", { when: when(row.createdAt) })}</span>
                  </div>
                  <p className="text-sm">
                    <span className="font-medium" dir="auto">
                      {row.listing.title}
                    </span>{" "}
                    <span className="text-muted-foreground">
                      · {t("listingId")} <Ltr>{row.listing.publicId}</Ltr>
                    </span>
                  </p>
                  <p className="text-sm text-muted-foreground">
                    {t("hostGuest", { host: isolate(row.host.name || t("noName")), guest: isolate(row.guest.name || t("noName")) })}
                  </p>
                  <p className="text-sm text-muted-foreground">
                    {formatDateRange(row.checkIn, row.checkOut, locale)} · {tb("nights", { count: row.nights })} · {tb("guests.total", { count: row.guests })} ·{" "}
                    <Ltr>{formatMoney(row.total, row.currency, locale)}</Ltr>
                  </p>
                </li>
              ))}
            </ul>
          )}
          <AdminPagination pathname="/admin/bookings" searchParams={query} page={result.page} pageSize={ADMIN_BOOKINGS_PAGE_SIZE} total={result.total} />
        </>
      ) : (
        <>
          <p className="mb-4 text-sm text-muted-foreground">{t("unreachableHint", { days: ATTENTION_EVENT_DAYS })}</p>
          {unreachable.rows.length === 0 ? (
            <EmptyState bordered icon={BellOff} title={t("unreachableEmpty")} description={t("unreachableEmptyHint")} />
          ) : (
            <ul className="divide-y rounded-xl border bg-card shadow-xs">
              {unreachable.rows.map((row) => (
                <li key={row.id} className="grid gap-1.5 p-3 sm:px-4">
                  <div className="flex flex-wrap items-center gap-2">
                    <Pill tone="danger">{t(`unreachableStage.${row.stage ?? "before"}`)}</Pill>
                    {row.bookingCode ? <Ltr className="font-mono text-sm text-muted-foreground">{row.bookingCode}</Ltr> : null}
                    <span className="ms-auto text-xs text-muted-foreground">{when(row.createdAt)}</span>
                  </div>
                  {row.listing ? (
                    <p className="text-sm">
                      <Link href={`/admin/moderation/${row.listing.id}`} className="font-medium underline-offset-4 hover:underline">
                        <span dir="auto">{row.listing.title}</span>
                      </Link>{" "}
                      <span className="text-muted-foreground">
                        · {t("listingId")} <Ltr>{row.listing.publicId}</Ltr>
                      </span>
                    </p>
                  ) : null}
                  <p className="flex flex-wrap gap-x-4 gap-y-1 text-sm">
                    {row.host ? (
                      <span>
                        {t("host")}{" "}
                        <Link href={`/admin/users/${row.host.id}`} className="font-medium underline-offset-4 hover:underline">
                          <span dir="auto">{row.host.name || t("noName")}</span>
                        </Link>
                      </span>
                    ) : null}
                    {row.guest ? (
                      <span>
                        {t("guest")}{" "}
                        <Link href={`/admin/users/${row.guest.id}`} className="font-medium underline-offset-4 hover:underline">
                          <span dir="auto">{row.guest.name || t("noName")}</span>
                        </Link>
                      </span>
                    ) : null}
                  </p>
                  <p className="text-sm text-muted-foreground">
                    {t("unreachableReason", { reason: t.has(`unreachableReasons.${row.reason}`) ? t(`unreachableReasons.${row.reason}`) : t("unreachableReasons.failed") })}
                  </p>
                  {row.attempts.length ? (
                    <p className="text-xs text-muted-foreground">
                      {row.attempts
                        .map((a) => `${t.has(`channels.${a.channel}`) ? t(`channels.${a.channel}`) : a.channel}: ${a.accepted ? t("attemptAccepted") : t("attemptFailed")}`)
                        .join(" · ")}
                    </p>
                  ) : null}
                </li>
              ))}
            </ul>
          )}
          <AdminPagination pathname="/admin/bookings" searchParams={query} page={unreachable.page} pageSize={ADMIN_BOOKINGS_PAGE_SIZE} total={unreachable.total} />
        </>
      )}
    </>
  );
}
