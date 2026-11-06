import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { getTranslations, setRequestLocale } from "next-intl/server";
import { ExternalLinkIcon, InfoIcon, PencilIcon } from "lucide-react";
import { ListingStatsCharts } from "@/components/account/listing-stats-charts";
import { ListingStatusBadge } from "@/components/account/listing-status-badge";
import { Ltr } from "@/components/common/ltr";
import { PageHeader } from "@/components/common/page-header";
import { Button } from "@/components/ui/button";
import type { AppLocale } from "@/config/site";
import { Link } from "@/i18n/navigation";
import { getOwnListing } from "@/lib/account/queries";
import { requireUser } from "@/lib/auth/session";
import { formatNumber } from "@/lib/format";
import { getListingStats } from "@/lib/listing/stats";
import { STATS_RANGES, isQuietPeriod, parseStatsRange } from "@/lib/listing/stats-math";
import { pageMetadata } from "@/lib/seo";
import { cn } from "@/lib/utils";

type Props = {
  params: Promise<{ locale: string; id: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
};

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { locale, id } = await params;
  const t = await getTranslations({ locale, namespace: "account.meta" });
  return pageMetadata({ locale, path: `/account/listings/${id}/stats`, title: t("stats"), description: t("description"), noIndex: true });
}

/**
 * /account/listings/<id>/stats — the host's stats for one listing (round 3, brief 6.2): views,
 * saves and contact taps (per method) over the last 7 or 30 days, and for short stays and hotels
 * bookings, booked nights and occupancy (hotels per room type). Only the listing's owner: anyone
 * else gets "not found" (getOwnListing checks the owner on the server).
 */
export default async function ListingStatsPage({ params, searchParams }: Props) {
  const { locale, id } = await params;
  setRequestLocale(locale);
  const query = await searchParams;
  const user = await requireUser({ next: `/account/listings/${encodeURIComponent(id)}/stats` });
  const t = await getTranslations("account.stats");
  const tl = await getTranslations("account.listings");

  const listing = await getOwnListing(user.id, id, locale as AppLocale);
  if (!listing) notFound();
  const range = parseStatsRange(query.days);
  const stats = await getListingStats(listing, range, locale as AppLocale);
  const title = listing.title || tl("untitled");
  const hotel = listing.dealType === "HOTEL_ROOM";

  return (
    <div>
      <PageHeader
        breadcrumbs={[{ label: tl("title"), href: "/account/listings" }, { label: t("title") }]}
        title={t("title")}
        description={
          <span className="flex flex-wrap items-center gap-2">
            <ListingStatusBadge status={listing.status} />
            <span dir="auto" className="font-medium text-foreground">
              {title}
            </span>
            <span className="text-xs">
              {tl("id")} <Ltr>{listing.publicId}</Ltr>
            </span>
          </span>
        }
        actions={
          <>
            <Button asChild variant="outline" className="h-11 rounded-xl px-4 sm:h-10">
              <Link href={`/account/listings/${listing.id}/edit`}>
                <PencilIcon aria-hidden="true" />
                {tl("actions.edit")}
              </Link>
            </Button>
            {listing.status === "LIVE" ? (
              <Button asChild variant="outline" className="h-11 rounded-xl px-4 sm:h-10">
                <Link href={listing.href}>
                  <ExternalLinkIcon aria-hidden="true" />
                  {tl("actions.view")}
                </Link>
              </Button>
            ) : null}
          </>
        }
      />

      <nav aria-label={t("rangeLabel")} className="mb-3 inline-flex rounded-xl border bg-card p-1">
        {STATS_RANGES.map((option) => (
          <Link
            key={option}
            href={{ pathname: `/account/listings/${listing.id}/stats`, query: option === 30 ? {} : { days: String(option) } }}
            aria-current={option === range ? "page" : undefined}
            className={cn(
              "inline-flex h-11 items-center rounded-lg px-4 text-sm font-medium outline-none focus-visible:ring-3 focus-visible:ring-ring/50 sm:h-9",
              option === range ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:bg-muted",
            )}
          >
            {t("range", { count: option, countText: formatNumber(option, locale) })}
          </Link>
        ))}
      </nav>

      <p className="mb-4 flex max-w-3xl items-start gap-2 text-sm text-muted-foreground">
        <InfoIcon className="mt-0.5 size-4 shrink-0" aria-hidden="true" />
        <span>
          {t("counting")}
          {listing.status !== "LIVE" ? ` ${t("notLive")}` : ""}
        </span>
      </p>

      {isQuietPeriod(stats.totals) ? (
        <p className="mb-4 rounded-xl border border-dashed bg-surface-muted px-4 py-3 text-sm">{t("emptyPeriod")}</p>
      ) : null}

      <ListingStatsCharts stats={stats} hotel={hotel} />
    </div>
  );
}
