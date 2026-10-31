/**
 * The ready message a guest sends to an owner (client-safe, pure). The text itself is in
 * messages/<locale>/contact.json under "message.<variant>"; this picks the variant and its
 * arguments from the guest's search (checkIn/checkOut/guests in the URL).
 */
import type { DealType } from "@/generated/prisma/enums";

export type MessageVariant = "datesGuests" | "dates" | "guests" | "plain" | "sale";

export type StayRequest = {
  /** "YYYY-MM-DD" */
  checkIn: string | null;
  /** "YYYY-MM-DD" (the day the guest leaves). */
  checkOut: string | null;
  guests: number | null;
};

const DAY = /^\d{4}-\d{2}-\d{2}$/;

function validDay(value: string | null | undefined): string | null {
  if (!value || !DAY.test(value)) return null;
  const time = Date.parse(`${value}T00:00:00Z`);
  return Number.isNaN(time) ? null : value;
}

/** Reads checkIn / checkOut / guests from a page's search params (anything invalid is dropped). */
export function stayRequestFrom(params: Record<string, string | string[] | undefined>): StayRequest {
  const one = (key: string) => {
    const value = params[key];
    return Array.isArray(value) ? value[0] : value;
  };
  let checkIn = validDay(one("checkIn"));
  let checkOut = validDay(one("checkOut"));
  if (checkIn && checkOut && checkOut <= checkIn) checkOut = null;
  if (!checkIn) checkOut = null;
  if (checkIn && checkOut) {
    const nights = (Date.parse(`${checkOut}T00:00:00Z`) - Date.parse(`${checkIn}T00:00:00Z`)) / 86_400_000;
    if (nights > 366) checkIn = checkOut = null;
  }
  const rawGuests = Number(one("guests"));
  const guests = Number.isInteger(rawGuests) && rawGuests >= 1 && rawGuests <= 50 ? rawGuests : null;
  return { checkIn, checkOut, guests };
}

/** Which message to use: sales never ask about dates; stays mention the dates and guests given. */
export function messageVariant(deal: DealType, stay: StayRequest): MessageVariant {
  if (deal === "SALE") return "sale";
  const hasDates = !!stay.checkIn;
  const hasGuests = stay.guests !== null && deal !== "MONTHLY_RENT";
  if (hasDates && hasGuests) return "datesGuests";
  if (hasDates) return "dates";
  if (hasGuests) return "guests";
  return "plain";
}

/** Query string that keeps the guest's dates on links (owner profile → listing, share…). */
export function stayQuery(stay: StayRequest): string {
  const params = new URLSearchParams();
  if (stay.checkIn) params.set("checkIn", stay.checkIn);
  if (stay.checkIn && stay.checkOut) params.set("checkOut", stay.checkOut);
  if (stay.guests) params.set("guests", String(stay.guests));
  const query = params.toString();
  return query ? `?${query}` : "";
}
