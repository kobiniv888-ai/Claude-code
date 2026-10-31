import "server-only";
import type { CurrentUser } from "@/lib/auth/session";
import { audit } from "@/lib/audit";
import { db } from "@/lib/db";
import { notificationEmailFor, sendEmail } from "@/lib/email";
import type { UserActionReason } from "../reasons";
import { AdminActionError, assertCanManage, localeOf, userReasonText } from "./common";

/**
 * Account enforcement shared by the user page and the reports page (server-only). Callers have
 * already checked the staff permission (runStaffAction). Every change is audited and the user is
 * emailed in THEIR language.
 */

const targetSelect = {
  id: true,
  name: true,
  email: true,
  contactEmail: true,
  role: true,
  status: true,
  locale: true,
} as const;

async function loadTarget(userId: string) {
  const user = await db.user.findUnique({ where: { id: userId }, select: targetSelect });
  if (!user) throw new AdminActionError("user_not_found", 404);
  if (user.status === "DELETED") throw new AdminActionError("invalid_status");
  return user;
}

type Context = { reportId?: string };

export async function revokeSessions(userId: string): Promise<number> {
  const { count } = await db.session.deleteMany({ where: { userId } });
  return count;
}

export async function warnUser(
  staff: CurrentUser,
  userId: string,
  reason: UserActionReason,
  note: string | null,
  context: Context = {},
): Promise<void> {
  const user = await loadTarget(userId);
  assertCanManage(staff, user);
  if (user.status === "BANNED" || user.status === "SUSPENDED") throw new AdminActionError("account_blocked");

  const locale = localeOf(user.locale);
  const text = await userReasonText(reason, locale, note);
  await db.user.update({ where: { id: user.id }, data: { status: "WARNED", statusReason: reason } });
  await audit({
    actorId: staff.id,
    action: "user.warn",
    targetType: "User",
    targetId: user.id,
    details: { from: user.status, reason, note, ...context },
  });
  const to = notificationEmailFor(user);
  if (to) {
    await sendEmail({
      to,
      template: "account_warning",
      locale,
      data: { name: user.name, reasonText: text.note ? `${text.reasonText}\n\n${text.note}` : text.reasonText },
    });
  }
}

export async function suspendUser(
  staff: CurrentUser,
  userId: string,
  reason: UserActionReason,
  note: string | null,
  until: Date,
): Promise<{ sessionsRevoked: number }> {
  const user = await loadTarget(userId);
  assertCanManage(staff, user);
  if (until.getTime() <= Date.now()) throw new AdminActionError("invalid_date", 400);

  const locale = localeOf(user.locale);
  const text = await userReasonText(reason, locale, note);
  await db.user.update({
    where: { id: user.id },
    data: { status: "SUSPENDED", statusReason: reason, suspendedUntil: until },
  });
  const sessionsRevoked = await revokeSessions(user.id);
  await audit({
    actorId: staff.id,
    action: "user.suspend",
    targetType: "User",
    targetId: user.id,
    details: { from: user.status, reason, note, until, sessionsRevoked },
  });
  const to = notificationEmailFor(user);
  if (to) {
    await sendEmail({
      to,
      template: "account_suspended",
      locale,
      data: {
        name: user.name,
        reasonText: text.note ? `${text.reasonText}\n\n${text.note}` : text.reasonText,
        until,
      },
    });
  }
  return { sessionsRevoked };
}

/** Bans the account, signs it out everywhere and takes its live listings off the site (PAUSED). */
export async function banUser(
  staff: CurrentUser,
  userId: string,
  reason: UserActionReason,
  note: string | null,
): Promise<{ sessionsRevoked: number; listingsPaused: number }> {
  const user = await loadTarget(userId);
  assertCanManage(staff, user);
  if (user.status === "BANNED") throw new AdminActionError("invalid_status");

  const locale = localeOf(user.locale);
  const text = await userReasonText(reason, locale, note);
  const live = await db.listing.findMany({
    where: { ownerId: user.id, status: { in: ["LIVE", "HIDDEN"] } },
    select: { id: true, publicId: true },
  });
  await db.$transaction([
    db.user.update({ where: { id: user.id }, data: { status: "BANNED", statusReason: reason, suspendedUntil: null } }),
    db.listing.updateMany({
      where: { id: { in: live.map((l) => l.id) }, status: { in: ["LIVE", "HIDDEN"] } },
      data: { status: "PAUSED" },
    }),
  ]);
  const sessionsRevoked = await revokeSessions(user.id);
  await audit({
    actorId: staff.id,
    action: "user.ban",
    targetType: "User",
    targetId: user.id,
    details: { from: user.status, reason, note, sessionsRevoked, pausedListings: live.map((l) => l.publicId) },
  });
  const to = notificationEmailFor(user);
  if (to) {
    await sendEmail({
      to,
      template: "account_suspended",
      locale,
      data: { name: user.name, reasonText: text.note ? `${text.reasonText}\n\n${text.note}` : text.reasonText, until: null },
    });
  }
  return { sessionsRevoked, listingsPaused: live.length };
}

/** Lifts a warning, suspension or ban. Paused listings stay paused: the owner turns them back on. */
export async function reactivateUser(staff: CurrentUser, userId: string, note: string | null): Promise<void> {
  const user = await loadTarget(userId);
  assertCanManage(staff, user);
  if (user.status === "ACTIVE") throw new AdminActionError("invalid_status");
  await db.user.update({ where: { id: user.id }, data: { status: "ACTIVE", statusReason: null, suspendedUntil: null } });
  await audit({
    actorId: staff.id,
    action: user.status === "BANNED" ? "user.unban" : "user.reactivate",
    targetType: "User",
    targetId: user.id,
    details: { from: user.status, note },
  });
}
