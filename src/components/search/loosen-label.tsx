"use client";

import { useLocale, useTranslations } from "next-intl";
import { useCurrency } from "@/components/providers/currency-provider";
import type { SearchFilters } from "@/lib/listing/search-params";
import { loosenLabel } from "@/lib/search/chip-label";
import type { LoosenFix } from "@/lib/search/loosen";

/** The label function for one-tap fixes in client components ("Remove the 'Kosher' filter"). */
export function useLoosenLabel(placeNames: { city: string | null; neighborhood: string | null }) {
  const t = useTranslations("search.chips");
  const f = useTranslations("listingFields");
  const fx = useTranslations("search.fixes");
  const locale = useLocale();
  const { currency } = useCurrency();
  return (fix: LoosenFix, filters: SearchFilters) => loosenLabel(fix, filters, { t, f, fx, locale, currency, placeNames });
}
