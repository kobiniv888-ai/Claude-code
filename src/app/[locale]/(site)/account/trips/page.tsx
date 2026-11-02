import type { Metadata } from "next";
import { getTranslations, setRequestLocale } from "next-intl/server";
import { LuggageIcon, SearchIcon } from "lucide-react";
import { TripCard } from "@/components/booking/trip-card";
import { PageHeader } from "@/components/common/page-header";
import { EmptyState } from "@/components/ds/empty-state";
import type { AppLocale } from "@/config/site";
import { requireUser } from "@/lib/auth/session";
import { TRIPS_PATH } from "@/lib/booking/constants";
import { getGuestTrips } from "@/lib/booking/queries";
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
  const [t, trips] = await Promise.all([getTranslations({ locale, namespace: "booking.trips" }), getGuestTrips(user.id, locale)]);
  const empty = trips.upcoming.length === 0 && trips.past.length === 0;

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
                  <TripCard key={trip.id} trip={trip} locale={locale} />
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
                  <TripCard key={trip.id} trip={trip} locale={locale} />
                ))}
              </ul>
            </section>
          ) : null}
        </div>
      )}
    </div>
  );
}
