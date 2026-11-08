import { BellRing, CalendarRange, Flag, History, Receipt, Users } from "lucide-react";
import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { getTranslations, setRequestLocale } from "next-intl/server";
import type { ReactNode } from "react";
import { ReportStatusBadge, UserStatusBadge } from "@/components/admin/badges";
import { Pill, type PillTone } from "@/components/admin/content/pill";
import { WhenText } from "@/components/admin/listing-bits";
import { AdminPageHeader, AdminSection, FactList } from "@/components/admin/page-header";
import { Ltr } from "@/components/common/ltr";
import { siteConfig, type AppLocale, type CurrencyCode } from "@/config/site";
import type { BookingStatus } from "@/generated/prisma/enums";
import { Link } from "@/i18n/navigation";
import { auditActionKey } from "@/lib/admin/audit-labels";
import { getAdminBooking } from "@/lib/admin/server/bookings";
import { requireStaff } from "@/lib/auth/session";
import { formatDate, formatMoney, formatTime, isolate } from "@/lib/format";
import { ClearNoShowButton } from "../../flags/_components/clear-no-show-button";
import { FlagReviewButton } from "../../flags/_components/flag-review-button";
import { BookingPriceLines } from "@/components/booking/booking-price-lines";

const STATUS_TONE: Record<BookingStatus, PillTone> = {
  CONFIRMED: "success",
  COMPLETED: "muted",
  CANCELLED_BY_GUEST: "muted",
  CANCELLED_BY_HOST: "warning",
  NO_SHOW: "warning",
};

type Props = {
  params: Promise<{ locale: string; id: string }>;
};

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: "admin.bookings" });
  return { title: t("detailTitle"), robots: { index: false, follow: false } };
}

/**
 * /admin/bookings/[id] ("moderation"): one booking for staff: the stay, the price lines copied when
 * it was booked, the guest's phone (staff only), how the host was told (hostNotifiedVia), the
 * cancellation, the flag with "mark reviewed", the status history from the audit log and the
 * reports about it. Read-only otherwise.
 */
