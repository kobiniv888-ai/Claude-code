import type { Metadata } from "next";
import { getTranslations, setRequestLocale } from "next-intl/server";
import {
  BanknoteIcon,
  ChevronRightIcon,
  CircleCheckBigIcon,
  CreditCardIcon,
  LandmarkIcon,
  LifeBuoyIcon,
  ShieldAlertIcon,
  type LucideIcon,
} from "lucide-react";
import { BookingPriceLines } from "@/components/booking/booking-price-lines";
import { CancelTrip } from "@/components/booking/cancel-trip";
import { CopyCode } from "@/components/booking/copy-code";
import { Ltr } from "@/components/common/ltr";
import { Card } from "@/components/ds/card";
import { Tag } from "@/components/ds/tag";
import { TurnedAwayButton } from "@/components/report/turned-away-button";
import { OfflineForget, OfflineNotice } from "@/components/trip/offline-save";
import { TripHost } from "@/components/trip/trip-host";
import { TripKeep } from "@/components/trip/trip-keep";
import { TripRules } from "@/components/trip/trip-rules";
import { TripSafety } from "@/components/trip/trip-safety";
import { TripShabbat } from "@/components/trip/trip-shabbat";
import { TripWhere } from "@/components/trip/trip-where";
import { TripReviewPrompt } from "@/components/reviews/trip-review-prompt";
import { siteConfig, type AppLocale } from "@/config/site";
import { Link } from "@/i18n/navigation";
import { requireUser } from "@/lib/auth/session";
import { cleanPaymentMethods, TRIPS_PATH, tripPath, type PaymentMethod } from "@/lib/booking/constants";
import { DEFAULT_CHECK_IN_TIME, tbilisiToday } from "@/lib/booking/dates";
import { isActiveOrDone, revealLastDay } from "@/lib/booking/policy";
import { clockText } from "@/lib/booking/guest";
import { formatBookingMoney } from "@/lib/booking/price-lines";
import { getGuestTrip } from "@/lib/booking/queries";
import { formatDate, formatDateRange, formatMoney, formatTime } from "@/lib/format";
import { guestBookingReports } from "@/lib/reports/queries";
import { pageMetadata } from "@/lib/seo";
import { tripGoogleCalendarUrl } from "@/lib/trip/calendar-server";
import { cancellationView } from "@/lib/trip/deadline";
import { OFFLINE_TRIP_GONE_MARKER, OFFLINE_TRIP_GONE_VALUE, OFFLINE_TRIP_MARKER, offlineSaveAllowed } from "@/lib/trip/offline";
import { offlineOwnerKey, offlineTripVersion } from "@/lib/trip/offline-server";
import { getTripExtras } from "@/lib/trip/server";
import { cn } from "@/lib/utils";
import TripNotFound from "./not-found";

