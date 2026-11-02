/**
 * The guest's side of a booking (client-safe, pure): guest counts, the review page's address
 * (/listing/<id>/book?checkIn&checkOut&adults&children&infants&room) and the WhatsApp text of a
 * confirmed trip. The rules themselves are in ./pricing (quoteStay) and ./policy.
 */
import { MAX_GUESTS_PER_BOOKING, MAX_INFANTS } from "./constants";
import { isDay } from "./dates";
import { quoteStay, type QuoteContext, type QuoteResult } from "./pricing";
import { resolveTerms, type BookableListing } from "./terms";
import { formatTime } from "@/lib/format";
import { clockDate } from "@/lib/listing-page/helpers";

export type GuestCounts = { adults: number; children: number; infants: number };
export type GuestKind = keyof GuestCounts;

export const GUEST_KINDS: readonly GuestKind[] = ["adults", "children", "infants"];
export const DEFAULT_GUESTS: GuestCounts = { adults: 1, children: 0, infants: 0 };

/** Adults + children allowed (infants under 2 do not count), capped by the site's ceiling. */
export function guestLimit(maxGuests: number | null | undefined): number {
  const max = typeof maxGuests === "number" && Number.isInteger(maxGuests) && maxGuests > 0 ? maxGuests : MAX_GUESTS_PER_BOOKING;
  return Math.min(max, MAX_GUESTS_PER_BOOKING);
}

function whole(value: unknown, fallback: number): number {
  const n = typeof value === "number" ? value : typeof value === "string" && value.trim() !== "" ? Number(value) : NaN;
  return Number.isInteger(n) && n >= 0 ? n : fallback;
}

/** Valid counts for this listing: at least one adult, adults + children within the limit, ≤ 5 infants. */
export function clampGuests(guests: Partial<Record<GuestKind, unknown>>, maxGuests?: number | null): GuestCounts {
  const limit = guestLimit(maxGuests);
  const adults = Math.min(Math.max(1, whole(guests.adults, 1)), limit);
  const children = Math.min(whole(guests.children, 0), limit - adults);
  const infants = Math.min(whole(guests.infants, 0), MAX_INFANTS);
  return { adults, children, infants };
}

/** Can this counter go up / down one step? */
export function canStep(guests: GuestCounts, kind: GuestKind, delta: 1 | -1, maxGuests?: number | null): boolean {
  if (delta === -1) return kind === "adults" ? guests.adults > 1 : guests[kind] > 0;
  if (kind === "infants") return guests.infants < MAX_INFANTS;
  return guests.adults + guests.children < guestLimit(maxGuests);
}

export function stepGuests(guests: GuestCounts, kind: GuestKind, delta: 1 | -1, maxGuests?: number | null): GuestCounts {
  if (!canStep(guests, kind, delta, maxGuests)) return guests;
  return { ...guests, [kind]: guests[kind] + delta };
}

/** What the review page needs from its address. */
export type BookRequest = {
  checkIn: string | null;
  checkOut: string | null;
  guests: GuestCounts;
  roomTypeId: string | null;
};

type SearchParams = Record<string, string | string[] | undefined>;

function one(params: SearchParams, key: string): string | undefined {
  const value = params[key];
  return Array.isArray(value) ? value[0] : value;
}

/**
 * Reads the review page's address. `adults` / `children` / `infants` win; the search's single
 * `guests` count (older links, the results page) becomes adults. Invalid values are dropped.
 */
export function bookRequestFrom(params: SearchParams, maxGuests?: number | null): BookRequest {
  const checkIn = one(params, "checkIn");
  const checkOut = one(params, "checkOut");
  const datesOk = isDay(checkIn) && isDay(checkOut) && checkIn < checkOut;
  const adults = one(params, "adults") ?? one(params, "guests");
  const room = one(params, "room")?.trim();
  return {
    checkIn: datesOk ? checkIn : null,
    checkOut: datesOk ? checkOut : null,
    guests: clampGuests({ adults, children: one(params, "children"), infants: one(params, "infants") }, maxGuests),
    roomTypeId: room && /^[\w-]{1,64}$/.test(room) ? room : null,
  };
}

/** Sets the stay's parameters on a query string, keeping the others ("" or "?…"). */
export function withBookParams(search: string, request: Partial<BookRequest>): string {
  const params = new URLSearchParams(search);
  if ("checkIn" in request || "checkOut" in request) {
    for (const key of ["checkIn", "checkOut"] as const) {
      const value = request[key];
      if (value) params.set(key, value);
      else params.delete(key);
    }
  }
  if (request.guests) {
    params.delete("guests");
    params.set("adults", String(request.guests.adults));
    for (const key of ["children", "infants"] as const) {
      if (request.guests[key] > 0) params.set(key, String(request.guests[key]));
      else params.delete(key);
    }
  }
  if ("roomTypeId" in request) {
    if (request.roomTypeId) params.set("room", request.roomTypeId);
    else params.delete("room");
  }
  const query = params.toString();
  return query ? `?${query}` : "";
}

/** /listing/<id>/book?checkIn&checkOut&adults… (listingPath without the locale). */
export function bookHref(listingPath: string, request: Partial<BookRequest>): string {
  return `${listingPath}/book${withBookParams("", request)}`;
}

/** Adults + children (what the maximum counts). */
export function countedGuests(guests: GuestCounts): number {
  return guests.adults + guests.children;
}

export type GuestQuoteResult = QuoteResult | { ok: false; error: "room_type_required" | "no_price" | "no_dates" };

/**
 * The price of the stay in the browser, with the same rules as the server (resolveTerms +
 * quoteStay): shown at once, then confirmed by quoteBookingAction.
 */
export function quoteGuestStay(terms: BookableListing, request: BookRequest, context: QuoteContext): GuestQuoteResult {
  if (!request.checkIn || !request.checkOut) return { ok: false, error: "no_dates" };
  const resolved = resolveTerms(terms, request.roomTypeId);
  if (!resolved.ok) return { ok: false, error: resolved.error === "room_type_required" ? "room_type_required" : "no_price" };
  return quoteStay(resolved.terms, { checkIn: request.checkIn, checkOut: request.checkOut, ...request.guests }, context);
}

/** The maximum guests for the chosen room type (hotels) or the listing. */
export function maxGuestsFor(terms: Pick<BookableListing, "maxGuests" | "roomTypes">, roomTypeId: string | null): number | null {
  const room = roomTypeId ? terms.roomTypes.find((r) => r.id === roomTypeId) : null;
  return room?.maxGuests ?? terms.maxGuests ?? null;
}

/** "14:00" → "14:00" / "2:00 PM" in the reader's language (host times are Georgian wall-clock). */
export function clockText(value: string | null | undefined, locale: string): string | null {
  const date = clockDate(value);
  return date ? formatTime(date, locale, "UTC") : null;
}
