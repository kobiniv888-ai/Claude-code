import { MapPinned, MessageSquarePlus } from "lucide-react";
import { getTranslations } from "next-intl/server";
import { EmptyState } from "@/components/common/states";
import { siteConfig, type AppLocale } from "@/config/site";
import { pickLocalized } from "@/i18n/locale";
import { Link } from "@/i18n/navigation";
import type { JewishPlaceType } from "@/lib/jewish-life/places";
import { toPublicPlace } from "@/lib/jewish-life/places";
import { loadPlaces } from "./data";
import { PlacesExplorer } from "./places-explorer";

const contactLinkClass =
  "inline-flex h-11 shrink-0 items-center justify-center gap-2 rounded-full border bg-card px-5 text-sm font-semibold shadow-card transition-colors hover:bg-muted focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring";

/** Map and list of Jewish places (server part: loads visible places and passes them to the explorer). */
export async function PlacesSection({
  locale,
  initialTypes,
  initialCity,
}: {
  locale: AppLocale;
  initialTypes: JewishPlaceType[];
  initialCity: string | null;
}) {
  const t = await getTranslations({ locale, namespace: "jewishLife.places" });
  const { records, cities: cityRows } = await loadPlaces();

  if (records.length === 0) {
    return (
      <EmptyState
        bordered
        icon={MapPinned}
        headingLevel="h3"
        title={t("emptyTitle")}
        description={t("emptyBody")}
        action={{ label: t("emptyCta"), href: "/contact", icon: MessageSquarePlus }}
      />
    );
  }

  const places = records.map((record) => toPublicPlace(record, locale));
  const cities = cityRows.map((c) => ({ slug: c.slug, name: pickLocalized(c.names, locale), count: c.placeCount }));

  return (
    <div className="space-y-6">
      <PlacesExplorer
        places={places}
        cities={cities}
        initialTypes={initialTypes}
        initialCity={initialCity}
        map={{
          center: siteConfig.map.defaultCenter,
          zoom: siteConfig.map.defaultZoom,
        }}
      />
      <div className="flex flex-col items-start gap-3 rounded-card bg-navy-soft/60 p-4 sm:flex-row sm:items-center sm:justify-between sm:p-5">
        <p className="text-sm text-pretty">
          <span className="font-semibold">{t("suggestTitle")}</span> {t("suggestBody")}
        </p>
        <Link href="/contact" className={contactLinkClass}>
          <MessageSquarePlus aria-hidden="true" className="size-4" />
          {t("suggestCta")}
        </Link>
      </div>
    </div>
  );
}
