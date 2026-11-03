import "server-only";
import type { Prisma } from "@/generated/prisma/client";
import { codeDisplayForHeaders, codeDisplayMode, type CodeDisplayEnv } from "@/lib/auth/code-display";
import { verifiedPhoneOf } from "@/lib/auth/phone-once";
import { audit } from "@/lib/audit";
import { db } from "@/lib/db";
import { isEmailDeliveryConfigured, notificationEmailFor } from "@/lib/email";
import { sendAdminAlert } from "@/lib/email/admin-alert";
import { rateLimit } from "@/lib/rate-limit";
import { absoluteUrl } from "@/lib/site-url";
import { sendSms } from "@/lib/sms";
import { getTranslations } from "next-intl/server";
import { siteConfig } from "@/config/site";
import { isAppLocale } from "@/i18n/locale";
import {
  alertAccepted,
  bookingCodeIn,
  hostAlertChannels,
  instantBookingGate,
  parseAlertPrefs,
  withEmailFailing,
  type AlertAttempt,
  type AlertBlockReason,
  type AlertEnvironment,
  type EmailEvent,
  type FailingEmail,
  type HostAlertTarget,
  type InstantGate,
} from "./alert-rules";
import { BOOKABLE_DEAL_TYPES } from "./constants";
import { BookingError } from "./errors";
import { emailHostNewBooking, notifyGuestHostUnreached } from "./notify";

/**
 * Booking alerts on the server (round 3, founder's answer 4; the rules are in ./alert-rules.ts).
 *
 *   const env = alertEnvironment(await headers());          // where the code runs
 *   const gate = await hostInstantGate(listing.ownerId, env); // { ok } or { ok: false, reason }
 *
 * createBooking (./service.ts) checks the gate before its transaction, then alerts the host right
 * after it (confirmWithHostAlert): when no channel accepted the alert, the booking and its block
 * are removed again in a compensating transaction, "booking.host_unreachable" is audited, the
 * founder is told and the guest gets "host_unreachable" (the review page offers "שאלה למארח").
 * Bounces and spam complaints come back through the Resend webhook (handleEmailBounce).
 */

/** Where the code runs, for the email channel. Without headers: development counts, production not. */
export function alertEnvironment(requestHeaders?: Pick<Headers, "get"> | null): AlertEnvironment {
  const mode = requestHeaders ? codeDisplayForHeaders(requestHeaders) : codeDisplayMode(process.env as CodeDisplayEnv, []);
  return { resend: isEmailDeliveryConfigured(), outboxCounts: mode !== null };
}

/** What the alert rules read about a host. */
export const hostAlertSelect = {
  email: true,
  contactEmail: true,
  isDemo: true,
  notificationPrefs: true,
} as const satisfies Prisma.UserSelect;

export function hostAlertTarget(user: Prisma.UserGetPayload<{ select: typeof hostAlertSelect }>): HostAlertTarget {
  return { email: notificationEmailFor(user), isDemo: user.isDemo, prefs: user.notificationPrefs };
}

/** May this host take instant bookings here and now? */
export async function hostInstantGate(hostUserId: string, env: AlertEnvironment): Promise<InstantGate> {
  const host = await db.user.findUnique({ where: { id: hostUserId }, select: hostAlertSelect });
  if (!host) return { ok: false, reason: "no_channel" };
  return instantBookingGate(hostAlertChannels(hostAlertTarget(host), env));
}

export type HostAlertStatus = { ok: true } | { ok: false; reason: AlertBlockReason; address: string | null };

/** Why a host can't take instant bookings, with the paused address (the host's own view only). */
export async function hostAlertStatus(userId: string, requestHeaders: Pick<Headers, "get"> | null): Promise<HostAlertStatus> {
  const gate = await hostInstantGate(userId, alertEnvironment(requestHeaders));
  if (gate.ok) return { ok: true };
  const user = gate.reason === "email_failing" ? await db.user.findUnique({ where: { id: userId }, select: { email: true, contactEmail: true } }) : null;
  return { ok: false, reason: gate.reason, address: user ? notificationEmailFor(user) : null };
}

