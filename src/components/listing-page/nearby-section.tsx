import { useLocale, useTranslations } from "next-intl";
import { BusIcon, DropletsIcon, HouseHeartIcon, LandmarkIcon, MapPinnedIcon, PlaneIcon, ShoppingCartIcon, TrainFrontIcon, UtensilsIcon, type LucideIcon } from "lucide-react";
import { Ltr } from "@/components/common/ltr";
import { pickLocalized } from "@/i18n/locale";
import { formatNumber } from "@/lib/format";
import type { NearbyInfo } from "@/lib/nearby";
import { Section } from "./section";

type Row = { key: string; icon: LucideIcon; label: string; name: string | null; value: string };

/** Nearby places with walking times, and the distance to the airport. */
export function NearbySection({ nearby }: { nearby: NearbyInfo }) {
  const t = useTranslations("listing.nearby");
  const locale = useLocale();
  const rows: Row[] = [];
  const place = (key: "synagogue" | "chabad" | "kosherFood" | "mikveh", icon: LucideIcon) => {
    const p = nearby[key];
    if (!p) return;
    rows.push({ key, icon, label: t(key), name: pickLocalized(p.name, locale) || null, value: t("walk", { count: p.minutes }) });
  };
  place("synagogue", LandmarkIcon);
  place("chabad", HouseHeartIcon);
  place("kosherFood", UtensilsIcon);
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
    <Section id="nearby" title={t("title")} description={t("note")} icon={MapPinnedIcon}>
      <ul className="grid gap-2 sm:grid-cols-2">
        {rows.map(({ key, icon: Icon, label, name, value }) => (
          <li key={key} className="flex items-center gap-3 rounded-xl border p-3">
            <span className="inline-flex size-9 shrink-0 items-center justify-center rounded-lg bg-secondary text-primary">
              <Icon className="size-4.5" aria-hidden />
            </span>
            <span className="grid min-w-0 flex-1">
              <span className="font-medium">{label}</span>
              {name ? (
                <span dir="auto" className="truncate text-xs text-muted-foreground">
                  {name}
                </span>
              ) : null}
            </span>
            <span className="shrink-0 text-sm font-semibold text-primary">
              {key === "airport" ? <Ltr>{value}</Ltr> : value}
            </span>
          </li>
        ))}
      </ul>
    </Section>
  );
}
