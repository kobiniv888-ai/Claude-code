"use server";

/**
 * "נצפו לאחרונה" for signed-in users (round 3, brief 4). Views are written through by
 * trackListingView (src/lib/listing-page/actions.ts); these two run from the home page and the
 * listing page: the merge after signing in, and "ניקוי".
 */
import { z } from "zod";
import { fail, ok, runAction, type ActionResult } from "@/lib/action";
import { requireUserForAction } from "@/lib/auth/session";
import { assertRateLimit } from "@/lib/rate-limit";
import { RECENTLY_VIEWED_KEEP, sanitizeViewed, type ViewedItem } from "./core";
import { clearAccountViews, mergeDeviceViews } from "./server";

const itemsSchema = z
  .array(
    z.object({
      id: z.number().int().positive().max(2_147_483_647),
      at: z.number().int().nonnegative(),
    }),
  )
  .max(RECENTLY_VIEWED_KEEP);

/**
 * Merges this device's list into the account and returns the account's list (newest first).
 * Signed-out visitors get "auth_required" (their list stays on the device).
 */
export async function syncRecentlyViewedAction(items: unknown): Promise<ActionResult<ViewedItem[]>> {
  return runAction(async () => {
    const parsed = itemsSchema.safeParse(items);
    if (!parsed.success) return fail("invalid_input");
    // Signed in (and past 2-step login where the account has it); "auth_required" otherwise.
    const user = await requireUserForAction();
    await assertRateLimit(`recently-viewed:sync:${user.id}`, { limit: 20, windowSeconds: 60 });
    const now = Date.now();
    return ok(await mergeDeviceViews(user.id, sanitizeViewed(parsed.data, now), { now }));
  });
}

/** "ניקוי" for a signed-in user: the account's list (the page clears the device copy itself). */
export async function clearRecentlyViewedAction(): Promise<ActionResult<{ cleared: number }>> {
  return runAction(async () => {
    const user = await requireUserForAction();
    await assertRateLimit(`recently-viewed:clear:${user.id}`, { limit: 10, windowSeconds: 60 });
    return ok({ cleared: await clearAccountViews(user.id) });
  });
}