export type HostAlertResult = { accepted: boolean; attempts: AlertAttempt[]; reason: AlertBlockReason | "failed" | null };

/**
 * Sends the "new booking" alert on every ready channel of the host (email for now). Never throws.
 * Accepted: Resend returned an id, or (development / test mode, demo hosts) it is in the outbox.
 */
export async function alertHostNewBooking(bookingId: string, hostUserId: string, env: AlertEnvironment): Promise<HostAlertResult> {
  const host = await db.user.findUnique({ where: { id: hostUserId }, select: hostAlertSelect }).catch(() => null);
  if (!host) return { accepted: false, attempts: [], reason: "no_channel" };
  const channels = hostAlertChannels(hostAlertTarget(host), env);
  const gate = instantBookingGate(channels);
  const attempts: AlertAttempt[] = [];
  for (const channel of channels) {
    if (!channel.ready) continue;
    if (channel.channel === "email") {
      const outbox = channel.transport === "outbox";
      const sent = await emailHostNewBooking(bookingId, { outboxOnly: outbox && env.resend });
      const accepted = sent.delivery === "sent" || (outbox && sent.delivery === "logged");
      attempts.push({ channel: "email", accepted, providerId: sent.providerId ?? null, error: accepted ? null : sent.delivery });
    }
    // Telegram (bot API accepted the message) and browser notifications (never confirming) plug
    // in here once their tables are approved.
  }
  const accepted = alertAccepted(attempts);
  return { accepted, attempts, reason: accepted ? null : gate.ok ? "failed" : gate.reason };
}

/**
 * The compensating transaction: removes a booking whose host was never told, with its block.
 * Only while Booking.hostNotifiedAt is empty (a booking that was confirmed is never removed).
 */
export async function undoUnalertedBooking(bookingId: string): Promise<boolean> {
  return db.$transaction(async (tx) => {
    const booking = await tx.booking.findUnique({ where: { id: bookingId }, select: { hostNotifiedAt: true } });
    if (!booking || booking.hostNotifiedAt) return false;
    await tx.availabilityBlock.deleteMany({ where: { bookingId } });
    await tx.booking.delete({ where: { id: bookingId } });
    return true;
  });
}

/** One founder email per host per this many hours about the same unreachable host. */
const UNREACHABLE_ALERT_HOURS = 6;

type UnreachableContext = {
  guestUserId: string;
  hostUserId: string;
  listingId: string;
  listingTitle: string;
  listingPublicId: number;
  bookingCode: string | null;
  reason: AlertBlockReason | "failed";
  attempts?: AlertAttempt[];
  /** "before": the gate was closed already; "after": the booking was made, then undone. */
  stage: "before" | "after";
};

/** Audits a refused booking and tells the founder (at most every few hours per host). */
export async function reportHostUnreachable(ctx: UnreachableContext): Promise<void> {
  await audit({
    actorId: ctx.guestUserId,
    action: "booking.host_unreachable",
    targetType: "Listing",
    targetId: ctx.listingId,
    details: { stage: ctx.stage, reason: ctx.reason, bookingCode: ctx.bookingCode, hostUserId: ctx.hostUserId, attempts: ctx.attempts ?? [] },
  });
  const quota = await rateLimit(`alert:host-unreachable:${ctx.hostUserId}`, { limit: 1, windowSeconds: UNREACHABLE_ALERT_HOURS * 3600 }).catch(() => ({ ok: true }));
  if (!quota.ok) return;
  const host = await db.user.findUnique({ where: { id: ctx.hostUserId }, select: { name: true, firstName: true } }).catch(() => null);
  await sendAdminAlert({
    kind: "host_unreachable",
    reason: ctx.reason,
    bookingCode: ctx.bookingCode,
    listingTitle: ctx.listingTitle,
    listingPublicId: ctx.listingPublicId,
    hostName: host?.firstName || host?.name || null,
    adminUrl: "/admin/bookings",
  });
}

