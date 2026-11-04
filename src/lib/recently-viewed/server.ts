import "server-only";
import { db } from "@/lib/db";
import { mergeViewed, RECENTLY_VIEWED_FETCH, RECENTLY_VIEWED_KEEP, type ViewedItem } from "./core";

/**
 * The account copy of "נצפו לאחרונה" (table RecentlyViewed). Callers check the session; these
 * functions trust the user id they get.
 *
 *   await recordAccountView(user.id, listing.id);                 // a listing page view (write-through)
 *   await mergeDeviceViews(user.id, deviceItems);                  // after signing in
 *   const items = await getAccountViews(user.id);                  // the home page
 */

/** A view by a signed-in user: the row moves to the top, and the list keeps its newest 50. */
export async function recordAccountView(userId: string, listingId: string, now = new Date()): Promise<boolean> {
  const listing = await db.listing.findFirst({ where: { id: listingId, status: "LIVE" }, select: { id: true } });
  if (!listing) return false;
  await db.recentlyViewed.upsert({
    where: { userId_listingId: { userId, listingId } },
    create: { userId, listingId, viewedAt: now },
    update: { viewedAt: now },
  });
  await trimAccountViews(userId);
  return true;
}

/** Deletes everything after the newest RECENTLY_VIEWED_KEEP rows. */
async function trimAccountViews(userId: string): Promise<void> {
  const extra = await db.recentlyViewed.findMany({
    where: { userId },
    orderBy: [{ viewedAt: "desc" }, { id: "asc" }],
    skip: RECENTLY_VIEWED_KEEP,
    select: { id: true },
  });
  if (extra.length) await db.recentlyViewed.deleteMany({ where: { id: { in: extra.map((row) => row.id) } } });
}

/**
 * The account list as public IDs and view times, newest first. Only LIVE listings: the cards are
 * fetched with the full public rule later (demo data switch, owner status), which skips the rest.
 */
export async function getAccountViews(userId: string, limit = RECENTLY_VIEWED_FETCH): Promise<ViewedItem[]> {
  const rows = await db.recentlyViewed.findMany({
    where: { userId, listing: { status: "LIVE" } },
    orderBy: [{ viewedAt: "desc" }, { id: "asc" }],
    take: limit,
    select: { viewedAt: true, listing: { select: { publicId: true } } },
  });
  return rows.map((row) => ({ id: row.listing.publicId, at: row.viewedAt.getTime() }));
}

/**
 * Merges the device list into the account (after signing in): per listing the newest view wins,
 * the account keeps its newest 50, and the merged list comes back (newest first, `limit` items,
 * LIVE listings only). Idempotent: the same device list merged twice changes nothing.
 */
export async function mergeDeviceViews(
  userId: string,
  device: readonly ViewedItem[],
  { now = Date.now(), limit = RECENTLY_VIEWED_FETCH }: { now?: number; limit?: number } = {},
): Promise<ViewedItem[]> {
  const deviceIds = [...new Set(device.map((item) => item.id))].slice(0, RECENTLY_VIEWED_KEEP);
  const [listings, accountRows] = await Promise.all([
    deviceIds.length
      ? db.listing.findMany({ where: { publicId: { in: deviceIds } }, select: { id: true, publicId: true } })
      : Promise.resolve([]),
    db.recentlyViewed.findMany({
      where: { userId },
      orderBy: [{ viewedAt: "desc" }, { id: "asc" }],
      take: RECENTLY_VIEWED_KEEP,
      select: { viewedAt: true, listing: { select: { id: true, publicId: true } } },
    }),
  ]);

  const listingIdOf = new Map<number, string>(listings.map((l) => [l.publicId, l.id]));
  for (const row of accountRows) listingIdOf.set(row.listing.publicId, row.listing.id);
  const account: ViewedItem[] = accountRows.map((row) => ({ id: row.listing.publicId, at: row.viewedAt.getTime() }));
  const accountAt = new Map(account.map((item) => [item.id, item.at]));
  // Listings that no longer exist are dropped here (no row to point to).
  const fromDevice = device.filter((item) => listingIdOf.has(item.id));
  const merged = mergeViewed([fromDevice, account], now, RECENTLY_VIEWED_KEEP);

  const changed = merged.filter((item) => accountAt.get(item.id) !== item.at);
  if (changed.length) {
    await db.$transaction(
      changed.map((item) => {
        const listingId = listingIdOf.get(item.id)!;
        const viewedAt = new Date(item.at);
        return db.recentlyViewed.upsert({
          where: { userId_listingId: { userId, listingId } },
          create: { userId, listingId, viewedAt },
          update: { viewedAt },
        });
      }),
    );
    await trimAccountViews(userId);
  }
  return getAccountViews(userId, limit);
}

/** "ניקוי": the whole account list. */
export async function clearAccountViews(userId: string): Promise<number> {
  const { count } = await db.recentlyViewed.deleteMany({ where: { userId } });
  return count;
}
