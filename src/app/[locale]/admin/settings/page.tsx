import { getTranslations, setRequestLocale } from "next-intl/server";
import { SettingsForm } from "@/components/admin/content/settings-form";
import { AdminPageHeader } from "@/components/admin/page-header";
import { LoginMethodsBanner } from "@/components/auth/login-methods-banner";
import { siteConfig } from "@/config/site";
import { toLocalizedForm } from "@/lib/admin/content/localized";
import { adminContentMetadata } from "@/lib/admin/content/server/metadata";
import { requireStaff } from "@/lib/auth/session";
import { enabledCurrencies } from "@/lib/currency/convert";
import { db } from "@/lib/db";
import { countDemoData } from "@/lib/demo";
import { isShabbatOrHolidayNow } from "@/lib/hebcal";
import { EMERGENCY_CONTACTS_SETTING_KEY } from "@/lib/jewish-life/emergency";
import { getSettings } from "@/lib/settings";

export async function generateMetadata({ params }: PageProps<"/[locale]/admin/settings">) {
  return adminContentMetadata(params, "settings");
}

/** Stored emergency contacts → editor rows (invalid entries are kept so the admin can fix them). */
function emergencyRows(value: unknown) {
  if (!Array.isArray(value)) return [];
  return value.slice(0, 50).map((raw) => {
    const entry = (raw && typeof raw === "object" ? raw : {}) as { label?: unknown; phone?: unknown; url?: unknown };
    return {
      label: toLocalizedForm(entry.label),
      phone: typeof entry.phone === "string" ? entry.phone : "",
      url: typeof entry.url === "string" ? entry.url : "",
    };
  });
}

export default async function SettingsPage({ params }: PageProps<"/[locale]/admin/settings">) {
  const { locale } = await params;
  setRequestLocale(locale);
  await requireStaff("settings");
  const [t, settings, demoCounts, emergency] = await Promise.all([
    getTranslations("adminContent.settings"),
    getSettings(),
    countDemoData(),
    db.siteSetting.findUnique({ where: { key: EMERGENCY_CONTACTS_SETTING_KEY }, select: { value: true } }),
  ]);
  let shabbatNow: ReturnType<typeof isShabbatOrHolidayNow> | null = null;
  try {
    shabbatNow = isShabbatOrHolidayNow(siteConfig.shabbat.israel);
  } catch (error) {
    console.error("[admin/settings] Shabbat check failed:", error);
  }

  return (
    <>
      <AdminPageHeader title={t("title")} description={t("description")} />
      <div className="max-w-3xl">
        <LoginMethodsBanner />
        <SettingsForm
          settings={{
            listingExpiryDays: settings.listingExpiryDays,
            shabbatModeEnabled: settings.shabbatModeEnabled,
            defaultCurrency: settings.defaultCurrency,
            reviewRiskThreshold: settings.reviewRiskThreshold,
            reportsToAutoHide: settings.reportsToAutoHide,
            scamBannerEnabled: settings.scamBannerEnabled,
            demoDataVisible: settings.demoDataVisible,
            paidFeaturePrices: settings.paidFeaturePrices,
          }}
          currencies={[...enabledCurrencies]}
          paidFeatureKeys={Object.keys(siteConfig.paidFeatures)}
          shabbat={{
            settingOn: settings.shabbatModeEnabled,
            shabbatNow: shabbatNow?.active ?? false,
            kind: shabbatNow?.kind ?? null,
            endsAt: shabbatNow?.endsAt?.toISOString() ?? null,
          }}
          demoCounts={demoCounts}
          emergency={emergencyRows(emergency?.value)}
        />
      </div>
    </>
  );
}
