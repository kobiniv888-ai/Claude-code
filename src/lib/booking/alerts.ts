import "server-only";
import type { Prisma } from "@/generated/prisma/client";
import { audit } from "@/lib/audit";
import { db } from "@/lib/db";
import { notificationEmailFor } from "@/lib/email";
import { personName } from "@/lib/auth/first-name";
import { sendFounderAlert } from "@/lib/alerts/founder";
import { setEmailSwitch, setWeeklyStatsEmail } from "@/lib/alerts/unsubscribe-server";
import { hmacHash } from "@/lib/crypto";
import {
  alertEnvironment,
  alertHost,
  clearChannelFailure,
  hostAlertTarget,
  hostInstantGate,
  loadAlertHost,
  reportChannelFailure,
} from "@/lib/alerts/host";
import {
  alertAccepted,
  bookingAffectedByFailure,
  bookingCodeIn,
  currentFailure,
  hostAlertChannels,
  instantBookingGate,
  notifiedVia,
  parseAlertPrefs,
  resumesFailure,
  type AlertAttempt,
  type AlertBlockReason,
  type AlertEnvironment,
  type ChannelStatus,
  type EmailEvent,
} from "@/lib/alerts/rules";
import { rateLimit } from "@/lib/rate-limit";
import { BookingError } from "./errors";
import { emailHostCancelledByGuest, notifyBookingCancelled, notifyBookingConfirmed, notifyGuestHostUnreached, textHost } from "./notify";

/**
 * Booking alerts on the booking side (round 3, founder's answer 4; channels and rules are in
 * src/lib/alerts).
 *
 *   const env = alertEnvironment(await headers());          // where the code runs
 *   const gate = await hostInstantGate(listing.ownerId, env); // { ok } or { ok: false, reason }
 *
 * createBooking (./service.ts) checks the gate before its transaction, then alerts the host right
 * after it on the CONFIRMING channels (email, Telegram; confirmWithHostAlert): when none accepted
 * the alert, the booking and its block are removed again in a compensating transaction,
 * "booking.host_unreachable" is audited, the founder is told and the guest gets "host_unreachable"
 * (the review page offers "שאלה למארח"). Otherwise Booking.hostNotifiedAt / hostNotifiedVia are
 * recorded and the guest's confirmation and the host's browser notification follow
 * (afterBookingConfirmed). A guest's cancellation reaches the host the same way (no undo).
 * Bounces and spam complaints come back through the Resend webhook (handleEmailBounce).
 */

export { alertEnvironment, hostInstantGate };

export type HostAlertStatus =
  | { ok: true; channels: ChannelStatus["channel"][] }
  | {
      ok: false;
      reason: AlertBlockReason;
      /** The paused address (email_failing), for the host's own view only. */
      address: string | null;
      /** The site's Telegram bot is set up (the notice can suggest connecting it). */
      telegram: boolean;
    };

/** Why a host can't take instant bookings, with the paused address (the host's own view only). */
export async function hostAlertStatus(userId: string, requestHeaders: Pick<Headers, "get"> | null): Promise<HostAlertStatus> {
  const env = alertEnvironment(requestHeaders);
  const host = await loadAlertHost(userId);
  if (!host) return { ok: false, reason: "no_channel", address: null, telegram: env.telegram };
  const target = hostAlertTarget(host);
  const gate = instantBookingGate(hostAlertChannels(target, env));
  if (gate.ok) return { ok: true, channels: gate.channels };
  return { ok: false, reason: gate.reason, address: gate.reason === "email_failing" ? target.email : null, telegram: env.telegram };
}

export type HostAlertResult = { accepted: boolean; attempts: AlertAttempt[]; reason: AlertBlockReason | "failed" | null };

/**
 * The "new booking" alert on the host's CONFIRMING channels (email and Telegram, together).
 * Never throws. Browser notifications follow only once the booking stands.
 */
