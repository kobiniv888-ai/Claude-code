import { getTranslations, setRequestLocale } from "next-intl/server";
import { ArticleForm } from "@/components/admin/content/article-form";
import { AdminPageHeader } from "@/components/admin/page-header";
import { adminContentMetadata } from "@/lib/admin/content/server/metadata";
import { requireStaff } from "@/lib/auth/session";

export async function generateMetadata({ params }: PageProps<"/[locale]/admin/content/articles/new">) {
  return adminContentMetadata(params, "articles.new");
}

export default async function NewArticlePage({ params }: PageProps<"/[locale]/admin/content/articles/new">) {
  const { locale } = await params;
  setRequestLocale(locale);
  await requireStaff("content");
  const t = await getTranslations("adminContent.articles");
  return (
    <>
      <AdminPageHeader back={{ href: "/admin/content/articles", label: t("back") }} title={t("new.title")} description={t("new.description")} />
      <div className="max-w-4xl">
        <ArticleForm id={null} />
      </div>
    </>
  );
}
