import "server-only";
import { db } from "@/lib/db";

/**
 * "Already shown to this visitor today" markers for "Show contact" (SECURITY_REPORT 4.6.e), in the
 * RateLimit table (no schema change). Unlike a counter, a marker is only READ before the daily
 * caps are checked and only WRITTEN once they passed, so a call that is still being checked (or
 * was refused) never counts as "seen": parallel calls for a new listing each go through the caps
 * (contact-reveal-race-1). Never decremented or reset.
 */

/** Was `key` marked and not expired? null when the store could not be read (the caller fails closed). */
export async function wasSeen(key: string, now: Date = new Date()): Promise<boolean | null> {
  try {
    const rows = await db.$queryRaw<{ one: number }[]>`SELECT 1 AS one FROM "RateLimit" WHERE "key" = ${key} AND "resetAt" > ${now} LIMIT 1`;
    return rows.length > 0;
  } catch (error) {
    console.error("[contact] could not read the shown-today marker:", error);
    return null;
  }
}

/**
 * Marks `key` for `windowSeconds`, unless it is marked already (an older marker keeps its end, so
 * a day stays a day). A failed write is logged: the next view of the listing then simply costs
 * another unit of the daily cap (it errs on the safe side).
 */
export async function markSeen(key: string, windowSeconds: number, now: Date = new Date()): Promise<void> {
  const until = new Date(now.getTime() + Math.round(windowSeconds) * 1000);
  try {
    await db.$executeRaw`
      INSERT INTO "RateLimit" ("key", "count", "resetAt") VALUES (${key}, 1, ${until})
      ON CONFLICT ("key") DO UPDATE SET "count" = 1, "resetAt" = EXCLUDED."resetAt"
      WHERE "RateLimit"."resetAt" <= ${now}`;
  } catch (error) {
    console.error("[contact] could not write the shown-today marker:", error);
  }
}
