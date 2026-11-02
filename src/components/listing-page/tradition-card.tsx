import { useLocale, useTranslations } from "next-intl";
import { BadgeCheckIcon, MoonStarIcon, TentIcon } from "lucide-react";
import { IconCircle } from "@/components/ds/icon-circle";
import { KosherStampIcon, ShabbatCandlesIcon, SynagogueIcon, WelcomeHomeIcon, type IconComponent } from "@/components/ds/jewish-icons";
import { HOTEL_JEWISH_FEATURE_ICONS, JEWISH_FEATURE_ICONS, SHABBAT_FEATURE_ICONS } from "@/components/listing/field-icons";
import { ShabbatCountdownCard } from "@/components/shabbat/shabbat-countdown-card";
import type { AppLocale } from "@/config/site";
import { pickLocalized } from "@/i18n/locale";
import { SHABBAT_FEATURES, type HotelJewishFeature, type JewishFeature } from "@/lib/listing/fields";
import type { ListingPageData } from "@/lib/listing-page/types";
import { cn } from "@/lib/utils";
import { CheckItem } from "./section";

const MAX_HIGHLIGHT_WALK = 30;

/** Shown in the checklist (sukkah) or as a highlight (keeps Shabbat), so not repeated as chips. */
const IN_CHECKLIST: readonly JewishFeature[] = ["sukkah_space", "host_keeps_shabbat"];

function Highlight({ icon, label, value, detail }: { icon: IconComponent; label: string; value: React.ReactNode; detail?: React.ReactNode }) {
  return (
    <li className="flex items-center gap-3 rounded-2xl bg-card p-3 shadow-card">
      <IconCircle icon={icon} tone="navy" size="md" />
      <div className="grid min-w-0">
        <span className="text-caption text-muted-foreground">{label}</span>
        <span className="text-small font-bold text-foreground">{value}</span>
        {detail ? <span className="text-caption text-muted-foreground">{detail}</span> : null}
      </div>
    </li>
  );
}

function FeatureChips({ items }: { items: { key: string; icon: IconComponent; label: string }[] }) {
  if (items.length === 0) return null;
  return (
    <ul className="flex flex-wrap gap-2">
      {items.map(({ key, icon: Icon, label }) => (
        <li key={key} className="inline-flex min-h-9 items-center gap-1.5 rounded-full bg-card px-3 text-small font-medium shadow-card">
          <Icon className="size-4 shrink-0 text-primary-text" aria-hidden="true" />
          {label}
        </li>
      ))}
    </ul>
  );
}

/**
 * "For those who keep tradition" — a colored callout (Zillow style) that puts the Jewish facts
 * of the place in one spot: kosher kitchen, the nearest synagogue on foot (with its name), the
 * host keeps Shabbat, the Shabbat checklist (✓/✗, with the sukkah), other Jewish details, hotel
 * kosher food, and this week's Shabbat times for the city (live countdown).
 * The kosher certificate photo is never shown.
 */
