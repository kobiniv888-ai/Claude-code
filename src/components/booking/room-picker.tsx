"use client";

import { useId } from "react";
import { useLocale, useTranslations } from "next-intl";
import { BedDoubleIcon, CircleAlertIcon, MinusIcon, PlusIcon, UsersIcon } from "lucide-react";
import { useStay } from "@/components/listing-page/stay-dates";
import { MAX_ROOMS_PER_BOOKING } from "@/lib/booking/constants";
import { countedGuests } from "@/lib/booking/guest";
import { formatBookingMoney } from "@/lib/booking/price-lines";
import { quoteStay } from "@/lib/booking/pricing";
import { formatMoney, formatNumber } from "@/lib/format";
import { cn } from "@/lib/utils";

const STEP =
  "inline-flex size-11 shrink-0 items-center justify-center rounded-full border border-border-strong bg-card text-foreground outline-none transition-[transform,background-color] duration-(--motion-fast) hover:bg-surface-muted focus-visible:ring-3 focus-visible:ring-ring/50 active:scale-95 motion-reduce:active:scale-100 disabled:pointer-events-none disabled:opacity-35";

/** Left-to-right isolate for an amount inside a translated sentence. */
const isolate = (text: string) => `⁦${text}⁩`;

/**
 * The room type and how many rooms (round 3, founder's answer 3): every room type of the place
 * with its price per night, the price of the chosen nights and, for hotels, the rooms still free
 * on every one of them (a full type can't be picked). Under the chosen one, hotels get a rooms
 * counter (up to the free rooms, at most MAX_ROOMS_PER_BOOKING) and a note when the guests don't
 * fit (up to the type's maximum × rooms). Needs <StayProvider rooms>. Text: `booking.rooms`.
 */
