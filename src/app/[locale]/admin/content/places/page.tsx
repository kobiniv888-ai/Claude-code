import { BadgeCheck, FlaskConical, MapPin, Plus } from "lucide-react";
import { getTranslations, setRequestLocale } from "next-intl/server";
import { Pill } from "@/components/admin/content/pill";
import { AdminFilterBar } from "@/components/admin/filter-bar";
import { AdminPageHeader } from "@/components/admin/page-header";
import { Ltr } from "@/components/common/ltr";
import { EmptyState } from "@/components/common/states";
import { Button } from "@/components/ui/button";
import { Link } from "@/i18n/navigation";
import { enumParam, param } from "@/lib/admin/params";
import { JEWISH_PLACE_TYPES } from "@/lib/admin/content/schemas";
import { cityOptions, listPlaces } from "@/lib/admin/content/server/queries";
import { adminContentMetadata } from "@/lib/admin/content/server/metadata";
import { requireStaff } from "@/lib/auth/session";
import { formatDate } from "@/lib/format";

export async function generateMetadata({ params }: PageProps<"/[locale]/admin/content/places">) {
  return adminContentMetadata(params, "places");
}

const SHOW = ["active", "hidden", "demo", "real", "verified", "unverified"] as const;

export default async function PlacesPage({ params, searchParams }: PageProps<"/[locale]/admin/content/places">) {
  const { locale } = await params;
  setRequestLocale(locale);
  await requireStaff("content");
  const query = await searchParams;
  const cities = await cityOptions(locale);
  const cityParam = param(query, "city");
  const filters = {
    type: enumParam(query, "type", JEWISH_PLACE_TYPES),
    cityId: cities.some((c) => c.id === cityParam) ? cityParam : undefined,
    show: enumParam(query, "show", SHOW),
    q: param(query, "q").slice(0, 100),
  };
  const [t, tCommon, places] = await Promise.all([
    getTranslations("adminContent.places"),
    getTranslations("adminContent.common"),
    listPlaces(locale, filters),
  ]);
  const filtered = Boolean(filters.type || filters.cityId || filters.show || filters.q);
  const addButton = (
    <Button asChild>
      <Link href="/admin/content/places/new">
        <Plus aria-hidden />
        {t("addPlace")}
      </Link>
    </Button>
  );

  return (
    <>
      <AdminPageHeader
        back={{ href: "/admin/content", label: tCommon("backToContent") }}
        title={t("title")}
        description={t("description")}
        actions={addButton}
      />
      <AdminFilterBar
        fields={[
          { type: "search", name: "q", label: t("filters.search"), placeholder: t("filters.searchPlaceholder") },
          {
            type: "select",
            name: "type",
            label: t("type"),
            allLabel: tCommon("all"),
            options: JEWISH_PLACE_TYPES.map((type) => ({ value: type, label: t(`types.${type}`) })),
          },
          { type: "select", name: "city", label: t("city"), allLabel: tCommon("all"), options: cities.map((c) => ({ value: c.id, label: c.name })) },
          { type: "select", name: "show", label: t("filters.show"), allLabel: tCommon("all"), options: SHOW.map((s) => ({ value: s, label: t(`filters.${s}`) })) },
        ]}
      />
      {places.length === 0 ? (
        <EmptyState
          bordered
          icon={MapPin}
          title={filtered ? t("noMatchTitle") : t("emptyTitle")}
          description={filtered ? t("noMatchDescription") : t("emptyDescription")}
          action={filtered ? undefined : addButton}
        />
      ) : (
        <ul className="divide-y rounded-xl border bg-card shadow-xs">
          {places.map((place) => (
            <li key={place.id}>
              <Link
                href={`/admin/content/places/${place.id}`}
                className="flex flex-wrap items-center gap-3 p-3 outline-none hover:bg-muted/50 focus-visible:ring-3 focus-visible:ring-ring/50 sm:px-4"
              >
                <span className="flex size-10 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary">
                  <MapPin aria-hidden className="size-5" />
                </span>
                <div className="min-w-0 flex-1">
                  <p className="line-clamp-2 font-medium break-words">{place.name}</p>
                  <p className="flex flex-wrap items-center gap-x-2 text-xs text-muted-foreground">
                    <span>{t(`types.${place.type}`)}</span>
                    {place.cityName ? <span>{place.cityName}</span> : null}
                    {place.addressText ? <span className="truncate">{place.addressText}</span> : null}
                    {place.phone ? <Ltr>{place.phone}</Ltr> : null}
                  </p>
                </div>
                <div className="flex flex-wrap gap-1.5">
                  {place.isDemo ? (
                    <Pill tone="demo" icon={FlaskConical}>
                      {t("demoLabel")}
                    </Pill>
                  ) : place.verifiedAt ? (
                    <Pill tone="success" icon={BadgeCheck}>
                      {t("verification.verifiedOn", { date: formatDate(place.verifiedAt.toISOString().slice(0, 10), locale, { dateStyle: "medium" }) })}
                    </Pill>
                  ) : (
                    <Pill tone="warning">{t("verification.notVerified")}</Pill>
                  )}
                  {place.active ? <Pill tone="success">{t("visible")}</Pill> : <Pill tone="muted">{t("hidden")}</Pill>}
                </div>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </>
  );
}
