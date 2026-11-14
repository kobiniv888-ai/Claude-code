import type { ReactNode } from "react";
import { useTranslations } from "next-intl";
import { ExternalLinkIcon, FileTextIcon, InfoIcon, SearchXIcon, TriangleAlertIcon } from "lucide-react";
import { Ltr } from "@/components/common/ltr";
import type { AppLocale, CurrencyCode } from "@/config/site";
import type { DealType, PricePeriod, PropertyType } from "@/generated/prisma/enums";
import { convert } from "@/lib/currency/convert";
import { formatDate, formatMoney, formatNumber, isolate } from "@/lib/format";
import {
  guidePeriodFor,
  parseMatched,
  pricePosition,
  sizeBandBounds,
  type GuideReference,
  type GuideResult,
  type GuideStats,
  type GuideUnit,
  type GuideWidening,
  type PricePosition,
} from "@/lib/pricing/guide";
import { cn } from "@/lib/utils";

/**
 * One answer of the hosts' price guide (round 3, brief 5): where the host's price sits, the middle
 * price and the usual range (the middle half), the lowest and highest from 10 places, the weekend
 * price (per night) or the price per m² (sales), exactly what was compared, and the reference
 * prices from public reports apart from Bayit's own numbers.
 *
 * No "use client": the "מדריך מחירים" page renders it on the server, the post form's panel
 * (./price-guide-panel.tsx) in the browser. Hosts' tool only: never render it for a guest.
 */

export type GuidePlace = { city: string; neighborhood: string | null };
export type GuideMine = { price: number | null; currency: CurrencyCode; period: PricePeriod };

type Translator = ReturnType<typeof useTranslations<"pricing">>;

const POSITION_STYLE: Record<PricePosition, string> = {
  far_below: "border-warning/40 bg-warning-soft",
  below: "border-primary-tint-border bg-primary-tint",
  typical: "border-success/30 bg-success/10",
  above: "border-primary-tint-border bg-primary-tint",
  far_above: "border-warning/40 bg-warning-soft",
};

function money(value: number, currency: CurrencyCode, locale: AppLocale, approx: boolean): string {
  const text = formatMoney(value, currency, locale, { maximumFractionDigits: 0 });
  return approx ? `≈ ${text}` : text;
}

/** "Some prices were converted to lari (₾)…": the currency by its name, never its ISO code. */
export function convertedNote(t: Translator, currency: CurrencyCode): string {
  return t("result.approx", { currency: isolate(t(`currencies.${currency}`)) });
}

/** "example.com" of a report's address (nothing for a broken one). */
function hostOf(url: string): string | null {
  try {
    return new URL(url).hostname.replace(/^www\./, "");
  } catch {
    return null;
  }
}

function unitLabel(t: Translator, unit: GuideUnit | "sqm"): string {
  return t(`result.unit.${unit}`);
}

/** The chips that say exactly what was compared (scope.matched plus the place). */
export function useScopeChips(guide: GuideResult, place: GuidePlace, locale: AppLocale): string[] {
  const t = useTranslations("pricing");
  const tf = useTranslations("listingFields");
  const n = (value: number) => ({ count: value, countText: formatNumber(value, locale) });
  const chips: string[] = [
    guide.scope.level === "neighborhood" && place.neighborhood
      ? t("scope.neighborhood", { neighborhood: place.neighborhood, city: place.city })
      : place.city,
  ];
  for (const { key, value } of parseMatched(guide.scope.matched)) {
    switch (key) {
      case "deal":
        chips.push(tf(`dealType.${value}` as "dealType.SALE"));
        break;
      case "type":
        chips.push(tf(`propertyType.${value}` as "propertyType.APARTMENT"));
        break;
      case "bedrooms":
        chips.push(value === "5+" ? t("scope.bedroomsPlus") : t("scope.bedrooms", n(Number(value))));
        break;
      case "guests":
        chips.push(value === "5+" ? t("scope.guestsPlus") : t("scope.guests", n(Number(value))));
        break;
      case "bathrooms":
        chips.push(value === "3+" ? t("scope.bathroomsPlus") : t("scope.bathrooms", n(Number(value))));
        break;
      case "kitchen":
        chips.push(value === "yes" ? t("scope.kitchenYes") : t("scope.kitchenNo"));
        break;
      case "sea":
        chips.push(value === "yes" ? t("scope.seaYes") : t("scope.seaNo"));
        break;
      case "building":
        chips.push(value === "new" ? t("scope.buildingNew") : t("scope.buildingOld"));
        break;
      case "size": {
        const bounds = sizeBandBounds(value);
        if (bounds) {
          chips.push(
            bounds.max === null
              ? t("scope.sizePlus", { min: formatNumber(bounds.min, locale) })
              : t("scope.size", { min: formatNumber(bounds.min, locale), max: formatNumber(bounds.max, locale) }),
          );
        }
        break;
      }
    }
  }
  return chips;
}

