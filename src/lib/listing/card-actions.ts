"use server";

/**
 * Card data for client widgets (recently viewed, compare). Public data only, rate-limited by IP.
 */
import { getLocale } from "next-intl/server";
import { z } from "zod";
import { siteConfig } from "@/config/site";
import { isAppLocale } from "@/i18n/locale";
import { ok, fail, runAction, type ActionResult } from "@/lib/action";
import { getCurrentUser } from "@/lib/auth/session";
import { getDisplayCurrency, getRates } from "@/lib/currency";
import { getListingCards } from "@/lib/listing/queries";
import type { ListingCardData } from "@/lib/listing/types";
import { assertRateLimitByIp } from "@/lib/rate-limit";

const MAX_IDS = 24;
const idsSchema = z.array(z.number().int().positive().max(2_147_483_647)).max(MAX_IDS);

/** Cards for these public IDs, in the same order (listings that are no longer public are skipped). */
export async function getListingCardsAction(ids: number[]): Promise<ActionResult<ListingCardData[]>> {
  return runAction(async () => {
    const input = idsSchema.safeParse(ids);
    if (!input.success) return fail("invalid_input");
    if (input.data.length === 0) return ok([]);
    await assertRateLimitByIp("listing-cards", { limit: 60, windowSeconds: 60 });

    const [user, locale, rates] = await Promise.all([getCurrentUser(), getLocale(), getRates()]);
    const currency = await getDisplayCurrency(user?.currency);
    const cards = await getListingCards(input.data, {
      locale: isAppLocale(locale) ? locale : siteConfig.i18n.primaryLocale,
      currency,
      rates,
      userId: user?.id ?? null,
    });
    return ok(cards);
  });
}
