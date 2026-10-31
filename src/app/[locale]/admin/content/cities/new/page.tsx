import { getTranslations, setRequestLocale } from "next-intl/server";
import { CityForm } from "@/components/admin/content/city-form";
import { AdminPageHeader } from "@/components/admin/page-header";
import { adminContentMetadata } from "@/lib/admin/content/server/metadata";
import { requireStaff } from "@/lib/auth/session";

export async function generateMetadata({ params }: PageProps<"/[locale]/admin/content/cities/new">) {
  return adminContentMetadata(params, "cities.new");
}

export default async function NewCityPage({ params }: PageProps<"/[locale]/admin/content/cities/new">) {
  const { locale } = await params;
  setRequestLocale(locale);
  await requireStaff("content");
  const t = await getTranslations("adminContent.cities");
  return (
    <>
      <AdminPageHeader back={{ href: "/admin/content/cities", label: t("back") }} title={t("new.title")} description={t("new.description")} />
      <div className="max-w-4xl">
        <CityForm id={null} />
      </div>
    </>
  );
}
