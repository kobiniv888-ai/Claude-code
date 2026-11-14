"use client";

import { createContext, useCallback, useContext, useMemo, useState, type ReactNode } from "react";
import { useLocale, useTranslations } from "next-intl";
import { useCurrency } from "@/components/providers/currency-provider";
import type { CurrencyCode } from "@/config/site";
import type { PricePeriod } from "@/generated/prisma/enums";
import { formatMoney } from "@/lib/format";
import { MAX_ROOMS_PER_BOOKING } from "@/lib/booking/constants";
import { bookHref, clampGuests, countedGuests, guestLimit, withBookParams, type GuestCounts } from "@/lib/booking/guest";
import { quoteStay, type DatePriceTerm, type MinStayDatePrice, type Quote } from "@/lib/booking/pricing";
import { freeFromSegments, noRoomTypeFree, type FreeSegment } from "@/lib/booking/room-availability";
import { roomGuestLimit } from "@/lib/booking/terms";
import type { DateBlock } from "@/lib/listing-page/calendar";
import { nightsBetween, withStayParams, type PickRules, type StayDates } from "@/lib/listing-page/stay";

/** Left-to-right isolate for a price inside a translated sentence. */
const isolate = (text: string) => `⁦${text}⁩`;

export type StayPrice = {
  amount: number | null;
  currency: CurrencyCode;
  period: PricePeriod;
  from: boolean;
  cleaningFee: number | null;
  /** Friday and Saturday nights (booking settings), else the nightly price. */
  weekendPrice?: number | null;
  /** Holiday prices ("מחיר לתאריכים", round 3, brief 6.3): they come first, then the weekend price. */
  datePrices?: DatePriceTerm[];
  /** % off the nights for 7+ / 28+ nights. */
  weeklyDiscountPct?: number | null;
  monthlyDiscountPct?: number | null;
};

/** The chosen nights are too short (the listing's minimum or a date price's own, brief 6.3). */
export type StayMinStay = { minNights: number; datePrice?: MinStayDatePrice };

/** One room type the guest can pick (hotels and guesthouses with room types). */
export type StayRoomOption = {
  id: string;
  /** In the guest's language (host-written: dir="auto"). */
  name: string;
  /** Per night, in `currency`. */
  price: number;
  currency: CurrencyCode;
  weekendPrice: number | null;
  /** Per room; null = the listing's maximum. */
  maxGuests: number | null;
  /** The listing's cleaning fee when the room type uses the listing's currency (per room). */
  cleaningFee: number | null;
  /** The room type's own holiday prices first, then the listing's (terms.datePricesFor). */
  datePrices: DatePriceTerm[];
  /** Hotels: identical rooms of this type and the nights with fewer free (else unset). */
  quantity?: number;
  segments?: FreeSegment[];
};

/**
 * Room types of the place (round 3, founder's answer 3). `inventory` (hotels): rooms are counted
 * per type, the guest picks how many rooms (up to the free ones), and guests may be up to the
 * type's maximum × rooms. Otherwise the guest only picks the room type.
 */
export type StayRooms = {
  inventory: boolean;
  options: StayRoomOption[];
  initialRoomTypeId?: string | null;
  initialRooms?: number;
};

/** The room picker's state, from <StayProvider rooms>. */
export type StayRoomState = StayRooms & {
  roomTypeId: string | null;
  room: StayRoomOption | null;
  setRoomTypeId: (id: string) => void;
  /** Rooms of the chosen type (1 unless `inventory`). */
  rooms: number;
  setRooms: (rooms: number) => void;
  /** Free rooms of a type for the chosen nights (its quantity before dates are chosen; null = not counted). */
  freeRooms: (id: string) => number | null;
  /** Adults + children allowed with the chosen room type and rooms (null = no limit set). */
  guestLimit: number | null;
  /** Adults + children fit in the chosen rooms. */
  guestsFit: boolean;
  /** Hotels: no room type has a free room for the chosen nights (each is full on some night). */
  allFull: boolean;
};

/** Replaces the address in place (no server round trip), keeping the other parameters. */
function replaceSearch(update: (search: string) => string) {
  try {
    const url = new URL(window.location.href);
    const href = `${url.pathname}${update(url.search)}${url.hash}`;
    if (href !== `${url.pathname}${url.search}${url.hash}`) window.history.replaceState(window.history.state, "", href);
  } catch {
    // The address could not be updated (old browser): the page still works with the state.
  }
}

