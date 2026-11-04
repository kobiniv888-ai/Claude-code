import "server-only";
import { siteConfig } from "@/config/site";
import type { AdminEmailData } from "@/lib/admin/email-templates";
import { db } from "@/lib/db";
import { sendEmail, type EmailData, type EmailTemplate } from "@/lib/email";
import { rateLimit } from "@/lib/rate-limit";
import { FOUNDER_OUTBOX_ADDRESS, founderAlertRecipients } from "./founder";

/**
 * Admin-panel emails to the founder (round 3, brief 9 "Notifications"), on top of the alert
 * emails in ./founder.ts and the report emails of src/lib/reports/notify.ts:
 *
 *   - notifyFounderListingInReview(): a listing entered the review queue. At most one email per
 *     listing every REVIEW_EMAIL_HOURS, and at most REVIEW_EMAILS_PER_HOUR in all (a burst is
 *     left for the queue and the daily summary). Demo listings never email.
 *   - sendFounderEmail(): the shared sender (also used by the daily summary).
 *
 * Recipients: ADMIN_ALERT_EMAIL (a PRIVATE setting, never in a file), else the real admin
 * accounts, else the admin outbox only. Without Resend everything stays in the outbox. Never throws.
 */

export const REVIEW_EMAIL_HOURS = 6;
export const REVIEW_EMAILS_PER_HOUR = 20;

/** Sends one founder email to every founder recipient (or keeps it in the outbox). True when at least one was accepted or logged. */
export async function sendFounderEmail<K extends EmailTemplate>(template: K, data: EmailData[K]): Promise<boolean> {
  try {
    const recipients = await founderAlertRecipients();
    if (recipients.length === 0) {
      const sent = await sendEmail({ to: FOUNDER_OUTBOX_ADDRESS, locale: siteConfig.i18n.primaryLocale, template, data, outboxOnly: true });
      return sent.ok;
    }
    const sent = await Promise.all(recipients.map((r) => sendEmail({ to: r.to, locale: r.locale, template, data })));
    return sent.some((s) => s.ok);
  } catch (error) {
    console.error(`[founder-admin] "${template}" could not be sent:`, error);
    return false;
  }
}

/**
 * A listing went to IN_REVIEW (submitForPublication, a re-check after an edit, unpause / renew).
 * `why` lists the review-rule reasons (src/lib/admin/review-rule.ts) or "recheck".
 */
export async function notifyFounderListingInReview(listingId: string, why: readonly string[]): Promise<void> {
  try {
    const listing = await db.listing.findUnique({
      where: { id: listingId },
      select: {
        id: true,
        publicId: true,
        title: true,
        isDemo: true,
        status: true,
        riskScore: true,
        riskReasons: true,
        owner: { select: { name: true, businessName: true, isDemo: true } },
      },
    });
    if (!listing || listing.isDemo || listing.owner.isDemo || listing.status !== "IN_REVIEW") return;
    const perListing = await rateLimit(`founder:review:${listing.id}`, { limit: 1, windowSeconds: REVIEW_EMAIL_HOURS * 3600 }).catch(() => ({ ok: true }));
    if (!perListing.ok) return;
    const overall = await rateLimit("founder:review:all", { limit: REVIEW_EMAILS_PER_HOUR, windowSeconds: 3600 }).catch(() => ({ ok: true }));
    if (!overall.ok) return;
    const data: AdminEmailData["admin_review_needed"] = {
      listingTitle: listing.title,
      listingPublicId: listing.publicId,
      hostName: listing.owner.businessName || listing.owner.name,
      why: [...why],
      riskScore: listing.riskScore,
      riskReasons: Array.isArray(listing.riskReasons) ? listing.riskReasons.length : 0,
      adminUrl: `/admin/moderation/${listing.id}`,
    };
    await sendFounderEmail("admin_review_needed", data);
  } catch (error) {
    console.error(`[founder-admin] review email for ${listingId} failed:`, error);
  }
}
