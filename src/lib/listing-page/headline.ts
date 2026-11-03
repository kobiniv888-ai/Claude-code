import type { DealType, PricePeriod } from "@/generated/prisma/enums";
import { pricePerSqm } from "./helpers";

/**
 * The main price right under a listing's title (round 3 brief 2.3), on every listing page and for
 * every viewer (also the owner and previews on phones). Pure: the client component
 * (<HeadlinePrice>) converts to the visitor's currency.
 *
 * | deal                  | shown                                                              |
 * | sale                  | the full price (≈ in the visitor's currency + the host's original) |
 * |                       | and the price per m² (≈ in the visitor's currency)                  |
 * | monthly               | per month                                                          |
 * | short stay / hotel    | per night ("from" for hotels with room types), plus the total      |
 * |                       | once dates are chosen (not for "from" prices: it depends on the room)|
 */
export type HeadlinePlan = {
  /** The unit after the main price (sales: the full price, no unit). */
  period: PricePeriod;
  /** Sales: price per m² in the host's currency (null without a size). */
  perSqm: number | null;
  /** Stays: add "N nights · total" once dates are chosen. */
  stayTotal: boolean;
};

export function headlinePlan(listing: {
  dealType: DealType;
  price: number | null;
  pricePeriod: PricePeriod;
  priceIsFrom: boolean;
  sizeSqm: number | null;
}): HeadlinePlan {
  const stay = listing.dealType === "SHORT_STAY" || listing.dealType === "HOTEL_ROOM";
  if (listing.dealType === "SALE") return { period: "TOTAL", perSqm: pricePerSqm(listing.price, listing.sizeSqm), stayTotal: false };
  if (listing.dealType === "MONTHLY_RENT") return { period: "MONTH", perSqm: null, stayTotal: false };
  return { period: listing.pricePeriod, perSqm: null, stayTotal: stay && listing.pricePeriod === "NIGHT" && !listing.priceIsFrom };
}
