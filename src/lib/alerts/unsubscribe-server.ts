import "server-only";
import { db } from "@/lib/db";
import { parseNotificationPrefs, type NotificationPrefs } from "@/lib/account/settings-schema";
import type { UnsubscribeKind } from "./unsubscribe-token";

/**
 * The switches a signed unsubscribe link may change (src/lib/alerts/unsubscribe-token.ts), for
 * the unsubscribe page and its form action. Never exported from a "use server" file: only a
 * verified token may lead here.
 */

/** The User.notificationPrefs.email switch each kind of link turns off (or back on). */
export const UNSUBSCRIBE_SWITCH = {
  weekly_stats: "weeklyStats",
  // Round 3, brief 7.4: the daily saved-search email and the price-drop email (/account/alerts).
  saved_search: "savedSearches",
  price_drop: "priceDrops",
  // Round 3, brief 8.1: the review request after a stay (/account/reviews has the switch too).
  review_request: "reviewRequests",
} as const satisfies Record<UnsubscribeKind, keyof NotificationPrefs["email"]>;

/** Sets one User.notificationPrefs.email switch, keeping every other preference as it is. */
export async function setEmailSwitch(userId: string, key: keyof NotificationPrefs["email"], on: boolean): Promise<boolean> {
  const count = await db.$executeRaw`
    UPDATE "User" SET "notificationPrefs" = jsonb_set(
      (CASE WHEN jsonb_typeof("notificationPrefs") = 'object' THEN "notificationPrefs" ELSE '{}'::jsonb END)
        || jsonb_build_object('email',
             CASE WHEN jsonb_typeof("notificationPrefs" -> 'email') = 'object' THEN "notificationPrefs" -> 'email' ELSE '{}'::jsonb END),
      ARRAY['email', ${key}]::text[], to_jsonb(${on}::boolean), true)
    WHERE "id" = ${userId} AND "status" <> 'DELETED'`;
  return count > 0;
}

/** Whether one email switch is on for this account; null when the account is gone. */
export async function emailSwitchOn(userId: string, key: keyof NotificationPrefs["email"]): Promise<boolean | null> {
  const user = await db.user.findUnique({ where: { id: userId }, select: { status: true, notificationPrefs: true } });
  if (!user || user.status === "DELETED") return null;
  return parseNotificationPrefs(user.notificationPrefs).email[key];
}

/** Turns the email a signed link is for off (or back on). */
export function setUnsubscribeSwitch(userId: string, kind: UnsubscribeKind, on: boolean): Promise<boolean> {
  return setEmailSwitch(userId, UNSUBSCRIBE_SWITCH[kind], on);
}

/** Whether the email a signed link is for is on; null when the account is gone. */
export function unsubscribeSwitchOn(userId: string, kind: UnsubscribeKind): Promise<boolean | null> {
  return emailSwitchOn(userId, UNSUBSCRIBE_SWITCH[kind]);
}

/** Sets User.notificationPrefs.email.weeklyStats, keeping every other preference as it is. */
export function setWeeklyStatsEmail(userId: string, on: boolean): Promise<boolean> {
  return setEmailSwitch(userId, "weeklyStats", on);
}

/** Whether the weekly stats email is on for this account; null when the account is gone. */
export function weeklyStatsEmailOn(userId: string): Promise<boolean | null> {
  return emailSwitchOn(userId, "weeklyStats");
}
