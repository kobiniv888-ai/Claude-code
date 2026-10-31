import { getTranslations, setRequestLocale } from "next-intl/server";
import { BannedWordsManager, BannedWordsTestBox } from "@/components/admin/content/banned-words-manager";
import { AdminFilterBar } from "@/components/admin/filter-bar";
import { AdminPageHeader } from "@/components/admin/page-header";
import { AdminPagination } from "@/components/admin/pagination";
import { siteConfig } from "@/config/site";
import { enumParam, pageParam, param } from "@/lib/admin/params";
import { BANNED_WORD_ACTIONS, BANNED_WORD_CATEGORIES, BANNED_WORD_LOCALES } from "@/lib/admin/content/schemas";
import { BANNED_WORDS_PAGE_SIZE, listBannedWords } from "@/lib/admin/content/server/queries";
import { adminContentMetadata } from "@/lib/admin/content/server/metadata";
import { requireStaff } from "@/lib/auth/session";

export async function generateMetadata({ params }: PageProps<"/[locale]/admin/content/banned-words">) {
  return adminContentMetadata(params, "bannedWords");
}

export default async function BannedWordsPage({ params, searchParams }: PageProps<"/[locale]/admin/content/banned-words">) {
  const { locale } = await params;
  setRequestLocale(locale);
  await requireStaff("content");
  const query = await searchParams;
  const filters = {
    q: param(query, "q").slice(0, 100) || undefined,
    action: enumParam(query, "action", BANNED_WORD_ACTIONS),
    category: enumParam(query, "category", BANNED_WORD_CATEGORIES),
    locale: enumParam(query, "lang", BANNED_WORD_LOCALES),
  };
  const [t, tCommon, result] = await Promise.all([
    getTranslations("adminContent.bannedWords"),
    getTranslations("adminContent.common"),
    listBannedWords(filters, pageParam(query)),
  ]);

  return (
    <>
      <AdminPageHeader back={{ href: "/admin/content", label: tCommon("backToContent") }} title={t("title")} description={t("description")} />
      <div className="grid gap-5 xl:grid-cols-[minmax(0,1fr)_22rem]">
        <div className="min-w-0">
          <AdminFilterBar
            fields={[
              { type: "search", name: "q", label: t("filters.search"), placeholder: t("filters.searchPlaceholder") },
              {
                type: "select",
                name: "action",
                label: t("action"),
                allLabel: tCommon("all"),
                options: BANNED_WORD_ACTIONS.map((a) => ({ value: a, label: t(`actions.${a}`) })),
              },
              {
                type: "select",
                name: "category",
                label: t("category"),
                allLabel: tCommon("all"),
                options: BANNED_WORD_CATEGORIES.map((c) => ({ value: c, label: t(`categories.${c}`) })),
              },
              {
                type: "select",
                name: "lang",
                label: t("language"),
                allLabel: tCommon("all"),
                options: BANNED_WORD_LOCALES.map((l) => ({ value: l, label: l === "all" ? t("allLanguages") : siteConfig.i18n.nativeNames[l] })),
              },
            ]}
          />
          <p className="mb-3 text-sm text-muted-foreground">{t("total", { count: result.total })}</p>
          <BannedWordsManager items={result.rows} />
          <AdminPagination
            pathname="/admin/content/banned-words"
            searchParams={query}
            page={result.page}
            pageSize={BANNED_WORDS_PAGE_SIZE}
            total={result.total}
          />
        </div>
        <div className="xl:sticky xl:top-20 xl:h-fit">
          <BannedWordsTestBox />
        </div>
      </div>
    </>
  );
}
