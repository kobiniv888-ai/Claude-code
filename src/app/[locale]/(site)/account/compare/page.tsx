import type { Metadata } from "next";
import { getTranslations, setRequestLocale } from "next-intl/server";
import { CompareView } from "@/components/account/compare-view";
import { PageHeader } from "@/components/common/page-header";
import { siteConfig } from "@/config/site";
import { requireUser } from "@/lib/auth/session";
import { formatNumber } from "@/lib/format";
import { pageMetadata } from "@/lib/seo";

type Props = { params: Promise<{ locale: string }> };

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: "account.meta" });
  return pageMetadata({ locale, path: "/account/compare", title: t("compare"), description: t("description"), noIndex: true });
}

/** /account/compare — the listings in this browser's compare list, side by side. */
export default async function ComparePage({ params }: Props) {
  const { locale } = await params;
  setRequestLocale(locale);
  await requireUser({ next: "/account/compare" });
  const t = await getTranslations("account.compare");
  const max = siteConfig.listings.compareMax;
  return (
    <div>
      <PageHeader title={t("title")} description={t("lead", { count: max, countText: formatNumber(max, locale) })} />
      <CompareView />
    </div>
  );
}
