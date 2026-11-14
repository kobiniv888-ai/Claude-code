import "server-only";
import { db } from "@/lib/db";
import { getDeviceHash } from "@/lib/request";
import { recordSecurityEvent } from "./events";
import { SIGNUP_DEVICE_ACCOUNT_CAP, SIGNUP_DEVICE_EVENT, SIGNUP_DEVICE_WINDOW_DAYS, DEVICE_FLAG_REVIEWED_ACTION, overSignupDeviceCap } from "./signup-rules";

/**
 * Fake sign-ups (SECURITY_REPORT 3.8.b/c; founder's answers Q20 and 6 of 9 November 2026).
 *
 * - 3.8.b Accounts per device: when a new account is the (SIGNUP_DEVICE_ACCOUNT_CAP + 1)th or later
 *   account made on one device (the bayit_did cookie's DeviceLink) within SIGNUP_DEVICE_WINDOW_DAYS
 *   days, the sign-up is FLAGGED, NEVER BLOCKED: a "signup_device_cap" security event names the new
 *   account, and Admin → Flags → "Accounts on one device" lists it for review ("mark reviewed" is
 *   an audit entry, DEVICE_FLAG_REVIEWED_ACTION; a new event reopens the flag).
 * - 3.8.c Sign-up bursts: ALERT ONLY, never a block by address, at most one alert an hour, over
 *   20 sign-ups an hour site-wide or 5 from one connection (IP hash): the founder's security alerts
 *   (src/lib/security/alerts-rules.ts "signup_burst", /api/cron/security-alerts) count the new
 *   accounts and their first logins; nothing here refuses anything.
 *
 * Demo accounts never count. Best effort: a failure is logged and the sign-up goes on.
 */

export {
  DEVICE_FLAG_REVIEWED_ACTION,
  SIGNUP_DEVICE_ACCOUNT_CAP,
  SIGNUP_DEVICE_EVENT,
  SIGNUP_DEVICE_WINDOW_DAYS,
  overSignupDeviceCap,
} from "./signup-rules";

const DAY_MS = 24 * 3600 * 1000;

/**
 * After a sign-up (the new account's device is already linked): how many non-demo accounts made in
 * the last SIGNUP_DEVICE_WINDOW_DAYS days this device has signed in to, and the flag when over the cap.
 */
export async function checkSignupDevice(
  userId: string,
  opts: { deviceHash?: string | null; now?: Date } = {},
): Promise<{ accounts: number; flagged: boolean } | null> {
  try {
    const deviceHash = opts.deviceHash !== undefined ? opts.deviceHash : await getDeviceHash();
    if (!deviceHash) return null;
    const since = new Date((opts.now ?? new Date()).getTime() - SIGNUP_DEVICE_WINDOW_DAYS * DAY_MS);
    const accounts = await db.deviceLink.count({ where: { deviceHash, user: { createdAt: { gte: since }, isDemo: false } } });
    const flagged = overSignupDeviceCap(accounts);
    if (flagged) {
      await recordSecurityEvent({ type: "signup_device_cap", userId, meta: { accounts, windowDays: SIGNUP_DEVICE_WINDOW_DAYS, cap: SIGNUP_DEVICE_ACCOUNT_CAP } });
    }
    return { accounts, flagged };
  } catch (error) {
    console.error("[signup-guard] could not check the device:", (error as Error)?.message ?? error);
    return null;
  }
}

export type DeviceFlagRow = {
  id: string;
  name: string | null;
  firstName: string | null;
  status: string;
  createdAt: Date;
  /** The most accounts made on that device in the window, as the newest event counted them. */
  accounts: number;
  latestAt: Date;
  reviewedAt: Date | null;
  reviewedBy: string | null;
  open: boolean;
};

/** Enough for any realistic list (computed whole, then paged). */
const CANDIDATE_LIMIT = 2000;

async function deviceFlagRowsAll(userIds?: readonly string[]): Promise<DeviceFlagRow[]> {
  const events = await db.securityEvent.findMany({
    where: { type: SIGNUP_DEVICE_EVENT, userId: userIds ? { in: [...userIds] } : { not: null } },
    orderBy: { createdAt: "desc" },
    take: CANDIDATE_LIMIT,
    select: { userId: true, createdAt: true, meta: true },
  });
  const latest = new Map<string, { at: Date; accounts: number }>();
  for (const event of events) {
    if (!event.userId) continue;
    const accounts = Number((event.meta as { accounts?: unknown } | null)?.accounts) || 0;
    const seen = latest.get(event.userId);
    if (!seen) latest.set(event.userId, { at: event.createdAt, accounts });
    else seen.accounts = Math.max(seen.accounts, accounts);
  }
  const ids = [...latest.keys()];
  if (ids.length === 0) return [];
  const [users, reviews] = await Promise.all([
    db.user.findMany({ where: { id: { in: ids }, isDemo: false }, select: { id: true, name: true, firstName: true, status: true, createdAt: true } }),
    db.auditLog.findMany({
      where: { action: DEVICE_FLAG_REVIEWED_ACTION, targetType: "User", targetId: { in: ids } },
      orderBy: { createdAt: "desc" },
      select: { targetId: true, createdAt: true, actor: { select: { name: true } } },
    }),
  ]);
  const lastReview = new Map<string, { at: Date; by: string | null }>();
  for (const review of reviews) if (review.targetId && !lastReview.has(review.targetId)) lastReview.set(review.targetId, { at: review.createdAt, by: review.actor?.name ?? null });
  return users
    .map((user) => {
      const flag = latest.get(user.id)!;
      const review = lastReview.get(user.id) ?? null;
      return {
        ...user,
        accounts: flag.accounts,
        latestAt: flag.at,
        reviewedAt: review?.at ?? null,
        reviewedBy: review?.by ?? null,
        open: !review || review.at.getTime() < flag.at.getTime(),
      };
    })
    .sort((a, b) => b.latestAt.getTime() - a.latestAt.getTime());
}

/** Admin → Flags → "Accounts on one device": open (not reviewed since the newest event) or reviewed. */
export async function listDeviceFlags(state: "open" | "reviewed", page?: { limit: number; offset: number }): Promise<{ total: number; rows: DeviceFlagRow[] }> {
  const all = (await deviceFlagRowsAll()).filter((row) => (state === "open" ? row.open : !row.open));
  return { total: all.length, rows: page ? all.slice(page.offset, page.offset + page.limit) : all };
}

/** One account's device flag (the "mark reviewed" action checks it again), or null when it has none. */
export async function deviceFlagSummary(userId: string): Promise<DeviceFlagRow | null> {
  return (await deviceFlagRowsAll([userId]))[0] ?? null;
}
