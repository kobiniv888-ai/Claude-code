import "server-only";
import { cache } from "react";
import type { AppLocale } from "@/config/site";
import { getCurrentUser } from "@/lib/auth/session";
import { getDisplayCurrency, getRates } from "@/lib/currency";
import type { ListingQueryContext } from "@/lib/listing/queries";

/** Card query context for this request (language, display currency, rates, the viewer's favorites). */
export const getCardContext = cache(async (locale: AppLocale): Promise<ListingQueryContext> => {
  const [session, rates] = await Promise.all([getCurrentUser().catch(() => null), getRates()]);
  // A session whose 2-step code is not entered yet counts as signed out (SECURITY_REPORT 4.2.a).
  const user = session?.twoFactorVerified ? session : null;
  const currency = await getDisplayCurrency(user?.currency);
  return { locale, currency, rates, userId: user?.id ?? null };
});
