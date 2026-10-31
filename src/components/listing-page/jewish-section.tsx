import { useTranslations } from "next-intl";
import { BadgeCheckIcon, FootprintsIcon, MoonStarIcon, UtensilsCrossedIcon } from "lucide-react";
import { FeatureList } from "@/components/listing/feature-list";
import { KITCHEN_KOSHER_ICONS, SHABBAT_FEATURE_ICONS } from "@/components/listing/field-icons";
import { SHABBAT_FEATURES } from "@/lib/listing/fields";
import type { ListingPageData } from "@/lib/listing-page/types";
import { CheckItem, Section } from "./section";

/**
 * Jewish-friendly: kitchen kosher level, the Shabbat checklist (check / cross per item) with the
 * "Shabbat-friendly" badge, other Jewish features, hotel kosher supervision and meals, and
 * walking minutes to the synagogue and Chabad house. The certificate photo is never shown.
 */
export function JewishSection({ data }: { data: ListingPageData }) {
  const t = useTranslations("listing.jewish");
  const f = useTranslations("listingFields");
  const isHotel = data.propertyType === "HOTEL" || data.propertyType === "GUESTHOUSE" || data.propertyType === "HOSTEL";
  const hasShabbat = data.shabbatFeatures.length > 0;
  const hasAnything =
    data.kitchenKosher !== null ||
    hasShabbat ||
    data.jewishFeatures.length > 0 ||
    data.hotelJewishFeatures.length > 0 ||
    !!data.kosherCertName ||
    data.synagogueWalkMin !== null ||
    data.chabadWalkMin !== null;
  if (!hasAnything) return null;
  const KitchenIcon = data.kitchenKosher ? KITCHEN_KOSHER_ICONS[data.kitchenKosher] : UtensilsCrossedIcon;

  return (
    <Section id="jewish" title={t("title")} icon={MoonStarIcon}>
      <div className="grid gap-6">
        {(data.synagogueWalkMin !== null || data.chabadWalkMin !== null || data.kitchenKosher) && (
          <ul className="grid gap-3 sm:grid-cols-3">
            {data.kitchenKosher ? (
              <li className="flex items-center gap-3 rounded-xl border p-3">
                <KitchenIcon className="size-5 shrink-0 text-primary" aria-hidden />
                <span className="grid">
                  <span className="text-xs text-muted-foreground">{t("kitchen")}</span>
                  <span className="font-medium">{f(`kitchenKosher.${data.kitchenKosher}`)}</span>
                </span>
              </li>
            ) : null}
            {data.synagogueWalkMin !== null ? (
              <li className="flex items-center gap-3 rounded-xl border p-3">
                <FootprintsIcon className="size-5 shrink-0 text-primary" aria-hidden />
                <span className="grid">
                  <span className="text-xs text-muted-foreground">{t("synagogue")}</span>
                  <span className="font-medium">{t("walk", { count: data.synagogueWalkMin })}</span>
                </span>
              </li>
            ) : null}
            {data.chabadWalkMin !== null ? (
              <li className="flex items-center gap-3 rounded-xl border p-3">
                <FootprintsIcon className="size-5 shrink-0 text-primary" aria-hidden />
                <span className="grid">
                  <span className="text-xs text-muted-foreground">{t("chabad")}</span>
                  <span className="font-medium">{t("walk", { count: data.chabadWalkMin })}</span>
                </span>
              </li>
            ) : null}
          </ul>
        )}

        {hasShabbat || data.isShabbatFriendly ? (
          <div className="grid gap-3">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <h3 className="font-semibold">{t("shabbatChecklist")}</h3>
              {data.isShabbatFriendly ? (
                <span className="inline-flex h-7 items-center gap-1.5 rounded-full bg-secondary px-3 text-sm font-medium text-primary ring-1 ring-primary/10" title={t("shabbatFriendlyHint")}>
                  <MoonStarIcon className="size-4" aria-hidden />
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
            </ul>
            {!data.isShabbatFriendly ? <p className="text-sm text-muted-foreground">{t("shabbatFriendlyHint")}</p> : null}
          </div>
        ) : null}

        {data.jewishFeatures.length ? (
          <div className="grid gap-3">
            <h3 className="font-semibold">{t("jewishFeatures")}</h3>
            <FeatureList group="jewishFeature" keys={data.jewishFeatures} />
          </div>
        ) : null}

        {isHotel && (data.kosherCertName || data.hotelJewishFeatures.length) ? (
          <div className="grid gap-3">
            <h3 className="font-semibold">{t("hotelKosher")}</h3>
            {data.kosherCertName ? (
              <p className="flex items-center gap-2 text-sm">
                <BadgeCheckIcon className="size-5 shrink-0 text-verified" aria-hidden />
                <span>
                  {t("supervision")}: <span dir="auto" className="font-medium">{data.kosherCertName}</span>
                </span>
              </p>
            ) : null}
            <FeatureList group="hotelJewishFeature" keys={data.hotelJewishFeatures} />
          </div>
        ) : null}
      </div>
    </Section>
  );
}
