import { getTranslations, setRequestLocale } from "next-intl/server";
import { PlaceForm } from "@/components/admin/content/place-form";
import { AdminPageHeader } from "@/components/admin/page-header";
import { cityOptions } from "@/lib/admin/content/server/queries";
import { adminContentMetadata } from "@/lib/admin/content/server/metadata";
import { requireStaff } from "@/lib/auth/session";

export async function generateMetadata({ params }: PageProps<"/[locale]/admin/content/places/new">) {
  return adminContentMetadata(params, "places.new");
}

export default async function NewPlacePage({ params }: PageProps<"/[locale]/admin/content/places/new">) {
  const { locale } = await params;
  setRequestLocale(locale);
  await requireStaff("content");
  const [t, cities] = await Promise.all([getTranslations("adminContent.places"), cityOptions(locale)]);
  return (
    <>
      <AdminPageHeader back={{ href: "/admin/content/places", label: t("back") }} title={t("new.title")} description={t("new.description")} />
      <div className="max-w-4xl">
        <PlaceForm id={null} cities={cities} />
      </div>
    </>
  );
}
