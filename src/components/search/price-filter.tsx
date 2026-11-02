"use client";

import { useEffect, useState } from "react";
import { useLocale, useTranslations } from "next-intl";
import { Slider as SliderPrimitive } from "radix-ui";
import { Skeleton } from "@/components/ui/skeleton";
import { useCurrency } from "@/components/providers/currency-provider";
import { dirFor } from "@/i18n/locale";
import { currencySymbol, formatMoney } from "@/lib/format";
import type { SearchFilters } from "@/lib/listing/search-params";
import { HISTOGRAM_BARS, barHeights, barInRange, type PriceHistogram } from "@/lib/search/price-histogram";
import { fromSliderValue, priceSliderConfig, sliderValue } from "@/lib/search/price-range";
import { cn } from "@/lib/utils";
import { NumberRange } from "./filter-parts";

/**
 * Price: a histogram of the matching listings' prices (bars grow in when the sheet opens; the bars
 * inside the chosen range are navy), a two-handle slider with a value bubble while dragging, and
 * min / max inputs — all in the visitor's display currency.
 */
export function PriceFilter({
  filters,
  onChange,
  histogram,
}: {
  filters: SearchFilters;
  onChange: (patch: Partial<SearchFilters>) => void;
  /** undefined while loading; null when the deal has no price slider. */
  histogram: PriceHistogram | null | undefined;
}) {
  const t = useTranslations("search.filters");
  const sheet = useTranslations("search.sheet");
  const locale = useLocale();
  const { currency, rates } = useCurrency();
  const config = priceSliderConfig(filters.deal, currency, rates);
  const [drag, setDrag] = useState<number[] | null>(null);
  const [moving, setMoving] = useState<0 | 1>(0);
  const [grown, setGrown] = useState(false);

  // The bars grow from the baseline once, right after the sheet opens.
  useEffect(() => {
    const frame = window.requestAnimationFrame(() => setGrown(true));
    return () => window.cancelAnimationFrame(frame);
  }, []);

  const symbol = currencySymbol(currency);
  const inputs = (
    <NumberRange
      min={filters.priceMin}
      max={filters.priceMax}
      unit={symbol}
      lowest={0}
      onCommit={(priceMin, priceMax) => onChange({ priceMin, priceMax })}
      labels={{ min: t("priceMin"), max: t("priceMax") }}
    />
  );
  if (!config) {
    return (
      <div className="grid gap-3">
        <p className="text-small text-muted-foreground">{t("priceNeedsDeal")}</p>
        {filters.priceMin !== null || filters.priceMax !== null ? inputs : null}
      </div>
    );
  }

  const committed = sliderValue(filters.priceMin, filters.priceMax, config);
  const shown = (drag ?? committed) as [number, number];
  const money = (amount: number) => formatMoney(amount, currency, locale, { maximumFractionDigits: 0 });
  const topLabel = (amount: number) => (amount >= config.max ? t("priceTop", { price: money(config.max) }) : money(amount));
  const bars = histogram && histogram.max > 0 ? histogram.buckets : null;
  const heights = bars ? barHeights(bars) : null;

  return (
    <div className="grid gap-3">
      <div aria-hidden="true" className="relative h-20">
        {heights ? (
          <div className="flex h-full items-end gap-[3px]">
            {heights.map((height, index) => (
              <span
                key={index}
                className={cn(
                  "h-full flex-1 origin-bottom rounded-t-[3px] transition-[transform,background-color] duration-(--motion-slow) ease-soft motion-reduce:transition-none",
                  barInRange(index, heights.length, histogram!.max, shown) ? "bg-navy" : "bg-border",
                )}
                style={{
                  transform: `scaleY(${grown ? height : 0})`,
                  transitionDelay: grown ? `${Math.min(index, HISTOGRAM_BARS) * 12}ms, 0ms` : undefined,
                }}
              />
            ))}
          </div>
        ) : histogram === undefined ? (
          <div className="flex h-full items-end gap-[3px]">
            {Array.from({ length: HISTOGRAM_BARS }, (_, index) => (
              <Skeleton key={index} className="flex-1 rounded-b-none" style={{ height: `${30 + ((index * 37) % 55)}%` }} />
            ))}
          </div>
        ) : null}
        {bars && histogram!.total === 0 ? (
          <p className="absolute inset-0 flex items-center justify-center text-small text-muted-foreground">{sheet("noPrices")}</p>
        ) : null}
      </div>
      <SliderPrimitive.Root
        dir={dirFor(locale)}
        min={config.min}
        max={config.max}
        step={config.step}
        minStepsBetweenThumbs={1}
        value={shown}
        onValueChange={(value) => {
          setMoving(value[0] !== shown[0] ? 0 : 1);
          setDrag(value);
        }}
        onValueCommit={(value) => {
          setDrag(null);
          onChange(fromSliderValue(value, config));
        }}
        className="relative -mt-3 flex h-8 w-full touch-none items-center select-none"
      >
        <SliderPrimitive.Track className="relative h-1 grow overflow-hidden rounded-full bg-border">
          <SliderPrimitive.Range className="absolute h-full bg-navy" />
        </SliderPrimitive.Track>
        {([0, 1] as const).map((index) => (
          <SliderPrimitive.Thumb
            key={index}
            aria-label={index === 0 ? t("priceMin") : t("priceMax")}
            aria-valuetext={index === 0 ? money(shown[0]) : topLabel(shown[1])}
            className="relative block size-7 rounded-full border-2 border-navy bg-card shadow-raised outline-none transition-transform duration-(--motion-fast) focus-visible:ring-4 focus-visible:ring-ring/40 active:scale-110 motion-reduce:transition-none"
          >
            {drag && moving === index ? (
              <span
                aria-hidden="true"
                className="pointer-events-none absolute bottom-full start-1/2 mb-2.5 -translate-x-1/2 animate-fade-in rounded-full bg-navy px-2.5 py-1 text-small font-bold whitespace-nowrap text-navy-foreground shadow-raised rtl:translate-x-1/2"
              >
                <bdi dir="ltr">{index === 0 ? money(shown[0]) : topLabel(shown[1])}</bdi>
              </span>
            ) : null}
          </SliderPrimitive.Thumb>
        ))}
      </SliderPrimitive.Root>
      <div aria-hidden="true" className="-mt-1 flex justify-between text-caption text-muted-foreground">
        <bdi dir="ltr">{money(0)}</bdi>
        <bdi dir="ltr">{t("priceTop", { price: money(config.max) })}</bdi>
      </div>
      {inputs}
      <p className="text-caption text-muted-foreground">{t("priceCurrencyNote", { currency })}</p>
    </div>
  );
}
