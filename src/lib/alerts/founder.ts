import "server-only";
import { siteConfig, type AppLocale } from "@/config/site";
import { isAppLocale } from "@/i18n/locale";
import { db } from "@/lib/db";
import { isEmailAddress, isPlaceholderEmail, notificationEmailFor, sendEmail, type EmailData } from "@/lib/email";

/**
 * Alerts for the founder (round 3, founder's answers 1 and 4): a booking refused because the host
 * could not be alerted, a host's channel paused after a bounce or a blocked bot, other bounces.
 *
 * Where they go:
 *   1. ADMIN_ALERT_EMAIL (comma-separated; a PRIVATE setting in .env filled from a Codespaces
 *      secret, never committed; a different address from the admin account), else
 *   2. the real (non-demo) admin accounts' real email addresses, else
 *   3. the admin email outbox only.
 * Without RESEND_API_KEY every one of them stays in the outbox (sendEmail logs it). Never throws.
 */

/** The configured alert addresses (ADMIN_ALERT_EMAIL): valid, real, lower-case, no duplicates. */
export function founderAlertEmail(env: Record<string, string | undefined> = process.env): string[] {
  const list = (env.ADMIN_ALERT_EMAIL ?? "")
    .split(/[,;\s]+/)
    .map((value) => value.trim().toLowerCase())
    .filter((value) => value && isEmailAddress(value) && !isPlaceholderEmail(value));
  return [...new Set(list)];
}

/** Where founder alerts go right now (see above). */
export async function founderAlertRecipients(): Promise<{ to: string; locale: AppLocale }[]> {
  const configured = founderAlertEmail();
  if (configured.length > 0) return configured.map((to) => ({ to, locale: siteConfig.i18n.primaryLocale }));
  const admins = await db.user.findMany({
    where: { role: "ADMIN", isDemo: false, deletedAt: null },
    select: { email: true, contactEmail: true, locale: true },
    take: 10,
  });
  const seen = new Set<string>();
  return admins.flatMap((admin) => {
    const to = notificationEmailFor(admin)?.toLowerCase();
    if (!to || seen.has(to)) return [];
    seen.add(to);
    return [{ to, locale: isAppLocale(admin.locale) ? admin.locale : siteConfig.i18n.primaryLocale }];
  });
}

/** Kept in the outbox when nobody is set up to receive founder alerts (never deliverable). */
export const FOUNDER_OUTBOX_ADDRESS = "admin-alerts@outbox.invalid";

export async function sendFounderAlert(data: EmailData["admin_alert"]): Promise<void> {
  try {
    const recipients = await founderAlertRecipients();
    if (recipients.length === 0) {
      await sendEmail({ to: FOUNDER_OUTBOX_ADDRESS, locale: siteConfig.i18n.primaryLocale, template: "admin_alert", data, outboxOnly: true });
      return;
    }
    await Promise.all(recipients.map((r) => sendEmail({ to: r.to, locale: r.locale, template: "admin_alert", data })));
  } catch (error) {
    console.error(`[founder-alert] "${data.kind}" could not be sent:`, error);
  }
}
