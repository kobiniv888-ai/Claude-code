"use server";

/**
 * Live result count for the filter drawer ("Show 123 results"). Public data only, read-only,
 * rate-limited by IP.
 */
import { getLocale } from "next-intl/server";
import { z } from "zod";
import { siteConfig } from "@/config/site";
import { isAppLocale } from "@/i18n/locale";
import { fail, ok, runAction, type ActionResult } from "@/lib/action";
import { countListings } from "@/lib/listing/queries";
import { parseSearchParams } from "@/lib/listing/search-params";
import { assertRateLimitByIp } from "@/lib/rate-limit";
import { getSearchContext } from "@/lib/search/context";

const querySchema = z.string().max(4000);

/** How many listings match a search query string ("deal=buy&city=batumi"). */
export async function countSearchResults(query: string): Promise<ActionResult<{ count: number }>> {
  return runAction(async () => {
    const input = querySchema.safeParse(query);
    if (!input.success) return fail("invalid_input");
    await assertRateLimitByIp("search:count", { limit: 120, windowSeconds: 60 });

    const locale = await getLocale();
    const ctx = await getSearchContext(isAppLocale(locale) ? locale : siteConfig.i18n.primaryLocale);
    const filters = parseSearchParams(new URLSearchParams(input.data.replace(/^\?/, "")));
    const count = await countListings(filters, ctx);
    return ok({ count });
  });
}
