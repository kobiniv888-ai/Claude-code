import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { getTranslations, setRequestLocale } from "next-intl/server";
import { ExternalLinkIcon, PencilIcon } from "lucide-react";
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
import { pageMetadata } from "@/lib/seo";
import { cn } from "@/lib/utils";

type Props = {
  params: Promise<{ locale: string; id: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
};

const RANGES = [30, 90] as const;

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { locale, id } = await params;
  const t = await getTranslations({ locale, namespace: "account.meta" });
  return pageMetadata({ locale, path: `/account/listings/${id}/stats`, title: t("stats"), description: t("description"), noIndex: true });
}

/** /account/listings/<id>/stats — views, contact clicks (per channel) and saves over 30 or 90 days. */
export default async function ListingStatsPage({ params, searchParams }: Props) {
  const { locale, id } = await params;
  setRequestLocale(locale);
  const query = await searchParams;
  const user = await requireUser({ next: `/account/listings/${encodeURIComponent(id)}/stats` });
  const t = await getTranslations("account.stats");
  const tl = await getTranslations("account.listings");

  const listing = await getOwnListing(user.id, id, locale as AppLocale);
  if (!listing) notFound();
  const days = Number(Array.isArray(query.days) ? query.days[0] : query.days) === 90 ? 90 : 30;
  const stats = await getListingStats(listing.id, days);
  const title = listing.title || tl("untitled");

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
            <Button asChild variant="outline" className="h-10 rounded-xl px-4">
              <Link href={`/account/listings/${listing.id}/edit`}>
                <PencilIcon aria-hidden="true" />
                {tl("actions.edit")}
              </Link>
            </Button>
            {listing.status === "LIVE" ? (
              <Button asChild variant="outline" className="h-10 rounded-xl px-4">
                <Link href={listing.href}>
                  <ExternalLinkIcon aria-hidden="true" />
                  {tl("actions.view")}
                </Link>
              </Button>
            ) : null}
          </>
        }
      />

      <nav aria-label={t("rangeLabel")} className="mb-4 inline-flex rounded-xl border bg-card p-1">
        {RANGES.map((range) => (
          <Link
            key={range}
            href={{ pathname: `/account/listings/${listing.id}/stats`, query: range === 30 ? {} : { days: String(range) } }}
            aria-current={range === days ? "page" : undefined}
            className={cn(
              "inline-flex h-9 items-center rounded-lg px-4 text-sm font-medium outline-none focus-visible:ring-3 focus-visible:ring-ring/50",
              range === days ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:bg-muted",
            )}
          >
            {t("range", { count: range, countText: formatNumber(range, locale) })}
          </Link>
        ))}
      </nav>

      <ListingStatsCharts stats={stats} />
    </div>
  );
}