export async function alertHostNewBooking(bookingId: string, hostUserId: string, env: AlertEnvironment): Promise<HostAlertResult> {
  const host = await loadAlertHost(hostUserId);
  if (!host) return { accepted: false, attempts: [], reason: "no_channel" };
  const gate = instantBookingGate(hostAlertChannels(hostAlertTarget(host), env));
  const attempts = await alertHost(host, { kind: "new_booking", bookingId }, env, { channels: ["email", "telegram"] });
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
    details: {
      stage: ctx.stage,
      reason: ctx.reason,
      bookingCode: ctx.bookingCode,
      hostUserId: ctx.hostUserId,
      attempts: (ctx.attempts ?? []).map((a) => ({ channel: a.channel, accepted: a.accepted, error: a.error ?? null })),
    },
  });
  const quota = await rateLimit(`alert:host-unreachable:${ctx.hostUserId}`, { limit: 1, windowSeconds: UNREACHABLE_ALERT_HOURS * 3600 }).catch(() => ({ ok: true }));
  if (!quota.ok) return;
  const host = await db.user.findUnique({ where: { id: ctx.hostUserId }, select: { name: true, firstName: true } }).catch(() => null);
  await sendFounderAlert({
    kind: "host_unreachable",
    reason: ctx.reason,
    bookingCode: ctx.bookingCode,
    listingTitle: ctx.listingTitle,
    listingPublicId: ctx.listingPublicId,
    hostName: host ? personName(host) : null,
    adminUrl: "/admin/bookings",
  });
}

/**
 * Right after the booking transaction: alert the host, then either confirm the booking
 * (hostNotifiedAt + hostNotifiedVia) or undo it and throw BookingError("host_unreachable").
 */
