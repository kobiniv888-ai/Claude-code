"use server";

/**
 * Listing page actions. Views are recorded from the browser once the page is shown (not while
 * rendering), so prefetches and link previews do not count; recordListingView dedupes per
 * device and day and skips bots and the owner.
 */
import { z } from "zod";
import { fail, ok, runAction, type ActionResult } from "@/lib/action";
import { getCurrentUser } from "@/lib/auth/session";
import { recordListingView } from "@/lib/listing/stats";
import { rateLimitByIp } from "@/lib/rate-limit";

const idSchema = z.string().trim().min(1).max(64);

export async function trackListingView(listingId: string): Promise<ActionResult<{ counted: boolean }>> {
  return runAction<{ counted: boolean }>(async () => {
    const id = idSchema.safeParse(listingId);
    if (!id.success) return fail("invalid_input");
    const limit = await rateLimitByIp("listing-view", { limit: 300, windowSeconds: 3600 });
    if (!limit.ok) return ok({ counted: false });
    const user = await getCurrentUser().catch(() => null);
    const counted = await recordListingView(id.data, { viewerId: user?.id ?? null });
    return ok({ counted });
  });
}
