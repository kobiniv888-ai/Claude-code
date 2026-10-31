import "server-only";
import { cache } from "react";
import type { AppLocale } from "@/config/site";
import { getCurrentUser } from "@/lib/auth/session";
import { getDisplayCurrency, getRates } from "@/lib/currency";
import type { ListingQueryContext } from "@/lib/listing/queries";

/** Card query context for this request (language, display currency, rates, the viewer's favorites). */
export const getCardContext = cache(async (locale: AppLocale): Promise<ListingQueryContext> => {
  const [user, rates] = await Promise.all([getCurrentUser().catch(() => null), getRates()]);
  const currency = await getDisplayCurrency(user?.currency);
  return { locale, currency, rates, userId: user?.id ?? null };
});
