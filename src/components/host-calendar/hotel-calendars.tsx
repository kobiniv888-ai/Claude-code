"use client";

import { useMemo, useState, type ComponentProps } from "react";
import { useTranslations } from "next-intl";
import { BedDoubleIcon, CalendarClockIcon, EyeOffIcon, HotelIcon, InfoIcon } from "lucide-react";
import { Card } from "@/components/ds/card";
import type { HostDatePrice } from "@/lib/booking/date-prices";
import type { HostRoomCalendar } from "@/lib/booking/host-calendar";
import { cn } from "@/lib/utils";
import { HostCalendar } from "./host-calendar";
import { IcalPanel } from "./ical-panel";
import { RoomCalendar } from "./room-calendar";
import { indexHotelNights } from "./room-model";

type CalendarProps = ComponentProps<typeof HostCalendar>;
type PanelProps = Omit<ComponentProps<typeof IcalPanel>, "listingId" | "roomTypeId" | "returnTo">;

/**
 * The hotel calendar (round 3, founder's answer 3): "the whole hotel" (blocks that close every
 * room, the rooms left per night and which bookings hold them) or one room type at a time (its
 * free rooms per night, close N rooms, its bookings), each with its own calendar links. Both show
 * the Jewish holidays and set holiday prices; the prices are kept here, so a price saved in one
 * view shows in the other. Under the switch, the note about the sync gap with other sites.
 * The switch is a group of native radios (one Tab stop, arrow keys). Text:
 * `hostBooking.calendar.rooms`, `hostBooking.calendar`.
 */
export function HotelCalendars({
  calendar,
  rooms,
  closed,
  listingSync,
  returnTo,
}: {
  /** The whole hotel's calendar (its own blocks, holiday prices, Jewish holidays). */
  calendar: CalendarProps;
  rooms: HostRoomCalendar[];
  /** Nights the whole hotel is closed (end exclusive). */
  closed: { start: string; end: string }[];
  /** The whole hotel's calendar links. */
  listingSync: PanelProps;
  returnTo?: string;
}) {
  const t = useTranslations("hostBooking.calendar.rooms");
  const tc = useTranslations("hostBooking.calendar");
  const [scope, setScope] = useState<string>(rooms[0]?.id ?? "hotel");
  const room = rooms.find((r) => r.id === scope) ?? null;
  // One list of holiday prices for every view (a save in one shows in the others).
  const [datePrices, setDatePrices] = useState<HostDatePrice[]>(calendar.datePrices ?? []);
  const hotelNights = useMemo(() => indexHotelNights(rooms, closed, calendar.today), [rooms, closed, calendar.today]);

  const chip = (id: string, label: string, off = false) => (
    <label
      key={id}
      className={cn(
        "inline-flex min-h-11 max-w-full cursor-pointer items-center gap-1.5 rounded-full border px-4 text-small font-medium transition-colors has-focus-visible:ring-3 has-focus-visible:ring-ring/50",
        scope === id ? "border-primary bg-primary text-primary-foreground" : "border-border-strong bg-card text-foreground hover:bg-surface-muted",
      )}
    >
      <input type="radio" name="calendar-scope" value={id} className="sr-only" checked={scope === id} onChange={() => setScope(id)} />
      {id === "hotel" ? <HotelIcon className="size-4 shrink-0" aria-hidden /> : <BedDoubleIcon className="size-4 shrink-0" aria-hidden />}
      <span dir="auto" className="truncate">
        {label}
      </span>
      {off ? (
        <>
          <EyeOffIcon className="size-3.5 shrink-0" aria-hidden />
          <span className="sr-only">{t("off")}</span>
        </>
      ) : null}
    </label>
  );

  return (
    <div className="grid gap-6">
      <div className="grid gap-3">
        <fieldset className="min-w-0">
          <legend className="sr-only">{t("scopeLabel")}</legend>
          <div className="flex flex-wrap gap-2">
            {rooms.map((r) => chip(r.id, r.name || t("unnamed"), !r.active))}
            {chip("hotel", t("wholeHotel"))}
          </div>
        </fieldset>
        <p className="flex items-start gap-2.5 rounded-card border border-border bg-surface-muted p-3 text-small text-pretty">
          <InfoIcon className="mt-0.5 size-4.5 shrink-0 text-primary-text" aria-hidden />
          <span>{t("syncGap")}</span>
        </p>
      </div>

      <Card as="section" padding="lg" aria-labelledby="calendar-title" className="grid gap-3">
        <div className="grid gap-0.5">
          <h2 id="calendar-title" className="text-h3" dir="auto">
            {room ? room.name || t("unnamed") : t("wholeHotel")}
          </h2>
          <p className="text-small text-pretty text-muted-foreground">
            {room ? (room.active ? t("roomLead", { count: room.quantity }) : t("roomOffLead", { count: room.quantity })) : t("hotelLead")}
          </p>
        </div>
        {room ? (
          <RoomCalendar
            key={room.id}
            listingId={calendar.listingId}
            room={room}
            today={calendar.today}
            monthCount={calendar.monthCount}
            closed={closed}
            bookings={calendar.bookings}
            returnTo={returnTo}
            datePrices={datePrices}
            onDatePricesChange={setDatePrices}
            pricing={calendar.pricing}
            roomTypes={calendar.roomTypes}
            holidays={calendar.holidays}
            holidayPeriods={calendar.holidayPeriods}
          />
        ) : (
          <HostCalendar {...calendar} datePrices={datePrices} onDatePricesChange={setDatePrices} hotelNights={hotelNights} returnTo={returnTo} />
        )}
      </Card>

      <section aria-labelledby="sync-title" className="grid gap-3">
        <div className="grid gap-1">
          <h2 id="sync-title" className="flex items-center gap-2 text-h3">
            <CalendarClockIcon className="size-5 text-primary-text" aria-hidden />
            {tc("syncTitle")}
          </h2>
          <p className="text-small text-pretty text-muted-foreground">{room ? t("syncRoomLead") : t("syncHotelLead")}</p>
        </div>
        {room ? (
          <IcalPanel
            key={room.id}
            listingId={calendar.listingId}
            roomTypeId={room.id}
            exportUrl={room.exportUrl}
            importUrls={room.importUrls}
            syncedAt={room.syncedAt}
            importedNights={room.importedNights}
            returnTo={returnTo}
          />
        ) : (
          <IcalPanel key="hotel" listingId={calendar.listingId} {...listingSync} returnTo={returnTo} />
        )}
      </section>
    </div>
  );
}
