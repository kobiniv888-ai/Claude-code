import "server-only";
import { siteConfig } from "@/config/site";
import { FOUNDER_OUTBOX_ADDRESS, founderAlertRecipients } from "@/lib/alerts/founder";
import { tripPath, TRIPS_PATH } from "@/lib/booking/constants";
import { db } from "@/lib/db";
import { notificationEmailFor, sendEmail } from "@/lib/email";
import { rateLimit } from "@/lib/rate-limit";
import { parseReportAttachments } from "./turned-away";

/**
 * Report emails that go out when a report arrives (round 3, brief 8.2 and 9):
 *
 * - notifyFounderOfReport(reportId): THE "a report came in" email to the founder, for every
 *   report (turned-away ones with an urgent subject). Same recipients as the other founder
 *   alerts: ADMIN_ALERT_EMAIL (private setting), else the real admin accounts, else the admin
 *   outbox only (src/lib/alerts/founder.ts). It names no reporter and quotes no guest text: the
 *   details are in the admin panel.
 * - sendReportConfirmation(reportId): the guest's confirmation of a turned-away report.
 *
 * Both never throw: a report is saved even when an email fails. A burst (more than
 * FOUNDER_REPORT_EMAILS_PER_HOUR in an hour, e.g. many accounts reporting at once) is left for
 * the queue and the daily summary instead of filling the founder's inbox. Turned-away reports
 * ("urgent", promised by email right away) have their own, larger budget, so a burst of ordinary
 * reports never silences them.
 */

export const FOUNDER_REPORT_EMAILS_PER_HOUR = 30;
export const FOUNDER_URGENT_REPORT_EMAILS_PER_HOUR = 60;

/** The hourly email budget a report draws from: urgent (turned-away) reports have their own. */
export function founderReportBudget(kind: string): { key: string; limit: number } {
  return kind === "TURNED_AWAY"
    ? { key: "founder:reports:urgent", limit: FOUNDER_URGENT_REPORT_EMAILS_PER_HOUR }
    : { key: "founder:reports:general", limit: FOUNDER_REPORT_EMAILS_PER_HOUR };
}

const reportSelect = {
  id: true,
  kind: true,
  reason: true,
  targetType: true,
  happenedOn: true,
  attachments: true,
  listing: { select: { title: true, publicId: true, owner: { select: { name: true, businessName: true } } } },
  targetUser: { select: { name: true, businessName: true } },
  booking: { select: { code: true } },
  reporter: { select: { name: true, firstName: true, email: true, contactEmail: true, locale: true } },
} as const;

function dayOf(date: Date | null): string | null {
  return date ? date.toISOString().slice(0, 10) : null;
}

export async function notifyFounderOfReport(reportId: string): Promise<void> {
  try {
    const report = await db.report.findUnique({ where: { id: reportId }, select: reportSelect });
    if (!report) return;
    const budget = founderReportBudget(report.kind);
    const burst = await rateLimit(budget.key, { limit: budget.limit, windowSeconds: 3600, failOpen: true }).catch(() => ({ ok: true }));
    if (!burst.ok) return;
    const host = report.targetUser ?? report.listing?.owner ?? null;
    const data = {
      kind: report.kind,
      reason: report.reason,
      targetType: report.targetType,
      listingTitle: report.listing?.title ?? null,
      listingPublicId: report.listing?.publicId ?? null,
      hostName: host ? host.businessName || host.name : null,
      bookingCode: report.booking?.code ?? null,
      happenedOn: dayOf(report.happenedOn),
      screenshots: parseReportAttachments(report.attachments).length,
      adminUrl: `/admin/reports/${report.id}`,
    };
    const recipients = await founderAlertRecipients();
    if (recipients.length === 0) {
      await sendEmail({ to: FOUNDER_OUTBOX_ADDRESS, locale: siteConfig.i18n.primaryLocale, template: "report_admin", data, outboxOnly: true });
      return;
    }
    await Promise.all(recipients.map((r) => sendEmail({ to: r.to, locale: r.locale, template: "report_admin", data })));
  } catch (error) {
    console.error(`[reports] the founder email for report ${reportId} could not be sent:`, error);
  }
}

export async function sendReportConfirmation(reportId: string): Promise<void> {
  try {
    const report = await db.report.findUnique({ where: { id: reportId }, select: reportSelect });
    const reporter = report?.reporter;
    if (!report || !reporter) return;
    const to = notificationEmailFor(reporter);
    if (!to) return; // A phone-only account: the on-screen confirmation is all it gets.
    await sendEmail({
      to,
      locale: reporter.locale,
      template: "report_received",
      data: {
        name: reporter.firstName || reporter.name,
        bookingCode: report.booking?.code ?? null,
        listingTitle: report.listing?.title ?? null,
        happenedOn: dayOf(report.happenedOn),
        tripsUrl: report.booking ? tripPath(report.booking.code) : TRIPS_PATH,
      },
    });
  } catch (error) {
    console.error(`[reports] the confirmation for report ${reportId} could not be sent:`, error);
  }
}
