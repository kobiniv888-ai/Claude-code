import { Info, Languages } from "lucide-react";
import { getTranslations, setRequestLocale } from "next-intl/server";
import { TranslationRows } from "@/components/admin/content/translation-rows";
import { AdminFilterBar } from "@/components/admin/filter-bar";
import { AdminPageHeader } from "@/components/admin/page-header";
import { AdminPagination } from "@/components/admin/pagination";
import { EmptyState } from "@/components/common/states";
import { locales, siteConfig } from "@/config/site";
import { enumParam, pageParam, param } from "@/lib/admin/params";
import { filterMessageRows } from "@/lib/admin/content/translations";
import { listNamespaces, loadMessageRows, overrideCounts } from "@/lib/admin/content/server/messages";
import { adminContentMetadata } from "@/lib/admin/content/server/metadata";
import { requireStaff } from "@/lib/auth/session";

export async function generateMetadata({ params }: PageProps<"/[locale]/admin/content/translations">) {
  return adminContentMetadata(params, "translations");
}

const PAGE_SIZE = 40;
const SHOW = ["overridden", "missing"] as const;

export default async function TranslationsPage({ params, searchParams }: PageProps<"/[locale]/admin/content/translations">) {
  const { locale } = await params;
  setRequestLocale(locale);
  await requireStaff("content");
  const query = await searchParams;
  const namespaces = await listNamespaces();
  const nsParam = param(query, "ns");
  const namespace = namespaces.includes(nsParam) ? nsParam : (namespaces.includes("common") ? "common" : namespaces[0] ?? "");
  const lang = enumParam(query, "lang", locales, siteConfig.i18n.primaryLocale);
  const show = enumParam(query, "show", SHOW);
  const q = param(query, "q").slice(0, 100);
  const page = pageParam(query);

  const [t, tCommon, rows, counts] = await Promise.all([
    getTranslations("adminContent.translations"),
    getTranslations("adminContent.common"),
    namespace ? loadMessageRows(lang, namespace) : Promise.resolve([]),
    overrideCounts(lang),
  ]);
  const filtered = filterMessageRows(rows, { query: q, onlyOverridden: show === "overridden", onlyMissing: show === "missing" });
  const pageRows = filtered.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE);
  const nsOverrides = counts.get(namespace) ?? 0;

  return (
    <>
      <AdminPageHeader back={{ href: "/admin/content", label: tCommon("backToContent") }} title={t("title")} description={t("description")} />
      <p className="mb-4 flex max-w-3xl items-start gap-2 rounded-xl border border-primary/20 bg-primary/5 p-3 text-sm">
        <Info aria-hidden className="mt-0.5 size-4 shrink-0 text-primary" />
        {t("howItWorks")}
      </p>
      <AdminFilterBar
        fields={[
          {
            type: "select",
            name: "ns",
            label: t("namespace"),
            defaultValue: namespace,
            options: namespaces.map((ns) => {
              const count = counts.get(ns) ?? 0;
              return { value: ns, label: count > 0 ? t("namespaceWithCount", { ns, count }) : ns };
            }),
          },
          {
            type: "select",
            name: "lang",
            label: t("language"),
            defaultValue: lang,
            options: locales.map((l) => ({ value: l, label: siteConfig.i18n.nativeNames[l] })),
          },
          { type: "select", name: "show", label: t("show"), allLabel: t("showAll"), options: SHOW.map((s) => ({ value: s, label: t(`show_${s}`) })) },
          { type: "search", name: "q", label: t("search"), placeholder: t("searchPlaceholder"), wide: true },
        ]}
      />
      <p className="mb-3 text-sm text-muted-foreground">
        {t("summary", { keys: rows.length, shown: filtered.length, overrides: nsOverrides })}
      </p>
      {pageRows.length === 0 ? (
        <EmptyState bordered icon={Languages} title={t("emptyTitle")} description={t("emptyDescription")} />
      ) : (
        <TranslationRows rows={pageRows} namespace={namespace} locale={lang} />
      )}
      <AdminPagination pathname="/admin/content/translations" searchParams={query} page={page} pageSize={PAGE_SIZE} total={filtered.length} />
    </>
  );
}
