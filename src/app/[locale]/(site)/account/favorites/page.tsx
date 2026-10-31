import type { Metadata } from "next";
import { getTranslations, setRequestLocale } from "next-intl/server";
import { GitCompareArrowsIcon } from "lucide-react";
import { FavoritesList } from "@/components/account/favorites-list";
import { PageHeader } from "@/components/common/page-header";
import { Button } from "@/components/ui/button";
import type { AppLocale } from "@/config/site";
import { Link } from "@/i18n/navigation";
import { FAVORITES_LIMIT, getFavoriteItems } from "@/lib/account/queries";
import { requireUser } from "@/lib/auth/session";
import { formatNumber } from "@/lib/format";
import { pageMetadata } from "@/lib/seo";

type Props = { params: Promise<{ locale: string }> };

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: "account.meta" });
  return pageMetadata({ locale, path: "/account/favorites", title: t("favorites"), description: t("description"), noIndex: true });
}

/** /account/favorites — saved listings with a private note each. */
export default async function FavoritesPage({ params }: Props) {
  const { locale } = await params;
  setRequestLocale(locale);
  const user = await requireUser({ next: "/account/favorites" });
  const t = await getTranslations("account.favorites");
  const items = await getFavoriteItems(user.id, locale as AppLocale);

  return (
    <div>
      <PageHeader
        title={t("title")}
        description={items.length > 0 ? t("lead", { count: items.length, countText: formatNumber(items.length, locale) }) : t("leadEmpty")}
        actions={
          items.length > 1 ? (
            <Button asChild variant="outline" className="h-10 rounded-xl px-4">
              <Link href="/account/compare">
                <GitCompareArrowsIcon aria-hidden="true" />
                {t("openCompare")}
              </Link>
            </Button>
          ) : null
        }
      />
      <FavoritesList items={items} />
      {items.length >= FAVORITES_LIMIT ? (
        <p className="mt-6 text-center text-sm text-muted-foreground">{t("limit", { count: formatNumber(FAVORITES_LIMIT, locale) })}</p>
      ) : null}
    </div>
  );
}
