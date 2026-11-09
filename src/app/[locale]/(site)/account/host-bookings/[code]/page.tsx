import type { Metadata } from "next";
import Image from "next/image";
import { notFound } from "next/navigation";
import { getTranslations, setRequestLocale } from "next-intl/server";
import {
  BanknoteIcon,
  CalendarDaysIcon,
  FlagIcon,
  MessageSquareTextIcon,
  PhoneIcon,
  UndoDotIcon,
  UsersRoundIcon,
} from "lucide-react";
import { BookingPriceLines } from "@/components/booking/booking-price-lines";
import { buttonStyles } from "@/components/ds/button";
import { Card } from "@/components/ds/card";
import { Ltr } from "@/components/common/ltr";
import { PageHeader } from "@/components/common/page-header";
import { BackToListing } from "@/components/listing-form/back-to-listing";
import { HostBookingActions } from "@/components/host-bookings/booking-actions";
import { BookingStatusTag } from "@/components/host-bookings/booking-row";
import { hostCalendarPath } from "@/components/host-calendar/paths";
import type { AppLocale } from "@/config/site";
import { Link } from "@/i18n/navigation";
import { formatPhoneInternational } from "@/lib/auth/phone";
import { requireUser } from "@/lib/auth/session";
import { HOST_BOOKINGS_PATH, hostBookingPath, isPaymentMethod } from "@/lib/booking/constants";
import { getHostBooking } from "@/lib/booking/queries";
import { whatsappUrl } from "@/lib/booking/reveal";
import { telHref } from "@/lib/phone";
import { formatDate, formatDateRange, formatTime } from "@/lib/format";
import { pageMetadata } from "@/lib/seo";
import { recordIdMiss } from "@/lib/security/id-guess";
import { HostBookingReview } from "@/components/reviews/host-booking-review";

type Props = {
  params: Promise<{ locale: string; code: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
};

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { locale, code } = await params;
  const t = await getTranslations({ locale, namespace: "hostBooking.details" });
  return pageMetadata({ locale, path: hostBookingPath(code), title: t("metaTitle"), description: t("metaTitle"), noIndex: true });
}

function Row({ icon: Icon, label, children }: { icon: typeof PhoneIcon; label: string; children: React.ReactNode }) {
  return (
    <div className="flex items-start gap-3">
      <Icon className="mt-0.5 size-5 shrink-0 text-muted-foreground" aria-hidden />
      <div className="grid min-w-0 flex-1 gap-0.5">
        <dt className="text-small text-muted-foreground">{label}</dt>
        <dd className="text-body">{children}</dd>
      </div>
    </div>
  );
}

/**
 * /account/host-bookings/<code> — one booking of the host's place: the guest and how to reach them
 * (for a confirmed or completed booking), the stay, what the guest pays at check-in, the policy,
 * and the host's actions (cancel with a reason, "לא הגיע").
 */
