import { useLocale, useTranslations } from "next-intl";
import { BedDoubleIcon, BedSingleIcon, RulerIcon, UsersIcon } from "lucide-react";
import { Price } from "@/components/listing/price";
import { formatArea } from "@/lib/format";
import type { RoomTypeData } from "@/lib/listing-page/types";
import { RoomPhotos } from "./room-photos";
import { Section } from "./section";

/** Hotels and guesthouses: each room type as a card — photos, guests, beds, size and price. */
export function RoomTypesSection({ rooms }: { rooms: RoomTypeData[] }) {
  const t = useTranslations("listing.rooms");
  const locale = useLocale();
  if (rooms.length === 0) return null;
  return (
    <Section id="rooms" title={t("title")} description={t("subtitle", { count: rooms.length })}>
      <ul className="grid gap-4 sm:grid-cols-2">
        {rooms.map((room) => {
          const facts = [
            room.maxGuests ? { key: "guests", icon: UsersIcon, text: t("guests", { count: room.maxGuests }) } : null,
            room.bedsDouble ? { key: "double", icon: BedDoubleIcon, text: t("bedsDouble", { count: room.bedsDouble }) } : null,
            room.bedsSingle ? { key: "single", icon: BedSingleIcon, text: t("bedsSingle", { count: room.bedsSingle }) } : null,
            room.sizeSqm ? { key: "size", icon: RulerIcon, text: formatArea(room.sizeSqm, locale) } : null,
          ].filter((fact) => fact !== null);
          return (
            <li key={room.id} className="grid content-start overflow-hidden rounded-card border bg-card shadow-card">
              <RoomPhotos photos={room.photos} name={room.name} />
              <div className="grid gap-2.5 p-4">
                <h3 dir="auto" className="text-h3">
                  {room.name}
                </h3>
                {facts.length ? (
                  <ul className="flex flex-wrap gap-1.5">
                    {facts.map(({ key, icon: Icon, text }) => (
                      <li key={key} className="inline-flex min-h-8 items-center gap-1.5 rounded-full bg-muted/80 px-2.5 text-small font-medium dark:bg-muted">
                        <Icon className="size-4 text-primary-text" aria-hidden />
                        {text}
                      </li>
                    ))}
                  </ul>
                ) : null}
                {room.description ? (
                  <p dir="auto" className="line-clamp-3 text-small text-foreground/80">
                    {room.description}
                  </p>
                ) : null}
                <div className="mt-1 border-t pt-3">
                  <Price amount={room.price} currency={room.currency} period={room.pricePeriod} size="card" />
                </div>
              </div>
            </li>
          );
        })}
      </ul>
    </Section>
  );
}
