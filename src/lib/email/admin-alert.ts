import "server-only";
import { siteConfig, type AppLocale } from "@/config/site";
import { isAppLocale } from "@/i18n/locale";
import { db } from "@/lib/db";
import { isEmailAddress, notificationEmailFor, sendEmail, type EmailData } from "./index";

/**
 * Alerts for the founder (round 3, founder's answer 1): to ADMIN_ALERT_EMAIL (comma-separated, a
 * PRIVATE setting in .env, never committed), else to every real (non-demo) admin account with a
 * real email address. With neither, the alert stays in the admin email outbox. Never throws.
 */

/** Where admin alerts go. Exported for the admin settings page and tests. */
export async function adminAlertRecipients(): Promise<{ to: string; locale: AppLocale }[]> {
  const configured = (process.env.ADMIN_ALERT_EMAIL ?? "")
    .split(",")
    .map((value) => value.trim())
    .filter((value) => value && isEmailAddress(value));
  if (configured.length > 0) return [...new Set(configured)].map((to) => ({ to, locale: siteConfig.i18n.primaryLocale }));
  const admins = await db.user.findMany({
    where: { role: "ADMIN", isDemo: false, deletedAt: null },
    select: { email: true, contactEmail: true, locale: true },
    take: 10,
  });
  return admins.flatMap((admin) => {
    const to = notificationEmailFor(admin);
    return to ? [{ to, locale: isAppLocale(admin.locale) ? admin.locale : siteConfig.i18n.primaryLocale }] : [];
  });
}

/** Kept in the outbox when nobody is set up to receive admin alerts (never deliverable). */
const OUTBOX_ONLY_ADDRESS = "admin-alerts@outbox.invalid";

export async function sendAdminAlert(data: EmailData["admin_alert"]): Promise<void> {
  try {
    const recipients = await adminAlertRecipients();
    if (recipients.length === 0) {
      await sendEmail({ to: OUTBOX_ONLY_ADDRESS, locale: siteConfig.i18n.primaryLocale, template: "admin_alert", data, outboxOnly: true });
      return;
    }
    await Promise.all(recipients.map((r) => sendEmail({ to: r.to, locale: r.locale, template: "admin_alert", data })));
  } catch (error) {
    console.error(`[admin-alert] "${data.kind}" could not be sent:`, error);
  }
}