export default async function HostBookingPage({ params, searchParams }: Props) {
  const { locale, code } = await params;
  // Opened from the place calendar inside the post form (bug 2.10): "חזרה למודעה".
  const { from } = await searchParams;
  setRequestLocale(locale);
  const user = await requireUser({ next: hostBookingPath(code) });
  const booking = await getHostBooking(user.id, code, locale as AppLocale);
  if (!booking) {
    // 4.7.a: a burst of codes that match nothing alerts the founder (src/lib/security/id-guess.ts).
    await recordIdMiss("host_booking", user.id);
    notFound();
  }
  const [t, tb, tl] = await Promise.all([
    getTranslations("hostBooking.details"),
    getTranslations("booking"),
    getTranslations("hostBooking.list"),
  ]);

  // The guest's phone reaches the host for a confirmed (or completed) stay only.
  const reveal = booking.status === "CONFIRMED" || booking.status === "COMPLETED";
  const phone = reveal && booking.guestPhone ? booking.guestPhone : null;
  const guestParts = [
    tb("guests.adults", { count: booking.adults }),
    booking.children > 0 ? tb("guests.children", { count: booking.children }) : null,
    booking.infants > 0 ? tb("guests.infants", { count: booking.infants }) : null,
  ].filter(Boolean);
  const methods = booking.paymentMethods.filter(isPaymentMethod);
  const cancelled = booking.status === "CANCELLED_BY_GUEST" || booking.status === "CANCELLED_BY_HOST";
  const reasonLabel = booking.cancelReasonCode
    ? tb.has(`hostReason.${booking.cancelReasonCode}`) && booking.status === "CANCELLED_BY_HOST"
      ? tb(`hostReason.${booking.cancelReasonCode}`)
      : tb.has(`guestReason.${booking.cancelReasonCode}`)
        ? tb(`guestReason.${booking.cancelReasonCode}`)
        : null
    : null;

  return (
    <div className="grid gap-5 pb-10">
      <BackToListing from={from} className="mt-4" />
      <PageHeader
        className="pb-0 sm:pb-0"
        breadcrumbs={[{ label: tl("title"), href: HOST_BOOKINGS_PATH }, { label: booking.code }]}
        title={
          <span className="flex flex-wrap items-center gap-x-3 gap-y-1">
            <span>{t("title")}</span>
            <Ltr>{booking.code}</Ltr>
          </span>
        }
        description={
          <span className="flex flex-wrap items-center gap-2">
            <BookingStatusTag status={booking.status} label={tb(`status.${booking.status}`)} />
            <span>{t("bookedOn", { date: formatDate(booking.createdAt, locale, { dateStyle: "medium" }) })}</span>
          </span>
        }
      />

      <div className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_minmax(0,22rem)] lg:items-start">
        <div className="grid gap-5">
          <Card as="section" padding="lg" aria-labelledby="guest-title" className="grid gap-4">
            <h2 id="guest-title" className="text-h3">
              {t("guestTitle")}
            </h2>
            <p className="text-h3" dir="auto">
              {booking.guestName}
            </p>
            {phone ? (
              <div className="grid gap-3">
                <p className="flex items-center gap-2 text-body">
                  <PhoneIcon className="size-5 text-muted-foreground" aria-hidden />
                  <Ltr className="font-medium">{formatPhoneInternational(phone)}</Ltr>
                </p>
                <div className="flex flex-wrap gap-2">
                  <a href={telHref(phone) ?? `tel:${phone}`} className={buttonStyles({ variant: "outline", className: "min-w-0 flex-1 shrink sm:flex-none" })}>
                    <PhoneIcon aria-hidden />
                    {t("call")}
                  </a>
                  <a
                    href={whatsappUrl(phone)}
                    target="_blank"
                    rel="noopener noreferrer"
                    className={buttonStyles({ variant: "whatsapp", className: "min-w-0 flex-1 shrink sm:flex-none" })}
                  >
                    <MessageSquareTextIcon aria-hidden />
                    {t("whatsapp")}
                  </a>
                </div>
                <p className="text-caption text-pretty text-muted-foreground">{t("phoneNote")}</p>
              </div>
            ) : (
              <p className="text-small text-pretty text-muted-foreground">{cancelled ? t("phoneHiddenCancelled") : t("phoneHidden")}</p>
            )}
            {booking.messageToHost && (
              <figure className="grid gap-1 rounded-xl bg-surface-muted p-3">
                <figcaption className="text-small font-medium text-muted-foreground">{t("message")}</figcaption>
                <blockquote className="text-body whitespace-pre-line" dir="auto">
                  {booking.messageToHost}
                </blockquote>
              </figure>
            )}
          </Card>

          <Card as="section" padding="lg" aria-labelledby="stay-title" className="grid gap-4">
            <h2 id="stay-title" className="text-h3">
              {t("stayTitle")}
            </h2>
            <Link href={booking.listing.path} className="flex items-center gap-3 rounded-xl outline-none focus-visible:ring-3 focus-visible:ring-ring/50">
              <span className="relative size-14 shrink-0 overflow-hidden rounded-xl bg-surface-muted">
                {booking.listing.photo && <Image src={booking.listing.photo} alt="" fill sizes="56px" className="object-cover" />}
              </span>
              <span className="min-w-0 flex-1 font-medium underline-offset-4 hover:underline" dir="auto">
                {booking.listing.title}
              </span>
            </Link>
            <dl className="grid gap-3">
              <Row icon={CalendarDaysIcon} label={t("dates")}>
                {formatDateRange(booking.checkIn, booking.checkOut, locale, { weekday: "short", day: "numeric", month: "short", year: "numeric" })}
                <span className="block text-small text-muted-foreground">{tb("nights", { count: booking.nights })}</span>
              </Row>
              <Row icon={UsersRoundIcon} label={t("guests")}>
                {guestParts.join(" · ")}
                {booking.roomTypeName && (
                  <span className="block text-small text-muted-foreground">
                    <span dir="auto">{t("roomType", { name: booking.roomTypeName })}</span>
                    {/* Hotels (round 3): the rooms of that type this booking holds. */}
                    {booking.rooms > 1 ? ` · ${tb("price.rooms", { count: booking.rooms })}` : null}
                  </span>
                )}
              </Row>
            </dl>
            <Link href={hostCalendarPath(booking.listing.id)} className={buttonStyles({ variant: "secondary", className: "justify-self-start" })}>
              <CalendarDaysIcon aria-hidden />
              {t("openCalendar")}
            </Link>
          </Card>
          {/* Real reviews (round 3, brief 8.1): the guest's review, the one reply and "report". */}
          <HostBookingReview bookingId={booking.id} locale={locale as AppLocale} />
        </div>

        <div className="grid gap-5">
          <Card as="section" padding="lg" aria-labelledby="pay-title" className="grid gap-4">
            <h2 id="pay-title" className="text-h3">
              {t("paymentTitle")}
            </h2>
            {/* What the guest confirmed, line by line (round 3, brief 6.3: Booking.priceLines). */}
            <BookingPriceLines lines={booking.priceLines} total={booking.total} currency={booking.currency} locale={locale} totalClassName="text-h3" />
            <dl className="grid gap-3">
              <Row icon={BanknoteIcon} label={t("paidAtCheckIn")}>
                {methods.length > 0 ? methods.map((m) => tb(`paymentMethod.${m}`)).join(" · ") : t("noMethods")}
              </Row>
              <Row icon={UndoDotIcon} label={t("policy", { name: tb(`policy.${booking.cancellationPolicy}.name`) })}>
                {tb(`policy.${booking.cancellationPolicy}.rule`)}
                {booking.status === "CONFIRMED" && (
                  <span className="block text-small text-muted-foreground">
                    {booking.cancellation.lateNow
                      ? tb("policy.freePassed")
                      : tb("policy.freeUntil", {
                          date: formatDate(booking.cancellation.freeUntil, locale, { dateStyle: "medium" }),
                          time: formatTime(booking.cancellation.freeUntil, locale),
                        })}
                  </span>
                )}
              </Row>
            </dl>
            <p className="text-caption text-pretty text-muted-foreground">{t("noFees")}</p>
          </Card>

          {(cancelled || booking.noShowReportedAt) && (
            <Card as="section" padding="lg" muted aria-labelledby="history-title" className="grid gap-3">
              <h2 id="history-title" className="flex items-center gap-2 text-h3">
                <FlagIcon className="size-5 text-muted-foreground" aria-hidden />
                {t("historyTitle")}
              </h2>
              {cancelled && booking.cancelledAt && (
                <p className="text-body text-pretty">
                  {booking.status === "CANCELLED_BY_HOST"
                    ? t("cancelledByHost", { date: formatDate(booking.cancelledAt, locale, { dateStyle: "medium" }) })
                    : t("cancelledByGuest", { date: formatDate(booking.cancelledAt, locale, { dateStyle: "medium" }) })}
                </p>
              )}
              {reasonLabel && <p className="text-small">{t("reason", { reason: reasonLabel })}</p>}
              {booking.cancelReason && (
                <p className="text-small whitespace-pre-line text-muted-foreground" dir="auto">
                  {booking.cancelReason}
                </p>
              )}
              {booking.noShowReportedAt && (
                <p className="text-body">{t("noShowOn", { date: formatDate(booking.noShowReportedAt, locale, { dateStyle: "medium" }) })}</p>
              )}
            </Card>
          )}

          {(booking.canCancel || booking.canReportNoShow) && (
            <Card as="section" padding="lg" aria-labelledby="actions-title" className="grid gap-3">
              <h2 id="actions-title" className="text-h3">
                {t("actionsTitle")}
              </h2>
              <p className="text-small text-pretty text-muted-foreground">{t("actionsLead")}</p>
              <HostBookingActions
                bookingId={booking.id}
                guestName={booking.guestName}
                canCancel={booking.canCancel}
                canReportNoShow={booking.canReportNoShow}
              />
            </Card>
          )}
        </div>
      </div>
    </div>
  );
}
