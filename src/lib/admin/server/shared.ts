import "server-only";
import type { Prisma } from "@/generated/prisma/client";
import { pickLocalized } from "@/i18n/locale";
import { isPlaceholderEmail } from "@/lib/auth/phone";
import { db } from "@/lib/db";
import { photoUrl } from "@/lib/media";
import { canSeeReporter, staffPhone, type StaffPhone, type StaffViewer } from "../staff-visibility";

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

/**
 * The account facts every admin page shows next to a name. No phone number: it is ADMIN only
 * (Q12, founder's answer (c)) and read on its own with `accountPhoneFor`.
 */
export const ownerBadgeSelect = {
  id: true,
  name: true,
  role: true,
  status: true,
  createdAt: true,
  accountType: true,
  businessName: true,
  phoneNumberVerified: true,
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
      user: { select: { id: true, name: true, status: true, role: true, createdAt: true } },
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

/**
 * An account's phone as `viewer` may see it (Q12, founder's answer (c)): the number for an ADMIN,
 * only "••• ••• ••45" for other staff. Read in its own query, so no other select carries it.
 */
export async function accountPhoneFor(viewer: Pick<StaffViewer, "role">, userId: string | null | undefined): Promise<StaffPhone> {
  if (!userId) return staffPhone(viewer, null);
  const row = await db.user.findUnique({ where: { id: userId }, select: { phoneNumber: true } });
  return staffPhone(viewer, row?.phoneNumber);
}

/** Which of these bookings carry a turned-away report (their guest sent it; Q12, 4.3.d). */
export async function turnedAwayBookingIds(bookingIds: readonly string[]): Promise<Set<string>> {
  const wanted = [...new Set(bookingIds)];
  if (wanted.length === 0) return new Set();
  const rows = await db.report.findMany({
    where: { kind: "TURNED_AWAY", bookingId: { in: wanted } },
    select: { bookingId: true },
    distinct: ["bookingId"],
  });
  return new Set(rows.map((r) => r.bookingId).filter((id): id is string => !!id));
}

/**
 * Booking rows as `viewer` may see them: the guest of a booking with a turned-away report sent that
 * report, so for staff who may not see who sent a report (Q12) such a row has no guest (null), and
 * `guestIsViewer` stands in for the own-item rule. Without a viewer every such guest is withheld.
 */
export async function withholdTurnedAwayGuests<T extends { id: string; guest: { id: string; name: string } }>(
  viewer: Pick<StaffViewer, "id" | "role"> | undefined,
  rows: readonly T[],
): Promise<(Omit<T, "guest"> & { guest: T["guest"] | null; guestIsViewer: boolean })[]> {
  const withheld = viewer && canSeeReporter(viewer) ? new Set<string>() : await turnedAwayBookingIds(rows.map((r) => r.id));
  return rows.map((row) => ({ ...row, guest: withheld.has(row.id) ? null : row.guest, guestIsViewer: !!viewer && row.guest.id === viewer.id }));
}
