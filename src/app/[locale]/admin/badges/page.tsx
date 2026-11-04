import { CircleAlert, ExternalLink, Info, MapPinCheck, SearchX } from "lucide-react";
import type { Metadata } from "next";
import { getTranslations, setRequestLocale } from "next-intl/server";
import { Pill } from "@/components/admin/content/pill";
import { ListingStatusBadge } from "@/components/admin/badges";
import { AdminFilterBar } from "@/components/admin/filter-bar";
import { ListingThumb, PublicId } from "@/components/admin/listing-bits";
import { AdminPageHeader, AdminSection } from "@/components/admin/page-header";
import { AdminPagination } from "@/components/admin/pagination";
import { EmptyState } from "@/components/common/states";
import { Link } from "@/i18n/navigation";
import { canSetVisited } from "@/lib/admin/badges/rules";
import { findListingsForBadge, listVisitedListings, type BadgeRow } from "@/lib/admin/badges/server";
import { pageParam, param } from "@/lib/admin/params";
import { requireStaff } from "@/lib/auth/session";
import { formatDate, formatNumber } from "@/lib/format";
import { listingPath } from "@/lib/listing/urls";
import { ClearVisitButton } from "./_components/clear-visit-button";
import { VisitDialog } from "./_components/visit-dialog";

type Props = {
  params: Promise<{ locale: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
};

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: "admin.badges" });
  return { title: t("title"), robots: { index: false, follow: false } };
}

/**
 * /admin/badges: "ביקרנו במקום" (round 3, brief 8.3 and 9). Staff with "moderation" see the list;
 * only an ADMIN sets or clears the badge (checked again in the actions). Find a listing by number
 * or title, set the visit date and the internal note, or clear it. Listings whose address, pin or
 * most photos changed since the visit are marked (the badge itself stays: the founder decides).
 */
export default async function BadgesPage({ params, searchParams }: Props) {
  const { locale } = await params;
  setRequestLocale(locale);
  const staff = await requireStaff("moderation");
  const query = await searchParams;
  const q = param(query, "q").slice(0, 120);
  const canEdit = canSetVisited(staff.role);

  const [t, visited, found] = await Promise.all([
    getTranslations("admin.badges"),
    listVisitedListings(pageParam(query), locale),
    q ? findListingsForBadge(q, locale) : Promise.resolve(null),
  ]);

  return (
    <>
      <AdminPageHeader title={t("title")} description={t("description")} />

      <div className="mb-5 grid gap-3">
        <p className="flex items-start gap-2 rounded-xl border bg-card p-3 text-sm text-muted-foreground shadow-xs">
          <Info aria-hidden className="mt-0.5 size-4 shrink-0 text-primary" />
          <span>{t("rules")}</span>
        </p>
        {!canEdit ? (
          <p role="note" className="flex items-start gap-2 rounded-xl border border-border-strong/40 bg-surface-muted p-3 text-sm">
            <CircleAlert aria-hidden className="mt-0.5 size-4 shrink-0" />
            <span>{t("adminOnly")}</span>
          </p>
        ) : null}
      </div>

      <AdminFilterBar fields={[{ type: "search", name: "q", label: t("search.label"), placeholder: t("search.placeholder"), wide: true }]} />

      {found ? (
        <AdminSection id="found" title={t("search.title", { query: q })} className="mb-5" bodyClassName="p-0">
          {found.length === 0 ? (
            <EmptyState icon={SearchX} title={t("search.empty")} description={t("search.emptyHint")} />
          ) : (
            <ul className="divide-y">
              {found.map((row) => (
                <BadgeRowItem key={row.id} row={row} locale={locale} canEdit={canEdit} />
              ))}
            </ul>
          )}
        </AdminSection>
      ) : null}

      <AdminSection
        id="visited"
        title={t("list.title", { count: visited.info.total })}
        description={t("list.description")}
        bodyClassName="p-0"
      >
        {visited.rows.length === 0 ? (
          <EmptyState icon={MapPinCheck} title={t("list.empty")} description={t("list.emptyHint")} />
        ) : (
          <ul className="divide-y">
            {visited.rows.map((row) => (
              <BadgeRowItem key={row.id} row={row} locale={locale} canEdit={canEdit} />
            ))}
          </ul>
        )}
      </AdminSection>
      <AdminPagination pathname="/admin/badges" searchParams={query} page={visited.info.page} pageSize={visited.info.pageSize} total={visited.info.total} />
    </>
  );
}

