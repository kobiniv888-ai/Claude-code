import { useLocale, useTranslations } from "next-intl";
import { BedDoubleIcon, BedSingleIcon, BedIcon, RulerIcon, UsersIcon } from "lucide-react";
import { Price } from "@/components/listing/price";
import { formatArea } from "@/lib/format";
import type { RoomTypeData } from "@/lib/listing-page/types";
import { RoomPhotos } from "./room-photos";
import { Section } from "./section";

/** Hotels and guesthouses: each room type with its photos, beds, guests, size and price. */
export function RoomTypesSection({ rooms }: { rooms: RoomTypeData[] }) {
  const t = useTranslations("listing.rooms");
  const locale = useLocale();
  if (rooms.length === 0) return null;
  return (
    <Section id="rooms" title={t("title")} description={t("subtitle", { count: rooms.length })} icon={BedIcon}>
      <ul className="grid gap-5 sm:grid-cols-2">
        {rooms.map((room) => (
          <li key={room.id} className="grid content-start gap-3 rounded-2xl border p-3">
            <RoomPhotos photos={room.photos} name={room.name} />
            <div className="grid gap-2 px-1 pb-1">
              <h3 dir="auto" className="text-lg font-semibold">
                {room.name}
              </h3>
              <ul className="flex flex-wrap gap-x-4 gap-y-1.5 text-sm text-muted-foreground">
                {room.maxGuests ? (
                  <li className="inline-flex items-center gap-1.5">
                    <UsersIcon className="size-4" aria-hidden />
                    {t("guests", { count: room.maxGuests })}
                  </li>
                ) : null}
                {room.bedsDouble ? (
                  <li className="inline-flex items-center gap-1.5">
                    <BedDoubleIcon className="size-4" aria-hidden />
                    {t("bedsDouble", { count: room.bedsDouble })}
                  </li>
                ) : null}
                {room.bedsSingle ? (
                  <li className="inline-flex items-center gap-1.5">
                    <BedSingleIcon className="size-4" aria-hidden />
                    {t("bedsSingle", { count: room.bedsSingle })}
                  </li>
                ) : null}
                {room.sizeSqm ? (
                  <li className="inline-flex items-center gap-1.5">
                    <RulerIcon className="size-4" aria-hidden />
                    {formatArea(room.sizeSqm, locale)}
                  </li>
                ) : null}
              </ul>
              {room.description ? (
                <p dir="auto" className="line-clamp-3 text-sm text-foreground/80">
                  {room.description}
                </p>
              ) : null}
              <Price amount={room.price} currency={room.currency} period={room.pricePeriod} size="md" />
            </div>
          </li>
        ))}
      </ul>
    </Section>
  );
}