export async function confirmWithHostAlert(
  created: { id: string; code: string },
  ctx: Omit<UnreachableContext, "bookingCode" | "reason" | "attempts" | "stage"> & { env: AlertEnvironment; now?: Date },
): Promise<void> {
  const result = await alertHostNewBooking(created.id, ctx.hostUserId, ctx.env);
  if (result.accepted) {
    await db.booking.update({
      where: { id: created.id },
      data: { hostNotifiedAt: ctx.now ?? new Date(), hostNotifiedVia: notifiedVia(result.attempts) },
    });
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

/**
 * Once the booking stands: the guest's confirmation (email + text, ./notify.ts) and the host's
 * browser notification (an extra: never what confirmed the booking). Never throws.
 */
export async function afterBookingConfirmed(bookingId: string, now: Date = new Date(), env: AlertEnvironment = alertEnvironment()): Promise<void> {
  await notifyBookingConfirmed(bookingId, now);
  try {
    const booking = await db.booking.findUnique({ where: { id: bookingId }, select: { hostUserId: true, hostNotifiedAt: true, status: true } });
    if (!booking?.hostNotifiedAt || booking.status !== "CONFIRMED") return;
    const host = await loadAlertHost(booking.hostUserId);
    if (host) await alertHost(host, { kind: "new_booking", bookingId }, env, { channels: ["push"] });
  } catch (error) {
    console.error(`[booking] host notification for ${bookingId} failed:`, error);
  }
}

/**
 * A cancelled booking: the other side hears about it. A guest's cancellation reaches the host on
 * every channel they chose (email, Telegram, notifications; no undo) plus a text; when none of
 * them took it, the email goes out anyway as a fallback. A host's cancellation: the guest's
 * email and text (./notify.ts). Never throws.
 */
export async function notifyCancellation(bookingId: string, env?: AlertEnvironment): Promise<void> {
  try {
    const booking = await db.booking.findUnique({ where: { id: bookingId }, select: { status: true, hostUserId: true } });
    if (!booking) return;
    if (booking.status !== "CANCELLED_BY_GUEST") {
      await notifyBookingCancelled(bookingId);
      return;
    }
    const host = await loadAlertHost(booking.hostUserId);
    if (!host) return;
    // Without Resend the email lands in the outbox, which is what a cancellation needs (no undo).
    const environment = { ...(env ?? alertEnvironment()), outboxCounts: true };
    const attempts = await alertHost(host, { kind: "cancelled", bookingId }, environment);
    const emailTried = attempts.some((a) => a.channel === "email");
    if (!emailTried && !attempts.some((a) => a.accepted)) {
      // Every channel is off or broken: the email is the last resort (unless that address bounces).
      const target = hostAlertTarget(host);
      if (target.email && !currentFailure(parseAlertPrefs(host.notificationPrefs), "email", target)) {
        await emailHostCancelledByGuest(bookingId);
      }
    }
    await textHost(bookingId, "booking_cancelled_by_guest");
  } catch (error) {
    console.error(`[booking] cancellation alert for ${bookingId} failed:`, error);
  }
}

// ─── Bounces (Resend webhook) ─────────────────────────────────

const userAlertSelect = {
  id: true,
  email: true,
  contactEmail: true,
  isDemo: true,
  notificationPrefs: true,
  locale: true,
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

/**
 * A bounce or a spam complaint: pause the email channel of every account using that address (a
 * host keeps taking instant bookings while Telegram works; with only notifications left, the
 * listing goes to "שאלה למארח"), tell those hosts on every channel they have left, tell the guest
 * when it was a host's "new booking" alert that no other channel delivered, and tell the founder.
 * Duplicate deliveries of the same event are ignored. Returns what it did (for the webhook's
 * response and tests).
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
  const template = outbox?.template ?? event.tags.template ?? null;
  const paused: string[] = [];
  let newlyPaused = false;
  for (const user of users) {
    const address = notificationEmailFor(user)!.toLowerCase();
    await audit({
      actorId: null,
      action: `email.${kind}`,
      targetType: "User",
      targetId: user.id,
      details: { template, emailId: event.emailId },
    });
    // Paused now (or already, by an earlier bounce of the same address).
    const failure = await reportChannelFailure({ userId: user.id, channel: "email", reason: kind, address, at, tellFounder: false });
    if (failure.changed) newlyPaused = true;
    paused.push(user.id);
    // A bounce or complaint about the weekly digest switches the digest off too (the bulk email
    // must not keep going to an address that refuses it).
    if (template === "weekly_host_stats") {
      await setWeeklyStatsEmail(user.id, false).catch((error: unknown) => console.error("[alerts] could not switch the weekly digest off:", error));
    }
    // The same for the saved-search and price-drop emails (round 3, brief 7.4).
    if (template === "saved_search_matches" || template === "price_drop") {
      await setEmailSwitch(user.id, template === "price_drop" ? "priceDrops" : "savedSearches", false).catch((error: unknown) =>
        console.error(`[alerts] could not switch the ${template} email off:`, error),
      );
    }
  }

  const code = event.tags.booking ?? bookingCodeIn(outbox?.text) ?? null;
  const booking =
    template === "booking_new_host" && code
      ? await db.booking.findUnique({
          where: { code },
          select: {
            id: true,
            code: true,
            status: true,
            hostNotifiedVia: true,
            listing: { select: { title: true, publicId: true } },
            host: { select: { name: true, firstName: true } },
          },
        })
      : null;

  // The host's "new booking" alert bounced and no other channel delivered it: the guest should
  // make sure the host expects them (email, and a text when Twilio is set up). The booking stands.
  const affected = booking && booking.status === "CONFIRMED" && bookingAffectedByFailure(booking.hostNotifiedVia, "email") ? booking : null;
  if (affected) await notifyGuestHostUnreached(affected.id);

  // The founder hears once per address: when it was paused now, or matched no account (then at
  // most once a week). A later bounce to an address already paused tells nobody again.
  const firstAddress = addresses[0] ?? "";
  const tellFounder =
    !!affected ||
    newlyPaused ||
    (users.length === 0 &&
      (await rateLimit(`alert:email-bounced:${hmacHash(firstAddress)}`, { limit: 1, windowSeconds: 7 * 24 * 3600 }).catch(() => ({ ok: true }))).ok);
  if (!tellFounder) return { duplicate: false, paused, bookingCode: booking?.code ?? null };

  await sendFounderAlert(
    affected
      ? {
          kind: "host_alert_bounced",
          reason: kind,
          bookingCode: affected.code,
          listingTitle: affected.listing.title,
          listingPublicId: affected.listing.publicId,
          hostName: personName(affected.host),
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
    const address = notificationEmailFor(user)?.toLowerCase() ?? null;
    if (!resumesFailure(failing, { channel: "email", sentAt: outbox.createdAt, address })) continue;
    if (await clearChannelFailure(user.id, "email", "delivered")) resumed.push(user.id);
  }
  return { resumed };
}

