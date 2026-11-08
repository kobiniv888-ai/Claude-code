import "server-only";
import { Prisma } from "@/generated/prisma/client";
import { releaseBookingsOfDeletedAccount } from "@/lib/booking/service";
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
 *  - first, upcoming bookings (as guest or host) are cancelled and the other side is told, while
 *    the names and contact details those messages need still exist; the guest snapshot on the
 *    user's bookings is cleared (releaseBookingsOfDeletedAccount, docs/redesign-2/booking.md);
 *  - every listing → DELETED (soft) with its contact details, exact address/map point, cadastral
 *    code, kosher certificate photo and calendar imports cleared;
 *  - favorites (save counters adjusted), saved lists (with their share links) and saved searches,
 *    recently viewed places, sessions, social/password accounts, device links, push-notification
 *    subscriptions (endpoint, keys, device hint), 2-step recovery codes, Terms acceptances and
 *    blocks are deleted (the user row is only anonymized, so its onDelete: Cascade never fires:
 *    every table goes here by hand); security events lose their link to the account (userId null);
 *  - verification documents and the user's ticket attachments are deleted from private storage
 *    (decided requests keep only their status; undecided ones are removed);
 *  - the user row becomes "Deleted user" with a placeholder email, no phone, bio or photo,
 *    status DELETED and deletedAt now.
 * Reviews the user wrote stay (founder's answer 6: final once posted); they show as "אורח" once
 * the account is DELETED (reviewerFirstName, src/lib/reviews/rules.ts).
 */
export async function deleteAccountData(userId: string): Promise<void> {
  const now = new Date();
  const user = await db.user.findUniqueOrThrow({ where: { id: userId }, select: { id: true, image: true } });
  // Before anything is anonymized: the guests/hosts of upcoming stays must hear about it.
  await releaseBookingsOfDeletedAccount(userId, now);

  const [requests, ticketMessages, favorites, kosherCerts] = await Promise.all([
    db.verificationRequest.findMany({
      where: { userId, documentsDeletedAt: null },
      select: { id: true, status: true, documents: true },
    }),
    db.ticketMessage.findMany({
      where: { authorId: userId, fromStaff: false, NOT: { attachments: { equals: Prisma.DbNull } } },
      select: { id: true, attachments: true },
    }),
    db.favorite.findMany({ where: { userId }, select: { listingId: true } }),
    db.listing.findMany({ where: { ownerId: userId, kosherCertPhotoKey: { not: null } }, select: { kosherCertPhotoKey: true } }),
  ]);

  const verificationKeys = requests
    .flatMap((r) => documentKeys(r.documents))
    .filter((key) => isOwnPrivateUpload(key, userId, "verification"));
  const ticketKeys = ticketMessages
    .flatMap((m) => documentKeys(m.attachments))
    .filter((key) => isOwnPrivateUpload(key, userId, "ticket"));
  // Kosher certificate photos are private "verification" uploads kept on the listing.
  const kosherCertKeys = kosherCerts
    .map((l) => l.kosherCertPhotoKey)
    .filter((key): key is string => isOwnPrivateUpload(key, userId, "verification"));
  const undecided = requests.filter((r) => r.status === "PENDING" || r.status === "NEEDS_MORE_INFO").map((r) => r.id);
  const decided = requests.filter((r) => !undecided.includes(r.id)).map((r) => r.id);
  const favoriteListingIds = favorites.map((f) => f.listingId);

  await db.$transaction([
    db.listing.updateMany({
      where: { ownerId: userId, status: { not: "DELETED" } },
      data: { status: "DELETED", deletedAt: now },
    }),
    // The exact place and private details go too; only the public, approximate point stays.
    db.listing.updateMany({
      where: { ownerId: userId },
      data: {
        contactMethods: Prisma.DbNull,
        address: null,
        lat: null,
        lng: null,
        cadastralCode: null,
        kosherCertPhotoKey: null,
        icalImportUrls: [],
      },
    }),
    db.listing.updateMany({
      where: { id: { in: favoriteListingIds }, saveCount: { gt: 0 } },
      data: { saveCount: { decrement: 1 } },
    }),
    db.favorite.deleteMany({ where: { userId } }),
    // After the favorites, so Favorite.listId's SetNull has nothing left to touch.
    db.savedSearch.deleteMany({ where: { userId } }),
    db.savedList.deleteMany({ where: { userId } }),
    db.recentlyViewed.deleteMany({ where: { userId } }),
    db.session.deleteMany({ where: { userId } }),
    db.account.deleteMany({ where: { userId } }),
    db.deviceLink.deleteMany({ where: { userId } }),
    db.pushSubscription.deleteMany({ where: { userId } }),
    // Security round (D1, D4, D6): 2-step recovery codes and the Terms acceptance log go; security
    // events stay for their 90 days, without the link to the account.
    db.twoFactorRecoveryCode.deleteMany({ where: { userId } }),
    db.termsAcceptance.deleteMany({ where: { userId } }),
    db.securityEvent.updateMany({ where: { userId }, data: { userId: null } }),
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
        firstName: null,
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
  await removeFiles([...new Set([...verificationKeys, ...ticketKeys, ...kosherCertKeys])], deletePrivate);
  const avatarKey = ownAvatarKey(user.image, userId);
  if (avatarKey) await removeFiles([avatarKey], deletePublic);
}
