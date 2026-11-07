"use server";

/**
 * Favorites ("Saved"): the heart on cards and on the listing page, plus a private note.
 * Every action needs a signed-in user and only touches that user's own favorites.
 *
 * Round 3 (brief 7.2): saved places are kept in lists (src/lib/lists). The heart saves into the
 * list used last (the default list "שמורים" at first) and keeps the headline price for price-drop
 * alerts; a signed-out visitor gets "auth_required" and the heart saves on the device instead.
 */
import { z } from "zod";
import { ok, fail, runAction, type ActionResult } from "@/lib/action";
import { getCurrentUser, requireUserForAction } from "@/lib/auth/session";
import { db } from "@/lib/db";
import { removeSaved, saveToList, type ListSummary } from "@/lib/lists/server";
import { assertRateLimit } from "@/lib/rate-limit";

const MAX_NOTE_LENGTH = 500;
const MAX_FAVORITES = 1000;

const listingIdSchema = z.string().trim().min(1).max(64);
const toggleSchema = z.object({ listingId: listingIdSchema, favorite: z.boolean().optional() });
const noteSchema = z.object({
  listingId: listingIdSchema,
  note: z
    .string()
    .max(MAX_NOTE_LENGTH)
    .nullable()
    .transform((v) => v?.trim() || null),
});

/**
 * Saves or un-saves a listing (Listing.id). Pass `favorite` to set the state the button shows
 * (safe with optimistic UI and double clicks); leave it out to toggle.
 */
export async function toggleFavorite(
  listingId: string,
  favorite?: boolean,
): Promise<ActionResult<{ isFavorite: boolean; list: ListSummary | null }>> {
  return runAction<{ isFavorite: boolean; list: ListSummary | null }>(async () => {
    const user = await requireUserForAction();
    const input = toggleSchema.safeParse({ listingId, favorite });
    if (!input.success) return fail("invalid_input");
    await assertRateLimit(`favorite:${user.id}`, { limit: 60, windowSeconds: 60 });
    const id = input.data.listingId;

    const existing = await db.favorite.findUnique({
      where: { userId_listingId: { userId: user.id, listingId: id } },
      select: { id: true },
    });
    const want = input.data.favorite ?? !existing;

    if (!want) {
      if (existing) await removeSaved(user, id);
      return ok({ isFavorite: false, list: null });
    }
    // Already saved: it stays in its list. Otherwise into the list used last (only listings
    // visitors can see may be saved; "not_found" for the rest).
    if (existing) return ok({ isFavorite: true, list: null });
    const saved = await saveToList(user, id, null);
    return ok({ isFavorite: true, list: saved.list });
  });
}

/** The private note on a saved listing (empty clears it). */
export async function updateFavoriteNote(
  listingId: string,
  note: string | null,
): Promise<ActionResult<{ note: string | null }>> {
  return runAction<{ note: string | null }>(async () => {
    const user = await requireUserForAction();
    const input = noteSchema.safeParse({ listingId, note });
    if (!input.success) return fail("invalid_input", z.flattenError(input.error).fieldErrors);
    await assertRateLimit(`favorite-note:${user.id}`, { limit: 30, windowSeconds: 60 });

    const { count } = await db.favorite.updateMany({
      where: { userId: user.id, listingId: input.data.listingId },
      data: { note: input.data.note },
    });
    if (count === 0) return fail("not_found");
    return ok({ note: input.data.note });
  });
}

/** Listing ids the current user has saved, newest first ([] when signed out). */
export async function getFavoriteIds(): Promise<string[]> {
  const user = await getCurrentUser();
  if (!user) return [];
  const rows = await db.favorite.findMany({
    where: { userId: user.id },
    orderBy: { createdAt: "desc" },
    take: MAX_FAVORITES,
    select: { listingId: true },
  });
  return rows.map((r) => r.listingId);
}
