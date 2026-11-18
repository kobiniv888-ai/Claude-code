"use server";

import { z } from "zod";
import { ok, toActionError, type ActionResult } from "@/lib/action";
import { requireUserForAction } from "@/lib/auth/session";
import { assertRateLimit } from "@/lib/rate-limit";
import { requireOwnedListing } from "@/lib/wizard/server";
import type { MistakeResult } from "./mistake-check";
import { getListingMistakes } from "./mistake-check-server";

/**
 * "בדיקה לפני פרסום" for the host's own listing (the post form's preview step and the edit page).
 * Owner only (session + ownership), zod-checked id, rate-limited. Read-only.
 */

const MISTAKE_CHECK_LIMIT = { limit: 120, windowSeconds: 600 };
const listingIdSchema = z.string().trim().min(1).max(64);

export async function loadMistakeCheck(listingId: unknown): Promise<ActionResult<MistakeResult & { checkedAt: string }>> {
  try {
    const user = await requireUserForAction();
    await assertRateLimit(`mistakes:${user.id}`, MISTAKE_CHECK_LIMIT);
    const listing = await requireOwnedListing(listingIdSchema.parse(listingId), user.id);
    const result = await getListingMistakes(listing.id);
    return ok({ ...result, checkedAt: new Date().toISOString() });
  } catch (error) {
    return toActionError(error);
  }
}
