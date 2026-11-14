"use client";

import { useLocale, useTranslations } from "next-intl";
import type { StayMinStay } from "@/components/listing-page/stay-dates";
import { pickLocalized } from "@/i18n/locale";
import { addDays } from "@/lib/booking/dates";
import { formatDateRange } from "@/lib/format";

/** First-strong isolate: the host's note keeps its own direction inside the sentence. */
const auto = (text: string) => `⁨${text}⁩`;

/**
 * Why the chosen nights are too short, in words: a date price's own minimum ("בתאריכים 24–26
 * בדצמבר (חנוכה) המארח מקבל הזמנות של 4 לילות לפחות.") or the listing's minimum ("מינימום 3
 * לילות"). Text: `booking.sheet`, `listing.calendar` (both sent to the listing page).
 */
export function useMinStayText() {
  const t = useTranslations("booking.sheet");
  const tc = useTranslations("listing.calendar");
  const locale = useLocale();
  return (minStay: StayMinStay): string => {
    const price = minStay.datePrice;
    if (!price) return tc("minStay", { count: minStay.minNights });
    // The date price's nights: its end is exclusive (the first night not at that price).
    const range = formatDateRange(price.start, addDays(price.end, -1), locale, { day: "numeric", month: "short" });
    const label = price.label ? pickLocalized(price.label, locale).trim() : "";
    const dates = label ? t("datesWithLabel", { dates: range, label: auto(label) }) : range;
    return t("minStayDates", { count: minStay.minNights, dates });
  };
}
