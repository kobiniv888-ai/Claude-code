import "server-only";
import { cache } from "react";
import type { AppLocale } from "@/config/site";
import { getCurrentUser } from "@/lib/auth/session";
import { getDisplayCurrency, getRates } from "@/lib/currency";
import type { ListingQueryContext } from "@/lib/listing/queries";

/**
 * The listing query context for this request: language, the visitor's display currency and
 * today's rates (the price filter is typed in that currency), and the signed-in user (favorites).
 * Same decision as the root layout, so prices and filters always agree.
 */
export const getSearchContext = cache(async (locale: AppLocale): Promise<ListingQueryContext> => {
  const [user, rates] = await Promise.all([getCurrentUser().catch(() => null), getRates()]);
  const currency = await getDisplayCurrency(user?.currency);
  return { locale, currency, rates, userId: user?.id ?? null };
});