export function RoomPicker({ className, headingLevel = 3 }: { className?: string; headingLevel?: 2 | 3 }) {
  const t = useTranslations("booking.rooms");
  const tp = useTranslations("booking.price");
  const ts = useTranslations("booking.sheet");
  const locale = useLocale();
  const ids = useId();
  const { roomPicker, dates, nights, guests, rules, price } = useStay();
  if (!roomPicker || roomPicker.options.length === 0) return null;
  const { options, roomTypeId, setRoomTypeId, rooms, setRooms, freeRooms, inventory, guestLimit, guestsFit } = roomPicker;
  const datesChosen = nights > 0 && !!dates.checkIn && !!dates.checkOut;
  const Heading = headingLevel === 2 ? "h2" : "h3";
  const chosenFree = roomTypeId ? freeRooms(roomTypeId) : null;
  const maxRooms = Math.max(1, Math.min(MAX_ROOMS_PER_BOOKING, chosenFree ?? MAX_ROOMS_PER_BOOKING));
  const guestCount = countedGuests(guests);
  const neededRooms = roomPicker.room?.maxGuests ? Math.ceil(guestCount / roomPicker.room.maxGuests) : null;
  const roomsLabel = t("rooms");

  return (
    <section aria-labelledby={`${ids}-title`} className={cn("grid gap-3", className)}>
      <div className="grid gap-0.5">
        <Heading id={`${ids}-title`} className={headingLevel === 2 ? "text-h2" : "text-h3 font-semibold"}>
          {t("title")}
        </Heading>
        <p className="text-caption text-muted-foreground">{datesChosen ? t("leadDates") : t("lead")}</p>
      </div>
      <div role="radiogroup" aria-labelledby={`${ids}-title`} className="grid gap-2">
        {options.map((option) => {
          const free = freeRooms(option.id);
          const full = inventory && datesChosen && free === 0;
          const selected = option.id === roomTypeId;
          // The chosen nights for one room of this type, with the same rules as the server.
          const stay =
            datesChosen && !full
              ? quoteStay(
                  {
                    currency: option.currency,
                    nightlyPrice: option.price,
                    weekendPrice: option.weekendPrice,
                    cleaningFee: option.cleaningFee,
                    minStayNights: rules.minNights,
                    datePrices: option.datePrices,
                    weeklyDiscountPct: price.weeklyDiscountPct,
                    monthlyDiscountPct: price.monthlyDiscountPct,
                  },
                  { checkIn: dates.checkIn!, checkOut: dates.checkOut!, adults: 1 },
                  { today: rules.today },
                )
              : null;
          return (
            <label
              key={option.id}
              className={cn(
                "flex min-h-14 cursor-pointer items-start gap-3 rounded-input border px-3 py-2.5 transition-colors has-focus-visible:ring-3 has-focus-visible:ring-ring/50",
                selected ? "border-primary bg-primary-tint" : "border-border hover:border-border-strong",
                full && "cursor-not-allowed bg-surface-muted opacity-70 hover:border-border",
              )}
            >
              <input
                type="radio"
                name={`${ids}-room`}
                value={option.id}
                checked={selected}
                disabled={full}
                onChange={() => setRoomTypeId(option.id)}
                className="mt-1 size-4 shrink-0 accent-(--primary)"
              />
              <span className="grid min-w-0 flex-1 gap-0.5">
                <span dir="auto" className="text-small font-semibold text-pretty">
                  {option.name}
                </span>
                <span className="flex flex-wrap items-center gap-x-3 gap-y-0.5 text-caption text-muted-foreground">
                  {option.maxGuests ? (
                    <span className="inline-flex items-center gap-1">
                      <UsersIcon className="size-3.5" aria-hidden />
                      {t("perRoom", { count: option.maxGuests })}
                    </span>
                  ) : null}
                  {inventory && datesChosen && free !== null ? (
                    <span className={cn("inline-flex items-center gap-1", full || free <= 2 ? "font-medium text-foreground" : undefined)}>
                      <BedDoubleIcon className="size-3.5" aria-hidden />
                      {full ? t("full") : t("left", { count: free })}
                    </span>
                  ) : null}
                </span>
              </span>
              <span className="grid shrink-0 justify-items-end text-end">
                <span className="text-small font-semibold tabular-nums">
                  <bdi>{formatMoney(option.price, option.currency, locale)}</bdi>
                </span>
                <span className="text-caption text-muted-foreground">
                  {stay?.ok ? t("forNights", { total: isolate(formatBookingMoney(stay.quote.total, stay.quote.currency, locale)), nights: tp("nights", { count: nights }) }) : t("night")}
                </span>
              </span>
            </label>
          );
        })}
      </div>

      {inventory && roomPicker.room ? (
        <div className="grid gap-1.5 rounded-input border border-border p-3">
          <div className="flex items-center justify-between gap-3">
            <span className="grid min-w-0">
              <span id={`${ids}-rooms`} className="text-body font-medium">
                {roomsLabel}
              </span>
              <span className="text-caption text-muted-foreground">
                {guestLimit !== null ? t("fits", { guests: formatNumber(guestLimit, locale), rooms: tp("rooms", { count: rooms }) }) : tp("rooms", { count: rooms })}
              </span>
            </span>
            <span className="flex shrink-0 items-center gap-1" role="group" aria-labelledby={`${ids}-rooms`}>
              <button type="button" className={STEP} disabled={rooms <= 1} aria-label={ts("decrease", { label: roomsLabel })} onClick={() => setRooms(rooms - 1)}>
                <MinusIcon className="size-4.5" aria-hidden />
              </button>
              <output aria-live="polite" aria-labelledby={`${ids}-rooms`} className="w-8 text-center text-body font-semibold tabular-nums">
                {formatNumber(rooms, locale)}
              </output>
              <button type="button" className={STEP} disabled={rooms >= maxRooms} aria-label={ts("increase", { label: roomsLabel })} onClick={() => setRooms(rooms + 1)}>
                <PlusIcon className="size-4.5" aria-hidden />
              </button>
            </span>
          </div>
          {datesChosen && chosenFree !== null && chosenFree > 0 && rooms === chosenFree && chosenFree < MAX_ROOMS_PER_BOOKING ? (
            <p className="text-caption text-muted-foreground">{t("onlyLeft", { count: chosenFree })}</p>
          ) : null}
          {datesChosen && chosenFree !== null && chosenFree < rooms ? (
            <p role="alert" className="flex items-start gap-1.5 text-small text-destructive">
              <CircleAlertIcon className="mt-0.5 size-4 shrink-0" aria-hidden />
              {chosenFree === 0 ? t("fullChosen") : t("onlyLeft", { count: chosenFree })}
            </p>
          ) : null}
        </div>
      ) : null}

      {roomPicker.room && !guestsFit ? (
        <p role="alert" className="flex items-start gap-2 rounded-input bg-warning-soft px-3 py-2 text-small text-pretty">
          <CircleAlertIcon className="mt-0.5 size-4 shrink-0 text-warning" aria-hidden />
          <span>
            {inventory && neededRooms !== null && neededRooms <= maxRooms
              ? t("needRooms", { guests: formatNumber(guestCount, locale), rooms: tp("rooms", { count: neededRooms }) })
              : inventory && roomPicker.room?.maxGuests && neededRooms !== null
                ? // Not enough free rooms of this type for everyone: another type may fit.
                  t("noFit", { count: roomPicker.room.maxGuests * maxRooms })
                : t("tooManyGuests", { count: guestLimit ?? 0 })}
          </span>
        </p>
      ) : null}
    </section>
  );
}
