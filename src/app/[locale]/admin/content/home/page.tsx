import { getTranslations, setRequestLocale } from "next-intl/server";
import { HomeSectionsEditor } from "@/components/admin/content/home-sections-editor";
import { AdminPageHeader } from "@/components/admin/page-header";
import { adminContentMetadata } from "@/lib/admin/content/server/metadata";
import { requireStaff } from "@/lib/auth/session";
import { DEFAULT_SETTINGS, getSettings } from "@/lib/settings";

export async function generateMetadata({ params }: PageProps<"/[locale]/admin/content/home">) {
  return adminContentMetadata(params, "home");
}

export default async function HomeSectionsPage({ params }: PageProps<"/[locale]/admin/content/home">) {
  const { locale } = await params;
  setRequestLocale(locale);
  await requireStaff("content");
  const [t, tCommon, settings] = await Promise.all([
    getTranslations("adminContent.home"),
    getTranslations("adminContent.common"),
    getSettings(),
  ]);
  return (
    <>
      <AdminPageHeader
        back={{ href: "/admin/content", label: tCommon("backToContent") }}
        title={t("title")}
        description={t("description")}
      />
      <div className="max-w-3xl">
        <HomeSectionsEditor initial={settings.homeSections} defaults={DEFAULT_SETTINGS.homeSections} />
      </div>
    </>
  );
}
