"use client";

import { useLocale, useTranslations } from "next-intl";
import { CalendarClockIcon } from "lucide-react";
import { BottomSheet } from "@/components/ds/bottom-sheet";
import { Button, buttonStyles } from "@/components/ds/button";
import { AvailabilityPicker } from "@/components/listing-page/availability-picker";
import { useStay } from "@/components/listing-page/stay-dates";
import { Link } from "@/i18n/navigation";
import { formatBookingMoney } from "@/lib/booking/price-lines";
import { GuestCounters } from "./guest-counters";
import { useMinStayText } from "./min-stay-text";
import { PriceBreakdown } from "./price-breakdown";
import { RoomPicker } from "./room-picker";

/**
 * "Dates and guests" (brief 5.5 step 1): the availability calendar (booked nights disabled, the
 * minimum-nights hint), the adults / children / infants counters and the live price, computed in
 * the browser with the booking rules (the review page confirms it with the server).
 *
 * `mode="continue"` (the listing page): the footer goes on to the review page.
 * `mode="apply"` (the review page): the footer only closes the sheet.
 * Hotels (round 3, founder's answer 3): under the guests, the room types with their prices and
 * free rooms for the chosen nights, and how many rooms; "continue" needs a room type that has them.
 * Needs <StayProvider>. Text: `booking.sheet`, `booking.price`, `booking.guests`, `booking.rooms`,
 * `listing.booking`.
 */
export function DatesGuestsSheet({ mode = "continue" }: { mode?: "continue" | "apply" }) {
  const t = useTranslations("booking.sheet");
  const tp = useTranslations("booking.price");
  const tl = useTranslations("listing.booking");
  const locale = useLocale();
  const tr = useTranslations("booking.rooms");
  const { sheetOpen, setSheetOpen, nights, dates, setDates, guests, setGuests, maxGuests, quote, minStay, bookHref, price, instant, roomPicker, needsRoom } = useStay();
  const minStayText = useMinStayText();
  const close = () => setSheetOpen(false);
  const goOn = mode === "continue" && instant;
  // Hotels: the room type (and enough free rooms) is picked here before going on.
  const roomMissing = goOn && nights > 0 && !minStay && needsRoom;

  const summary =
    quote !== null ? (
      <span className="grid min-w-0">
        <span className="truncate text-body font-semibold tabular-nums">
          <bdi>{formatBookingMoney(quote.total, quote.currency, locale)}</bdi>
        </span>
        <span className="truncate text-caption text-muted-foreground">{tp("nights", { count: nights })}</span>
      </span>
    ) : (
      <span className="min-w-0 text-caption text-muted-foreground">{nights > 0 ? tp("nights", { count: nights }) : t("pickDates")}</span>
    );

  const action =
    goOn && bookHref && !roomMissing ? (
      <Link href={bookHref} onClick={close} className={buttonStyles({ className: "min-w-0 flex-1 shrink" })}>
        <span className="truncate">{t("continue")}</span>
      </Link>
    ) : (
      <Button className="min-w-0 flex-1 shrink" onClick={close} disabled={(nights === 0 || minStay !== null || roomMissing) && mode === "continue" && instant}>
        <span className="truncate">{goOn ? t("continue") : t("done")}</span>
      </Button>
    );

  return (
    <BottomSheet
      open={sheetOpen}
      onOpenChange={setSheetOpen}
      title={t("title")}
      size="full"
      onClear={dates.checkIn ? () => setDates({ checkIn: null, checkOut: null }) : undefined}
      clearLabel={tl("clear")}
      footer={
        <div className="grid gap-3">
          {minStay ? (
            // A date price's own minimum stay (round 3, brief 6.3), next to the button it blocks (the
            // calendar does not move under the guest's finger); the server refuses shorter stays too.
            <p role="status" className="flex items-start gap-2.5 rounded-input bg-primary-tint px-3 py-2 text-small text-pretty">
              <CalendarClockIcon className="mt-0.5 size-4.5 shrink-0 text-primary-text" aria-hidden />
              <span>
                {minStayText(minStay)} {t("minStayFix")}
              </span>
            </p>
          ) : roomMissing ? (
            <p role="status" className="text-caption text-pretty text-muted-foreground">
              {roomPicker?.room ? tr("fixRooms") : tr("pickToContinue")}
            </p>
          ) : null}
          <div className="flex items-center gap-3">
            <div className="min-w-0 flex-1">{summary}</div>
            {action}
          </div>
        </div>
      }
    >
      <div className="grid gap-6">
        <AvailabilityPicker />
        <section aria-labelledby="sheet-guests-title" className="grid gap-1 border-t border-border pt-4">
          <h3 id="sheet-guests-title" className="text-h3 font-semibold">
            {t("guests")}
          </h3>
          <GuestCounters value={guests} onChange={setGuests} maxGuests={maxGuests} />
        </section>
        {roomPicker ? <RoomPicker className="border-t border-border pt-4" /> : null}
        {quote ? (
          <section aria-labelledby="sheet-price-title" className="grid gap-3 border-t border-border pt-4">
            <h3 id="sheet-price-title" className="text-h3 font-semibold">
              {tp("title")}
            </h3>
            <PriceBreakdown quote={quote} />
          </section>
        ) : price.from && nights > 0 && !roomPicker ? (
          <p className="border-t border-border pt-4 text-small text-muted-foreground">{t("roomLater")}</p>
        ) : null}
      </div>
    </BottomSheet>
  );
}
