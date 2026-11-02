"use client";

import { useLocale, useTranslations } from "next-intl";
import { BottomSheet } from "@/components/ds/bottom-sheet";
import { Button, buttonStyles } from "@/components/ds/button";
import { AvailabilityPicker } from "@/components/listing-page/availability-picker";
import { useStay } from "@/components/listing-page/stay-dates";
import { Link } from "@/i18n/navigation";
import { formatMoney } from "@/lib/format";
import { GuestCounters } from "./guest-counters";
import { PriceBreakdown } from "./price-breakdown";

/**
 * "Dates and guests" (brief 5.5 step 1): the availability calendar (booked nights disabled, the
 * minimum-nights hint), the adults / children / infants counters and the live price, computed in
 * the browser with the booking rules (the review page confirms it with the server).
 *
 * `mode="continue"` (the listing page): the footer goes on to the review page.
 * `mode="apply"` (the review page): the footer only closes the sheet.
 * Needs <StayProvider>. Text: `booking.sheet`, `booking.price`, `booking.guests`, `listing.booking`.
 */
export function DatesGuestsSheet({ mode = "continue" }: { mode?: "continue" | "apply" }) {
  const t = useTranslations("booking.sheet");
  const tp = useTranslations("booking.price");
  const tl = useTranslations("listing.booking");
  const locale = useLocale();
  const { sheetOpen, setSheetOpen, nights, dates, setDates, guests, setGuests, maxGuests, quote, bookHref, price, instant } = useStay();
  const close = () => setSheetOpen(false);
  const goOn = mode === "continue" && instant;

  const summary =
    quote !== null ? (
      <span className="grid min-w-0">
        <span className="truncate text-body font-semibold tabular-nums">
          <bdi>{formatMoney(quote.total, quote.currency, locale)}</bdi>
        </span>
        <span className="truncate text-caption text-muted-foreground">{tp("nights", { count: nights })}</span>
      </span>
    ) : (
      <span className="min-w-0 text-caption text-muted-foreground">{nights > 0 ? tp("nights", { count: nights }) : t("pickDates")}</span>
    );

  const action =
    goOn && bookHref ? (
      <Link href={bookHref} onClick={close} className={buttonStyles({ className: "min-w-0 flex-1 shrink" })}>
        <span className="truncate">{t("continue")}</span>
      </Link>
    ) : (
      <Button className="min-w-0 flex-1 shrink" onClick={close} disabled={nights === 0 && mode === "continue" && instant}>
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
        <div className="flex items-center gap-3">
          <div className="min-w-0 flex-1">{summary}</div>
          {action}
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
        {quote ? (
          <section aria-labelledby="sheet-price-title" className="grid gap-3 border-t border-border pt-4">
            <h3 id="sheet-price-title" className="text-h3 font-semibold">
              {tp("title")}
            </h3>
            <PriceBreakdown quote={quote} />
          </section>
        ) : price.from && nights > 0 ? (
          <p className="border-t border-border pt-4 text-small text-muted-foreground">{t("roomLater")}</p>
        ) : null}
      </div>
    </BottomSheet>
  );
}
