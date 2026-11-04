import type { Metadata } from "next";
import { getTranslations, setRequestLocale } from "next-intl/server";
import {
  BanknoteIcon,
  CalendarPlusIcon,
  ChevronRightIcon,
  CircleCheckBigIcon,
  CreditCardIcon,
  LandmarkIcon,
  LifeBuoyIcon,
  MapPinIcon,
  NavigationIcon,
  PhoneIcon,
  SearchXIcon,
  ShieldAlertIcon,
  type LucideIcon,
} from "lucide-react";
import { CancelTrip } from "@/components/booking/cancel-trip";
import { CopyCode } from "@/components/booking/copy-code";
import { WhatsAppIcon } from "@/components/common/brand-icons";
import { Ltr } from "@/components/common/ltr";
import { buttonStyles } from "@/components/ds/button";
import { Card } from "@/components/ds/card";
import { EmptyState } from "@/components/ds/empty-state";
import { Tag } from "@/components/ds/tag";
import { TurnedAwayButton } from "@/components/report/turned-away-button";
import { siteConfig, type AppLocale } from "@/config/site";
import { Link } from "@/i18n/navigation";
import { formatPhoneInternational } from "@/lib/auth/phone";
import { requireUser } from "@/lib/auth/session";
import { cleanPaymentMethods, TRIPS_PATH, tripPath, type PaymentMethod } from "@/lib/booking/constants";
import { DEFAULT_CHECK_IN_TIME, tbilisiToday } from "@/lib/booking/dates";
import { clockText } from "@/lib/booking/guest";
import { getGuestTrip } from "@/lib/booking/queries";
import { whatsappUrl } from "@/lib/booking/reveal";
import { telHref } from "@/lib/phone";
import { formatDate, formatDateRange, formatMoney, formatTime } from "@/lib/format";
import { guestBookingReports } from "@/lib/reports/queries";
import { pageMetadata } from "@/lib/seo";
import { cn } from "@/lib/utils";

type Props = {
  params: Promise<{ locale: string; code: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
};

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { locale, code } = await params;
  const t = await getTranslations({ locale, namespace: "booking.trip" });
  return pageMetadata({ locale, path: tripPath(decodeURIComponent(code)), title: t("title"), description: t("confirmedText"), noIndex: true });
}

const PAYMENT_ICONS: Record<PaymentMethod, LucideIcon> = { cash: BanknoteIcon, card: CreditCardIcon, bank_transfer: LandmarkIcon };

function Row({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="grid gap-0.5 py-2.5">
      <dt className="text-caption text-muted-foreground">{label}</dt>
      <dd className="text-small font-medium">{children}</dd>
    </div>
  );
}

/**
 * /account/trips/<code> — one trip, and the booking confirmation (?booked=1, brief 5.5 step 3):
 * the booking number, dates and guests; for a confirmed booking the exact address, directions and
 * the host's phone / WhatsApp (revealed only now), "Add to calendar", "What's next"; the price paid
 * at check-in; the cancellation policy and "Cancel booking" (with a reason).
 */
