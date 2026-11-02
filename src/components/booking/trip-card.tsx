import { getTranslations } from "next-intl/server";
import { ChevronLeftIcon } from "lucide-react";
import { Ltr } from "@/components/common/ltr";
import { Card } from "@/components/ds/card";
import { Tag } from "@/components/ds/tag";
import type { AppLocale } from "@/config/site";
import { Link } from "@/i18n/navigation";
import { tripPath } from "@/lib/booking/constants";
import { daysBetween, tbilisiToday } from "@/lib/booking/dates";
import type { BookingSummary } from "@/lib/booking/queries";
import { formatDateRange } from "@/lib/format";

/** One trip in "הנסיעות שלי": photo, title, dates, guests, status and the booking number. */
export async function TripCard({ trip, locale }: { trip: BookingSummary; locale: AppLocale }) {
  const t = await getTranslations({ locale, namespace: "booking" });
  const guests = [
    t("guests.total", { count: trip.adults + trip.children }),
    trip.infants > 0 ? t("guests.infants", { count: trip.infants }) : null,
  ]
    .filter(Boolean)
    .join(" · ");
  const days = trip.upcoming ? Math.max(0, daysBetween(tbilisiToday(), trip.checkIn)) : null;
  const cancelled = trip.status === "CANCELLED_BY_GUEST" || trip.status === "CANCELLED_BY_HOST";
  return (
    <Card as="li" interactive padding="none" className="overflow-hidden">
      <div className="flex gap-3 p-3">
        {trip.listing.photo ? (
          // eslint-disable-next-line @next/next/no-img-element -- a small, already sized WebP from the media route
          <img src={trip.listing.photo} alt="" width={88} height={88} className={`size-22 shrink-0 rounded-xl object-cover ${cancelled ? "opacity-60" : ""}`} />
        ) : (
          <div className="size-22 shrink-0 rounded-xl bg-surface-muted" aria-hidden />
        )}
        <div className="grid min-w-0 flex-1 content-start gap-1">
          <div className="flex flex-wrap items-center gap-1.5">
            <Tag variant={trip.status === "CONFIRMED" ? "success" : "neutral"} size="sm">
              {t(`status.${trip.status}`)}
            </Tag>
            {days !== null ? (
              <Tag variant="primary" size="sm">
                {t("trips.inDays", { count: days })}
              </Tag>
            ) : null}
          </div>
          <Link
            href={tripPath(trip.code)}
            className="line-clamp-2 rounded text-h3 font-semibold outline-none after:absolute after:inset-0 focus-visible:underline"
            dir="auto"
          >
            {trip.listing.title}
          </Link>
          <p className="text-small text-muted-foreground">
            {formatDateRange(trip.checkIn, trip.checkOut, locale, { day: "numeric", month: "short", year: "numeric" })} ·{" "}
            {t("price.nights", { count: trip.nights })}
          </p>
          <p className="flex flex-wrap items-center gap-x-3 text-caption text-muted-foreground">
            <span>{guests}</span>
            <span>
              {t("codeLabel")} <Ltr className="font-medium text-foreground">{trip.code}</Ltr>
            </span>
          </p>
        </div>
        <ChevronLeftIcon className="size-5 shrink-0 self-center text-muted-foreground ltr:-scale-x-100" aria-hidden />
      </div>
    </Card>
  );
}
