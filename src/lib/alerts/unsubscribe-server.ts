import "server-only";
import { db } from "@/lib/db";
import { parseNotificationPrefs } from "@/lib/account/settings-schema";

/**
 * The switches a signed unsubscribe link may change (src/lib/alerts/unsubscribe-token.ts), for
 * the unsubscribe page and its form action. Never exported from a "use server" file: only a
 * verified token may lead here.
 */

/** Sets User.notificationPrefs.email.weeklyStats, keeping every other preference as it is. */
export async function setWeeklyStatsEmail(userId: string, on: boolean): Promise<boolean> {
  const count = await db.$executeRaw`
    UPDATE "User" SET "notificationPrefs" = jsonb_set(
      (CASE WHEN jsonb_typeof("notificationPrefs") = 'object' THEN "notificationPrefs" ELSE '{}'::jsonb END)
        || jsonb_build_object('email',
             CASE WHEN jsonb_typeof("notificationPrefs" -> 'email') = 'object' THEN "notificationPrefs" -> 'email' ELSE '{}'::jsonb END),
      '{email,weeklyStats}', to_jsonb(${on}::boolean), true)
    WHERE "id" = ${userId} AND "status" <> 'DELETED'`;
  return count > 0;
}

/** Whether the weekly stats email is on for this account; null when the account is gone. */
export async function weeklyStatsEmailOn(userId: string): Promise<boolean | null> {
  const user = await db.user.findUnique({ where: { id: userId }, select: { status: true, notificationPrefs: true } });
  if (!user || user.status === "DELETED") return null;
  return parseNotificationPrefs(user.notificationPrefs).email.weeklyStats;
}
