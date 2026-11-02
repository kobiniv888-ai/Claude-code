import { useLocale, useTranslations } from "next-intl";
import { Ltr } from "@/components/common/ltr";
import { SpriteIcon } from "@/components/ds/sprite-icons";
import type { SpriteIconName } from "@/components/ds/sprite-icons.generated";
import { pickLocalized } from "@/i18n/locale";
import { formatNumber } from "@/lib/format";
import type { NearbyInfo } from "@/lib/nearby";

type Row = { key: string; icon: SpriteIconName; label: string; name: string | null; value: string };

const TRANSPORT_ICON: Record<NonNullable<NearbyInfo["transport"]>["kind"], SpriteIconName> = {
  metro: "train-front",
  train: "train-front",
  tram: "tram-front",
  bus: "bus",
};

/**
 * What is nearby, with walking times, and the distance to the airport (under the location map).
 * Synagogues and kosher places are not repeated here: the nearest verified synagogue is in the
 * folded "Kosher and Shabbat" section (each place once).
 */
export function NearbyList({ nearby }: { nearby: NearbyInfo }) {
  const t = useTranslations("listing.nearby");
  const locale = useLocale();
  const rows: Row[] = [];
  if (nearby.supermarket) {
    const s = nearby.supermarket;
    rows.push({
      key: "supermarket",
      icon: "shopping-cart",
      label: t("supermarket"),
      name: (s.names && pickLocalized(s.names, locale)) || s.name || null,
      value: t("walk", { count: s.minutes }),
    });
  }
  if (nearby.transport) {
    const tr = nearby.transport;
    rows.push({
      key: "transport",
      icon: TRANSPORT_ICON[tr.kind] ?? "bus",
      label: t(`transport.${tr.kind}`),
      name: (tr.names && pickLocalized(tr.names, locale)) || tr.name || null,
      value: t("walk", { count: tr.minutes }),
    });
  }
  if (nearby.airport) {
    rows.push({
      key: "airport",
      icon: "plane",
      label: t("airport"),
      name: null,
      value: t("km", { km: formatNumber(nearby.airport.km, locale), code: nearby.airport.code }),
    });
  }
  if (rows.length === 0) return null;

  return (
    <div className="grid gap-2">
      <ul className="grid gap-3 sm:grid-cols-2">
        {rows.map(({ key, icon, label, name, value }) => (
          <li key={key} className="flex items-center gap-3">
            <SpriteIcon name={icon} className="size-5 shrink-0 text-muted-foreground" />
            <span className="grid min-w-0 flex-1">
              <span className="text-small font-medium">{label}</span>
              {name ? (
                <span dir="auto" className="truncate text-caption text-muted-foreground">
                  {name}
                </span>
              ) : null}
            </span>
            <span className="shrink-0 text-small text-foreground">{key === "airport" ? <Ltr>{value}</Ltr> : value}</span>
          </li>
        ))}
      </ul>
      <p className="text-caption text-muted-foreground">{t("note")}</p>
    </div>
  );
}
