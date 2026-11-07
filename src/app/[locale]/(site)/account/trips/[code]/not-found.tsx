import { useTranslations } from "next-intl";
import { ChevronRightIcon, SearchXIcon } from "lucide-react";
import { NotFoundState } from "@/components/common/states";
import { Link } from "@/i18n/navigation";
import { TRIPS_PATH } from "@/lib/booking/constants";

/**
 * A trip that is not this account's (or no such booking): the same friendly text either way, so
 * nothing about another guest's booking leaks ("noindex"; account pages stream, so the status
 * stays 200). It has no trip mark, which tells the service worker to drop a copy saved for
 * offline use by another account on this device (public/sw.js, src/lib/trip/offline.ts).
 */
export default function TripNotFound() {
  const t = useTranslations("booking");
  return (
    <div className="grid gap-2 py-6">
      <Link
        href={TRIPS_PATH}
        className="inline-flex min-h-11 items-center gap-1 justify-self-start rounded-md text-small font-medium text-muted-foreground outline-none hover:text-foreground focus-visible:ring-3 focus-visible:ring-ring/50"
      >
        <ChevronRightIcon className="size-4 ltr:-scale-x-100" aria-hidden />
        {t("trip.back")}
      </Link>
      <NotFoundState bordered icon={SearchXIcon} title={t("trip.notFoundTitle")} description={t("trip.notFoundText")} action={{ label: t("trips.title"), href: TRIPS_PATH }} />
    </div>
  );
}
