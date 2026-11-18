import "server-only";
import { getTranslations } from "next-intl/server";
import type { AppLocale, CurrencyCode } from "@/config/site";
import { db } from "@/lib/db";
import { formatDate, formatDateRange } from "@/lib/format";
import { serializeSearchQuery, type SearchFilters } from "@/lib/listing/search-params";
import { clipSearchName, defaultNameParts, isSameSearch, normalizeSearch, readStoredFilters } from "./core";

/**
 * What the results page's "שמירת חיפוש" button needs (round 3, brief 7.4): the prefilled name
 * ("השכרה לטווח קצר בבטומי · 10–14 בדצמ׳") and whether the signed-in visitor already saved this
 * search (the button then reads "החיפוש שמור" and leads to the alerts page).
 */
export type SaveSearchState = { defaultName: string; saved: boolean };

export async function defaultSearchName(filters: SearchFilters, place: string | null, locale: AppLocale): Promise<string> {
  const t = await getTranslations({ locale, namespace: "alerts.defaultName" });
  const parts = defaultNameParts(filters, place);
  let name = parts.place ? t(`place.${parts.deal}`, { place: parts.place }) : parts.text ? t("text", { text: parts.text }) : t(`anywhere.${parts.deal}`);
  if (parts.checkIn && parts.checkOut) {
    name = t("withDates", { name, dates: formatDateRange(parts.checkIn, parts.checkOut, locale, { day: "numeric", month: "short" }) });
  } else if (parts.checkIn) {
    name = t("withMoveIn", { name, date: formatDate(parts.checkIn, locale, { day: "numeric", month: "short" }) });
  }
  return clipSearchName(name);
}

/** Is this exact search saved (and on) for the user? */
export async function isSearchSaved(userId: string, filters: SearchFilters, currency: CurrencyCode): Promise<boolean> {
  const { filters: normalized, query } = normalizeSearch(serializeSearchQuery(filters));
  const wanted = { filters: normalized, query, currency };
  const rows = await db.savedSearch.findMany({ where: { userId, active: true }, select: { filters: true }, take: 50 });
  return rows.some((row) => {
    const criteria = readStoredFilters(row.filters);
    return criteria !== null && isSameSearch(criteria, wanted);
  });
}

export async function getSaveSearchState(input: {
  filters: SearchFilters;
  place: string | null;
  locale: AppLocale;
  userId: string | null | undefined;
  currency: CurrencyCode;
}): Promise<SaveSearchState> {
  const [defaultName, saved] = await Promise.all([
    defaultSearchName(input.filters, input.place, input.locale),
    input.userId ? isSearchSaved(input.userId, input.filters, input.currency).catch(() => false) : Promise.resolve(false),
  ]);
  return { defaultName, saved };
}
