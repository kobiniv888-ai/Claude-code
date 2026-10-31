import { connection } from "next/server";
import { getLocale, getTranslations } from "next-intl/server";
import { pickLocalized } from "@/i18n/locale";
import { db } from "@/lib/db";
import { getSettings } from "@/lib/settings";
import { alertKey, DISMISSED_ALERTS_ATTR } from "./dismissed-alerts";
import { ScamAlertBannerView } from "./scam-alert-banner-view";

async function getBannerAlert() {
  const now = new Date();
  return db.scamAlert.findFirst({
    where: {
      active: true,
      showAsBanner: true,
      startsAt: { lte: now },
      OR: [{ endsAt: null }, { endsAt: { gt: now } }],
    },
    // Enum order is INFO < WARNING < CRITICAL: the most serious alert wins, then the newest.
    orderBy: [{ severity: "desc" }, { startsAt: "desc" }],
    select: { id: true, title: true, body: true, severity: true, updatedAt: true },
  });
}

/**
 * The site-wide scam-alert bar (Admin → Content → Scam alerts, "show as banner"), shown while
 * the "scam banner" setting is on. Visitors can close it; the choice is remembered per alert.
 */
export async function ScamAlertBanner() {
  await connection();
  const settings = await getSettings();
  if (!settings.scamBannerEnabled) return null;

  let alert: Awaited<ReturnType<typeof getBannerAlert>> = null;
  try {
    alert = await getBannerAlert();
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