type Props = {
  params: Promise<{ locale: string; code: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
};

function decodedCode(raw: string): string {
  try {
    return decodeURIComponent(raw);
  } catch {
    return raw;
  }
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { locale, code } = await params;
  const t = await getTranslations({ locale, namespace: "booking.trip" });
  return pageMetadata({ locale, path: tripPath(decodedCode(code)), title: t("title"), description: t("confirmedText"), noIndex: true });
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
 * /account/trips/<code> — the trip page (round 3, brief 7.1), also the booking confirmation
 * (?booked=1). Only for the guest of the booking (anyone else gets "not found"; the host has their
 * own booking page). Linked from the confirmation, every booking email to the guest and "הנסיעות
 * שלי". It shows, in this order:
 *
 * - status, booking number, dates with check-in / check-out times ("גמיש" too), guests, room type
 *   and rooms for hotels;
 * - the exact address (confirmed and completed bookings only, as before), a map of the exact point
 *   that loads only near the screen, "פתיחה ב-Google Maps" / "פתיחה ב-Waze";
 * - the host's contact buttons (every method the host chose) and contact hours;
 * - "הוספה ליומן" (.ics + Google Calendar) and "שמירה לשימוש בלי אינטרנט" (on a tap only; not
 *   for a cancelled trip or after the keep window, when a copy saved earlier is deleted instead);
 * - ONLY when the stay includes a Friday night or a night of a holiday (Israeli calendar):
 *   candle-lighting and Havdalah times for the city, the nearest verified synagogue, Chabad house
 *   and kosher place with walking times, "המארח לא עונה בשבת" (src/lib/trip/server.ts);
 * - the house rules; the itemized total (Booking.priceLines) and how to pay on arrival;
 * - the free-cancellation deadline with the cancel button; the safety note and emergency numbers;
 * - "Turned away?" (round 3, brief 8.2) and help.
 *
 * Light on weak connections: a server component; the only client parts are the copy, cancel,
 * report and offline buttons, and the map (lazy). The reviews prompt (brief 8.1) goes in its
 * marked place below.
 */
export default async function TripPage({ params, searchParams }: Props) {
  const { locale: raw, code } = await params;
  setRequestLocale(raw);
  const locale = raw as AppLocale;
  const user = await requireUser({ next: tripPath(decodedCode(code)) });
  const [t, tt, trip, query] = await Promise.all([
    getTranslations({ locale, namespace: "booking" }),
    getTranslations({ locale, namespace: "trips" }),
    getGuestTrip(user.id, decodedCode(code), locale),
    searchParams,
  ]);
  // Not this account's booking (or no such booking): the same answer, nothing about it leaks.
  // Rendered here rather than with notFound(): this page streams (loading.tsx), and a streamed
  // notFound() reaches the browser only in the page's data, so the service worker would not see
  // the not-found page's "gone" mark in the HTML and could not delete another account's saved
  // copy (public/sw.js). The page is "noindex" either way.
  if (!trip) return <TripNotFound />;

  const brand = siteConfig.localizedName[locale] ?? siteConfig.name;
  const dates = formatDateRange(trip.checkIn, trip.checkOut, locale, { day: "numeric", month: "short" });
  const reveal = trip.reveal;
  const confirmed = trip.status === "CONFIRMED";
  const cancelled = trip.status === "CANCELLED_BY_GUEST" || trip.status === "CANCELLED_BY_HOST";
  const justBooked = query.booked === "1" && confirmed;
  const [tr, reports, extras, googleUrl] = await Promise.all([
    getTranslations({ locale, namespace: "report.turnedAway" }),
    guestBookingReports(user.id, [trip.id]),
    getTripExtras(
      user.id,
      { id: trip.id, status: trip.status, checkIn: trip.checkIn, checkOut: trip.checkOut, revealed: reveal !== null },
      locale,
      { message: t("trip.whatsappText", { brand, code: trip.code, dates }) },
    ),
    confirmed && reveal ? tripGoogleCalendarUrl(trip, locale) : Promise.resolve(null),
  ]);
  if (!extras) return <TripNotFound />;

  // "Turned away?" (round 3, brief 8.2): the guest can report the host from every trip; after a
  // host cancellation it is a card of its own. ?report=1 (the cancellation email) opens the form.
  const reportedAt = reports.get(trip.id) ?? null;
  const today = tbilisiToday();
  const reportProps = {
    target: { bookingId: trip.id },
    context: { bookingCode: trip.code },
    today,
    defaultDate: trip.status === "CANCELLED_BY_HOST" && trip.cancelledAt ? tbilisiToday(trip.cancelledAt) : today,
    autoOpen: query.report === "1" && !reportedAt,
  };
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
  const total = formatBookingMoney(trip.total, trip.currency, locale);
  const methods = cleanPaymentMethods(trip.paymentMethods);
  const deadline = cancellationView({
    status: trip.status,
    checkIn: trip.checkIn,
    checkOut: trip.checkOut,
    policy: trip.cancellation.policy,
    checkInFrom: trip.checkInFrom,
  });
  const freeLine =
    deadline.kind === "free"
      ? tt("cancel.freeUntil", {
          date: formatDate(deadline.until, locale, { weekday: "short", day: "numeric", month: "long" }),
          time: formatTime(deadline.until, locale),
        })
      : null;
  const pagePath = `/${locale}${trip.path}`;
  // "שמירה לשימוש בלי אינטרנט" (src/lib/trip/offline.ts): the copy belongs to this account, and is
  // re-saved when what it shows changes (the content key below).
  const offlineAllowed = offlineSaveAllowed({ status: trip.status, checkOut: trip.checkOut }, today);
  const offline = offlineAllowed
    ? {
        path: pagePath,
        code: trip.code,
        title: trip.listing.title,
        checkIn: trip.checkIn,
        checkOut: trip.checkOut,
        // The offline page's list shows the dates as this page writes them (i18n-1).
        datesLabel: dates,
        status: trip.status,
        owner: offlineOwnerKey(user.id),
        version: offlineTripVersion({
          status: trip.status,
          dates: [trip.checkIn, trip.checkOut, trip.checkInFrom, trip.checkOutUntil, trip.checkInFlexible, trip.checkOutFlexible],
          guests: [trip.adults, trip.children, trip.infants, trip.rooms, trip.roomTypeName],
          title: trip.listing.title,
          reveal,
          extras,
          price: [trip.total, trip.currency, trip.priceLines, trip.paymentMethods, trip.cancellation.policy],
          message: trip.messageToHost,
        }),
      }
    : null;

  return (
    // The mark tells the offline copy apart from "not found" and the login page; the "gone" mark
    // tells the service worker to delete a copy that may no longer be kept (src/lib/trip/offline.ts).
    <div
      className="grid max-w-3xl gap-4 pt-2 pb-8"
      {...{ [OFFLINE_TRIP_MARKER]: trip.code, ...(offlineAllowed ? {} : { [OFFLINE_TRIP_GONE_MARKER]: OFFLINE_TRIP_GONE_VALUE }) }}
    >
      <Link
        href={TRIPS_PATH}
        className="inline-flex min-h-11 items-center gap-1 justify-self-start rounded-md text-small font-medium text-muted-foreground outline-none hover:text-foreground focus-visible:ring-3 focus-visible:ring-ring/50"
      >
        <ChevronRightIcon className="size-4 ltr:-scale-x-100" aria-hidden />
        {t("trip.back")}
      </Link>

      <OfflineNotice />
      {offlineAllowed ? null : <OfflineForget path={pagePath} />}

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
          {trip.roomTypeName ? (
            // Hotels (round 3): the room type and how many rooms of it (a family can book several).
            <Row label={tt("room.label")}>
              <span dir="auto">{tt("room.value", { name: trip.roomTypeName, count: trip.rooms })}</span>
            </Row>
          ) : null}
        </dl>
      </Card>

      {/* Reviews (round 3, brief 8.1): renders nothing unless this stay can be reviewed now. */}
      <TripReviewPrompt bookingCode={trip.code} locale={locale} />

      {reveal ? (
        <>
          <TripWhere locale={locale} address={reveal.address} directions={reveal.directions} point={extras.point} />
          <TripHost locale={locale} hostName={reveal.hostName} buttons={extras.contactButtons} contactHours={extras.contactHours} />
        </>
      ) : !cancelled ? (
        // Security checklist 6.f: a week after check-out the address and contacts are hidden again.
        <p className="rounded-card border border-border bg-surface-muted p-4 text-small text-muted-foreground">
          {isActiveOrDone(trip.status) && today > revealLastDay(trip.checkOut) ? tt("where.hiddenAfterStay") : t("trip.hidden")}
        </p>
      ) : null}

      {!cancelled ? (
        <TripKeep
          locale={locale}
          calendar={
            confirmed && trip.icsPath && googleUrl
              ? { icsHref: `${trip.icsPath}?lang=${locale}`, fileName: `${trip.code}.ics`, googleUrl }
              : null
          }
          offline={offline}
        />
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

      {extras.shabbat ? <TripShabbat locale={locale} shabbat={extras.shabbat} /> : null}

      {!cancelled ? <TripRules locale={locale} rules={extras.rules} /> : null}

      {cancelled ? null : (
        <Card as="section" aria-labelledby="trip-pay" className="grid gap-3">
          <h2 id="trip-pay" className="text-h2">
            {t("trip.payTitle")}
          </h2>
          {/* The lines the guest confirmed (round 3, brief 6.3: Booking.priceLines). */}
          <BookingPriceLines lines={trip.priceLines} total={trip.total} currency={trip.currency} locale={locale} />
          {trip.display ? (
            <p className="-mt-1 text-end text-caption text-muted-foreground">
              {t("price.estimate", { amount: `⁦≈ ${formatMoney(trip.display.total, trip.display.currency, locale, { maximumFractionDigits: 0 })}⁩` })}
            </p>
          ) : null}
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
            {confirmed && deadline.kind !== "closed" ? (
              <p className={cn("text-body", deadline.kind === "late" ? "text-foreground" : "font-semibold")}>
                {deadline.kind === "late" ? t("policy.lateNote") : freeLine}
              </p>
            ) : null}
            {deadline.canCancel ? (
              <CancelTrip bookingId={trip.id} late={deadline.kind === "late"} freeLine={freeLine} />
            ) : confirmed ? (
              <p className="text-small text-muted-foreground">{t("trip.cantCancel")}</p>
            ) : null}
          </>
        )}
        {trip.status === "COMPLETED" ? <p className="text-small">{t("trip.completedNote", { brand })}</p> : null}
      </Card>

      {!cancelled ? <TripSafety locale={locale} emergencyNumber={extras.emergencyNumber} /> : null}

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
