"use client";

import { createContext, useCallback, useContext, useMemo, useState, type ReactNode } from "react";
import { useLocale, useTranslations } from "next-intl";
import { useCurrency } from "@/components/providers/currency-provider";
import type { CurrencyCode } from "@/config/site";
import type { PricePeriod } from "@/generated/prisma/enums";
import { formatMoney } from "@/lib/format";
import type { DateBlock } from "@/lib/listing-page/calendar";
import { bookingPath, nightsBetween, stayTotal, withStayParams, type PickRules, type StayDates } from "@/lib/listing-page/stay";

/** Left-to-right isolate for a price inside a translated sentence. */
const isolate = (text: string) => `⁦${text}⁩`;

export type StayPrice = { amount: number | null; currency: CurrencyCode; period: PricePeriod; from: boolean; cleaningFee: number | null };

type StayState = {
  dates: StayDates;
  setDates: (dates: StayDates) => void;
  nights: number;
  rules: PickRules;
  /** How many months ahead the calendar can page (the loaded booked dates cover them). */
  maxMonths: number;
  price: StayPrice;
  /** The total in the host's currency, or null (no dates yet, a "from" price, not per night). */
  total: number | null;
  /** /listing/<id>/book?checkIn&checkOut&guests once both dates are chosen. */
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
  guests,
  blocks,
  today,
  minNights,
  maxMonths = 6,
  price,
  listingPath,
  children,
}: {
  initial: StayDates;
  guests: number | null;
  blocks: DateBlock[];
  /** "YYYY-MM-DD" in Georgia, from the server (so both render the same month). */
  today: string;
  minNights: number | null;
  maxMonths?: number;
  price: StayPrice;
  /** The listing's path without the locale (/listing/104-…). */
  listingPath: string;
  children: ReactNode;
}) {
  const [dates, setState] = useState<StayDates>(initial);
  const [sheetOpen, setSheetOpen] = useState(false);
  const setDates = useCallback((next: StayDates) => {
    setState(next);
    try {
      const url = new URL(window.location.href);
      const href = `${url.pathname}${withStayParams(url.search, next)}${url.hash}`;
      if (href !== `${url.pathname}${url.search}${url.hash}`) window.history.replaceState(window.history.state, "", href);
    } catch {
      // The address could not be updated (old browser): the page still works with the state.
    }
  }, []);

  const value = useMemo<StayState>(() => {
    const nights = dates.checkIn && dates.checkOut ? nightsBetween(dates.checkIn, dates.checkOut) : 0;
    const perNight = price.amount && price.amount > 0 && price.period === "NIGHT" && !price.from ? price.amount : null;
    return {
      dates,
      setDates,
      nights,
      rules: { blocks, today, minNights },
      maxMonths,
      price,
      total: nights > 0 && perNight ? stayTotal(perNight, nights, price.cleaningFee) : null,
      bookHref: nights > 0 ? bookingPath(listingPath, dates, guests) : null,
      sheetOpen,
      setSheetOpen,
    };
  }, [dates, setDates, blocks, today, minNights, maxMonths, price, listingPath, guests, sheetOpen]);

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