export default async function AdminBookingPage({ params }: Props) {
  const { locale, id } = await params;
  setRequestLocale(locale);
  const staff = await requireStaff("moderation");
  const data = await getAdminBooking(id, locale as AppLocale, staff);
  if (!data) notFound();
  const { booking, lines, history } = data;
  const [t, tb, tAdmin, tFields, tReviews] = await Promise.all([
    getTranslations("admin.bookings"),
    getTranslations("booking"),
    getTranslations("admin"),
    getTranslations("listingFields"),
    getTranslations("reviews"),
  ]);
  const currency = booking.currency as CurrencyCode;
  const when = (d: Date) => t("at", { date: formatDate(d, locale), time: formatTime(d, locale) });
  const reasonKey = booking.cancelReasonCode
    ? booking.status === "CANCELLED_BY_HOST"
      ? `hostReason.${booking.cancelReasonCode}`
      : `guestReason.${booking.cancelReasonCode}`
    : null;
  const reason = reasonKey ? (tb.has(reasonKey) ? tb(reasonKey) : booking.cancelReasonCode) : null;
  const guestCount = [
    tb("guests.adults", { count: booking.adults }),
    booking.children > 0 ? tb("guests.children", { count: booking.children }) : null,
    booking.infants > 0 ? tb("guests.infants", { count: booking.infants }) : null,
  ]
    .filter(Boolean)
    .join(" · ");
  const channelLabel = (c: string) => (t.has(`channels.${c}`) ? t(`channels.${c}`) : c);
  const actionLabel = (action: string) => {
    const key = auditActionKey(action);
    return tAdmin.has(`audit.${key}`) ? tAdmin(`audit.${key}`) : action;
  };

  return (
    <>
      <AdminPageHeader
        back={{ href: "/admin/bookings", label: t("backToList") }}
        title={<Ltr className="font-mono">{booking.code}</Ltr>}
        meta={
          <>
            <Pill tone={STATUS_TONE[booking.status]}>{tb(`status.${booking.status}`)}</Pill>
            {booking.flag ? <Pill tone={booking.flagReviewedAt ? "muted" : "danger"}>{t(`flag.${booking.flag}`)}</Pill> : null}
            {booking.listing.isDemo ? <Pill tone="demo">{tAdmin("markers.demo")}</Pill> : null}
            <span className="text-xs">{t("bookedAt", { when: when(booking.createdAt) })}</span>
          </>
        }
      />

      {booking.flag ? (
        <div className="mb-5 flex flex-wrap items-center justify-between gap-3 rounded-xl border border-destructive/30 bg-destructive/5 p-3 text-sm">
          <p className="flex min-w-0 items-start gap-2">
            <Flag aria-hidden className="mt-0.5 size-4 shrink-0 text-destructive" />
            <span>
              {t(`flagExplain.${booking.flag}`)}
              {booking.flagReviewedAt ? (
                <span className="block text-xs text-muted-foreground">{t("reviewedBy", { name: isolate(booking.flagReviewedBy ?? "—"), when: when(booking.flagReviewedAt) })}</span>
              ) : null}
            </span>
          </p>
          {/* Nobody reviews the flag of a booking they are part of (as host or guest). */}
          {booking.host.id !== staff.id && booking.guest.id !== staff.id ? (
            <div className="flex flex-wrap gap-2">
              {/* A wrong "didn't arrive" report: the guest can review the stay again. */}
              {booking.status === "NO_SHOW" ? <ClearNoShowButton bookingId={booking.id} label={booking.code} /> : null}
              {!booking.flagReviewedAt ? <FlagReviewButton target={{ bookingId: booking.id }} label={booking.code} /> : null}
            </div>
          ) : null}
        </div>
      ) : null}

      <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_22rem]">
        <div className="flex min-w-0 flex-col gap-4">
          <AdminSection title={<SectionTitle icon={CalendarRange}>{t("stayTitle")}</SectionTitle>}>
            <FactList
              items={[
                {
                  label: t("listing"),
                  value: (
                    <Link href={`/admin/moderation/${booking.listing.id}`} className="font-medium text-primary hover:underline">
                      <span dir="auto">{booking.listingTitle}</span> · <Ltr>{booking.listing.publicId}</Ltr>
                    </Link>
                  ),
                },
                { label: t("dealType"), value: tFields(`dealType.${booking.listing.dealType}`) },
                ...(booking.roomTypeName
                  ? [
                      {
                        label: t("roomType"),
                        value: (
                          <>
                            <span dir="auto">{booking.roomTypeName}</span>
                            {booking.rooms > 1 ? ` · ${tb("price.rooms", { count: booking.rooms })}` : null}
                          </>
                        ),
                      },
                    ]
                  : []),
                { label: t("checkIn"), value: formatDate(booking.checkIn, locale, { dateStyle: "full" }) },
                { label: t("checkOut"), value: formatDate(booking.checkOut, locale, { dateStyle: "full" }) },
                { label: t("nights"), value: tb("nights", { count: booking.nights }) },
                { label: t("guests"), value: guestCount },
                { label: t("policy"), value: tb.has(`policy.${booking.cancellationPolicy}.name`) ? tb(`policy.${booking.cancellationPolicy}.name`) : booking.cancellationPolicy },
                {
                  label: t("payment"),
                  value: booking.paymentMethods.length
                    ? booking.paymentMethods.map((m) => (tb.has(`paymentMethod.${m}`) ? tb(`paymentMethod.${m}`) : m)).join(", ")
                    : "—",
                },
              ]}
            />
            {booking.review ? (
              // The guest's review of this stay (reviews-2): staff can hide it there, reported or not.
              <p className="mt-4 flex flex-wrap items-center gap-2 text-sm">
                <span className="text-xs text-muted-foreground">{tReviews("admin.title")}:</span>
                <Link href={`/admin/reviews/${booking.review.id}`} className="font-medium text-primary hover:underline">
                  {tReviews("stars.label", { count: booking.review.rating })}
                </Link>
                {booking.review.hidden ? <span className="text-xs font-medium text-destructive">{tReviews("admin.hiddenBadge")}</span> : null}
              </p>
            ) : null}
            {booking.messageToHost ? (
              <div className="mt-4">
                <p className="mb-1 text-xs text-muted-foreground">{t("messageToHost")}</p>
                <p className="rounded-lg border bg-background p-3 text-sm whitespace-pre-wrap" dir="auto">
                  {booking.messageToHost}
                </p>
              </div>
            ) : null}
          </AdminSection>

          <AdminSection title={<SectionTitle icon={Receipt}>{t("priceTitle")}</SectionTitle>} description={t("priceDescription")}>
            {/* The lines the guest confirmed (Booking.priceLines; rebuilt for older bookings). */}
            <BookingPriceLines lines={lines} total={booking.total} currency={currency} locale={locale} className="text-sm" />
            <dl className="grid gap-2 text-sm">
              {booking.displayTotal !== null && booking.displayCurrency && booking.displayCurrency !== booking.currency ? (
                <div className="flex items-center justify-between gap-3 text-xs text-muted-foreground">
                  <dt>{t("displayEstimate")}</dt>
                  <dd>
                    <Ltr>≈ {formatMoney(booking.displayTotal, booking.displayCurrency as CurrencyCode, locale)}</Ltr>
                  </dd>
                </div>
              ) : null}
            </dl>
          </AdminSection>

          <AdminSection title={<SectionTitle icon={History}>{t("historyTitle")}</SectionTitle>}>
            <ol className="flex flex-col gap-3 text-sm">
              <li className="flex flex-col gap-0.5">
                <span className="font-medium">{t("historyCreated")}</span>
                <span className="text-xs text-muted-foreground">{when(booking.createdAt)}</span>
              </li>
              {booking.hostNotifiedAt ? (
                <li className="flex flex-col gap-0.5">
                  <span className="font-medium">{t("historyHostTold", { channels: booking.notifiedVia.map(channelLabel).join(", ") || "—" })}</span>
                  <span className="text-xs text-muted-foreground">{when(booking.hostNotifiedAt)}</span>
                </li>
              ) : null}
              {history.map((entry) => (
                <li key={entry.id} className="flex flex-col gap-0.5">
                  <span className="font-medium">{actionLabel(entry.action)}</span>
                  <span className="text-xs text-muted-foreground">
                    {when(entry.createdAt)}
                    {entry.actor ? (
                      <>
                        {" · "}
                        <span dir="auto">{entry.actor.name}</span>
                      </>
                    ) : null}
                    {typeof entry.details.note === "string" ? (
                      <>
                        {" · "}
                        <span dir="auto">{entry.details.note}</span>
                      </>
                    ) : null}
                  </span>
                </li>
              ))}
              {booking.reminderSentAt ? (
                <li className="flex flex-col gap-0.5">
                  <span className="font-medium">{t("historyReminder")}</span>
                  <span className="text-xs text-muted-foreground">{when(booking.reminderSentAt)}</span>
                </li>
              ) : null}
            </ol>
          </AdminSection>

          {booking.cancelledAt ? (
            <AdminSection title={t("cancellationTitle")}>
              <FactList
                items={[
                  { label: t("cancelledAt"), value: when(booking.cancelledAt) },
                  { label: t("hoursAfterBooking"), value: t("hours", { count: booking.hoursToCancel ?? 0 }) },
                  ...(reason ? [{ label: t("cancelReason"), value: reason }] : []),
                ]}
              />
              {booking.cancelReason ? (
                <p className="mt-3 rounded-lg border bg-background p-3 text-sm whitespace-pre-wrap" dir="auto">
                  {booking.cancelReason}
                </p>
              ) : null}
            </AdminSection>
          ) : null}
        </div>

        <aside className="flex min-w-0 flex-col gap-4">
          <AdminSection title={<SectionTitle icon={Users}>{t("peopleTitle")}</SectionTitle>}>
            <div className="flex flex-col gap-4 text-sm">
              <div className="flex flex-col gap-1">
                <span className="text-xs text-muted-foreground">{t("guestLabel")}</span>
                <span className="flex flex-wrap items-center gap-1.5">
                  <Link href={`/admin/users/${booking.guest.id}`} className="font-medium text-primary hover:underline">
                    <span dir="auto">{booking.guestName || booking.guest.name}</span>
                  </Link>
                  <UserStatusBadge status={booking.guest.status} className="h-5" />
                </span>
                {/* ADMIN only (Q12): other staff get no phone from the query at all. */}
                {booking.guestPhone ? <Ltr className="text-xs">{booking.guestPhone}</Ltr> : booking.guestPhoneWithheld ? <span className="text-xs text-muted-foreground">{t("guestPhoneWithheld")}</span> : null}
                <span className="text-xs text-muted-foreground">{t("guestLanguage", { language: siteConfig.i18n.nativeNames[booking.locale] ?? booking.locale })}</span>
              </div>
              <div className="flex flex-col gap-1">
                <span className="text-xs text-muted-foreground">{t("hostLabel")}</span>
                <span className="flex flex-wrap items-center gap-1.5">
                  <Link href={`/admin/users/${booking.host.id}`} className="font-medium text-primary hover:underline">
                    <span dir="auto">{booking.hostName}</span>
                  </Link>
                  <UserStatusBadge status={booking.host.status} className="h-5" />
                </span>
              </div>
            </div>
          </AdminSection>

          <AdminSection title={<SectionTitle icon={BellRing}>{t("alertTitle")}</SectionTitle>}>
            {booking.hostNotifiedAt ? (
              <p className="text-sm">
                {t("alertSent", { channels: booking.notifiedVia.map(channelLabel).join(", ") || "—" })}
                <span className="block text-xs text-muted-foreground">{when(booking.hostNotifiedAt)}</span>
              </p>
            ) : (
              <p className="text-sm text-muted-foreground">{t("alertUnknown")}</p>
            )}
          </AdminSection>

          <AdminSection title={<SectionTitle icon={Flag}>{t("reportsTitle", { count: booking.reports.length })}</SectionTitle>}>
            {booking.reports.length === 0 ? (
              <p className="text-sm text-muted-foreground">{t("noReports")}</p>
            ) : (
              <ul className="divide-y">
                {booking.reports.map((r) => (
                  <li key={r.id} className="flex flex-wrap items-center gap-2 py-2 text-sm first:pt-0 last:pb-0">
                    <Link href={`/admin/reports/${r.id}`} className="font-medium hover:underline">
                      {tFields.has(`reportReason.${r.reason}`) ? tFields(`reportReason.${r.reason}`) : t(`reportKind.${r.kind}`)}
                    </Link>
                    {r.kind === "TURNED_AWAY" ? <Pill tone="danger">{t("reportKind.TURNED_AWAY")}</Pill> : null}
                    <ReportStatusBadge status={r.status} className="h-5" />
                    <span className="text-xs text-muted-foreground">
                      <WhenText date={r.createdAt} />
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </AdminSection>
        </aside>
      </div>
    </>
  );
}

function SectionTitle({ icon: Icon, children }: { icon: typeof Flag; children: ReactNode }) {
  return (
    <span className="inline-flex items-center gap-1.5">
      <Icon aria-hidden className="size-4 text-muted-foreground" />
      {children}
    </span>
  );
}