function Stat({ label, children, hint }: { label: string; children: ReactNode; hint?: string }) {
  return (
    <div className="grid min-w-0 content-start gap-0.5 rounded-xl bg-surface-muted px-3 py-2.5">
      <p className="text-xs font-medium text-muted-foreground">{label}</p>
      <p className="text-lg leading-tight font-semibold text-foreground tabular-nums">{children}</p>
      {hint ? <p className="text-xs text-pretty text-muted-foreground">{hint}</p> : null}
    </div>
  );
}

/** The usual range as a band on a line, the middle price as a tick and the host's price as a dot. */
function RangeBar({ stats, mine, label }: { stats: GuideStats; mine: number | null; label: string }) {
  const spread = Math.max(stats.p75 - stats.p25, stats.median * 0.2, 1);
  let low = Math.max(0, stats.min ?? stats.p25 - spread);
  let high = stats.max ?? stats.p75 + spread;
  if (mine !== null) {
    // Stretch the line to show the host's price, but not further than a quarter of the range's
    // low end or three times its high end (a far-off price sits at the line's end).
    low = Math.min(low, Math.max(stats.p25 * 0.25, mine - spread * 0.25));
    high = Math.max(high, Math.min(stats.p75 * 3, mine + spread * 0.25));
  }
  const at = (value: number) => Math.min(100, Math.max(0, ((value - low) / (high - low || 1)) * 100));
  const start = at(stats.p25);
  const end = at(stats.p75);
  return (
    <div className="px-1.5 py-2" role="img" aria-label={label}>
      <div className="relative h-2 rounded-full bg-muted">
        <span className="absolute inset-y-0 rounded-full bg-primary/35 dark:bg-primary/60" style={{ insetInlineStart: `${start}%`, width: `${Math.max(end - start, 2)}%` }} />
        <span className="absolute -top-1 h-4 w-0.5 -translate-x-1/2 rounded-full bg-primary-text rtl:translate-x-1/2" style={{ insetInlineStart: `${at(stats.median)}%` }} />
        {mine !== null ? (
          <span
            className="absolute -top-1 size-4 -translate-x-1/2 rounded-full border-2 border-card bg-foreground shadow-sm rtl:translate-x-1/2"
            style={{ insetInlineStart: `${at(mine)}%` }}
          />
        ) : null}
      </div>
    </div>
  );
}