type StayState = {
  dates: StayDates;
  setDates: (dates: StayDates) => void;
  nights: number;
  rules: PickRules;
  /** How many months ahead the calendar can page (the loaded booked dates cover them). */
  maxMonths: number;
  price: StayPrice;
  /** Adults, children, infants (the dates and guests sheet; in the address as adults/children/infants). */
  guests: GuestCounts;
  setGuests: (guests: GuestCounts) => void;
  /** Adults + children the place takes (null = no limit set). */
  maxGuests: number | null;
  /** Guests book on the site (bookingMode INSTANT); otherwise "Book" becomes "Ask the host". */
  instant: boolean;
  /** The price of the chosen nights, line by line (nights, date prices, discount, cleaning fee), or null. */
  quote: Quote | null;
  /** Room types to pick from, or null for a place booked as a whole. */
  roomPicker: StayRoomState | null;
  /** A room type must be picked (and have the rooms asked for) before going on to book. */
  needsRoom: boolean;
  /** The chosen nights are shorter than the minimum stay (then there is no quote and no bookHref). */
  minStay: StayMinStay | null;
  /** The total in the host's currency, or null (no dates yet, a "from" price, not per night). */
  total: number | null;
  /** /listing/<id>/book?checkIn&checkOut&adults… once both dates are chosen (and long enough). */
  bookHref: string | null;
  sheetOpen: boolean;
  setSheetOpen: (open: boolean) => void;
};

const StayContext = createContext<StayState | null>(null);

export function useStay(): StayState {
  const value = useContext(StayContext);
  if (!value) throw new Error("useStay must be used inside <StayProvider>");
  return value;
}

/**
 * The stay dates of a short-stay or hotel listing, shared by the "Availability" calendar, the
 * dates sheet, the phone's sticky bar and the desktop booking box. The dates live in the address
 * (?checkIn&checkOut, replaced in place without a server round trip), so a shared link or a reload
 * keeps them and the contact message mentions them.
 */
