import "server-only";
import type { Prisma } from "@/generated/prisma/client";
import { pickLocalized } from "@/i18n/locale";
import { isPlaceholderEmail } from "@/lib/auth/phone";
import { db } from "@/lib/db";
import { photoUrl } from "@/lib/media";

/** Small read helpers shared by the admin pages (server-only). */

export const ADMIN_PAGE_SIZE = 25;

/** The cover photo of a listing (or its first photo). */
export const coverPhotoSelect = {
  orderBy: [{ isCover: "desc" }, { sortOrder: "asc" }],
  take: 1,
  select: { url: true, storageKey: true },
} satisfies Prisma.Listing$photosArgs;

export function coverUrl(photos: { url: string; storageKey: string | null }[] | undefined, size: "sm" | "md" = "sm") {
  const photo = photos?.[0];
  return photo ? photoUrl(photo, size) : null;
}

/** The real email of an account (null for phone-only placeholder addresses). */
export function realEmail(email: string | null | undefined): string | null {
  return email && !isPlaceholderEmail(email) ? email : null;
}

export function cityName(city: { names: unknown } | null | undefined, locale: string): string | null {
  return city ? pickLocalized(city.names, locale) || null : null;
}

/** Listing title in `locale` when a translation exists, else the owner's original. */
export function localizedTitle(
  listing: { title: string; translations?: { title: string }[] },
  fallback: string,
): string {
  return listing.translations?.[0]?.title?.trim() || listing.title.trim() || fallback;
}

export const ownerBadgeSelect = {
  id: true,
  name: true,
  role: true,
  status: true,
  createdAt: true,
  accountType: true,
  businessName: true,
  phoneNumberVerified: true,
  phoneNumber: true,
  idVerifiedAt: true,
  businessVerifiedAt: true,
  isDemo: true,
} satisfies Prisma.UserSelect;

export type OwnerBadgeInfo = Prisma.UserGetPayload<{ select: typeof ownerBadgeSelect }>;

/** Accounts that share a device with `userId` ("several accounts on one device"). */
export async function sharedDeviceAccounts(userId: string, take = 20) {
  const devices = await db.deviceLink.findMany({ where: { userId }, select: { deviceHash: true }, take: 50 });
  if (devices.length === 0) return [];
  const links = await db.deviceLink.findMany({
    where: { deviceHash: { in: devices.map((d) => d.deviceHash) }, userId: { not: userId } },
    distinct: ["userId"],
    orderBy: { lastSeenAt: "desc" },
    take,
    select: {
      lastSeenAt: true,
      user: { select: { id: true, name: true, status: true, role: true, createdAt: true, phoneNumber: true } },
    },
  });
  return links.map((l) => ({ ...l.user, lastSeenAt: l.lastSeenAt }));
}

/** Names of staff members by id (for "verified by …" without a relation). */
export async function staffNames(ids: (string | null | undefined)[]): Promise<Map<string, string>> {
  const unique = [...new Set(ids.filter((id): id is string => !!id))];
  if (unique.length === 0) return new Map();
  const rows = await db.user.findMany({ where: { id: { in: unique } }, select: { id: true, name: true } });
  return new Map(rows.map((r) => [r.id, r.name]));
}
