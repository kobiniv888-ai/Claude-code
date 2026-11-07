"use server";

/**
 * Listing page actions. Views are recorded from the browser once the page is shown (not while
 * rendering), so prefetches and link previews do not count; recordListingView counts each
 * visitor once a day and skips the host, staff, bots, prefetches and demo listings
 * (src/lib/listing/stats-rules.ts).
 */
import { z } from "zod";
import { fail, ok, runAction, type ActionResult } from "@/lib/action";
import { getCurrentUser } from "@/lib/auth/session";
import { recordListingView } from "@/lib/listing/stats";
import { recordAccountView } from "@/lib/recently-viewed/server";
import { hmacHash } from "@/lib/crypto";
import { ipNetwork } from "@/lib/listing/stats-rules";
import { rateLimit } from "@/lib/rate-limit";
import { getClientIp } from "@/lib/request";

const idSchema = z.string().trim().min(1).max(64);

/**
 * `signedIn`: the view was also written to the account's "נצפו לאחרונה" (src/lib/recently-viewed),
 * so the page knows to merge this device's list into the account once.
 */
export async function trackListingView(listingId: string): Promise<ActionResult<{ counted: boolean; signedIn: boolean }>> {
  return runAction<{ counted: boolean; signedIn: boolean }>(async () => {
    const id = idSchema.safeParse(listingId);
    if (!id.success) return fail("invalid_input");
    // Per network (the IPv4 address or the IPv6 /64), so rotating IPv6 addresses gets no new budget.
    const ip = await getClientIp().catch(() => null);
    const limit = await rateLimit(`listing-view:net:${ip ? hmacHash(`net:${ipNetwork(ip)}`) : "unknown"}`, { limit: 300, windowSeconds: 3600 });
    if (!limit.ok) return ok({ counted: false, signedIn: false });
    const user = await getCurrentUser().catch(() => null);
    const [counted] = await Promise.all([
      recordListingView(id.data, user ? { id: user.id, isStaff: user.isStaff } : null),
      user?.twoFactorVerified
        ? recordAccountView(user.id, id.data).catch((error: unknown) => {
            console.error("[recently-viewed] could not record a view:", error);
            return false;
          })
        : false,
    ]);
    return ok({ counted, signedIn: !!user?.twoFactorVerified });
  });
}
