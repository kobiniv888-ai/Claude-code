import { notFound } from "next/navigation";
import { getTranslations, setRequestLocale } from "next-intl/server";
import { CityForm } from "@/components/admin/content/city-form";
import { DeleteCityButton, NeighborhoodsManager } from "@/components/admin/content/neighborhoods-manager";
import { AdminPageHeader, AdminSection } from "@/components/admin/page-header";
import { pickLocalized } from "@/i18n/locale";
import { coordText } from "@/lib/admin/content/coords";
import { toLocalizedForm } from "@/lib/admin/content/localized";
import { getCity } from "@/lib/admin/content/server/queries";
import { requireStaff } from "@/lib/auth/session";

export async function generateMetadata({ params }: PageProps<"/[locale]/admin/content/cities/[id]">) {
  const { locale, id } = await params;
  const t = await getTranslations({ locale, namespace: "adminContent.cities" });
  const city = await getCity(id).catch(() => null);
  return {
    title: city ? t("edit.title", { name: pickLocalized(city.names, locale) }) : t("title"),
    robots: { index: false, follow: false },
  };
}

export default async function EditCityPage({ params }: PageProps<"/[locale]/admin/content/cities/[id]">) {
  const { locale, id } = await params;
  setRequestLocale(locale);
  await requireStaff("content");
  const [t, city] = await Promise.all([getTranslations("adminContent.cities"), getCity(id)]);
  if (!city) notFound();
  const name = pickLocalized(city.names, locale);

  return (
    <>
      <AdminPageHeader
        back={{ href: "/admin/content/cities", label: t("back") }}
        title={t("edit.title", { name })}
        description={t("edit.description")}
        actions={<DeleteCityButton id={city.id} name={name} listings={city._count.listings} />}
      />
      <div className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_26rem]">
        <CityForm
          id={city.id}
          initial={{
            names: toLocalizedForm(city.names),
            aliases: city.aliases.join(", "),
            slug: city.slug,
            coords: coordText(city.lat, city.lng),
            timezone: city.timezone,
            airportCode: city.airportCode ?? "",
            airport: coordText(city.airportLat, city.airportLng),
            isPopular: city.isPopular,
            sortOrder: String(city.sortOrder),
            active: city.active,
            photoUrl: city.photoUrl ?? "",
          }}
        />
        <AdminSection title={t("neighborhoods")} description={t("neighborhoodsDescription")} className="h-fit">
          <NeighborhoodsManager
            cityId={city.id}
            center={{ lat: city.lat, lng: city.lng }}
            items={city.neighborhoods.map((n) => ({
              id: n.id,
              slug: n.slug,
              names: n.names,
              aliases: n.aliases,
              lat: n.lat,
              lng: n.lng,
              sortOrder: n.sortOrder,
              active: n.active,
              listings: n._count.listings,
            }))}
          />
        </AdminSection>
      </div>
    </>
  );
}
