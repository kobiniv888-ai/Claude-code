import { FileText, Plus, Scale, ToggleLeft } from "lucide-react";
import { getTranslations, setRequestLocale } from "next-intl/server";
import { Pill } from "@/components/admin/content/pill";
import { AdminPageHeader } from "@/components/admin/page-header";
import { EmptyState } from "@/components/common/states";
import { Button } from "@/components/ui/button";
import { siteConfig } from "@/config/site";
import { Link } from "@/i18n/navigation";
import { listArticles } from "@/lib/admin/content/server/queries";
import { adminContentMetadata } from "@/lib/admin/content/server/metadata";
import { requireStaff } from "@/lib/auth/session";
import { formatDate } from "@/lib/format";

export async function generateMetadata({ params }: PageProps<"/[locale]/admin/content/articles">) {
  return adminContentMetadata(params, "articles");
}

export default async function ArticlesPage({ params }: PageProps<"/[locale]/admin/content/articles">) {
  const { locale } = await params;
  setRequestLocale(locale);
  await requireStaff("content");
  const [t, tCommon, articles] = await Promise.all([
    getTranslations("adminContent.articles"),
    getTranslations("adminContent.common"),
    listArticles(locale),
  ]);
  const featureOn = siteConfig.features.articles;
  const addButton = (
    <Button asChild>
      <Link href="/admin/content/articles/new">
        <Plus aria-hidden />
        {t("addArticle")}
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
      <div
        role="note"
        className={
          featureOn
            ? "mb-4 flex items-start gap-2 rounded-xl border border-verified/30 bg-verified-soft p-3 text-sm"
            : "mb-4 flex items-start gap-2 rounded-xl border border-warning/40 bg-warning-soft p-3 text-sm"
        }
      >
        <ToggleLeft aria-hidden className="mt-0.5 size-4 shrink-0" />
        <p>{featureOn ? t("featureOn") : t.rich("featureOff", { code: (chunks) => <code className="rounded bg-background/70 px-1 font-mono text-xs" dir="ltr">{chunks}</code> })}</p>
      </div>
      {articles.length === 0 ? (
        <EmptyState bordered icon={FileText} title={t("emptyTitle")} description={t("emptyDescription")} action={addButton} />
      ) : (
        <ul className="divide-y rounded-xl border bg-card shadow-xs">
          {articles.map((a) => (
            <li key={a.id}>
              <Link
                href={`/admin/content/articles/${a.id}`}
                className="flex flex-wrap items-center gap-3 p-3 outline-none hover:bg-muted/50 focus-visible:ring-3 focus-visible:ring-ring/50 sm:px-4"
              >
                <div className="min-w-0 flex-1">
                  <p className="truncate font-medium">{a.titleText || a.slug}</p>
                  <p className="flex flex-wrap items-center gap-x-2 text-xs text-muted-foreground">
                    <span dir="ltr">{a.slug}</span>
                    <span>{t.has(`categories.${a.category}`) ? t(`categories.${a.category}`) : a.category}</span>
                    <span>{t("updated", { date: formatDate(a.updatedAt, locale) })}</span>
                  </p>
                </div>
                <div className="flex flex-wrap gap-1.5">
                  {a.reviewedByLawyer ? (
                    <Pill tone="primary" icon={Scale}>
                      {t("lawyerBadge")}
                    </Pill>
                  ) : null}
                  <Pill tone={a.status === "PUBLISHED" ? "success" : "muted"}>{t(`statuses.${a.status}`)}</Pill>
                </div>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </>
  );
}
