/**
 * Airport names for the listing page's "nearby" list (pure, client-safe).
 *
 * Round 3, section 3: the row read "שדה תעופה · 4 ק״מ (BUS)", and "BUS" (the IATA code of Batumi
 * airport) reads like "bus". It now names the airport by its city — "שדה התעופה של בטומי · 4 ק״מ" —
 * from the messages (listing.nearby.airports.<code>), with no code. The airport is the CITY's
 * airport (City.airportCode), so a listing in Kobuleti shows Batumi's.
 *
 * Each named code needs a message in all five languages (nearby-airports.test.ts checks it, and
 * that every airport in siteConfig.cities is named). An unknown code falls back to the generic
 * "שדה תעופה".
 */
export const NAMED_AIRPORTS = ["TBS", "BUS", "KUT"] as const;
export type NamedAirport = (typeof NAMED_AIRPORTS)[number];

/** The airport's message key (listing.nearby.airports.<code>), or null for the generic label. */
export function namedAirport(code: string | null | undefined): NamedAirport | null {
  const upper = code?.trim().toUpperCase();
  return upper && (NAMED_AIRPORTS as readonly string[]).includes(upper) ? (upper as NamedAirport) : null;
}
