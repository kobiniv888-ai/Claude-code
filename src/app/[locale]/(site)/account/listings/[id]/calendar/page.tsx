import type { Metadata } from "next";
import { headers } from "next/headers";
import { notFound } from "next/navigation";
import { HostInstantNotice } from "@/components/booking/host-instant-notice";
import { hostAlertStatus } from "@/lib/booking/alerts";
import { getTranslations, setRequestLocale } from "next-intl/server";
import { CalendarClockIcon, InboxIcon, PencilIcon, ZapIcon } from "lucide-react";
import { buttonStyles } from "@/components/ds/button";
import { Card } from "@/components/ds/card";
import { Ltr } from "@/components/common/ltr";
import { PageHeader } from "@/components/common/page-header";
import { HostBookingRow } from "@/components/host-bookings/booking-row";
import { HostCalendar } from "@/components/host-calendar/host-calendar";
import { IcalPanel } from "@/components/host-calendar/ical-panel";
import type { AppLocale } from "@/config/site";
import { Link } from "@/i18n/navigation";
import { requireUser } from "@/lib/auth/session";
import { HOST_BOOKINGS_PATH, isInstantDealType } from "@/lib/booking/constants";
import { getHostCalendar, HOST_CALENDAR_MONTHS } from "@/lib/booking/host-calendar";
import { getHostBookings } from "@/lib/booking/queries";
import { pageMetadata } from "@/lib/seo";

type Props = { params: Promise<{ locale: string; id: string }> };

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { locale, id } = await params;
  const t = await getTranslations({ locale, namespace: "hostBooking.calendar" });
  return pageMetadata({ locale, path: `/account/listings/${id}/calendar`, title: t("metaTitle"), description: t("lead"), noIndex: true });
}

/**
 * /account/listings/<id>/calendar — the host's calendar for one listing: block and open dates, see
 * Bayit bookings (tap → details), and sync with Airbnb / Booking.com (iCal import and export).
 */
export default async function ListingCalendarPage({ params }: Props) {
  const { locale, id } = await params;
  setRequestLocale(locale);
  const user = await requireUser({ next: `/account/listings/${encodeURIComponent(id)}/calendar` });
  const data = await getHostCalendar(user.id, id, locale as AppLocale);
  if (!data || data.listing.dealType === "SALE") notFound();
  const { listing } = data;
  const [t, tl] = await Promise.all([getTranslations("hostBooking.calendar"), getTranslations("account.listings")]);
  const upcoming = listing.bookable
    ? (await getHostBookings(user.id, locale as AppLocale, { listingId: listing.id, scope: "upcoming" })).slice(0, 5)
    : [];
  // Hotels are contact-only until booking by room type (round 3); short stays need the booking step
  // saved, and a host Bayit can alert about a booking (alert gate).
  const isHotel = listing.dealType === "HOTEL_ROOM";
  const needsSettings = listing.bookable && isInstantDealType(listing.dealType) && listing.bookingMode !== "INSTANT";
  const alertStatus = listing.bookable && !isHotel && !needsSettings ? await hostAlertStatus(user.id, await headers()) : null;

  return (
    <div className="grid gap-6 pb-10">
      <PageHeader
        className="pb-0 sm:pb-0"
        breadcrumbs={[{ label: tl("title"), href: "/account/listings" }, { label: t("title") }]}
        title={t("title")}
        description={
          <span className="flex flex-wrap items-center gap-x-2 gap-y-1">
            <span dir="auto" className="font-medium text-foreground">
              {listing.title || tl("untitled")}
            </span>
            <span className="text-xs">
              {tl("id")} <Ltr>{listing.publicId}</Ltr>
            </span>
          </span>
        }
        actions={
          <Link href={`/account/listings/${listing.id}/edit`} className={buttonStyles({ variant: "secondary" })}>
            <PencilIcon aria-hidden />
            {tl("actions.edit")}
          </Link>
        }
      />

      {listing.bookable && (isHotel || alertStatus) ? <HostInstantNotice hotel={isHotel} status={alertStatus ?? undefined} /> : null}

      {needsSettings && (
        <div className="flex flex-col gap-3 rounded-card border border-primary-tint-border bg-primary-tint p-4 sm:flex-row sm:items-center">
          <ZapIcon className="size-5 shrink-0 text-primary-text" aria-hidden />
          <p className="min-w-0 flex-1 text-small text-pretty">{t("notInstant")}</p>
          <Link href={`/account/listings/${listing.id}/edit?step=booking`} className={buttonStyles({ variant: "secondary" })}>
            {t("notInstantAction")}
          </Link>
        </div>
      )}

      <Card as="section" padding="lg" aria-labelledby="calendar-title" className="grid gap-3">
        <h2 id="calendar-title" className="sr-only">
          {t("title")}
        </h2>
        <HostCalendar
          listingId={listing.id}
          today={data.today}
          monthCount={HOST_CALENDAR_MONTHS}
          owner={data.owner}
          booked={data.booked}
          imported={data.imported}
          bookings={data.bookings}
        />
      </Card>

      {listing.bookable && (
        <section aria-labelledby="upcoming-title" className="grid gap-3">
          <div className="flex flex-wrap items-baseline justify-between gap-2">
            <h2 id="upcoming-title" className="text-h3">
              {t("upcomingTitle")}
            </h2>
            <Link
              href={{ pathname: HOST_BOOKINGS_PATH, query: { listing: listing.id } }}
              className="inline-flex min-h-11 items-center text-small font-medium text-primary-text underline-offset-4 hover:underline"
            >
              {t("allBookings")}
            </Link>
          </div>
          {upcoming.length > 0 ? (
            <ul className="grid gap-2">
              {upcoming.map((booking) => (
                <HostBookingRow key={booking.id} booking={booking} locale={locale} showListing={false} />
              ))}
            </ul>
          ) : (
            <p className="flex items-center gap-3 rounded-card border border-dashed border-border-strong p-4 text-small text-muted-foreground">
              <InboxIcon className="size-5 shrink-0" aria-hidden />
              {t("noUpcoming")}
            </p>
          )}
        </section>
      )}

      {listing.bookable && (
        <section aria-labelledby="sync-title" className="grid gap-3">
          <div className="grid gap-1">
            <h2 id="sync-title" className="flex items-center gap-2 text-h3">
              <CalendarClockIcon className="size-5 text-primary-text" aria-hidden />
              {t("syncTitle")}
            </h2>
            <p className="text-small text-pretty text-muted-foreground">{t("syncLead")}</p>
          </div>
          <IcalPanel
            listingId={listing.id}
            exportUrl={listing.exportUrl}
            importUrls={listing.importUrls}
            syncedAt={listing.syncedAt}
            importedNights={data.importedNights}
          />
        </section>
      )}
    </div>
  );
}
