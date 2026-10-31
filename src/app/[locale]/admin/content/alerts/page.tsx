import { getTranslations, setRequestLocale } from "next-intl/server";
import { AlertsManager } from "@/components/admin/content/alerts-manager";
import { AdminPageHeader } from "@/components/admin/page-header";
import { listAlerts } from "@/lib/admin/content/server/queries";
import { adminContentMetadata } from "@/lib/admin/content/server/metadata";
import { requireStaff } from "@/lib/auth/session";
import { DEMO_SCAM_ALERT_ID, isDemoAlertTitle } from "@/lib/demo";
import { getSettings } from "@/lib/settings";

export async function generateMetadata({ params }: PageProps<"/[locale]/admin/content/alerts">) {
  return adminContentMetadata(params, "alerts");
}

export default async function AlertsPage({ params }: PageProps<"/[locale]/admin/content/alerts">) {
  const { locale } = await params;
  setRequestLocale(locale);
  await requireStaff("content");
  const [t, tCommon, alerts, settings] = await Promise.all([
    getTranslations("adminContent.alerts"),
    getTranslations("adminContent.common"),
    listAlerts(),
    getSettings(),
  ]);
  const now = new Date();
  const stateOf = (a: (typeof alerts)[number]) =>
    !a.active ? "off" : a.startsAt > now ? "scheduled" : a.endsAt && a.endsAt <= now ? "ended" : "live";
  return (
    <>
      <AdminPageHeader back={{ href: "/admin/content", label: tCommon("backToContent") }} title={t("title")} description={t("description")} />
      <div className="max-w-4xl">
        <AlertsManager
          bannerEnabled={settings.scamBannerEnabled}
          items={alerts.map((a) => ({
            id: a.id,
            title: a.title,
            body: a.body,
            severity: a.severity,
            active: a.active,
            showAsBanner: a.showAsBanner,
            startsAt: a.startsAt.toISOString(),
            endsAt: a.endsAt?.toISOString() ?? null,
            isDemo: a.id === DEMO_SCAM_ALERT_ID || isDemoAlertTitle(a.title),
            state: stateOf(a),
          }))}
        />
      </div>
    </>
  );
}
