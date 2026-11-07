import type { Metadata } from "next";
import { getTranslations, setRequestLocale } from "next-intl/server";
import { GitCompareArrowsIcon, HeartIcon, SearchIcon } from "lucide-react";
import { FavoritesList } from "@/components/account/favorites-list";
import { PageHeader } from "@/components/common/page-header";
import { chipStyles } from "@/components/ds/chip";
import { EmptyState } from "@/components/ds/empty-state";
import { AccountListHeader, NewListChip } from "@/components/lists/account-list-header";
import { DeviceListsMerge } from "@/components/lists/device-lists-merge";
import { displayListName } from "@/components/lists/list-text";
import { Button } from "@/components/ui/button";
import type { AppLocale } from "@/config/site";
import { Link } from "@/i18n/navigation";
import { FAVORITES_LIMIT, getFavoriteItems } from "@/lib/account/queries";
import { requireUser } from "@/lib/auth/session";
import { formatNumber } from "@/lib/format";
import { ACCOUNT_LISTS_PATH } from "@/lib/lists/paths";
import { redirectSignedOutFromSaved } from "@/lib/lists/redirect";
import { getAccountLists } from "@/lib/lists/server";
import { pageMetadata } from "@/lib/seo";
import { absoluteUrl } from "@/lib/site-url";
import { cn } from "@/lib/utils";

type Props = {
  params: Promise<{ locale: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
};

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: "account.meta" });
  return pageMetadata({ locale, path: "/account/favorites", title: t("favorites"), description: t("description"), noIndex: true });
}

/**
 * /account/favorites — "שמורים" as lists (round 3, brief 7.2): a tab per list (the default list
 * first), the chosen list's places with a private note each, Move / Remove per place, and Share /
 * Rename / Delete for the list. `?list=<id>` picks a list (the default list otherwise). Signed-out
 * visitors are sent to /saved (their device lists) by the account layout.
 */
export default async function FavoritesPage({ params, searchParams }: Props) {
  const { locale } = await params;
  setRequestLocale(locale);
  await redirectSignedOutFromSaved(locale, ACCOUNT_LISTS_PATH);
  const user = await requireUser({ next: ACCOUNT_LISTS_PATH });
  const query = await searchParams;
  const wanted = typeof query.list === "string" ? query.list : null;
  const [t, tl, { lists, rows }] = await Promise.all([getTranslations("account.favorites"), getTranslations("lists"), getAccountLists(user.id)]);
  const selected = lists.find((list) => list.id === wanted) ?? lists[0];
  const row = rows.find((r) => r.id === selected.id);
  const items = await getFavoriteItems(user.id, locale as AppLocale, { id: selected.id, isDefault: selected.isDefault });
  const total = lists.reduce((sum, list) => sum + list.count, 0);
  const defaultName = tl("saving.defaultName");
  const shareUrl = row?.shareToken && row.sharedAt ? absoluteUrl(`/${locale}/lists/${row.shareToken}`) : null;

  return (
    <div>
      <DeviceListsMerge />
      <PageHeader
        title={t("title")}
        description={tl("page.lead")}
        actions={
          total > 1 ? (
            <Button asChild variant="outline" className="h-11 rounded-full px-4">
              <Link href="/account/compare">
                <GitCompareArrowsIcon aria-hidden />
                {t("openCompare")}
              </Link>
            </Button>
          ) : null
        }
      />

      <nav aria-label={tl("page.tabsLabel")} className="-mx-4 mb-3 overflow-x-auto px-4 [scrollbar-width:none] sm:mx-0 sm:px-0">
        <ul className="flex w-max items-center gap-2 py-1.5">
          {lists.map((list) => {
            const current = list.id === selected.id;
            return (
              <li key={list.id}>
                <Link
                  href={list.isDefault ? "/account/favorites" : { pathname: "/account/favorites", query: { list: list.id } }}
                  aria-current={current ? "page" : undefined}
                  className={cn(chipStyles({ active: current }), "max-w-64 gap-2")}
                >
                  <span dir="auto" className="truncate">
                    {displayListName(list, defaultName)}
                  </span>
                  <span className={cn("text-xs tabular-nums", current ? "text-primary-text" : "text-muted-foreground")}>
                    {formatNumber(list.count, locale)}
                  </span>
                </Link>
              </li>
            );
          })}
          <li>
            <NewListChip />
          </li>
        </ul>
      </nav>

      <AccountListHeader list={selected} displayName={displayListName(selected, defaultName)} defaultName={defaultName} shareUrl={shareUrl} />

      <div className="mt-6">
        <FavoritesList
          key={selected.id}
          items={items}
          empty={
            selected.isDefault && total === 0 ? undefined : (
              <EmptyState
                icon={HeartIcon}
                title={tl("page.emptyTitle")}
                description={tl("page.emptyBody")}
                action={{ label: t("startSearching"), href: "/search", icon: SearchIcon }}
                className="rounded-card bg-card px-6 shadow-raised ring-1 ring-foreground/5"
              />
            )
          }
        />
      </div>
      {items.length >= FAVORITES_LIMIT ? (
        <p className="mt-6 text-center text-sm text-muted-foreground">{t("limit", { count: formatNumber(FAVORITES_LIMIT, locale) })}</p>
      ) : null}
    </div>
  );
}
