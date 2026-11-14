import { useLocale, useTranslations } from "next-intl";
import { SpriteIcon } from "@/components/ds/sprite-icons";
import { Link } from "@/i18n/navigation";
import { formatNumber } from "@/lib/format";
import { otherJewishFeatures, shabbatChecklist, type ShabbatLine } from "@/lib/listing-page/highlights";
import type { VerifiedPlace } from "@/lib/listing-page/places";
import type { ListingPageData } from "@/lib/listing-page/types";
import { cn } from "@/lib/utils";
import { KosherFoldedSection } from "./folded-section-island";

function lineText(line: ShabbatLine, t: (key: string, values?: Record<string, string>) => string, locale: string): string {
  if (line.key === "elevator" && !line.ok && line.floor !== null) return t("line.elevator.noFloor", { floor: formatNumber(line.floor, locale) });
  return t(`line.${line.key}.${line.ok ? "ok" : "no"}`);
}

/** One plain statement with a ✓ or ✗ (no strikethrough, no double negatives: bug 8.8). */
function Check({ ok, children }: { ok: boolean; children: React.ReactNode }) {
  const t = useTranslations("listing.kosher");
  return (
    <li className="flex items-start gap-2.5">
      <SpriteIcon name={ok ? "check" : "x"} strokeWidth={2.5} className={cn("mt-0.5 size-5 shrink-0", ok ? "text-primary-text" : "text-muted-foreground")} />
      <span>
        {ok ? <span className="sr-only">{t("yes")}: </span> : null}
        {children}
      </span>
    </li>
  );
}

/**
 * "Kosher and Shabbat": one folded section, closed by default, shown only when the place has at
 * least one such feature (the page decides with hasKosherShabbat). Inside: the kitchen, hotel
 * kosher food, the Shabbat checklist written plainly, other Jewish details, the nearest synagogue
 * ONLY when it is a verified place, and a link to the city's Shabbat times on the Jewish life
 * hub. No countdown. The kosher certificate photo is never shown.
 */
export function KosherShabbatSection({ data, synagogue }: { data: ListingPageData; synagogue: VerifiedPlace | null }) {
  const t = useTranslations("listing.kosher");
  const f = useTranslations("listingFields");
  const locale = useLocale();
  const checklist = shabbatChecklist(data);
  const others = otherJewishFeatures(data.jewishFeatures, data.owner.badges.keepsShabbat);
  const hotelFood = data.hotelJewishFeatures;

  return (
    <section id="kosher" aria-label={t("title")} className="scroll-mt-(--header-height) border-t border-border pt-4">
      <KosherFoldedSection value="kosher" title={t("title")} triggerClassName="text-h2" contentClassName="grid gap-5 pt-1">
        {data.kitchenKosher || data.kosherCertName || hotelFood.length ? (
          <dl className="grid gap-3">
            {data.kitchenKosher ? (
              <div className="grid gap-0.5">
                <dt className="text-small text-muted-foreground">{t("kitchen")}</dt>
                <dd>{f(`kitchenKosher.${data.kitchenKosher}`)}</dd>
              </div>
            ) : null}
            {data.kosherCertName ? (
              <div className="grid gap-0.5">
                <dt className="text-small text-muted-foreground">{t("supervision")}</dt>
                <dd dir="auto">{data.kosherCertName}</dd>
              </div>
            ) : null}
            {hotelFood.length ? (
              <div className="grid gap-0.5">
                <dt className="text-small text-muted-foreground">{t("food")}</dt>
                <dd>{hotelFood.map((key) => f(`hotelJewishFeature.${key}`)).join(" · ")}</dd>
              </div>
            ) : null}
          </dl>
        ) : null}

        {checklist.length ? (
          <div className="grid gap-2.5">
            <h3 className="text-body font-semibold">{t("checklist")}</h3>
            <ul className="grid gap-2.5 sm:grid-cols-2">
              {checklist.map((line) => (
                <Check key={line.key} ok={line.ok}>
                  {lineText(line, t as never, locale)}
                </Check>
              ))}
            </ul>
          </div>
        ) : null}

        {others.length ? (
          <ul className="grid gap-2.5 sm:grid-cols-2">
            {others.map((key) => (
              <Check key={key} ok>
                {f(`jewishFeature.${key}`)}
              </Check>
            ))}
          </ul>
        ) : null}

        {synagogue ? (
          <p className="flex items-start gap-2.5">
            <SpriteIcon name="map-pin" className="mt-0.5 size-5 shrink-0 text-primary-text" />
            <span>
              {t("nearestSynagogue")}: <span dir="auto" className="font-medium">{synagogue.name}</span>
              <span aria-hidden="true" className="px-1.5 text-muted-foreground">·</span>
              {t("walk", { count: synagogue.minutes })}
            </span>
          </p>
        ) : null}

        {data.city ? (
          <Link
            href={{ pathname: "/jewish-life", query: { city: data.city.slug }, hash: "shabbat-times" }}
            className="inline-flex min-h-11 items-center gap-1.5 justify-self-start rounded font-medium text-primary-text underline-offset-4 outline-none hover:underline focus-visible:ring-3 focus-visible:ring-ring/50"
          >
            {t("times", { city: data.city.name })}
            <SpriteIcon name="arrow-right" className="size-4 rtl:-scale-x-100" />
          </Link>
        ) : null}
      </KosherFoldedSection>
    </section>
  );
}
