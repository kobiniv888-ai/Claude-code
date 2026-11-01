import { useLocale, useTranslations } from "next-intl";
import { BusIcon, DropletsIcon, PlaneIcon, ShoppingCartIcon, TrainFrontIcon } from "lucide-react";
import { Ltr } from "@/components/common/ltr";
import { IconCircle } from "@/components/ds/icon-circle";
import { KosherStampIcon, SynagogueIcon, WelcomeHomeIcon, type IconComponent } from "@/components/ds/jewish-icons";
import { pickLocalized } from "@/i18n/locale";
import { formatNumber } from "@/lib/format";
import type { NearbyInfo } from "@/lib/nearby";

type Row = { key: string; icon: IconComponent; label: string; name: string | null; value: string };

/** Nearby places with walking times, and the distance to the airport (under the location map). */
export function NearbyList({ nearby }: { nearby: NearbyInfo }) {
  const t = useTranslations("listing.nearby");
  const locale = useLocale();
  const rows: Row[] = [];
  const place = (key: "synagogue" | "chabad" | "kosherFood" | "mikveh", icon: IconComponent) => {
    const p = nearby[key];
    if (!p) return;
    rows.push({ key, icon, label: t(key), name: pickLocalized(p.name, locale) || null, value: t("walk", { count: p.minutes }) });
  };
  place("synagogue", SynagogueIcon);
  place("chabad", WelcomeHomeIcon);
  place("kosherFood", KosherStampIcon);
  place("mikveh", DropletsIcon);
  if (nearby.supermarket) {
    const s = nearby.supermarket;
    rows.push({
      key: "supermarket",
      icon: ShoppingCartIcon,
      label: t("supermarket"),
      name: (s.names && pickLocalized(s.names, locale)) || s.name || null,
      value: t("walk", { count: s.minutes }),
    });
  }
  if (nearby.transport) {
    const tr = nearby.transport;
    rows.push({
      key: "transport",
      icon: tr.kind === "bus" ? BusIcon : TrainFrontIcon,
      label: t(`transport.${tr.kind}`),
      name: (tr.names && pickLocalized(tr.names, locale)) || tr.name || null,
      value: t("walk", { count: tr.minutes }),
    });
  }
  if (nearby.airport) {
    rows.push({
      key: "airport",
      icon: PlaneIcon,
      label: t("airport"),
      name: null,
      value: t("km", { km: formatNumber(nearby.airport.km, locale), code: nearby.airport.code }),
    });
  }
  if (rows.length === 0) return null;

  return (
    <div className="grid gap-2">
      <ul className="grid gap-2 sm:grid-cols-2">
        {rows.map(({ key, icon, label, name, value }) => (
          <li key={key} className="flex items-center gap-3 rounded-2xl border bg-card p-2.5">
            <IconCircle icon={icon} tone="navy" size="sm" />
            <span className="grid min-w-0 flex-1">
              <span className="text-small font-semibold">{label}</span>
              {name ? (
                <span dir="auto" className="truncate text-caption text-muted-foreground">
                  {name}
                </span>
              ) : null}
            </span>
            <span className="shrink-0 text-small font-bold text-navy">{key === "airport" ? <Ltr>{value}</Ltr> : value}</span>
          </li>
        ))}
      </ul>
      <p className="text-caption text-muted-foreground">{t("note")}</p>
    </div>
  );
}
