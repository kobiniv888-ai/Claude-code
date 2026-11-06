/**
 * The listing page's "All photos" grouped by room (round 3, brief 6.1). Pure and client-safe, and
 * deliberately tiny: the gallery is a client component on a public page.
 *
 * The host labels photos in the post form (bedroom, kitchen, bathroom…). When at least two
 * different rooms are labelled, "All photos" shows one section per room, in a fixed order, and
 * the unlabelled photos last; otherwise it stays one grid, as before.
 */
import type { PhotoRoom } from "@/generated/prisma/enums";

/** Section order (the same as PHOTO_ROOMS in @/lib/listing/fields; a test keeps them equal). */
export const GALLERY_ROOM_ORDER = ["BEDROOM", "KITCHEN", "BATHROOM", "LIVING_ROOM", "VIEW", "BALCONY", "BUILDING"] as const satisfies readonly PhotoRoom[];

export type PhotoGroup<T> = {
  room: PhotoRoom | null;
  photos: T[];
  /** Index of the section's first photo in all sections together (the viewer's order). */
  start: number;
};

/** Rooms needed before the gallery is grouped. */
export const MIN_ROOMS_TO_GROUP = 2;

/**
 * The photos in room sections, or null when fewer than two rooms are labelled (show them as
 * today). Order inside a section is the host's order; unlabelled photos come last (room: null).
 */
export function groupPhotosByRoom<T extends { room?: PhotoRoom | null }>(photos: readonly T[]): PhotoGroup<T>[] | null {
  const rooms = new Set(photos.map((p) => p.room).filter((r): r is PhotoRoom => !!r));
  if (rooms.size < MIN_ROOMS_TO_GROUP) return null;
  const sections: { room: PhotoRoom | null; photos: T[] }[] = GALLERY_ROOM_ORDER.filter((room) => rooms.has(room)).map((room) => ({
    room,
    photos: photos.filter((p) => p.room === room),
  }));
  const rest = photos.filter((p) => !p.room || !(GALLERY_ROOM_ORDER as readonly string[]).includes(p.room));
  if (rest.length > 0) sections.push({ room: null, photos: rest });
  let start = 0;
  return sections.map((section) => {
    const group = { ...section, start };
    start += section.photos.length;
    return group;
  });
}
