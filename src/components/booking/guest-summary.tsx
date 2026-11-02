"use client";

import { useTranslations } from "next-intl";
import type { GuestCounts } from "@/lib/booking/guest";

/** "3 guests · 1 infant" (adults + children, then infants). Text: `booking.guests`. */
export function useGuestSummary() {
  const t = useTranslations("booking.guests");
  return (guests: GuestCounts) =>
    [t("total", { count: guests.adults + guests.children }), guests.infants > 0 ? t("infants", { count: guests.infants }) : null]
      .filter(Boolean)
      .join(" · ");
}
