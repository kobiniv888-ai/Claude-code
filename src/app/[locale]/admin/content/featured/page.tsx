import { BadgeInfo } from "lucide-react";
import { getTranslations, setRequestLocale } from "next-intl/server";
import { FeaturedManager } from "@/components/admin/content/featured-manager";
import { AdminPageHeader } from "@/components/admin/page-header";
import { listFeatured } from "@/lib/admin/content/server/queries";
import { adminContentMetadata } from "@/lib/admin/content/server/metadata";
import { requireStaff } from "@/lib/auth/session";

export async function generateMetadata({ params }: PageProps<"/[locale]/admin/content/featured">) {
  return adminContentMetadata(params, "featured");
}

export default async function FeaturedPage({ params }: PageProps<"/[locale]/admin/content/featured">) {
  const { locale } = await params;
  setRequestLocale(locale);
  await requireStaff("content");
  const [t, tCommon, rows] = await Promise.all([
    getTranslations("adminContent.featured"),
    getTranslations("adminContent.common"),
    listFeatured(locale),
  ]);
  return (
    <>
      <AdminPageHeader
        back={{ href: "/admin/content", label: tCommon("backToContent") }}
        title={t("title")}
        description={t("description")}
      />
      <p className="mb-4 flex max-w-3xl items-start gap-2 rounded-xl border border-primary/20 bg-primary/5 p-3 text-sm">
        <BadgeInfo aria-hidden className="mt-0.5 size-4 shrink-0 text-primary" />
        {t("promotedNote")}
      </p>
      <div className="max-w-4xl">
        <FeaturedManager
          items={rows.map((r) => ({
            id: r.id,
            publicId: r.publicId,
            title: r.title,
            city: r.city,
            status: r.status,
            photo: r.photo,
            featuredUntil: r.featuredUntil?.toISOString() ?? null,
            isDemo: r.isDemo,
            ended: r.ended,
          }))}
        />
      </div>
    </>
  );
}
