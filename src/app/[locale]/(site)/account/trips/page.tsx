import type { Metadata } from "next";
import { getTranslations, setRequestLocale } from "next-intl/server";
import { FlagIcon, LuggageIcon, SearchIcon } from "lucide-react";
import { TripCard } from "@/components/booking/trip-card";
import { PageHeader } from "@/components/common/page-header";
import { EmptyState } from "@/components/ds/empty-state";
import type { AppLocale } from "@/config/site";
import { Link } from "@/i18n/navigation";
import { requireUser } from "@/lib/auth/session";
import { TRIPS_PATH, tripPath } from "@/lib/booking/constants";
import { getGuestTrips, type BookingSummary } from "@/lib/booking/queries";
import { guestBookingReports } from "@/lib/reports/queries";
import { pageMetadata } from "@/lib/seo";

type Props = { params: Promise<{ locale: string }> };

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: "booking.trips" });
  return pageMetadata({ locale, path: TRIPS_PATH, title: t("title"), description: t("subtitle"), noIndex: true });
}

/** /account/trips — "הנסיעות שלי": upcoming trips (soonest first), then past and cancelled ones. */
export default async function TripsPage({ params }: Props) {
  const { locale: raw } = await params;
  setRequestLocale(raw);
  const locale = raw as AppLocale;
  const user = await requireUser({ next: TRIPS_PATH });
  const [t, tr, trips] = await Promise.all([
    getTranslations({ locale, namespace: "booking.trips" }),
    getTranslations({ locale, namespace: "report.turnedAway" }),
    getGuestTrips(user.id, locale),
  ]);
  const empty = trips.upcoming.length === 0 && trips.past.length === 0;
  // "המארח ביטל? ספרו לנו" (round 3, brief 8.2) under trips the host cancelled.
  const cancelledByHost = [...trips.upcoming, ...trips.past].filter((trip) => trip.status === "CANCELLED_BY_HOST");
  const reported = await guestBookingReports(user.id, cancelledByHost.map((trip) => trip.id));
  const footer = (trip: BookingSummary) =>
    trip.status !== "CANCELLED_BY_HOST" ? undefined : reported.has(trip.id) ? (
      <p className="flex min-h-11 items-center gap-1.5 text-small text-muted-foreground">
        <FlagIcon className="size-4 shrink-0" aria-hidden />
        {tr("reportedShort")}
      </p>
    ) : (
      <Link
        href={`${tripPath(trip.code)}?report=1`}
        className="flex min-h-11 items-center gap-1.5 rounded-md text-small font-medium text-primary-text underline-offset-4 outline-none hover:underline focus-visible:ring-3 focus-visible:ring-ring/50"
      >
        <FlagIcon className="size-4 shrink-0" aria-hidden />
        {tr("hostCancelled")}
      </Link>
    );

  return (
    <div className="pb-8">
      <PageHeader title={t("title")} description={t("subtitle")} />
      {empty ? (
        <EmptyState
          icon={LuggageIcon}
          title={t("emptyTitle")}
          description={t("emptyText")}
          action={{ label: t("search"), href: "/search", icon: SearchIcon }}
        />
      ) : (
        <div className="grid gap-8">
          <section aria-labelledby="trips-upcoming" className="grid gap-3">
            <h2 id="trips-upcoming" className="text-h2">
              {t("upcoming")}
            </h2>
            {trips.upcoming.length ? (
              <ul className="grid gap-3 lg:grid-cols-2">
                {trips.upcoming.map((trip) => (
                  <TripCard key={trip.id} trip={trip} locale={locale} footer={footer(trip)} />
                ))}
              </ul>
            ) : (
              <p className="text-small text-muted-foreground">{t("noUpcoming")}</p>
            )}
          </section>
          {trips.past.length ? (
            <section aria-labelledby="trips-past" className="grid gap-3">
              <h2 id="trips-past" className="text-h2">
                {t("past")}
              </h2>
              <ul className="grid gap-3 lg:grid-cols-2">
                {trips.past.map((trip) => (
                  <TripCard key={trip.id} trip={trip} locale={locale} footer={footer(trip)} />
                ))}
              </ul>
            </section>
          ) : null}
        </div>
      )}
    </div>
  );
}
