import { CircleDollarSign, ExternalLink, Plus } from "lucide-react";
import type { Metadata } from "next";
import { getTranslations, setRequestLocale } from "next-intl/server";
import { Pill } from "@/components/admin/content/pill";
import { AdminFilterBar } from "@/components/admin/filter-bar";
import { AdminPageHeader } from "@/components/admin/page-header";
import { AdminPagination } from "@/components/admin/pagination";
import { TabLinks } from "@/components/admin/tab-links";
import { Ltr } from "@/components/common/ltr";
import { EmptyState } from "@/components/common/states";
import { Button } from "@/components/ui/button";
import type { CurrencyCode } from "@/config/site";
import { Link } from "@/i18n/navigation";
import { enumParam, pageParam, param } from "@/lib/admin/params";
import { isStaleReference } from "@/lib/admin/reference-prices";
import { listReferencePrices, REFERENCE_PAGE_SIZE, REFERENCE_STATES, referenceFormOptions } from "@/lib/admin/server/reference-prices";
import { requireStaff } from "@/lib/auth/session";
import { formatDate, formatMoney } from "@/lib/format";
import { DEAL_TYPES } from "@/lib/listing/fields";
import { ReferenceActiveButton } from "./_components/reference-active-button";

type Props = {
  params: Promise<{ locale: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
};

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: "admin.referencePrices" });
  return { title: t("title"), robots: { index: false, follow: false } };
}

/**
 * /admin/reference-prices (ADMIN or MODERATOR: "moderation"): price ranges from public reports for
 * the hosts' price guide, with source and month. Add, edit, deactivate; every change is audited.
 */
export default async function ReferencePricesPage({ params, searchParams }: Props) {
  const { locale } = await params;
  setRequestLocale(locale);
  await requireStaff("moderation");
  const query = await searchParams;
  const cities = await referenceFormOptions(locale);
  const cityId = param(query, "city");
  const filters = {
    state: enumParam(query, "state", REFERENCE_STATES, "active"),
    cityId: cities.some((c) => c.id === cityId) ? cityId : undefined,
    dealType: enumParam(query, "deal", DEAL_TYPES),
  };
  const [t, tFields, result] = await Promise.all([
    getTranslations("admin.referencePrices"),
    getTranslations("listingFields"),
    listReferencePrices(filters, pageParam(query), locale),
  ]);
  const stateHref = (state: string) => {
    const q = new URLSearchParams();
    if (state !== "active") q.set("state", state);
    if (filters.cityId) q.set("city", filters.cityId);
    if (filters.dealType) q.set("deal", filters.dealType);
    const s = q.toString();
    return s ? `/admin/reference-prices?${s}` : "/admin/reference-prices";
  };

  return (
    <>
      <AdminPageHeader
        title={t("title")}
        description={t("description")}
        actions={
          <Button asChild size="sm" className="h-9">
            <Link href="/admin/reference-prices/new">
              <Plus aria-hidden />
              {t("add")}
            </Link>
          </Button>
        }
      />
      <TabLinks
        label={t("statesLabel")}
        active={filters.state}
        items={REFERENCE_STATES.map((key) => ({ key, href: stateHref(key), label: t(`states.${key}`), count: result.counts[key] }))}
      />
      <AdminFilterBar
        fields={[
          { type: "select", name: "city", label: t("form.city"), allLabel: t("filters.allCities"), options: cities.map((c) => ({ value: c.id, label: c.name })) },
          { type: "select", name: "deal", label: t("form.dealType"), allLabel: t("filters.allDeals"), options: DEAL_TYPES.map((d) => ({ value: d, label: tFields(`dealType.${d}`) })) },
        ]}
      />
      {result.rows.length === 0 ? (
        <EmptyState
          bordered
          icon={CircleDollarSign}
          title={t(`empty.${filters.state}`)}
          description={t("emptyHint")}
          action={{ label: t("add"), href: "/admin/reference-prices/new", icon: Plus }}
        />
      ) : (
        <ul className="divide-y rounded-xl border bg-card shadow-xs">
          {result.rows.map((row) => {
            const unitKey = `unit.${row.unit}${row.perSqm ? "_sqm" : ""}`;
            const where = [row.neighborhoodName, row.cityName].filter(Boolean).join(", ");
            const what = [
              tFields(`dealType.${row.dealType}`),
              row.propertyType ? tFields(`propertyType.${row.propertyType}`) : t("form.allTypes"),
              row.bedrooms !== null ? t("bedroomsValue", { count: row.bedrooms }) : t("form.allSizes"),
            ].join(" · ");
            const label = t("sourceLabel", { source: row.sourceName, month: formatDate(row.sourceMonth, locale, { month: "long", year: "numeric", timeZone: "UTC" }) });
            return (
              <li key={row.id} className="grid gap-1.5 p-3 sm:px-4">
                <div className="flex flex-wrap items-center gap-2">
                  <Link href={`/admin/reference-prices/${row.id}`} className="font-medium underline-offset-4 hover:underline">
                    {where}
                  </Link>
                  {!row.active ? <Pill tone="muted">{t("inactive")}</Pill> : null}
                  {isStaleReference(row.sourceMonth) ? <Pill tone="warning">{t("stale")}</Pill> : null}
                </div>
                <p className="text-sm text-muted-foreground">{what}</p>
                <p className="text-sm">
                  <Ltr className="font-semibold">
                    {formatMoney(row.low, row.currency as CurrencyCode, locale)} – {formatMoney(row.high, row.currency as CurrencyCode, locale)}
                  </Ltr>{" "}
                  <span className="text-muted-foreground">{t(unitKey)}</span>
                </p>
                <p className="flex flex-wrap items-center gap-x-2 text-xs text-muted-foreground">
                  <span dir="auto">{label}</span>
                  {row.sourceUrl ? (
                    <a href={row.sourceUrl} target="_blank" rel="noopener noreferrer nofollow" className="inline-flex items-center gap-1 text-primary hover:underline">
                      <ExternalLink aria-hidden className="size-3.5" />
                      {t("openSource")}
                    </a>
                  ) : null}
                </p>
                <div className="flex flex-wrap items-center gap-2">
                  <Button asChild variant="outline" size="sm" className="h-8 min-h-11 sm:min-h-0">
                    <Link href={`/admin/reference-prices/${row.id}`}>{t("edit")}</Link>
                  </Button>
                  <ReferenceActiveButton id={row.id} active={row.active} label={where} />
                </div>
              </li>
            );
          })}
        </ul>
      )}
      <AdminPagination pathname="/admin/reference-prices" searchParams={query} page={result.page} pageSize={REFERENCE_PAGE_SIZE} total={result.total} />
    </>
  );
}