/**
 * Right after the booking transaction: alert the host, then either confirm the booking
 * (hostNotifiedAt) or undo it and throw BookingError("host_unreachable").
 */
export async function confirmWithHostAlert(
  created: { id: string; code: string },
  ctx: Omit<UnreachableContext, "bookingCode" | "reason" | "attempts" | "stage"> & { env: AlertEnvironment; now?: Date },
): Promise<void> {
  const result = await alertHostNewBooking(created.id, ctx.hostUserId, ctx.env);
  if (result.accepted) {
    await db.booking.update({ where: { id: created.id }, data: { hostNotifiedAt: ctx.now ?? new Date() } });
    return;
  }
  // Undo (one retry): the guest is told either way, and a booking left over is in the audit log.
  const undo = () => undoUnalertedBooking(created.id);
  await undo()
    .catch(undo)
    .catch((error) => console.error(`[booking] could not undo unalerted booking ${created.code}:`, error));
  await reportHostUnreachable({
    guestUserId: ctx.guestUserId,
    hostUserId: ctx.hostUserId,
    listingId: ctx.listingId,
    listingTitle: ctx.listingTitle,
    listingPublicId: ctx.listingPublicId,
    bookingCode: created.code,
    reason: result.reason ?? "failed",
    attempts: result.attempts,
    stage: "after",
  });
  throw new BookingError("host_unreachable");
}

// ─── Bounces (Resend webhook) ─────────────────────────────────

const userAlertSelect = {
  id: true,
  email: true,
  contactEmail: true,
  isDemo: true,
  notificationPrefs: true,
  locale: true,
  phoneNumber: true,
  phoneNumberVerified: true,
} as const satisfies Prisma.UserSelect;

async function usersWithAddress(addresses: string[]) {
  if (addresses.length === 0) return [];
  const users = await db.user.findMany({
    where: {
      deletedAt: null,
      OR: addresses.flatMap((address) => [
        { email: { equals: address, mode: "insensitive" as const } },
        { contactEmail: { equals: address, mode: "insensitive" as const } },
      ]),
    },
    select: userAlertSelect,
    take: 20,
  });
  // Only accounts whose notifications go to that address.
  return users.filter((user) => {
    const to = notificationEmailFor(user)?.toLowerCase();
    return !!to && addresses.includes(to);
  });
}

/** "Our emails bounce, instant booking is paused" to a host, by text (when Twilio is set up). */
async function textHostAlertsPaused(user: Prisma.UserGetPayload<{ select: typeof userAlertSelect }>): Promise<void> {
  const phone = verifiedPhoneOf(user);
  if (!phone) return;
  const locale = isAppLocale(user.locale) ? user.locale : siteConfig.i18n.primaryLocale;
  const t = await getTranslations({ locale, namespace: "emails" });
  const body = t("sms.host_alerts_paused", {
    brand: siteConfig.localizedName[locale] ?? siteConfig.name,
    url: absoluteUrl(`/${locale}/account/settings`),
  });
  await sendSms({ to: phone, body, logAs: "host_alerts_paused", logOnly: user.isDemo });
}

/**
 * A bounce or a spam complaint: mark the email channel of every account using that address as
 * failing (a host without another channel goes to "שאלה למארח"), tell the guest when it was a
 * host's "new booking" alert, tell the host by text, and tell the founder. Duplicate deliveries
 * of the same event are ignored. Returns what it did (for the webhook's response and tests).
 */
