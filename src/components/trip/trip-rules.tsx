import { getTranslations } from "next-intl/server";
import { Card } from "@/components/ds/card";
import { SpriteIcon } from "@/components/ds/sprite-icons";
import type { SpriteIconName } from "@/components/ds/sprite-icons.generated";
import type { AppLocale } from "@/config/site";
import type { HouseRule } from "@/lib/listing-page/highlights";
import { isolate } from "@/lib/format";
import { clockLabel } from "@/lib/listing/check-times";

const ICONS: Record<HouseRule["key"], SpriteIconName> = {
  smoking: "cigarette",
  pets: "paw-print",
  parties: "party-popper",
  quietHours: "volume-1",
};

/** "כללי הבית" (round 3, brief 7.1): the rules the host set, nothing invented. Hidden when none. */
export async function TripRules({ locale, rules }: { locale: AppLocale; rules: HouseRule[] }) {
  if (rules.length === 0) return null;
  const t = await getTranslations({ locale, namespace: "trips.rules" });
  return (
    <Card as="section" aria-labelledby="trip-rules" className="grid gap-3">
      <h2 id="trip-rules" className="text-h2">
        {t("title")}
      </h2>
      <ul className="grid gap-2.5">
        {rules.map((rule) => (
          <li key={rule.key} className="flex items-center gap-3 text-body">
            <SpriteIcon name={ICONS[rule.key]} className="size-5 shrink-0 text-muted-foreground" />
            {rule.key === "quietHours" ? (
              <span>{t("quietHours", { from: isolate(clockLabel(rule.from, locale)), to: isolate(clockLabel(rule.to, locale)) })}</span>
            ) : (
              <span>{t(`${rule.key}.${rule.allowed ? "yes" : "no"}`)}</span>
            )}
          </li>
        ))}
      </ul>
    </Card>
  );
}
