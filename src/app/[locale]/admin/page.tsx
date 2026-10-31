import { BadgeCheck, Flag, Home, Inbox, LifeBuoy, MousePointerClick, UserPlus } from "lucide-react";
import type { Metadata } from "next";
import { getTranslations, setRequestLocale } from "next-intl/server";
import { AuditList } from "@/components/admin/audit-list";
import { ClicksByChannelChart } from "@/components/admin/clicks-chart";
import { KpiCard } from "@/components/admin/kpi-card";
import { AdminPageHeader, AdminSection } from "@/components/admin/page-header";
import { RankedList } from "@/components/admin/ranked-list";
import { Link } from "@/i18n/navigation";
import { getAdminCounts } from "@/lib/admin/server/counts";
import { getOverviewStats } from "@/lib/admin/server/overview";
import { recentAuditEntries } from "@/lib/admin/server/audit";
import { can } from "@/lib/auth/permissions";
import { requireStaff } from "@/lib/auth/session";
import { formatNumber } from "@/lib/format";

export async function generateMetadata({ params }: PageProps<"/[locale]/admin">): Promise<Metadata> {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: "admin.overview" });
  return { title: t("title"), robots: { index: false, follow: false } };
}

export default async function AdminOverviewPage({ params }: PageProps<"/[locale]/admin">) {
  const { locale } = await params;
  setRequestLocale(locale);
  const staff = await requireStaff();
  const seesAudit = can(staff.role, "audit");
  const [t, tFields, stats, counts, recent] = await Promise.all([
    getTranslations("admin.overview"),
    getTranslations("listingFields"),
    getOverviewStats(locale),
    getAdminCounts(),
    recentAuditEntries(8, seesAudit ? {} : { actorId: staff.id }),
  ]);
  const n = (value: number) => formatNumber(value, locale);
  const link = (permission: Parameters<typeof can>[1], href: string) => (can(staff.role, permission) ? href : undefined);

  return (
    <>
      <AdminPageHeader title={t("title")} description={t("greeting", { name: staff.name })} />

      <section aria-labelledby="kpis" className="mb-6">
        <h2 id="kpis" className="sr-only">
          {t("kpisTitle")}
        </h2>
        <div className="grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-4">
          <KpiCard
            label={t("kpi.newUsers")}
            value={n(stats.newUsers7)}
            hint={t("kpi.thirtyDays", { value: n(stats.newUsers30) })}
            icon={UserPlus}
            href={link("users.view", "/admin/users")}
          />
          <KpiCard
            label={t("kpi.newListings")}
            value={n(stats.newListings7)}
            hint={t("kpi.thirtyDays", { value: n(stats.newListings30) })}
            icon={Home}
          />
          <KpiCard label={t("kpi.liveListings")} value={n(stats.liveListings)} hint={t("kpi.liveHint")} icon={Home} />
          <KpiCard
            label={t("kpi.inReview")}
            value={n(counts.inReview)}
            hint={t("kpi.inReviewHint")}
            icon={Inbox}
            tone={counts.inReview > 0 ? "attention" : "default"}
            href={link("moderation", "/admin/moderation")}
          />
          <KpiCard
            label={t("kpi.openReports")}
            value={n(counts.openReports)}
            hint={t("kpi.openReportsHint")}
            icon={Flag}
            tone={counts.openReports > 0 ? "attention" : "default"}
            href={link("reports.view", "/admin/reports")}
          />
          <KpiCard
            label={t("kpi.openTickets")}
            value={n(counts.activeTickets)}
            hint={t("kpi.urgentTickets", { value: n(counts.urgentTickets) })}
            icon={LifeBuoy}
            tone={counts.urgentTickets > 0 ? "urgent" : "default"}
            href={link("tickets", "/admin/tickets")}
          />
          <KpiCard
            label={t("kpi.pendingVerifications")}
            value={n(counts.pendingVerifications)}
            hint={t("kpi.pendingVerificationsHint")}
            icon={BadgeCheck}
            tone={counts.pendingVerifications > 0 ? "attention" : "default"}
            href={link("verifications", "/admin/verifications")}
          />
          <KpiCard
            label={t("kpi.contactClicks")}
            value={n(stats.contactClicks30)}
            hint={t("kpi.last30")}
            icon={MousePointerClick}
          />
        </div>
      </section>

      <div className="grid gap-4 lg:grid-cols-2">
        <AdminSection title={t("clicksTitle")} description={t("clicksDescription")}>
          {stats.contactClicks30 > 0 ? (
            <ClicksByChannelChart
              data={stats.clicksByChannel.map((c) => ({ label: tFields(`contactChannel.${c.channel}`), count: c.count }))}
              labels={{ channel: t("channel"), clicks: t("clicks"), table: t("clicksTitle") }}
            />
          ) : (
            <p className="py-10 text-center text-sm text-muted-foreground">{t("noClicks")}</p>
          )}
        </AdminSection>
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-1 xl:grid-cols-2">
          <AdminSection title={t("citiesByListings")}>
            <RankedList
              items={stats.topCitiesByListings.map((c) => ({ key: c.cityId, label: c.name, count: c.count }))}
              empty={t("noCities")}
            />
          </AdminSection>
          <AdminSection title={t("citiesByClicks")} description={t("last30Days")}>
            <RankedList
              items={stats.topCitiesByClicks.map((c) => ({ key: c.cityId, label: c.name, count: c.count }))}
              empty={t("noClicks")}
            />
          </AdminSection>
        </div>
      </div>

      <AdminSection
        className="mt-4"
        title={seesAudit ? t("recentActivity") : t("myActivity")}
        actions={
          seesAudit ? (
            <Link href="/admin/audit" className="text-sm font-medium text-primary hover:underline">
              {t("openAudit")}
            </Link>
          ) : null
        }
      >
        <AuditList rows={recent} compact />
      </AdminSection>
    </>
  );
}
