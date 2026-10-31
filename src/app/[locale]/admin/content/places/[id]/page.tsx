import { notFound } from "next/navigation";
import { getTranslations, setRequestLocale } from "next-intl/server";
import { PlaceForm } from "@/components/admin/content/place-form";
import { AdminPageHeader } from "@/components/admin/page-header";
import { pickLocalized } from "@/i18n/locale";
import { coordText } from "@/lib/admin/content/coords";
import { toLocalizedForm } from "@/lib/admin/content/localized";
import { cityOptions, getPlace } from "@/lib/admin/content/server/queries";
import { requireStaff } from "@/lib/auth/session";

export async function generateMetadata({ params }: PageProps<"/[locale]/admin/content/places/[id]">) {
  const { locale, id } = await params;
  const t = await getTranslations({ locale, namespace: "adminContent.places" });
  const place = await getPlace(id).catch(() => null);
  return {
    title: place ? t("edit.title", { name: pickLocalized(place.names, locale) }) : t("title"),
    robots: { index: false, follow: false },
  };
}

export default async function EditPlacePage({ params }: PageProps<"/[locale]/admin/content/places/[id]">) {
  const { locale, id } = await params;
  setRequestLocale(locale);
  await requireStaff("content");
  const [t, place, cities] = await Promise.all([getTranslations("adminContent.places"), getPlace(id), cityOptions(locale)]);
  if (!place) notFound();
  return (
    <>
      <AdminPageHeader
        back={{ href: "/admin/content/places", label: t("back") }}
        title={t("edit.title", { name: pickLocalized(place.names, locale) })}
        description={t("edit.description")}
      />
      <div className="max-w-4xl">
        <PlaceForm
          id={place.id}
          cities={cities}
          initial={{
            type: place.type,
            names: toLocalizedForm(place.names),
            description: toLocalizedForm(place.description),
            address: toLocalizedForm(place.address),
            hours: toLocalizedForm(place.hours),
            cityId: place.cityId ?? "",
            coords: coordText(place.lat, place.lng),
            phone: place.phone ?? "",
            website: place.website ?? "",
            active: place.active,
            isDemo: place.isDemo,
          }}
        />
      </div>
    </>
  );
}
