import { Building2, ImageOff, Plus, Star } from "lucide-react";
import { getTranslations, setRequestLocale } from "next-intl/server";
import { Pill } from "@/components/admin/content/pill";
import { AdminPageHeader } from "@/components/admin/page-header";
import { EmptyState } from "@/components/common/states";
import { Button } from "@/components/ui/button";
import { Link } from "@/i18n/navigation";
import { listCities } from "@/lib/admin/content/server/queries";
import { adminContentMetadata } from "@/lib/admin/content/server/metadata";
import { requireStaff } from "@/lib/auth/session";
import { formatNumber } from "@/lib/format";

export async function generateMetadata({ params }: PageProps<"/[locale]/admin/content/cities">) {
  return adminContentMetadata(params, "cities");
}

export default async function CitiesPage({ params }: PageProps<"/[locale]/admin/content/cities">) {
  const { locale } = await params;
  setRequestLocale(locale);
  await requireStaff("content");
  const [t, tCommon, cities] = await Promise.all([
    getTranslations("adminContent.cities"),
    getTranslations("adminContent.common"),
    listCities(locale),
  ]);
  const addButton = (
    <Button asChild>
      <Link href="/admin/content/cities/new">
        <Plus aria-hidden />
        {t("addCity")}
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
      {cities.length === 0 ? (
        <EmptyState bordered icon={Building2} title={t("emptyTitle")} description={t("emptyDescription")} action={addButton} />
      ) : (
        <ul className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
          {cities.map((city) => (
            <li key={city.id}>
              <Link
                href={`/admin/content/cities/${city.id}`}
                className="flex h-full gap-3 rounded-xl border bg-card p-3 shadow-xs outline-none transition-colors hover:border-primary/40 focus-visible:ring-3 focus-visible:ring-ring/50"
              >
                <div className="size-20 shrink-0 overflow-hidden rounded-lg bg-muted">
                  {city.photoUrl ? (
                    // eslint-disable-next-line @next/next/no-img-element -- small admin thumbnail
                    <img src={city.photoUrl} alt="" className="size-full object-cover" loading="lazy" />
                  ) : (
                    <span className="flex size-full items-center justify-center text-muted-foreground">
                      <ImageOff aria-hidden className="size-5" />
                    </span>
                  )}
                </div>
                <div className="flex min-w-0 flex-1 flex-col gap-1">
                  <p className="flex items-center gap-1.5 font-semibold">
                    <span className="truncate">{city.name}</span>
                    {city.isPopular ? <Star aria-label={t("popular")} className="size-4 shrink-0 fill-current text-warning" /> : null}
                  </p>
                  <p className="text-xs text-muted-foreground" dir="ltr">
                    {city.slug}
                    {city.airportCode ? ` · ${city.airportCode}` : ""}
                  </p>
                  <p className="text-xs text-muted-foreground">
                    {t("cityStats", {
                      neighborhoods: formatNumber(city._count.neighborhoods, locale),
                      listings: formatNumber(city._count.listings, locale),
                      places: formatNumber(city._count.places, locale),
                    })}
                  </p>
                  <div className="mt-auto flex flex-wrap gap-1.5 pt-1">
                    {city.active ? <Pill tone="success">{t("visible")}</Pill> : <Pill tone="muted">{t("hidden")}</Pill>}
                    <Pill tone="muted">{t("orderBadge", { order: formatNumber(city.sortOrder, locale) })}</Pill>
                  </div>
                </div>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </>
  );
}
