"use server";

import { z } from "zod";
import { currencyCodes, locales } from "@/config/site";
import { ok, toActionError, type ActionResult } from "@/lib/action";
import { requireUserForAction } from "@/lib/auth/session";
import { NotFoundError } from "@/lib/errors";
import { assertRateLimit } from "@/lib/rate-limit";
import { getListingPriceGuides, type ListingGuideView } from "./guide-server";
import { PRICE_GUIDE_RATE_LIMIT, priceGuideRateKey } from "./limits";

/**
 * "מדריך מחירים" for the host's own listing: the post form's price step ("הזמנות ומחיר") and the
 * edit page. Owner only (session + ownership on the server), zod-checked, rate-limited (also so
 * the guide can't be queried over and over to probe other hosts' prices). Read-only.
 */

const schema = z.object({
  listingId: z.string().trim().min(1).max(64),
  currency: z.enum(currencyCodes),
  locale: z.enum(locales),
});

export async function loadListingPriceGuide(input: unknown): Promise<ActionResult<ListingGuideView>> {
  try {
    const user = await requireUserForAction();
    const { listingId, currency, locale } = schema.parse(input);
    await assertRateLimit(priceGuideRateKey(user.id), PRICE_GUIDE_RATE_LIMIT);
    const view = await getListingPriceGuides(listingId, user.id, { locale, currency });
    if (!view) throw new NotFoundError();
    return ok(view);
  } catch (error) {
    return toActionError(error);
  }
}
