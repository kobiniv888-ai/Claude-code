import type { Metadata } from "next";
import { getTranslations, setRequestLocale } from "next-intl/server";
import { FilePlus2Icon, PlusIcon, SearchXIcon } from "lucide-react";
import { MyListingCard } from "@/components/account/my-listing-card";
import { ArrowEnd, ArrowStart } from "@/components/common/directional-icon";
import { PageHeader } from "@/components/common/page-header";
import { EmptyState } from "@/components/common/states";
import { Button } from "@/components/ui/button";
import type { AppLocale } from "@/config/site";
import { Link } from "@/i18n/navigation";
import { LISTING_FILTERS, parseListingFilter, type ListingFilter } from "@/lib/account/listing-status";
import { getMyListings } from "@/lib/account/queries";
import { requireUser } from "@/lib/auth/session";
import { formatNumber } from "@/lib/format";
import { pageMetadata } from "@/lib/seo";
import { cn } from "@/lib/utils";

type Props = {
  params: Promise<{ locale: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
};

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: "account.meta" });
  return pageMetadata({ locale, path: "/account/listings", title: t("listings"), description: t("description"), noIndex: true });
}

function hrefFor(filter: ListingFilter, page = 1) {
  const query: Record<string, string> = {};
  if (filter !== "all") query.status = filter;
  if (page > 1) query.page = String(page);
  return { pathname: "/account/listings", query };
}

/** /account/listings — every listing of the user (except deleted) with status, counters and actions. */
export default async function MyListingsPage({ params, searchParams }: Props) {
  const { locale } = await params;
  setRequestLocale(locale);
  const query = await searchParams;
  const user = await requireUser({ next: "/account/listings" });
  const t = await getTranslations("account.listings");
  const filter = parseListingFilter(query.status);
  const requested = Number(Array.isArray(query.page) ? query.page[0] : query.page);
  const { items, counts, page, pageCount, total } = await getMyListings(user.id, {
    filter,
    page: Number.isInteger(requested) && requested > 0 ? requested : 1,
    locale: locale as AppLocale,
  });
  const tabs = LISTING_FILTERS.filter((f) => f === "all" || f === filter || counts[f] > 0);

  return (
    <div>
      <PageHeader
        title={t("title")}
        description={t("lead")}
        actions={
          counts.all > 0 ? (
            <Button asChild className="h-10 rounded-xl px-4">
              <Link href="/post">
                <PlusIcon aria-hidden="true" />
                {t("post")}
              </Link>
            </Button>
          ) : null
        }
      />

      {counts.all === 0 ? (
        <EmptyState
          bordered
          icon={FilePlus2Icon}
          title={t("emptyTitle")}
          description={t("emptyBody")}
          action={{ label: t("post"), href: "/post", icon: PlusIcon }}
          secondaryAction={{ label: t("howItWorks"), href: "/how-it-works" }}
        />
      ) : (
        <>
          <nav aria-label={t("filtersLabel")} className="relative -mx-1 mb-4 overflow-x-auto pb-1 [scrollbar-width:thin]">
            <ul className="flex gap-1.5 px-1">
              {tabs.map((f) => {
                const current = f === filter;
                return (
                  <li key={f} className="shrink-0">
                    <Link
                      href={hrefFor(f)}
                      aria-current={current ? "page" : undefined}
                      className={cn(
                        "inline-flex h-9 items-center gap-1.5 rounded-full border px-3.5 text-sm font-medium whitespace-nowrap outline-none focus-visible:ring-3 focus-visible:ring-ring/50",
                        current ? "border-primary bg-primary text-primary-foreground" : "bg-card hover:bg-muted",
                      )}
                    >
                      {t(`filters.${f}`)}
                      <span className={cn("tabular-nums", current ? "text-primary-foreground/80" : "text-muted-foreground")}>
                        {formatNumber(counts[f], locale)}
                      </span>
                    </Link>
                  </li>
                );
              })}
            </ul>
          </nav>

          {items.length === 0 ? (
            <EmptyState
              bordered
              size="sm"
              icon={SearchXIcon}
              title={t("emptyFilterTitle")}
              description={t("emptyFilterBody")}
              action={{ label: t("showAll"), href: "/account/listings" }}
            />
          ) : (
            <>
              <h2 className="sr-only">{t(`filters.${filter}`)}</h2>
              <ul className="grid gap-3">
                {items.map((listing) => (
                  <li key={listing.id}>
                    <MyListingCard listing={listing} />
                  </li>
                ))}
              </ul>
              {pageCount > 1 ? (
                <nav aria-label={t("pagination")} className="mt-6 flex items-center justify-between gap-3">
                  {page > 1 ? (
                    <Button asChild variant="outline" className="h-10 rounded-xl px-4">
                      <Link href={hrefFor(filter, page - 1)}>
                        <ArrowStart aria-hidden />
                        {t("previous")}
                      </Link>
                    </Button>
                  ) : (
                    <span />
                  )}
                  <span className="text-sm text-muted-foreground">
                    {t("pageOf", { page: formatNumber(page, locale), total: formatNumber(pageCount, locale), count: formatNumber(total, locale) })}
                  </span>
                  {page < pageCount ? (
                    <Button asChild variant="outline" className="h-10 rounded-xl px-4">
                      <Link href={hrefFor(filter, page + 1)}>
                        {t("next")}
                        <ArrowEnd aria-hidden />
                      </Link>
                    </Button>
                  ) : (
                    <span />
                  )}
                </nav>
              ) : null}
            </>
          )}
        </>
      )}
    </div>
  );
}
