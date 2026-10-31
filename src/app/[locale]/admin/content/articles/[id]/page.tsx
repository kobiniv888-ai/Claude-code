import { notFound } from "next/navigation";
import { getTranslations, setRequestLocale } from "next-intl/server";
import { ArticleForm } from "@/components/admin/content/article-form";
import { AdminPageHeader } from "@/components/admin/page-header";
import { pickLocalized } from "@/i18n/locale";
import { toLocalizedForm } from "@/lib/admin/content/localized";
import { getArticle } from "@/lib/admin/content/server/queries";
import { requireStaff } from "@/lib/auth/session";

export async function generateMetadata({ params }: PageProps<"/[locale]/admin/content/articles/[id]">) {
  const { locale, id } = await params;
  const t = await getTranslations({ locale, namespace: "adminContent.articles" });
  const article = await getArticle(id).catch(() => null);
  return {
    title: article ? t("edit.title", { name: pickLocalized(article.title, locale) || article.slug }) : t("title"),
    robots: { index: false, follow: false },
  };
}

export default async function EditArticlePage({ params }: PageProps<"/[locale]/admin/content/articles/[id]">) {
  const { locale, id } = await params;
  setRequestLocale(locale);
  await requireStaff("content");
  const [t, article] = await Promise.all([getTranslations("adminContent.articles"), getArticle(id)]);
  if (!article) notFound();
  return (
    <>
      <AdminPageHeader
        back={{ href: "/admin/content/articles", label: t("back") }}
        title={t("edit.title", { name: pickLocalized(article.title, locale) || article.slug })}
        description={t("edit.description")}
      />
      <div className="max-w-4xl">
        <ArticleForm
          id={article.id}
          initial={{
            slug: article.slug,
            category: article.category,
            title: toLocalizedForm(article.title),
            excerpt: toLocalizedForm(article.excerpt),
            body: toLocalizedForm(article.body),
            coverUrl: article.coverUrl ?? "",
            status: article.status,
            reviewedByLawyer: article.reviewedByLawyer,
          }}
        />
      </div>
    </>
  );
}