export default async function TripPage({ params, searchParams }: Props) {
  const { locale: raw, code } = await params;
  setRequestLocale(raw);
  const locale = raw as AppLocale;
  const user = await requireUser({ next: tripPath(decodeURIComponent(code)) });
  const [t, trip, query] = await Promise.all([
    getTranslations({ locale, namespace: "booking" }),
    getGuestTrip(user.id, decodeURIComponent(code), locale),
    searchParams,
  ]);

  const back = (
    <Link
      href={TRIPS_PATH}
      className="inline-flex min-h-11 items-center gap-1 justify-self-start rounded-md text-small font-medium text-muted-foreground outline-none hover:text-foreground focus-visible:ring-3 focus-visible:ring-ring/50"
    >
      <ChevronRightIcon className="size-4 ltr:-scale-x-100" aria-hidden />
      {t("trip.back")}
    </Link>
  );

  if (!trip) {
    return (
      <div className="grid gap-2 py-6">
        {back}
        <EmptyState icon={SearchXIcon} title={t("trip.notFoundTitle")} description={t("trip.notFoundText")} action={{ label: t("trips.title"), href: TRIPS_PATH }} />
      </div>
    );
  }

  const brand = siteConfig.localizedName[locale] ?? siteConfig.name;
  // "Turned away?" (round 3, brief 8.2): the guest can report the host from every trip; after a
  // host cancellation it is a card of its own. ?report=1 (the cancellation email) opens the form.
  const [tr, reports] = await Promise.all([getTranslations({ locale, namespace: "report.turnedAway" }), guestBookingReports(user.id, [trip.id])]);
  const reportedAt = reports.get(trip.id) ?? null;
  const today = tbilisiToday();
  const reportProps = {
    target: { bookingId: trip.id },
    context: { bookingCode: trip.code },
    today,
    defaultDate: trip.status === "CANCELLED_BY_HOST" && trip.cancelledAt ? tbilisiToday(trip.cancelledAt) : today,
    autoOpen: query.report === "1" && !reportedAt,
  };
  const confirmed = trip.status === "CONFIRMED";
  const cancelled = trip.status === "CANCELLED_BY_GUEST" || trip.status === "CANCELLED_BY_HOST";
  const justBooked = query.booked === "1" && confirmed;
  const dates = formatDateRange(trip.checkIn, trip.checkOut, locale, { day: "numeric", month: "short" });
  const guests = [
    t("guests.adults", { count: trip.adults }),
    trip.children > 0 ? t("guests.children", { count: trip.children }) : null,
    trip.infants > 0 ? t("guests.infants", { count: trip.infants }) : null,
  ]
    .filter(Boolean)
    .join(" · ");
  const day = (value: string) => formatDate(value, locale, { weekday: "long", day: "numeric", month: "long" });
  const checkInTime = clockText(trip.checkInFrom ?? DEFAULT_CHECK_IN_TIME, locale) ?? "";
  const checkOutTime = clockText(trip.checkOutUntil, locale);
  const total = formatMoney(trip.total, trip.currency, locale);
  const methods = cleanPaymentMethods(trip.paymentMethods);
  const reveal = trip.reveal;
  const whatsapp = reveal?.contact.whatsapp ? whatsappUrl(reveal.contact.whatsapp, t("trip.whatsappText", { brand, code: trip.code, dates })) : null;
  const freeLine =
    confirmed && !trip.cancellation.lateNow
      ? t("policy.freeUntil", {
          date: formatDate(trip.cancellation.freeUntil, locale, { weekday: "short", day: "numeric", month: "long" }),
          time: formatTime(trip.cancellation.freeUntil, locale),
        })
      : null;

  return (
    <div className="grid max-w-3xl gap-4 pt-2 pb-8">
      {back}

      {justBooked ? (
        <div role="status" className="flex items-start gap-3 rounded-card border border-border bg-primary-tint p-4 motion-safe:animate-in motion-safe:fade-in-0 motion-safe:slide-in-from-bottom-2">
          <CircleCheckBigIcon className="mt-0.5 size-6 shrink-0 text-success" aria-hidden />
          <div className="grid gap-0.5">
            <h1 className="text-h1">{t("trip.confirmedTitle")}</h1>
            <p className="text-small text-foreground">{t("trip.confirmedText")}</p>
          </div>
        </div>
      ) : (
        <h1 className="text-h1">{t("trip.title")}</h1>
      )}

      <Card as="section" aria-label={t("review.stay")} className="grid gap-3">
        <div className="flex items-center justify-between gap-2">
          <div className="grid min-w-0">
            <span className="text-caption text-muted-foreground">{t("codeLabel")}</span>
            <Ltr className="text-h2 font-semibold tracking-wide">{trip.code}</Ltr>
          </div>
          <div className="flex shrink-0 items-center gap-1">
            <Tag variant={confirmed ? "success" : "neutral"}>{t(`status.${trip.status}`)}</Tag>
            <CopyCode code={trip.code} />
          </div>
        </div>
        <Link href={trip.listing.path} className="group flex items-center gap-3 rounded-xl outline-none focus-visible:ring-3 focus-visible:ring-ring/50">
          {trip.listing.photo ? (
            // eslint-disable-next-line @next/next/no-img-element -- a small, already sized WebP from the media route
            <img src={trip.listing.photo} alt="" width={64} height={64} className="size-16 shrink-0 rounded-xl object-cover" />
          ) : null}
          <span className="grid min-w-0">
            <span dir="auto" className="line-clamp-2 text-h3 font-semibold group-hover:underline">
              {trip.listing.title}
            </span>
            {trip.roomTypeName ? (
              <span dir="auto" className="truncate text-caption text-muted-foreground">
                {trip.roomTypeName}
              </span>
            ) : null}
            <span className="text-caption text-primary-text">{t("trip.viewListing")}</span>
          </span>
        </Link>
        <dl className="grid divide-y divide-border border-t border-border sm:grid-cols-2 sm:divide-y-0">
          <Row label={t("trip.arrival")}>
            {day(trip.checkIn)} ·{" "}
            <bdi>{trip.checkInFlexible ? t("checkTimes.flexibleIn") : t("trip.fromTime", { time: checkInTime })}</bdi>
          </Row>
          <Row label={t("trip.departure")}>
            {day(trip.checkOut)}
            {trip.checkOutFlexible || checkOutTime ? (
              <>
                {" "}
                · <bdi>{trip.checkOutFlexible ? t("checkTimes.flexibleOut") : t("trip.untilTime", { time: checkOutTime ?? "" })}</bdi>
              </>
            ) : null}
          </Row>
          <Row label={t("sheet.guests")}>{guests}</Row>
          <Row label={t("review.dates")}>
            {dates} · {t("price.nights", { count: trip.nights })}
          </Row>
        </dl>
      </Card>

      {reveal ? (
        <Card as="section" aria-labelledby="trip-where" className="grid gap-4">
          <div className="grid gap-2">
            <h2 id="trip-where" className="text-h2">
              {t("trip.address")}
            </h2>
            {reveal.address ? (
              <p dir="auto" className="flex items-start gap-2 text-body">
                <MapPinIcon className="mt-1 size-5 shrink-0 text-primary-text" aria-hidden />
                <span>{reveal.address}</span>
              </p>
            ) : (
              <p className="text-small text-muted-foreground">{t("trip.noAddress")}</p>
            )}
            {reveal.directions ? (
              <div className="flex flex-wrap gap-2">
                <a href={reveal.directions.google} target="_blank" rel="noopener noreferrer" className={buttonStyles({ variant: "secondary", size: "sm" })}>
                  <NavigationIcon aria-hidden />
                  {t("trip.googleMaps")}
                </a>
                <a href={reveal.directions.waze} target="_blank" rel="noopener noreferrer" className={buttonStyles({ variant: "secondary", size: "sm" })}>
                  <NavigationIcon aria-hidden />
                  {t("trip.waze")}
                </a>
              </div>
            ) : null}
          </div>
          <div className="grid gap-2 border-t border-border pt-4">
            <h2 className="text-h2">{t("trip.host")}</h2>
            {reveal.hostName ? (
              <p dir="auto" className="text-body font-medium">
                {reveal.hostName}
              </p>
            ) : null}
            {reveal.contact.phone || whatsapp ? (
              <div className="grid gap-2 sm:flex sm:flex-wrap">
                {whatsapp ? (
                  <a href={whatsapp} target="_blank" rel="noopener noreferrer" className={buttonStyles({ variant: "whatsapp" })}>
                    <WhatsAppIcon className="size-5" />
                    {t("trip.whatsapp")}
                  </a>
                ) : null}
                {reveal.contact.phone ? (
                  <a href={telHref(reveal.contact.phone) ?? `tel:${reveal.contact.phone}`} className={buttonStyles({ variant: "outline" })}>
                    <PhoneIcon aria-hidden />
                    <span className="truncate">
                      {t("trip.call")} <Ltr>{formatPhoneInternational(reveal.contact.phone)}</Ltr>
                    </span>
                  </a>
                ) : null}
              </div>
            ) : (
              <p className="text-small text-muted-foreground">{t("trip.noContact")}</p>
            )}
          </div>
          {trip.icsPath ? (
            <a
              href={`${trip.icsPath}?lang=${locale}`}
              download={`${trip.code}.ics`}
              className={buttonStyles({ variant: "soft", className: "justify-self-start" })}
            >
              <CalendarPlusIcon aria-hidden />
              {t("trip.calendar")}
            </a>
          ) : null}
        </Card>
      ) : !cancelled ? (
        <p className="rounded-card border border-border bg-surface-muted p-4 text-small text-muted-foreground">{t("trip.hidden")}</p>
      ) : null}

      {confirmed && trip.upcoming ? (
        <Card as="section" aria-labelledby="trip-next" className="grid gap-3">
          <h2 id="trip-next" className="text-h2">
            {t("trip.whatNext")}
          </h2>
          <ol className="grid gap-3">
            {[
              t("trip.step1"),
              trip.checkInFlexible ? t("trip.step2Flexible") : t("trip.step2", { time: checkInTime }),
              t("trip.step3", { amount: `⁦${total}⁩` }),
            ].map((step, i) => (
              <li key={i} className="flex items-start gap-3 text-small">
                <span className="flex size-7 shrink-0 items-center justify-center rounded-full bg-primary-tint text-caption font-semibold text-primary-text" aria-hidden>
                  {i + 1}
                </span>
                <span className="pt-1">{step}</span>
              </li>
            ))}
          </ol>
        </Card>
      ) : null}

      {cancelled ? null : (
      <Card as="section" aria-labelledby="trip-pay" className="grid gap-3">
        <h2 id="trip-pay" className="text-h2">
          {t("trip.payTitle")}
        </h2>
        <div className="flex items-baseline justify-between gap-3">
          <span className="text-body font-semibold">{t("price.total")}</span>
          <span className="text-end">
            <bdi className="text-body font-semibold tabular-nums">{total}</bdi>
            {trip.display ? (
              <span className="block text-caption text-muted-foreground">
                {t("price.estimate", { amount: `⁦≈ ${formatMoney(trip.display.total, trip.display.currency, locale, { maximumFractionDigits: 0 })}⁩` })}
              </span>
            ) : null}
          </span>
        </div>
        <p className="text-caption text-muted-foreground">{t("payAtCheckIn", { currency: t(`inCurrency.${trip.currency}`) })}</p>
        {methods.length ? (
          <ul className="flex flex-wrap gap-2">
            {methods.map((method) => {
              const Icon = PAYMENT_ICONS[method];
              return (
                <li key={method} className="inline-flex h-9 items-center gap-1.5 rounded-full border border-border px-3 text-small">
                  <Icon className="size-4 text-primary-text" aria-hidden />
                  {t(`paymentMethod.${method}`)}
                </li>
              );
            })}
          </ul>
        ) : null}
        <p className="flex items-start gap-2 rounded-input bg-surface-muted p-3 text-small">
          <ShieldAlertIcon className="mt-0.5 size-5 shrink-0 text-primary-text" aria-hidden />
          <span>{t("noPrepayment", { brand })}</span>
        </p>
      </Card>
      )}

      {trip.messageToHost ? (
        <Card as="section" aria-labelledby="trip-message" className="grid gap-2">
          <h2 id="trip-message" className="text-h3 font-semibold">
            {t("trip.yourMessage")}
          </h2>
          <p dir="auto" className="text-small whitespace-pre-line text-muted-foreground">
            {trip.messageToHost}
          </p>
        </Card>
      ) : null}

      <Card as="section" aria-labelledby="trip-cancel" className="grid gap-3">
        <h2 id="trip-cancel" tabIndex={-1} className="text-h2 outline-none">
          {t("review.cancellation")} · {t(`policy.${trip.cancellation.policy}.name`)}
        </h2>
        {cancelled ? (
          <p className="text-small">
            {t(`status.${trip.status}`)}
            {trip.cancelledAt ? ` · ${t("trip.cancelledOn", { date: formatDate(trip.cancelledAt, locale, { day: "numeric", month: "long", year: "numeric" }) })}` : null}
            {trip.cancelReasonCode && trip.status === "CANCELLED_BY_GUEST" && trip.cancelReasonCode in GUEST_REASON_KEYS
              ? ` · ${t(`guestReason.${trip.cancelReasonCode as keyof typeof GUEST_REASON_KEYS}`)}`
              : null}
          </p>
        ) : (
          <>
            <p className="text-small">{t(`policy.${trip.cancellation.policy}.rule`)}.</p>
            {confirmed ? (
              <p className={cn("text-small", trip.cancellation.lateNow ? "text-foreground" : "text-muted-foreground")}>
                {trip.cancellation.lateNow ? t("policy.lateNote") : freeLine}
              </p>
            ) : null}
            {trip.canCancel ? (
              <CancelTrip bookingId={trip.id} late={trip.cancellation.lateNow} freeLine={freeLine} />
            ) : confirmed ? (
              <p className="text-small text-muted-foreground">{t("trip.cantCancel")}</p>
            ) : null}
          </>
        )}
        {trip.status === "COMPLETED" ? <p className="text-small">{t("trip.completedNote", { brand })}</p> : null}
      </Card>

      {trip.status === "CANCELLED_BY_HOST" && !reportedAt ? (
        <Card as="section" aria-labelledby="trip-report" className="grid gap-3">
          <h2 id="trip-report" className="text-h2">
            {tr("hostCancelled")}
          </h2>
          <p className="text-small text-muted-foreground">{tr("hostCancelledText")}</p>
          <TurnedAwayButton {...reportProps} label={tr("tripButton")} variant="soft" className="justify-self-start" />
        </Card>
      ) : null}
      {reportedAt ? (
        <p className="flex items-start gap-2 rounded-card border border-border bg-surface-muted p-4 text-small" role="status">
          <ShieldAlertIcon className="mt-0.5 size-5 shrink-0 text-primary-text" aria-hidden />
          <span>{tr("reported", { date: formatDate(reportedAt, locale, { day: "numeric", month: "long", year: "numeric" }) })}</span>
        </p>
      ) : null}

      <div className="flex flex-wrap items-center gap-x-6 gap-y-1">
        <Link
          href="/contact"
          className="inline-flex min-h-11 items-center gap-2 justify-self-start rounded-md text-small font-medium text-primary-text underline underline-offset-4 outline-none focus-visible:ring-3 focus-visible:ring-ring/50"
        >
          <LifeBuoyIcon className="size-4.5" aria-hidden />
          {t("trip.help")}
        </Link>
        {trip.status !== "CANCELLED_BY_HOST" && !reportedAt ? (
          <TurnedAwayButton {...reportProps} label={tr("tripButton")} variant="link" className="min-h-11 text-small text-muted-foreground hover:text-destructive" />
        ) : null}
      </div>
    </div>
  );
}

const GUEST_REASON_KEYS = { CHANGE_OF_PLANS: 1, FOUND_OTHER_STAY: 1, TRAVEL_PROBLEM: 1, HOST_ASKED: 1, OTHER: 1 } as const;