/** Long pills (Georgian, Russian) wrap inside the row on a 360 px phone instead of running past it. */
const WRAP_PILL = "h-auto min-h-6 max-w-full shrink py-0.5 whitespace-normal";

async function BadgeRowItem({ row, locale, canEdit }: { row: BadgeRow; locale: string; canEdit: boolean }) {
  const t = await getTranslations("admin.badges");
  const label = `#${formatNumber(row.publicId, locale, { useGrouping: false })} · ${row.title || t("untitled")}`;
  const place = [row.cityName, row.ownerName].filter(Boolean).join(" · ");
  return (
    <li className="flex flex-col gap-3 p-3 sm:flex-row sm:items-start sm:px-4" data-badge-row={row.publicId}>
      <ListingThumb src={row.thumb} alt="" className="size-14" />
      <div className="grid min-w-0 flex-1 grid-cols-1 gap-1.5">
        <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
          <Link href={`/admin/moderation/${row.id}`} dir="auto" className="min-w-0 truncate font-medium underline-offset-4 hover:underline">
            {row.title || t("untitled")}
          </Link>
          <PublicId id={row.publicId} />
          <ListingStatusBadge status={row.status} />
          {row.isDemo ? <Pill tone="demo">{t("demo")}</Pill> : null}
        </div>
        {place ? (
          <p className="truncate text-sm text-muted-foreground" dir="auto">
            {place}
          </p>
        ) : null}

        {row.visitedOn ? (
          <div className="grid grid-cols-1 gap-1 text-sm">
            <p className="flex flex-wrap items-center gap-x-2 gap-y-1">
              <Pill tone="success" icon={MapPinCheck} className={WRAP_PILL}>
                {t("visitedOn", { date: formatDate(row.visitedOn, locale, { day: "numeric", month: "long", year: "numeric" }) })}
              </Pill>
              {row.visitedByName ? (
                <span className="text-xs text-muted-foreground">
                  {t.rich("enteredBy", { name: () => <bdi dir="auto">{row.visitedByName}</bdi> })}
                </span>
              ) : null}
            </p>
            {row.visitedNote ? (
              <p className="rounded-lg bg-muted/60 px-2.5 py-1.5 text-sm">
                <span className="me-1 text-xs font-medium text-muted-foreground">{t("noteLabel")}</span>
                <span dir="auto" className="break-words whitespace-pre-line">
                  {row.visitedNote}
                </span>
              </p>
            ) : null}
            {row.changes.length > 0 ? (
              <ul className="flex flex-wrap gap-1.5" aria-label={t("changedLabel")}>
                {row.changes.map((change) => (
                  <li key={change}>
                    <Pill tone="warning" icon={CircleAlert} className={WRAP_PILL}>
                      {t(`changed.${change}`)}
                    </Pill>
                  </li>
                ))}
              </ul>
            ) : null}
          </div>
        ) : row.refusal === "visited_demo" ? (
          <p className="text-xs text-muted-foreground">{t("demoRefused")}</p>
        ) : (
          <p className="text-xs text-muted-foreground">{t("notVisited")}</p>
        )}
      </div>

      <div className="flex flex-wrap items-center gap-2 sm:flex-col sm:items-end">
        {canEdit && !row.refusal ? (
          <VisitDialog
            listingId={row.id}
            listingLabel={label}
            today={row.today}
            current={row.visitedOn ? { visitedOn: row.visitedOn, note: row.visitedNote ?? "" } : null}
          />
        ) : null}
        {canEdit && row.visitedOn ? <ClearVisitButton listingId={row.id} listingLabel={label} /> : null}
        {row.status === "LIVE" ? (
          <Link
            href={listingPath(row.publicId, row.title)}
            target="_blank"
            className="inline-flex h-8 min-h-11 items-center gap-1 rounded-md px-2.5 text-sm text-primary outline-none hover:underline focus-visible:ring-3 focus-visible:ring-ring/50 sm:min-h-0"
          >
            <ExternalLink aria-hidden className="size-3.5" />
            {t("openListing")}
          </Link>
        ) : null}
      </div>
    </li>
  );
}
