"use server";

/**
 * Home page actions (public, read-only, rate-limited by IP).
 */
import { getLocale } from "next-intl/server";
import { z } from "zod";
import { siteConfig } from "@/config/site";
import { isAppLocale } from "@/i18n/locale";
import { fail, ok, runAction, type ActionResult } from "@/lib/action";
import { getCurrentUser } from "@/lib/auth/session";
import { getDisplayCurrency, getRates } from "@/lib/currency";
import type { ListingCardData } from "@/lib/listing/types";
import { assertRateLimitByIp } from "@/lib/rate-limit";
import { SEARCH_BAR_DEALS } from "@/lib/search/search-bar";
import { getHomeRecommendedCached } from "./recommended-server";

const dealSchema = z.enum(SEARCH_BAR_DEALS);

/** "מקומות מומלצים" for another home tab (the page renders the first tab's row itself). */
export async function getHomeRecommendedAction(deal: unknown): Promise<ActionResult<ListingCardData[]>> {
  return runAction(async () => {
    const parsed = dealSchema.safeParse(deal);
    if (!parsed.success) return fail("invalid_input");
    await assertRateLimitByIp("home-recommended", { limit: 40, windowSeconds: 60 });
    const [user, locale, rates] = await Promise.all([getCurrentUser().catch(() => null), getLocale(), getRates()]);
    const currency = await getDisplayCurrency(user?.currency);
    const cards = await getHomeRecommendedCached(
      { locale: isAppLocale(locale) ? locale : siteConfig.i18n.primaryLocale, currency, rates, userId: user?.id ?? null },
      parsed.data,
    );
    return ok(cards);
  });
}