export function StayProvider({
  initial,
  guests: guestCount,
  initialGuests,
  maxGuests = null,
  instant = true,
  blocks,
  today,
  minNights,
  maxMonths = 6,
  price,
  rooms: roomsInput = null,
  listingPath,
  children,
}: {
  initial: StayDates;
  /** The search's single guest count (older links): becomes adults when `initialGuests` is not given. */
  guests: number | null;
  initialGuests?: GuestCounts | null;
  maxGuests?: number | null;
  instant?: boolean;
  blocks: DateBlock[];
  /** "YYYY-MM-DD" in Georgia, from the server (so both render the same month). */
  today: string;
  minNights: number | null;
  maxMonths?: number;
  price: StayPrice;
  /** Room types to pick from (hotels and places with room types). */
  rooms?: StayRooms | null;
  /** The listing's path without the locale (/listing/104-…). */
  listingPath: string;
  children: ReactNode;
}) {
  const [dates, setState] = useState<StayDates>(initial);
  const [sheetOpen, setSheetOpen] = useState(false);
  const [roomTypeId, setRoomState] = useState<string | null>(() =>
    roomsInput?.options.some((o) => o.id === roomsInput.initialRoomTypeId) ? (roomsInput.initialRoomTypeId ?? null) : null,
  );
  const [roomCount, setRoomCount] = useState<number>(() => (roomsInput?.inventory ? Math.min(MAX_ROOMS_PER_BOOKING, Math.max(1, roomsInput.initialRooms ?? 1)) : 1));
  // Hotels: a room type's maximum is per room, so the counters allow up to the booking ceiling.
  const counterMax = roomsInput?.inventory ? null : maxGuests;
  const [guests, setGuestState] = useState<GuestCounts>(() => clampGuests(initialGuests ?? { adults: guestCount ?? 1 }, counterMax));
  const { currency: displayCurrency, rates } = useCurrency();
  const roomOption = roomsInput?.options.find((o) => o.id === roomTypeId) ?? null;
  const freeOf = useCallback(
    (option: StayRoomOption | null | undefined, stay: StayDates): number | null => {
      if (!option || !roomsInput?.inventory || option.quantity === undefined) return null;
      if (!stay.checkIn || !stay.checkOut) return option.quantity;
      return freeFromSegments(option.quantity, option.segments ?? [], stay.checkIn, stay.checkOut);
    },
    [roomsInput?.inventory],
  );
  const setRooms = useCallback((next: number) => {
    const value = Math.min(MAX_ROOMS_PER_BOOKING, Math.max(1, Math.floor(next)));
    setRoomCount(value);
    replaceSearch((search) => withBookParams(search, { rooms: value }));
  }, []);
  const setRoomTypeId = useCallback(
    (id: string) => {
      setRoomState(id);
      // Fewer rooms of the new type are free: ask for at most those.
      const free = freeOf(roomsInput?.options.find((o) => o.id === id), dates);
      const value = free !== null && free > 0 && roomCount > free ? free : roomCount;
      if (value !== roomCount) setRoomCount(value);
      replaceSearch((search) => withBookParams(search, { roomTypeId: id, rooms: value }));
    },
    [freeOf, roomsInput, dates, roomCount],
  );
  const setDates = useCallback(
    (next: StayDates) => {
      setState(next);
      replaceSearch((search) => withStayParams(search, next));
      // New nights with fewer free rooms of the chosen type: keep the rooms within them.
      const free = freeOf(roomOption, next);
      if (free !== null && free > 0 && roomCount > free) {
        setRoomCount(free);
        replaceSearch((search) => withBookParams(search, { rooms: free }));
      }
    },
    [freeOf, roomOption, roomCount],
  );
  const setGuests = useCallback((next: GuestCounts) => {
    setGuestState(next);
    replaceSearch((search) => withBookParams(search, { guests: next }));
  }, []);

  const value = useMemo<StayState>(() => {
    const nights = dates.checkIn && dates.checkOut ? nightsBetween(dates.checkIn, dates.checkOut) : 0;
    const inventory = !!roomsInput?.inventory;
    const rooms = inventory && roomOption ? roomCount : 1;
    // A chosen room type prices the stay (every night and the cleaning fee per room, for hotels).
    const shown: StayPrice = roomOption
      ? {
          amount: roomOption.price,
          currency: roomOption.currency,
          period: "NIGHT",
          from: false,
          cleaningFee: roomOption.cleaningFee,
          weekendPrice: roomOption.weekendPrice,
          datePrices: roomOption.datePrices,
          weeklyDiscountPct: price.weeklyDiscountPct,
          monthlyDiscountPct: price.monthlyDiscountPct,
        }
      : price;
    const perNight = shown.amount && shown.amount > 0 && shown.period === "NIGHT" && !shown.from ? shown.amount : null;
    // The same pure rules as the review page and the server (the picker already keeps the minimum).
    const result =
      nights > 0 && perNight && dates.checkIn && dates.checkOut
        ? quoteStay(
            {
              currency: shown.currency,
              nightlyPrice: perNight,
              weekendPrice: shown.weekendPrice,
              cleaningFee: shown.cleaningFee,
              minStayNights: minNights,
              datePrices: shown.datePrices,
              weeklyDiscountPct: shown.weeklyDiscountPct,
              monthlyDiscountPct: shown.monthlyDiscountPct,
              rooms,
            },
            { checkIn: dates.checkIn, checkOut: dates.checkOut, adults: 1 },
            { today, displayCurrency, rates },
          )
        : null;
    const quote = result?.ok ? result.quote : null;
    // A date price's own minimum stay (the picker only knows the listing's): explained in the sheet.
    const minStay: StayMinStay | null =
      result && !result.ok && result.error === "min_stay"
        ? { minNights: result.minNights ?? 1, ...(result.datePrice ? { datePrice: result.datePrice } : {}) }
        : null;
    const limit = roomOption ? roomGuestLimit(roomOption.maxGuests ?? maxGuests, rooms) : counterMax;
    const guestsFit = countedGuests(guests) <= guestLimit(limit);
    const free = freeOf(roomOption, dates);
    const roomPicker: StayRoomState | null = roomsInput
      ? {
          ...roomsInput,
          roomTypeId: roomOption?.id ?? null,
          room: roomOption,
          setRoomTypeId,
          rooms,
          setRooms,
          freeRooms: (id) => freeOf(roomsInput.options.find((o) => o.id === id), dates),
          guestLimit: limit,
          guestsFit,
          allFull: inventory && noRoomTypeFree(roomsInput.options, dates.checkIn, dates.checkOut),
        }
      : null;
    // Hotels: a room type with enough free rooms for the guests is chosen before booking. Other
    // places with room types need one only when they have no price of their own.
    const ownPrice = !!price.amount && price.amount > 0 && !price.from;
    const needsRoom = !roomsInput || roomsInput.options.length === 0
      ? false
      : inventory
        ? !roomOption || !guestsFit || (free !== null && free < rooms)
        : (!roomOption && !ownPrice) || (!!roomOption && !guestsFit);
    return {
      dates,
      setDates,
      nights,
      rules: { blocks, today, minNights },
      maxMonths,
      price: shown,
      guests,
      setGuests,
      maxGuests: counterMax,
      instant,
      quote,
      roomPicker,
      needsRoom,
      minStay,
      total: quote?.total ?? null,
      bookHref:
        nights > 0 && !minStay
          ? bookHref(listingPath, { checkIn: dates.checkIn, checkOut: dates.checkOut, guests, roomTypeId: roomOption?.id ?? null, rooms })
          : null,
      sheetOpen,
      setSheetOpen,
    };
  }, [dates, setDates, blocks, today, minNights, maxMonths, price, listingPath, guests, setGuests, counterMax, maxGuests, instant, displayCurrency, rates, sheetOpen, roomsInput, roomOption, roomCount, setRoomTypeId, setRooms, freeOf]);

  return <StayContext.Provider value={value}>{children}</StayContext.Provider>;
}

/** An amount in the host's currency shown in the visitor's display currency ("≈ ₪1,310"). */
export function useStayMoney() {
  const t = useTranslations("listingCard.price");
  const locale = useLocale();
  const { currency: display, format } = useCurrency();
  return (amount: number, currency: CurrencyCode) =>
    display === currency
      ? formatMoney(amount, currency, locale)
      : t("approx", { price: isolate(format(amount, currency, { maximumFractionDigits: 0 })) });
}
