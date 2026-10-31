import "server-only";
import { Prisma } from "@/generated/prisma/client";
import { db } from "@/lib/db";
import { isOwnPrivateUpload } from "@/lib/media";
import { deletePrivate, deletePublic } from "@/lib/storage";
import { deletedEmailFor, ownAvatarKey } from "./settings-schema";

/** Name shown for a deleted account wherever it still appears (old tickets, reports). */
export const DELETED_USER_NAME = "Deleted user";

function documentKeys(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return value.flatMap((item) => {
    const key = item && typeof item === "object" ? (item as { key?: unknown }).key : null;
    return typeof key === "string" && key ? [key] : [];
  });
}

async function removeFiles(keys: string[], remove: (key: string) => Promise<void>): Promise<void> {
  const results = await Promise.allSettled(keys.map((key) => remove(key)));
  for (const result of results) {
    if (result.status === "rejected") console.error("[account] could not delete a file:", result.reason);
  }
}

/**
 * Removes a user's personal data and anonymizes the account (server-only, no session checks —
 * the caller is the user's own "Delete my account" action):
 *  - every listing → DELETED (soft) with its contact details cleared;
 *  - favorites (save counters adjusted), sessions, social/password accounts, device links,
 *    blocks are deleted;
 *  - verification documents and the user's ticket attachments are deleted from private storage
 *    (decided requests keep only their status; undecided ones are removed);
 *  - the user row becomes "Deleted user" with a placeholder email, no phone, bio or photo,
 *    status DELETED and deletedAt now.
 */
export async function deleteAccountData(userId: string): Promise<void> {
  const now = new Date();
  const user = await db.user.findUniqueOrThrow({ where: { id: userId }, select: { id: true, image: true } });

  const [requests, ticketMessages, favorites] = await Promise.all([
    db.verificationRequest.findMany({
      where: { userId, documentsDeletedAt: null },
      select: { id: true, status: true, documents: true },
    }),
    db.ticketMessage.findMany({
      where: { authorId: userId, fromStaff: false, NOT: { attachments: { equals: Prisma.DbNull } } },
      select: { id: true, attachments: true },
    }),
    db.favorite.findMany({ where: { userId }, select: { listingId: true } }),
  ]);

  const verificationKeys = requests
    .flatMap((r) => documentKeys(r.documents))
    .filter((key) => isOwnPrivateUpload(key, userId, "verification"));
  const ticketKeys = ticketMessages
    .flatMap((m) => documentKeys(m.attachments))
    .filter((key) => isOwnPrivateUpload(key, userId, "ticket"));
  const undecided = requests.filter((r) => r.status === "PENDING" || r.status === "NEEDS_MORE_INFO").map((r) => r.id);
  const decided = requests.filter((r) => !undecided.includes(r.id)).map((r) => r.id);
  const favoriteListingIds = favorites.map((f) => f.listingId);

  await db.$transaction([
    db.listing.updateMany({
      where: { ownerId: userId, status: { not: "DELETED" } },
      data: { status: "DELETED", deletedAt: now },
    }),
    db.listing.updateMany({ where: { ownerId: userId }, data: { contactMethods: Prisma.DbNull } }),
    db.listing.updateMany({
      where: { id: { in: favoriteListingIds }, saveCount: { gt: 0 } },
      data: { saveCount: { decrement: 1 } },
    }),
    db.favorite.deleteMany({ where: { userId } }),
    db.session.deleteMany({ where: { userId } }),
    db.account.deleteMany({ where: { userId } }),
    db.deviceLink.deleteMany({ where: { userId } }),
    db.userBlock.deleteMany({ where: { OR: [{ blockerId: userId }, { blockedId: userId }] } }),
    db.verificationRequest.deleteMany({ where: { id: { in: undecided } } }),
    db.verificationRequest.updateMany({
      where: { id: { in: decided } },
      data: { documents: [], documentsDeletedAt: now, userNote: null },
    }),
    db.ticketMessage.updateMany({
      where: { id: { in: ticketMessages.map((m) => m.id) } },
      data: { attachments: Prisma.DbNull },
    }),
    db.user.update({
      where: { id: userId },
      data: {
        name: DELETED_USER_NAME,
        email: deletedEmailFor(userId),
        emailVerified: false,
        contactEmail: null,
        phoneNumber: null,
        phoneNumberVerified: false,
        image: null,
        bio: null,
        businessName: null,
        spokenLanguages: [],
        notificationPrefs: Prisma.DbNull,
        twoFactorEnabled: false,
        totpSecret: null,
        status: "DELETED",
        statusReason: null,
        deletedAt: now,
      },
    }),
  ]);

  // Files go after the database changes, so a storage hiccup never leaves a half-deleted account.
  await removeFiles([...verificationKeys, ...ticketKeys], deletePrivate);
  const avatarKey = ownAvatarKey(user.image, userId);
  if (avatarKey) await removeFiles([avatarKey], deletePublic);
}
