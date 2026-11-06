"use client";

import { useState, type ComponentProps } from "react";
import { useTranslations } from "next-intl";
import { BedDoubleIcon, CalendarClockIcon, EyeOffIcon, HotelIcon, InfoIcon } from "lucide-react";
import { Card } from "@/components/ds/card";
import type { HostRoomCalendar } from "@/lib/booking/host-calendar";
import { cn } from "@/lib/utils";
import { HostCalendar } from "./host-calendar";
import { IcalPanel } from "./ical-panel";
import { RoomCalendar } from "./room-calendar";

type CalendarProps = ComponentProps<typeof HostCalendar>;
type PanelProps = Omit<ComponentProps<typeof IcalPanel>, "listingId" | "roomTypeId" | "returnTo">;

/**
 * The hotel calendar (round 3, founder's answer 3): "the whole hotel" (blocks that close every
 * room, holiday prices) or one room type at a time (its free rooms per night, close N rooms, its
 * bookings), each with its own calendar links. Under the switch, the note about the sync gap with
 * other sites. Text: `hostBooking.calendar.rooms`, `hostBooking.calendar`.
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

  const chip = (id: string, label: string, off = false) => (
    <button
      key={id}
      type="button"
      role="radio"
      aria-checked={scope === id}
      onClick={() => setScope(id)}
      className={cn(
        "inline-flex min-h-11 max-w-full items-center gap-1.5 rounded-full border px-4 text-small font-medium outline-none transition-colors focus-visible:ring-3 focus-visible:ring-ring/50",
        scope === id ? "border-primary bg-primary text-primary-foreground" : "border-border-strong bg-card text-foreground hover:bg-surface-muted",
      )}
    >
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
    </button>
  );

  return (
    <div className="grid gap-6">
      <div className="grid gap-3">
        <div role="radiogroup" aria-label={t("scopeLabel")} className="flex flex-wrap gap-2">
          {rooms.map((r) => chip(r.id, r.name || t("unnamed"), !r.active))}
          {chip("hotel", t("wholeHotel"))}
        </div>
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
          />
        ) : (
          <HostCalendar {...calendar} returnTo={returnTo} />
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
