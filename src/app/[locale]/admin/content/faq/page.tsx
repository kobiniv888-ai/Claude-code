import { getTranslations, setRequestLocale } from "next-intl/server";
import { FaqManager } from "@/components/admin/content/faq-manager";
import { AdminPageHeader } from "@/components/admin/page-header";
import { listFaqByCategory } from "@/lib/admin/content/server/queries";
import { adminContentMetadata } from "@/lib/admin/content/server/metadata";
import { requireStaff } from "@/lib/auth/session";

export async function generateMetadata({ params }: PageProps<"/[locale]/admin/content/faq">) {
  return adminContentMetadata(params, "faq");
}

export default async function FaqPage({ params }: PageProps<"/[locale]/admin/content/faq">) {
  const { locale } = await params;
  setRequestLocale(locale);
  await requireStaff("content");
  const [t, tCommon, groups] = await Promise.all([
    getTranslations("adminContent.faq"),
    getTranslations("adminContent.common"),
    listFaqByCategory(),
  ]);
  return (
    <>
      <AdminPageHeader back={{ href: "/admin/content", label: tCommon("backToContent") }} title={t("title")} description={t("description")} />
      <div className="max-w-4xl">
        <FaqManager
          groups={groups.map((g) => ({
            category: g.category,
            items: g.items.map((i) => ({ id: i.id, category: i.category, question: i.question, answer: i.answer, published: i.published })),
          }))}
        />
      </div>
    </>
  );
}
