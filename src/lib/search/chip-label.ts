/**
 * The text of a filter chip ("Kosher kitchen", "₪300 – ₪900", "3+ bedrooms"), shared by the
 * client chips and the server's no-results fixes (pure: pass the translators of the "search.chips"
 * and "listingFields" namespaces).
 */
import type { CurrencyCode } from "@/config/site";
import { formatArea, formatDate, formatMoney, formatNumber } from "@/lib/format";
import type { FilterChip, SearchFilters } from "@/lib/listing/search-params";
import type { LoosenFix } from "@/lib/search/loosen";
import { formatStay } from "@/lib/search/format-stay";

export type Translate = (key: string, values?: Record<string, string | number>) => string;

export type ChipLabelContext = {
  /** "search.chips" */
  t: Translate;
  /** "listingFields" */
  f: Translate;
  locale: string;
  currency: CurrencyCode;
  /** City and neighborhood names in the page language. */
  placeNames: { city: string | null; neighborhood: string | null };
};

export function chipLabel(chip: FilterChip, filters: SearchFilters, ctx: ChipLabelContext): string {
  const { t, f, locale, currency, placeNames } = ctx;
  const value = chip.value ?? "";
  // Isolated (LRI … PDI) so "₪300" keeps its order inside Hebrew text.
  // "5+" as one left-to-right unit, so it never shows as "+5" in Hebrew and Arabic.
  const atLeast = (n: number) => `⁦${formatNumber(n, locale)}+⁩`;
  const money = (amount: number) => `⁦${formatMoney(amount, currency, locale, { maximumFractionDigits: 0 })}⁩`;
  const range = (min: number | null, max: number | null, show: (n: number) => string) =>
    min !== null && max !== null
      ? t("between", { min: show(min), max: show(max) })
      : min !== null
        ? t("atLeast", { min: show(min) })
        : t("atMost", { max: show(max ?? 0) });

  switch (chip.key) {
    case "city":
      return placeNames.city ?? value;
    case "neighborhood":
      return placeNames.neighborhood ?? value;
    case "q":
      return t("text", { q: value });
    case "dates":
      if (!filters.checkIn) return "";
      if (!filters.checkOut) {
        return t("moveIn", { date: formatDate(filters.checkIn, locale, { day: "numeric", month: "short" }) });
      }
      return formatStay(filters.checkIn, filters.checkOut, locale);
    case "guests":
      return f("facts.guests", { count: filters.guests ?? 0 });
    case "price":
      return range(filters.priceMin, filters.priceMax, money);
    case "rooms":
      return t("minRooms", { value: atLeast(Number(value)) });
    case "bedrooms":
      return t("minBedrooms", { value: atLeast(Number(value)) });
    case "bathrooms":
      return t("minBathrooms", { value: atLeast(Number(value)) });
    case "propertyTypes":
      return f(`propertyType.${value}`);
    case "amenities":
      return value === "pets_allowed" || value === "smoking_allowed" ? f(`houseRule.${value}`) : f(`amenity.${value}`);
    case "kitchen":
      return f(`kitchenFilter.${value}`);
    case "kosherShabbat":
      return t("kosherShabbat");
    case "jewish":
      return f(`jewishFeature.${value}`);
    case "hotel":
      return f(`hotelJewishFeature.${value}`);
    case "synagogueMaxWalk":
      return f("filter.synagogueMaxWalk", { count: Number(value) });
    case "sharedRoomFor":
      return f(`sharedRoomFor.${value}`);
    case "ownerType":
      return f(`ownerType.${value}`);
    case "postedWithin":
      return f(`postedWithin.${value}`);
    case "condition":
      return f(`condition.${value}`);
    case "heating":
      return f(`heating.${value}`);
    case "views":
      return f(`view.${value}`);
    case "buildingAge":
      return f(`buildingAge.${value}`);
    case "size":
      return range(filters.sizeMin, filters.sizeMax, (n) => formatArea(n, locale));
    case "floor":
      return t("floor", { range: range(filters.floorMin, filters.floorMax, (n) => formatNumber(n, locale)) });
    case "bounds":
      return t("mapArea");
    case "visited":
      return t("visited");
    case "shabbatFriendly":
    case "bigFamily":
    case "verifiedOnly":
    case "hasPhotos":
    case "hasVideo":
    case "furnished":
    case "elevator":
      return f(`filter.${chip.key}`);
  }
}

/** The text of a one-tap fix ("Remove the 'Kosher kitchen' filter", "Wider area", "Clear the dates"). */
export function loosenLabel(
  fix: LoosenFix,
  filters: SearchFilters,
  ctx: ChipLabelContext & {
    /** "search.fixes" */
    fx: Translate;
  },
): string {
  switch (fix.kind) {
    case "remove":
      return ctx.fx("remove", { label: chipLabel(fix.chip, filters, ctx) });
    case "dates":
      return ctx.fx("dates");
    case "area":
      return fix.scope === "city" ? ctx.fx("allGeorgia") : ctx.fx("widerArea");
  }
}
