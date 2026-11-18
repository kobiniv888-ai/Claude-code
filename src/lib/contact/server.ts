import "server-only";
import { db } from "@/lib/db";
import { publicListingWhere } from "@/lib/listing/where";
import { getSettings } from "@/lib/settings";

/**
 * Server helpers for contacting owners (server-only). Used by the contact and report actions
 * and by the owner profile page.
 */

/** True when either user has blocked the other. */
export async function isBlockedBetween(a: string, b: string): Promise<boolean> {
  if (!a || !b || a === b) return false;
  const row = await db.userBlock.findFirst({
    where: { OR: [{ blockerId: a, blockedId: b }, { blockerId: b, blockedId: a }] },
    select: { blockerId: true },
  });
  return !!row;
}

/** Did `blockerId` block `blockedId`? (for the Block / Unblock button). */
export async function hasBlocked(blockerId: string, blockedId: string): Promise<boolean> {
  if (!blockerId || !blockedId || blockerId === blockedId) return false;
  const row = await db.userBlock.findUnique({
    where: { blockerId_blockedId: { blockerId, blockedId } },
    select: { blockerId: true },
  });
  return !!row;
}

/** A public listing with what the contact actions need (contact values included — never send them as is). */
export async function findContactableListing(listingId: string) {
  const settings = await getSettings();
  return db.listing.findFirst({
    where: { AND: [{ id: listingId }, publicListingWhere({ demoVisible: settings.demoDataVisible })] },
    select: {
      id: true,
      publicId: true,
      title: true,
      ownerId: true,
      countryCode: true,
      contactMethods: true,
      owner: { select: { id: true, name: true, email: true, contactEmail: true, locale: true, businessName: true, accountType: true } },
    },
  });
}

/** Has this user already accepted the first-contact safety tip? */
export async function safetyTipSeen(userId: string | null | undefined): Promise<boolean> {
  if (!userId) return false;
  const row = await db.user.findUnique({ where: { id: userId }, select: { safetyTipSeenAt: true } });
  return !!row?.safetyTipSeenAt;
}
