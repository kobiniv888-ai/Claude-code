import { connection } from "next/server";
import { getLocale, getTranslations } from "next-intl/server";
import { pickLocalized } from "@/i18n/locale";
import { getBannerScamAlert } from "@/lib/scam-alerts/server";
import { getSettings } from "@/lib/settings";
import { alertKey, DISMISSED_ALERTS_ATTR } from "./dismissed-alerts";
import { ScamAlertBannerView } from "./scam-alert-banner-view";

/**
 * The site-wide scam-alert bar (Admin → Content → Scam alerts, "show as banner"), shown while
 * the "scam banner" setting is on. Visitors can close it; the choice is remembered per alert.
 */
export async function ScamAlertBanner() {
  await connection();
  const settings = await getSettings();
  if (!settings.scamBannerEnabled) return null;

  let alert: Awaited<ReturnType<typeof getBannerScamAlert>>;
  try {
    alert = await getBannerScamAlert();
  } catch (error) {
    console.error("[layout] could not load the scam-alert banner", error);
    return null;
  }
  if (!alert) return null;

  const key = alertKey(alert.id, alert.updatedAt);
  if (!key) return null;
  const [locale, t] = await Promise.all([getLocale(), getTranslations("banners.scam")]);
  const title = pickLocalized(alert.title, locale);
  if (!title) return null;

  return (
    <>
      {/* Hidden before paint when this visitor already closed this alert (see dismissed-alerts.ts). */}
      <style>{`html[${DISMISSED_ALERTS_ATTR}~="${key}"] [data-scam-alert="${key}"]{display:none}`}</style>
      <ScamAlertBannerView
        alertKey={key}
        severity={alert.severity}
        title={title}
        body={pickLocalized(alert.body, locale)}
        labels={{ label: t("label"), more: t("more"), dismiss: t("dismiss") }}
      />
    </>
  );
}