function References({ references, locale }: { references: GuideReference[]; locale: AppLocale }) {
  const t = useTranslations("pricing");
  return (
    <section className="grid gap-2 rounded-xl border border-dashed border-border p-3" aria-label={t("references.title")}>
      <div className="flex items-start gap-2">
        <FileTextIcon className="mt-0.5 size-4 shrink-0 text-muted-foreground" aria-hidden />
        <div className="grid gap-0.5">
          <h4 className="text-sm font-semibold text-foreground">{t("references.title")}</h4>
          <p className="text-xs text-muted-foreground">{t("references.lead")}</p>
        </div>
      </div>
      <ul className="grid gap-2">
        {references.map((ref, i) => {
          const month = formatDate(new Date(`${ref.sourceMonth}-01T00:00:00Z`), locale, { month: "long", year: "numeric", timeZone: "UTC" });
          const unit = ref.perSqm ? unitLabel(t, "sqm") : unitLabel(t, ref.unit as GuideUnit);
          return (
            <li key={`${ref.sourceName}-${ref.sourceMonth}-${i}`} className="grid gap-0.5 rounded-lg bg-surface-muted px-3 py-2 text-sm">
              <p className="font-semibold tabular-nums">
                <Ltr>
                  {money(ref.low, ref.currency, locale, !!ref.converted)}–{formatMoney(ref.high, ref.currency, locale, { maximumFractionDigits: 0 })}
                </Ltr>{" "}
                <span className="font-normal text-muted-foreground">{unit}</span>
              </p>
              <p className="flex flex-wrap items-center gap-x-2 text-xs text-muted-foreground">
                <span>{t("references.by", { source: isolate(ref.sourceName), month })}</span>
                {ref.sourceUrl && hostOf(ref.sourceUrl) ? (
                  <a
                    href={ref.sourceUrl}
                    target="_blank"
                    rel="noopener noreferrer nofollow"
                    className="inline-flex min-h-11 items-center gap-1 rounded-md font-medium text-primary-text underline-offset-4 outline-none hover:underline focus-visible:ring-3 focus-visible:ring-ring/50 sm:min-h-0"
                    aria-label={t("references.open", { source: ref.sourceName })}
                  >
                    <ExternalLinkIcon className="size-3.5" aria-hidden />
                    <span aria-hidden>{hostOf(ref.sourceUrl)}</span>
                  </a>
                ) : null}
              </p>
            </li>
          );
        })}
      </ul>
    </section>
  );
}

export type GuideViewProps = {
  guide: GuideResult;
  widened: readonly GuideWidening[];
  dealType: DealType;
  propertyType: PropertyType;
  place: GuidePlace;
  locale: AppLocale;
  /** The host's own price, placed among similar places (the form's live value, or the saved one). */
  mine?: GuideMine | null;
  /** A heading above the answer (a hotel's room type: user text, shown with dir="auto"). */
  title?: string | null;
  className?: string;
};