export async function handleEmailBounce(event: EmailEvent): Promise<{ duplicate: boolean; paused: string[]; bookingCode: string | null }> {
  const at = event.at ?? new Date();
  const kind = event.kind === "complained" ? "complained" : "bounced";
  const outbox = event.emailId ? await db.emailOutbox.findFirst({ where: { providerId: event.emailId } }) : null;
  if (outbox?.error && /^(bounced|complained):/.test(outbox.error)) return { duplicate: true, paused: [], bookingCode: null };
  if (outbox) {
    await db.emailOutbox.update({
      where: { id: outbox.id },
      data: { status: "FAILED", error: `${kind}: ${event.detail ?? ""}`.trim().slice(0, 1000) },
    });
  }

  const addresses = [...new Set([...event.to, outbox?.to ?? ""].map((a) => a.trim().toLowerCase()).filter(Boolean))];
  const users = await usersWithAddress(addresses);
  const failing = (address: string): FailingEmail => ({ address, reason: kind, since: at.toISOString() });
  const paused: string[] = [];
  for (const user of users) {
    const address = notificationEmailFor(user)!.toLowerCase();
    await db.user.update({
      where: { id: user.id },
      data: { notificationPrefs: withEmailFailing(user.notificationPrefs, failing(address)) as Prisma.InputJsonValue },
    });
    paused.push(user.id);
    await audit({
      actorId: null,
      action: `email.${kind}`,
      targetType: "User",
      targetId: user.id,
      details: { template: outbox?.template ?? event.tags.template ?? null, emailId: event.emailId },
    });
  }

  const template = outbox?.template ?? event.tags.template ?? null;
  const code = event.tags.booking ?? bookingCodeIn(outbox?.text) ?? null;
  const booking =
    template === "booking_new_host" && code
      ? await db.booking.findUnique({
          where: { code },
          select: { id: true, code: true, status: true, hostUserId: true, listing: { select: { title: true, publicId: true } }, host: { select: { name: true, firstName: true } } },
        })
      : null;

  // The host's "new booking" alert bounced: the guest should make sure the host expects them.
  if (booking && booking.status === "CONFIRMED") await notifyGuestHostUnreached(booking.id);

  // Tell the hosts by the channels they have left (a text; email is the one that bounced).
  const hostIds = new Set(
    (
      await db.listing.findMany({
        where: { ownerId: { in: users.map((u) => u.id) }, deletedAt: null, dealType: { in: [...BOOKABLE_DEAL_TYPES] } },
        select: { ownerId: true },
      })
    ).map((l) => l.ownerId),
  );
  await Promise.all(users.filter((u) => hostIds.has(u.id)).map((u) => textHostAlertsPaused(u).catch(() => undefined)));

  await sendAdminAlert(
    booking
      ? {
          kind: "host_alert_bounced",
          reason: kind,
          bookingCode: booking.code,
          listingTitle: booking.listing.title,
          listingPublicId: booking.listing.publicId,
          hostName: booking.host.firstName || booking.host.name || null,
          address: addresses[0] ?? null,
          template,
          adminUrl: "/admin/bookings",
        }
      : { kind: "email_bounced", reason: kind, address: addresses[0] ?? null, template, adminUrl: "/admin/outbox" },
  );
  return { duplicate: false, paused, bookingCode: booking?.code ?? null };
}

/**
 * A later email to a paused address was delivered: the channel works again. Only an email sent
 * after the failure counts (an old "delivered" event arriving late changes nothing).
 */
export async function handleEmailDelivered(event: EmailEvent): Promise<{ resumed: string[] }> {
  const outbox = event.emailId ? await db.emailOutbox.findFirst({ where: { providerId: event.emailId }, select: { createdAt: true, to: true } }) : null;
  if (!outbox) return { resumed: [] };
  const addresses = [...new Set([...event.to, outbox.to].map((a) => a.trim().toLowerCase()).filter(Boolean))];
  const resumed: string[] = [];
  for (const user of await usersWithAddress(addresses)) {
    const failing = parseAlertPrefs(user.notificationPrefs).email.failing;
    if (!failing || !addresses.includes(failing.address)) continue;
    if (failing.since && outbox.createdAt.getTime() <= Date.parse(failing.since)) continue;
    await db.user.update({
      where: { id: user.id },
      data: { notificationPrefs: withEmailFailing(user.notificationPrefs, null) as Prisma.InputJsonValue },
    });
    await audit({ actorId: null, action: "email.resumed", targetType: "User", targetId: user.id, details: { emailId: event.emailId } });
    resumed.push(user.id);
  }
  return { resumed };
}
