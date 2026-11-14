import { CheckCircle2, Sparkles } from "lucide-react";
import type { Metadata } from "next";
import { getTranslations, setRequestLocale } from "next-intl/server";
import { AccountMarkers, ListingStatusBadge, RiskChip, UserStatusBadge } from "@/components/admin/badges";
import { AdminFilterBar } from "@/components/admin/filter-bar";
import { AdminPrice, ListingThumb, PublicId, WhenText } from "@/components/admin/listing-bits";
import { AdminPageHeader } from "@/components/admin/page-header";
import { AdminPagination } from "@/components/admin/pagination";
import { TabLinks } from "@/components/admin/tab-links";
import { EmptyState } from "@/components/common/states";
import { Link } from "@/i18n/navigation";
import { enumParam, pageParam, withParams } from "@/lib/admin/params";
import {
  getModerationQueue,
  getModerationTabCounts,
  MODERATION_PAGE_SIZE,
  MODERATION_SORTS,
  MODERATION_TABS,
} from "@/lib/admin/server/moderation";
import { cityName, coverUrl } from "@/lib/admin/server/shared";
import { requireStaff } from "@/lib/auth/session";
import { formatRelativeTime } from "@/lib/format";
import { getSettings } from "@/lib/settings";

export async function generateMetadata({ params }: PageProps<"/[locale]/admin/moderation">): Promise<Metadata> {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: "admin.moderation" });
  return { title: t("title"), robots: { index: false, follow: false } };
}

export default async function ModerationQueuePage({ params, searchParams }: PageProps<"/[locale]/admin/moderation">) {
  const { locale } = await params;
  setRequestLocale(locale);
  await requireStaff("moderation");
  const query = await searchParams;
  const tab = enumParam(query, "tab", MODERATION_TABS, "in_review");
  const sort = enumParam(query, "sort", MODERATION_SORTS, "risk");
  const [t, tRisk, tFields, counts, queue, settings] = await Promise.all([
    getTranslations("admin.moderation"),
    getTranslations("moderation.risk"),
    getTranslations("listingFields"),
    getModerationTabCounts(),
    getModerationQueue(tab, sort, pageParam(query)),
    getSettings(),
  ]);

  return (
    <>
      <AdminPageHeader title={t("title")} description={t("description")} />
      <TabLinks
        label={t("tabsLabel")}
        active={tab}
        items={MODERATION_TABS.map((key) => ({
          key,
          href: `/admin/moderation${withParams(query, { tab: key === "in_review" ? null : key })}`,
          label: t(`tabs.${key}`),
          count: counts[key],
          urgent: key === "hidden",
        }))}
      />
      <AdminFilterBar
        fields={[
          {
            type: "select",
            name: "sort",
            label: t("sortLabel"),
            defaultValue: "risk",
            options: MODERATION_SORTS.map((s) => ({ value: s, label: t(`sort.${s}`) })),
          },
        ]}
      />

      {queue.rows.length === 0 ? (
        <EmptyState
          bordered
          icon={tab === "in_review" ? CheckCircle2 : Sparkles}
          title={t(`empty.${tab}.title`)}
          description={t(`empty.${tab}.description`)}
        />
      ) : (
        <ul className="divide-y overflow-hidden rounded-xl border bg-card shadow-xs">
          {queue.rows.map((row) => {
            const city = cityName(row.city, locale);
            return (
              <li key={row.id} className="relative flex gap-3 p-3 transition-colors hover:bg-muted/40 sm:p-4">
                <ListingThumb src={coverUrl(row.photos)} alt="" className="size-14 sm:size-16" />
                <div className="flex min-w-0 flex-1 flex-col gap-1.5">
                  <div className="flex flex-wrap items-start justify-between gap-x-3 gap-y-1">
                    <Link
                      href={`/admin/moderation/${row.id}`}
                      className="min-w-0 font-medium outline-none after:absolute after:inset-0 after:content-[''] hover:underline focus-visible:after:rounded-xl focus-visible:after:ring-3 focus-visible:after:ring-ring/50"
                    >
                      <span dir="auto" className="line-clamp-2">
                        {row.title || t("untitled")}
                      </span>
                    </Link>
                    <div className="flex shrink-0 items-center gap-1.5">
                      {tab !== "in_review" ? <ListingStatusBadge status={row.status} /> : null}
                      <RiskChip score={row.riskScore} threshold={settings.reviewRiskThreshold} />
                    </div>
                  </div>
                  <div className="flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-muted-foreground">
                    <PublicId id={row.publicId} />
                    <span aria-hidden>·</span>
                    <span>{tFields(`dealType.${row.dealType}`)}</span>
                    {city ? (
                      <>
                        <span aria-hidden>·</span>
                        <span>{city}</span>
                      </>
                    ) : null}
                    <span aria-hidden>·</span>
                    <AdminPrice amount={row.price} currency={row.currency} period={row.pricePeriod} className="text-foreground" />
                  </div>
                  <div className="flex flex-wrap items-center gap-x-2 gap-y-1 text-xs">
                    <span className="font-medium" dir="auto">
                      {row.owner.businessName || row.owner.name}
                    </span>
                    {row.owner.status !== "ACTIVE" ? <UserStatusBadge status={row.owner.status} className="h-5" /> : null}
                    <AccountMarkers user={row.owner} />
                    <span className="text-muted-foreground">
                      {t("accountAge", { age: formatRelativeTime(row.owner.createdAt, locale) })}
                    </span>
                    {row.firstListing ? (
                      <span className="rounded-full bg-surface-muted px-2 py-0.5 font-medium text-foreground">{t("firstListing")}</span>
                    ) : null}
                    {row._count.reports > 0 ? (
                      <span className="rounded-full bg-destructive/10 px-2 py-0.5 font-medium text-destructive">
                        {t("openReports", { count: row._count.reports })}
                      </span>
                    ) : null}
                  </div>
                  {row.reasons.length ? (
                    <ul className="flex flex-wrap gap-1.5" aria-label={t("topReasons")}>
                      {row.reasons
                        .slice()
                        .sort((a, b) => b.points - a.points)
                        .slice(0, 3)
                        .map((r) => (
                          <li key={r.code} className="rounded-md border bg-background px-1.5 py-0.5 text-[11px] text-muted-foreground">
                            {tRisk.has(r.code) ? tRisk(r.code) : r.code}
                          </li>
                        ))}
                    </ul>
                  ) : null}
                  <p className="text-[11px] text-muted-foreground">
                    {tab === "approved" && row.reviewedAt ? (
                      <>
                        {t("approvedBy", { name: row.reviewedBy?.name ?? "—" })} · <WhenText date={row.reviewedAt} />
                      </>
                    ) : (
                      <>
                        {t("updated")} <WhenText date={row.updatedAt} />
                      </>
                    )}
                  </p>
                </div>
              </li>
            );
          })}
        </ul>
      )}
      <AdminPagination
        pathname="/admin/moderation"
        searchParams={query}
        page={queue.page}
        pageSize={MODERATION_PAGE_SIZE}
        total={queue.total}
      />
    </>
  );
}