export function TraditionCard({ data, locale }: { data: ListingPageData; locale: AppLocale }) {
  const t = useTranslations("listing.jewish");
  const f = useTranslations("listingFields");
  const uiLocale = useLocale();
  const isHotel = data.propertyType === "HOTEL" || data.propertyType === "GUESTHOUSE" || data.propertyType === "HOSTEL";
  const synagogue = data.nearby.synagogue;
  const synagogueMinutes = synagogue?.minutes ?? data.synagogueWalkMin;
  const synagogueName = synagogue ? pickLocalized(synagogue.name, uiLocale) : null;
  // A Chabad house is a highlight only when it is a walk away (the nearby list shows the rest).
  const chabadWalk = data.nearby.chabad?.minutes ?? data.chabadWalkMin;
  const chabadMinutes = chabadWalk !== null && chabadWalk <= MAX_HIGHLIGHT_WALK ? chabadWalk : null;
  const keepsShabbat = data.owner.badges.keepsShabbat || data.jewishFeatures.includes("host_keeps_shabbat");
  const sukkah = data.jewishFeatures.includes("sukkah_space");
  const hasChecklist = data.shabbatFeatures.length > 0 || data.isShabbatFriendly;
  const otherFeatures = (data.jewishFeatures as JewishFeature[]).filter((key) => !IN_CHECKLIST.includes(key) && key in JEWISH_FEATURE_ICONS);
  const hotelFeatures = isHotel ? (data.hotelJewishFeatures as HotelJewishFeature[]).filter((key) => key in HOTEL_JEWISH_FEATURE_ICONS) : [];
  const hasHighlights = data.kitchenKosher !== null || synagogueMinutes !== null || chabadMinutes !== null || keepsShabbat;
  const hasAnything = hasHighlights || hasChecklist || sukkah || otherFeatures.length > 0 || hotelFeatures.length > 0 || !!data.kosherCertName;
  if (!hasAnything && !data.city) return null;

  return (
    <section id="tradition" aria-labelledby="tradition-title" className="scroll-mt-(--header-height) overflow-hidden rounded-card bg-primary-tint ring-1 ring-primary/10">
      <div className="flex items-center gap-3 bg-primary px-4 py-3.5 text-white sm:px-5">
        <span className="inline-flex size-11 shrink-0 items-center justify-center rounded-full bg-white/15" aria-hidden="true">
          <ShabbatCandlesIcon className="size-6" />
        </span>
        <div className="grid min-w-0">
          <h2 id="tradition-title" className="text-h3 leading-tight">
            {t("title")}
          </h2>
          <p className="text-small text-white/85">{t("subtitle")}</p>
        </div>
      </div>

      <div className="grid gap-5 p-4 sm:p-5">
        {hasHighlights ? (
          <ul className="grid gap-2.5 sm:grid-cols-2">
            {data.kitchenKosher ? (
              <Highlight icon={KosherStampIcon} label={t("kitchen")} value={f(`kitchenKosher.${data.kitchenKosher}`)} />
            ) : null}
            {synagogueMinutes !== null ? (
              <Highlight
                icon={SynagogueIcon}
                label={t("synagogue")}
                value={t("walk", { count: synagogueMinutes })}
                detail={synagogueName ? <span dir="auto">{synagogueName}</span> : undefined}
              />
            ) : null}
            {chabadMinutes !== null ? <Highlight icon={WelcomeHomeIcon} label={t("chabad")} value={t("walk", { count: chabadMinutes })} /> : null}
            {keepsShabbat ? <Highlight icon={MoonStarIcon} label={t("host")} value={t("keepsShabbat")} detail={t("keepsShabbatHint")} /> : null}
          </ul>
        ) : null}

        {hasChecklist ? (
          <div className="grid gap-3 rounded-2xl bg-card p-4 shadow-card">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <h3 className="text-body font-bold">{t("shabbatChecklist")}</h3>
              {data.isShabbatFriendly ? (
                <span className="inline-flex h-7 items-center gap-1.5 rounded-full bg-primary-tint px-3 text-small font-semibold text-success ring-1 ring-success/20">
                  <ShabbatCandlesIcon className="size-4" aria-hidden="true" />
                  {t("shabbatFriendly")}
                </span>
              ) : null}
            </div>
            <ul className="grid gap-2.5 sm:grid-cols-2">
              {SHABBAT_FEATURES.map((key) => {
                const ok = data.shabbatFeatures.includes(key);
                return (
                  <CheckItem key={key} ok={ok} icon={SHABBAT_FEATURE_ICONS[key]} state={ok ? t("has") : t("hasNot")}>
                    {f(`shabbatFeature.${key}`)}
                  </CheckItem>
                );
              })}
              <CheckItem ok={sukkah} icon={TentIcon} state={sukkah ? t("has") : t("hasNot")} strike={false}>
                {sukkah ? t("sukkah") : t("noSukkah")}
              </CheckItem>
            </ul>
            <p className="text-caption text-muted-foreground">{t("shabbatFriendlyHint")}</p>
          </div>
        ) : sukkah ? (
          <FeatureChips items={[{ key: "sukkah", icon: TentIcon, label: t("sukkah") }]} />
        ) : null}

        {otherFeatures.length ? (
          <div className="grid gap-2.5">
            <h3 className="text-small font-bold text-primary-text">{t("jewishFeatures")}</h3>
            <FeatureChips items={otherFeatures.map((key) => ({ key, icon: JEWISH_FEATURE_ICONS[key], label: f(`jewishFeature.${key}`) }))} />
          </div>
        ) : null}

        {isHotel && (data.kosherCertName || hotelFeatures.length) ? (
          <div className="grid gap-2.5">
            <h3 className="text-small font-bold text-primary-text">{t("hotelKosher")}</h3>
            {data.kosherCertName ? (
              <p className="flex items-center gap-2 text-small">
                <BadgeCheckIcon className="size-5 shrink-0 text-success" aria-hidden="true" />
                <span>
                  {t("supervision")}: <span dir="auto" className="font-semibold">{data.kosherCertName}</span>
                </span>
              </p>
            ) : null}
            <FeatureChips items={hotelFeatures.map((key) => ({ key, icon: HOTEL_JEWISH_FEATURE_ICONS[key], label: f(`hotelJewishFeature.${key}`) }))} />
          </div>
        ) : null}

        {data.city ? (
          <div className={cn("grid gap-2")}>
            <ShabbatCountdownCard cities={[data.city.slug]} headingLevel="h3" locale={locale} />
          </div>
        ) : null}
      </div>
    </section>
  );
}