/** One guide answer. See the file comment. */
export function GuideView({ guide, widened, dealType, place, locale, mine, title, className }: GuideViewProps) {
  const t = useTranslations("pricing");
  const chips = useScopeChips(guide, place, locale);
  const unit = guide.unit;
  const approx = !!guide.converted;
  const stats = guide.price;
  const enough = guide.status !== "not_enough" && !!stats;

  // The host's price, in the guide's currency, when it is in the unit the guide compares.
  const comparable = mine && mine.price !== null && mine.price > 0 && mine.period === guidePeriodFor(dealType);
  const position = comparable && enough ? pricePosition(guide, mine.price!, mine.currency) : null;
  const mineInGuide =
    comparable && enough ? (mine.currency === guide.currency ? mine.price! : convert(mine.price!, mine.currency, guide.currency, guide.rates)) : null;
  const placeName = guide.scope.level === "neighborhood" && place.neighborhood ? place.neighborhood : place.city;

  return (
    <div className={cn("grid min-w-0 gap-3", className)} data-guide-status={guide.status}>
      {title ? (
        <h3 className="text-sm font-semibold text-foreground">
          {t.rich("panel.room", { name: () => <bdi dir="auto">{title}</bdi> })}
        </h3>
      ) : null}

      {mine && enough ? (
        position ? (
          <p className={cn("flex items-start gap-2 rounded-xl border px-3 py-2.5 text-sm text-pretty", POSITION_STYLE[position])} data-position={position} aria-live="polite">
            {position === "far_below" || position === "far_above" ? (
              <TriangleAlertIcon className="mt-0.5 size-4 shrink-0 text-warning" aria-hidden />
            ) : (
              <InfoIcon className="mt-0.5 size-4 shrink-0 text-primary-text" aria-hidden />
            )}
            <span>
              {t.rich(`position.${position}`, {
                price: () => <Ltr className="font-semibold">{formatMoney(mine.price!, mine.currency, locale)}</Ltr>,
                place: isolate(placeName),
              })}
            </span>
          </p>
        ) : (
          <p className="rounded-xl bg-surface-muted px-3 py-2.5 text-sm text-pretty text-muted-foreground" aria-live="polite">
            {mine.price !== null && mine.price > 0 && !comparable
              ? t("position.otherPeriod", { unit: unitLabel(t, unit) })
              : t("position.noPrice")}
          </p>
        )
      ) : null}

      {enough ? (
        <>
          <div className="grid grid-cols-2 gap-2">
            <Stat label={t("result.middle")} hint={unitLabel(t, unit)}>
              <Ltr>{money(stats.median, guide.currency, locale, approx)}</Ltr>
            </Stat>
            <Stat label={t("result.range")} hint={t("result.rangeHelp")}>
              <Ltr>
                {money(stats.p25, guide.currency, locale, approx)}–{formatMoney(stats.p75, guide.currency, locale, { maximumFractionDigits: 0 })}
              </Ltr>
            </Stat>
          </div>
          <RangeBar stats={stats} mine={mineInGuide} label={t("result.barLabel")} />
          {stats.min !== undefined && stats.max !== undefined ? (
            <div className="grid grid-cols-2 gap-2">
              <Stat label={t("result.lowest")}>
                <Ltr>{money(stats.min, guide.currency, locale, approx)}</Ltr>
              </Stat>
              <Stat label={t("result.highest")}>
                <Ltr>{money(stats.max, guide.currency, locale, approx)}</Ltr>
              </Stat>
            </div>
          ) : null}
          {guide.weekend ? (
            <div className="grid grid-cols-2 gap-2">
              <Stat label={`${t("result.weekend")} · ${t("result.middle")}`} hint={unitLabel(t, unit)}>
                <Ltr>{money(guide.weekend.median, guide.currency, locale, approx)}</Ltr>
              </Stat>
              <Stat label={`${t("result.weekend")} · ${t("result.range")}`}>
                <Ltr>
                  {money(guide.weekend.p25, guide.currency, locale, approx)}–
                  {formatMoney(guide.weekend.p75, guide.currency, locale, { maximumFractionDigits: 0 })}
                </Ltr>
              </Stat>
            </div>
          ) : null}
          {guide.perSqm ? (
            <div className="grid grid-cols-2 gap-2">
              <Stat label={`${t("result.perSqm")} · ${t("result.middle")}`}>
                <Ltr>{money(guide.perSqm.median, guide.currency, locale, approx)}</Ltr>
              </Stat>
              <Stat label={`${t("result.perSqm")} · ${t("result.range")}`}>
                <Ltr>
                  {money(guide.perSqm.p25, guide.currency, locale, approx)}–
                  {formatMoney(guide.perSqm.p75, guide.currency, locale, { maximumFractionDigits: 0 })}
                </Ltr>
              </Stat>
            </div>
          ) : null}
        </>
      ) : (
        <div className="flex items-start gap-3 rounded-xl border border-dashed border-border p-3" role="status">
          <SearchXIcon className="mt-0.5 size-5 shrink-0 text-muted-foreground" aria-hidden />
          <div className="grid gap-1">
            <p className="text-sm font-semibold text-foreground" data-testid="guide-not-enough">
              {t("result.notEnoughTitle")}
            </p>
            <p className="text-xs text-pretty text-muted-foreground">{t("result.notEnoughBody")}</p>
          </div>
        </div>
      )}

      <div className="grid gap-1.5">
        <p className="text-xs font-medium text-muted-foreground">
          {enough ? t("result.compared", { count: stats.count, countText: formatNumber(stats.count, locale) }) : t("result.comparedBy")}
        </p>
        <ul className="flex flex-wrap gap-1.5" data-testid="guide-scope">
          {chips.map((chip, i) => (
            <li key={`${chip}-${i}`} className="rounded-full border border-border bg-card px-2.5 py-1 text-xs text-foreground">
              {chip}
            </li>
          ))}
        </ul>
        {widened.includes("neighborhood") && place.neighborhood ? (
          <p className="text-xs text-pretty text-muted-foreground">
            {t("result.widenedNeighborhood", { neighborhood: isolate(place.neighborhood), city: isolate(place.city) })}
          </p>
        ) : null}
        {widened.includes("size") ? <p className="text-xs text-pretty text-muted-foreground">{t("result.widenedSize")}</p> : null}
        {enough && approx ? <p className="text-xs text-pretty text-muted-foreground">{convertedNote(t, guide.currency)}</p> : null}
        <p className="text-xs text-pretty text-muted-foreground">{t("result.source")}</p>
      </div>

      {guide.references.length > 0 ? <References references={guide.references} locale={locale} /> : null}
    </div>
  );
}
