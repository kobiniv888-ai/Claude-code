import { useLocale, useTranslations } from "next-intl";
import { SpriteIcon } from "@/components/ds/sprite-icons";
import type { SpriteIconName } from "@/components/ds/sprite-icons.generated";
import { Price } from "@/components/listing/price";
import { formatArea, formatNumber } from "@/lib/format";
import { AMENITIES, type Amenity } from "@/lib/listing/fields";
import type { RoomTypeData } from "@/lib/listing-page/types";
import { AMENITY_SPRITE } from "./icons";
import { RoomPhotos } from "./room-photos";
import { Section } from "./section";

/** In-room amenities shown on a card before "+N". */
const AMENITIES_SHOWN = 4;

const isAmenity = (key: string): key is Amenity => (AMENITIES as readonly string[]).includes(key);

/**
 * Hotels and guesthouses: each room type as a card — photos, guests, beds, size, what the room has
 * ("מה יש בחדר", the host's in-room amenities) and price. A server component: icons come from the
 * sprite (CONVENTIONS rule 6), never lucide-react.
 */
export function RoomTypesSection({ rooms }: { rooms: RoomTypeData[] }) {
  const t = useTranslations("listing.rooms");
  const f = useTranslations("listingFields.amenity");
  const locale = useLocale();
  if (rooms.length === 0) return null;
  return (
    <Section id="rooms" title={t("title")} description={t("subtitle", { count: rooms.length })}>
      <ul className="grid gap-4 sm:grid-cols-2">
        {rooms.map((room) => {
          const facts: { key: string; icon: SpriteIconName; text: string }[] = [
            room.maxGuests ? { key: "guests", icon: "users" as const, text: t("guests", { count: room.maxGuests }) } : null,
            room.bedsDouble ? { key: "double", icon: "bed-double" as const, text: t("bedsDouble", { count: room.bedsDouble }) } : null,
            room.bedsSingle ? { key: "single", icon: "bed-single" as const, text: t("bedsSingle", { count: room.bedsSingle }) } : null,
            room.bedsSofa ? { key: "sofa", icon: "sofa" as const, text: t("bedsSofa", { count: room.bedsSofa }) } : null,
            room.sizeSqm ? { key: "size", icon: "ruler" as const, text: formatArea(room.sizeSqm, locale) } : null,
          ].filter((fact) => fact !== null);
          const amenities = (room.amenities ?? []).filter(isAmenity);
          const more = amenities.length - AMENITIES_SHOWN;
          return (
            <li key={room.id} className="grid content-start overflow-hidden rounded-card border border-border bg-card">
              <RoomPhotos photos={room.photos} name={room.name} />
              <div className="grid gap-2.5 p-4">
                <h3 dir="auto" className="text-h3">
                  {room.name}
                </h3>
                {facts.length ? (
                  <ul className="flex flex-wrap gap-1.5">
                    {facts.map(({ key, icon, text }) => (
                      <li key={key} className="inline-flex min-h-8 items-center gap-1.5 rounded-full bg-surface-muted px-2.5 text-small font-medium">
                        <SpriteIcon name={icon} className="size-4 text-primary-text" />
                        {text}
                      </li>
                    ))}
                  </ul>
                ) : null}
                {amenities.length ? (
                  <ul aria-label={t("amenitiesLabel")} className="flex flex-wrap gap-x-3 gap-y-1 text-small text-muted-foreground">
                    {amenities.slice(0, AMENITIES_SHOWN).map((key) => (
                      <li key={key} className="inline-flex items-center gap-1.5">
                        <SpriteIcon name={AMENITY_SPRITE[key]} className="size-4 shrink-0" />
                        {f(key)}
                      </li>
                    ))}
                    {more > 0 ? <li className="font-medium">{t("moreAmenities", { count: formatNumber(more, locale) })}</li> : null}
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
