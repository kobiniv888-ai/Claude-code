import "server-only";
import type { Prisma } from "@/generated/prisma/client";
import { db } from "@/lib/db";
import { NotFoundError } from "@/lib/errors";
import { belowPhotoMinimum } from "./live-edit";

/**
 * Deleting photos and room types under the listing's row lock (server-only, used by
 * ./actions.ts). The same lock is taken by every change that puts a listing on the site
 * (src/lib/listing/lifecycle.ts transitionWithoutMistakes) and, for hotels, by a booking
 * (src/lib/booking/service.ts locks the Listing, then the RoomType): so a deletion can't slip in
 * between the mistake check and a status change, and a room type can't lose a booking that is
 * being committed.
 */

type Tx = Prisma.TransactionClient;

/** Locks the listing's row and returns its status (null: no such listing). */
export async function lockListing(tx: Tx, listingId: string): Promise<string | null> {
  const rows = await tx.$queryRaw<{ status: string }[]>`SELECT "status"::text AS "status" FROM "Listing" WHERE "id" = ${listingId} FOR UPDATE`;
  return rows[0]?.status ?? null;
}

/**
 * The photos guests see, as the mistake check counts them: the main photos, and for hotels the
 * photos of the room types they offer. `except` leaves out a photo or a room type being removed.
 */
export function visiblePhotosWhere(
  listingId: string,
  isHotel: boolean,
  except: { photoId?: string; roomTypeId?: string } = {},
): Prisma.ListingPhotoWhereInput {
  return {
    listingId,
    ...(except.photoId ? { id: { not: except.photoId } } : {}),
    OR: [
      { roomTypeId: null },
      ...(isHotel ? [{ roomType: { active: true, ...(except.roomTypeId ? { id: { not: except.roomTypeId } } : {}) } }] : []),
    ],
  };
}

/** True when `listingId` is LIVE (checked under the lock) and the change would leave too few photos. */
async function leavesTooFewPhotos(tx: Tx, status: string | null, listingId: string, isHotel: boolean, except: { photoId?: string; roomTypeId?: string }) {
  if (status !== "LIVE") return false;
  return belowPhotoMinimum(await tx.listingPhoto.count({ where: visiblePhotosWhere(listingId, isHotel, except) }));
}

export type PhotoDeletion = { ok: true; photo: { id: string; storageKey: string | null; roomTypeId: string | null } } | { ok: false; error: "photos_min" };

/**
 * Deletes one photo of the listing (its files are the caller's, after the commit). A LIVE listing
 * keeps at least the minimum of photos guests see: "photos_min" otherwise.
 */
export async function deletePhotoLocked(listingId: string, photoId: string, isHotel: boolean): Promise<PhotoDeletion> {
  return db.$transaction(async (tx) => {
    const status = await lockListing(tx, listingId);
    const photo = await tx.listingPhoto.findFirst({
      where: { id: photoId, listingId },
      select: { id: true, storageKey: true, roomTypeId: true, roomType: { select: { active: true } } },
    });
    if (!photo) throw new NotFoundError();
    const visible = photo.roomTypeId === null || (isHotel && photo.roomType?.active === true);
    if (visible && (await leavesTooFewPhotos(tx, status, listingId, isHotel, { photoId: photo.id }))) return { ok: false, error: "photos_min" } as const;
    await tx.listingPhoto.delete({ where: { id: photo.id } });
    return { ok: true, photo: { id: photo.id, storageKey: photo.storageKey, roomTypeId: photo.roomTypeId } } as const;
  });
}

/** True when switching room type `roomTypeId` off would leave a LIVE hotel with too few photos (checked under the lock). */
export async function deactivationLeavesTooFewPhotos(tx: Tx, listingId: string, roomTypeId: string, isHotel: boolean): Promise<boolean> {
  const status = await lockListing(tx, listingId);
  return isHotel && (await leavesTooFewPhotos(tx, status, listingId, isHotel, { roomTypeId }));
}

export type RoomTypeDeletion =
  | { ok: true; photos: { id: string; storageKey: string | null }[] }
  | { ok: false; error: "room_type_has_bookings" | "photos_min" };

/**
 * Deletes a room type and its photos in ONE transaction, locking in the booking's order (the
 * Listing, then the RoomType): a booking being committed for it finishes first and is counted,
 * so a room type with upcoming bookings is never deleted ("room_type_has_bookings"). A LIVE hotel
 * keeps the minimum of photos ("photos_min"). The photo files are the caller's, after the commit.
 */
export async function deleteRoomTypeLocked(listingId: string, roomTypeId: string, isHotel: boolean, now: Date = new Date()): Promise<RoomTypeDeletion> {
  return db.$transaction(async (tx) => {
    const status = await lockListing(tx, listingId);
    const locked = await tx.$queryRaw<{ id: string }[]>`SELECT "id" FROM "RoomType" WHERE "id" = ${roomTypeId} AND "listingId" = ${listingId} FOR UPDATE`;
    if (locked.length === 0) throw new NotFoundError();
    const upcoming = await tx.booking.count({ where: { roomTypeId, status: "CONFIRMED", checkOut: { gt: now } } });
    if (upcoming > 0) return { ok: false, error: "room_type_has_bookings" } as const;
    const room = await tx.roomType.findUniqueOrThrow({ where: { id: roomTypeId }, select: { active: true } });
    if (room.active && (await leavesTooFewPhotos(tx, status, listingId, isHotel, { roomTypeId }))) return { ok: false, error: "photos_min" } as const;
    const photos = await tx.listingPhoto.findMany({ where: { roomTypeId, listingId }, select: { id: true, storageKey: true } });
    await tx.listingPhoto.deleteMany({ where: { roomTypeId, listingId } });
    await tx.roomType.delete({ where: { id: roomTypeId } });
    return { ok: true, photos } as const;
  });
}
