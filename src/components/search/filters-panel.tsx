"use client";

import { useEffect, useId, useRef, useState, type ReactNode } from "react";
import { useLocale, useTranslations } from "next-intl";
import { ChevronDown } from "lucide-react";
import { Slider as SliderPrimitive } from "radix-ui";
import { Checkbox } from "@/components/ui/checkbox";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { useCurrency } from "@/components/providers/currency-provider";
import { dirFor } from "@/i18n/locale";
import { currencySymbol, formatMoney, formatNumber } from "@/lib/format";
import {
  CONDITIONS,
  HEATING_TYPES,
  HOTEL_JEWISH_FEATURES,
  JEWISH_FEATURES,
  SHARED_ROOM_FOR,
  VIEW_TYPES,
} from "@/lib/listing/fields";
import {
  AMENITY_FILTERS,
  BUILDING_AGES,
  DEAL_FILTERS,
  KITCHEN_FILTERS,
  OWNER_TYPES,
  POSTED_WITHIN,
  SYNAGOGUE_WALK_OPTIONS,
  type SearchFilters,
} from "@/lib/listing/search-params";
import {
  filterVisibility,
  propertyTypesFor,
  sectionActiveCount,
  type FilterSection,
} from "@/lib/search/filter-sections";
import type { HolidayMark } from "@/lib/search/holiday-marks";
import { fromSliderValue, priceSliderConfig, sliderValue } from "@/lib/search/price-range";
import { cn } from "@/lib/utils";
import { GuestsStepper } from "./guests-stepper";
import { HolidayCalendar } from "./holiday-calendar";

export type FiltersPanelProps = {
  filters: SearchFilters;
  onChange: (patch: Partial<SearchFilters>) => void;
  holidays: HolidayMark[];
  className?: string;
};

const MIN_COUNTS = [1, 2, 3, 4, 5] as const;
const AMENITIES_COLLAPSED = 8;

/**
 * Every search filter (brief section 7), grouped in collapsible sections. Stateless: the desktop
 * sidebar applies each change at once, the phone drawer keeps a draft until "Show N results".
 * Filters that cannot match the chosen deal are hidden unless they are set.
 */
export function FiltersPanel({ filters, onChange, holidays, className }: FiltersPanelProps) {
  const t = useTranslations("search.filters");
  const f = useTranslations("listingFields");
  const visible = filterVisibility(filters);
  const types = propertyTypesFor(filters.deal);
  const toggle = <T extends string>(list: readonly T[], value: T): T[] =>
    list.includes(value) ? list.filter((v) => v !== value) : [...list, value];

  return (
    <div className={cn("divide-y", className)}>
      <Section id="deal" filters={filters} title={t("sections.deal")} defaultOpen>
        <Field label={t("dealType")}>
          <ChoiceChips
            value={filters.deal}
            options={[null, ...DEAL_FILTERS]}
            label={(deal) => (deal ? f(`dealFilter.${deal}`) : t("any"))}
            onChange={(deal) =>
              onChange({
                deal,
                propertyTypes: filters.propertyTypes.filter((type) => propertyTypesFor(deal).includes(type)),
              })
            }
          />
        </Field>
        <Field label={t("propertyType")}>
          <CheckList
            options={types}
            selected={filters.propertyTypes}
            label={(type) => f(`propertyType.${type}`)}
            onToggle={(type) => onChange({ propertyTypes: toggle(filters.propertyTypes, type) })}
            columns={2}
          />
        </Field>
      </Section>

      <Section id="price" filters={filters} title={t("sections.price")} defaultOpen>
        {visible.price ? (
          <PriceFilter filters={filters} onChange={onChange} />
        ) : (
          <p className="text-sm text-muted-foreground">{t("priceNeedsDeal")}</p>
        )}
      </Section>

      {visible.dates ? (
        <Section id="dates" filters={filters} title={visible.moveIn ? t("sections.moveIn") : t("sections.dates")} defaultOpen>
          <div className="-mx-1 overflow-x-auto">
            {visible.moveIn ? (
              <HolidayCalendar
                mode="single"
                holidays={holidays}
                checkIn={filters.checkIn}
                onChange={(checkIn) => onChange({ checkIn, checkOut: null })}
                className="[--cell-size:--spacing(9)]"
              />
            ) : (
              <HolidayCalendar
                mode="range"
                holidays={holidays}
                checkIn={filters.checkIn}
                checkOut={filters.checkOut}
                onChange={(checkIn, checkOut) => {
                  // Apply a stay only when it is complete (or cleared).
                  if (!checkIn || checkOut) onChange({ checkIn, checkOut });
                  else onChange({ checkIn, checkOut: null });
                }}
                className="[--cell-size:--spacing(9)]"
              />
            )}
          </div>
          {filters.checkIn ? (
            <button
              type="button"
              onClick={() => onChange({ checkIn: null, checkOut: null })}
              className="mt-1 text-sm font-semibold text-primary underline-offset-4 hover:underline focus-visible:outline-2 focus-visible:outline-ring"
            >
              {t("clearDates")}
            </button>
          ) : null}
          {visible.guests ? (
            <GuestsStepper
              className="mt-4"
              value={filters.guests ?? 0}
              onChange={(guests) => onChange({ guests: guests > 0 ? guests : null })}
            />
          ) : null}
        </Section>
      ) : null}

      <Section id="rooms" filters={filters} title={t("sections.rooms")}>
        <Field label={t("rooms")}>
          <MinChips value={filters.rooms} onChange={(rooms) => onChange({ rooms })} />
        </Field>
        <Field label={t("bedrooms")}>
          <MinChips value={filters.bedrooms} onChange={(bedrooms) => onChange({ bedrooms })} />
        </Field>
        <Field label={t("bathrooms")}>
          <MinChips value={filters.bathrooms} onChange={(bathrooms) => onChange({ bathrooms })} />
        </Field>
      </Section>

      <Section id="jewish" filters={filters} title={t("sections.jewish")} defaultOpen>
        <CheckRow
          checked={filters.shabbatFriendly}
          onChange={(shabbatFriendly) => onChange({ shabbatFriendly })}
          label={f("filter.shabbatFriendly")}
          hint={t("shabbatFriendlyHint")}
        />
        <Field label={t("kitchen")}>
          <ChoiceChips
            value={filters.kitchen}
            options={[null, ...KITCHEN_FILTERS]}
            label={(kitchen) => (kitchen ? f(`kitchenFilter.${kitchen}`) : t("any"))}
            onChange={(kitchen) => onChange({ kitchen })}
          />
        </Field>
        <Field label={t("synagogueWalk")}>
          <ChoiceChips
            value={filters.synagogueMaxWalk}
            options={[null, ...SYNAGOGUE_WALK_OPTIONS]}
            label={(minutes) => (minutes ? t("walkMinutes", { count: minutes }) : t("any"))}
            onChange={(synagogueMaxWalk) => onChange({ synagogueMaxWalk })}
          />
        </Field>
        <Field label={t("jewishFeatures")}>
          <CheckList
            options={JEWISH_FEATURES}
            selected={filters.jewish}
            label={(feature) => f(`jewishFeature.${feature}`)}
            onToggle={(feature) => onChange({ jewish: toggle(filters.jewish, feature) })}
          />
        </Field>
        {visible.hotel ? (
          <Field label={t("hotelFeatures")}>
            <CheckList
              options={HOTEL_JEWISH_FEATURES}
              selected={filters.hotel}
              label={(feature) => f(`hotelJewishFeature.${feature}`)}
              onToggle={(feature) => onChange({ hotel: toggle(filters.hotel, feature) })}
            />
          </Field>
        ) : null}
        {visible.bigFamily ? (
          <CheckRow
            checked={filters.bigFamily}
            onChange={(bigFamily) => onChange({ bigFamily })}
            label={f("filter.bigFamily")}
          />
        ) : null}
        {visible.sharedRoomFor ? (
          <Field label={t("sharedRoomFor")}>
            <ChoiceChips
              value={filters.sharedRoomFor}
              options={[null, ...SHARED_ROOM_FOR]}
              label={(value) => (value ? f(`sharedRoomFor.${value}`) : t("any"))}
              onChange={(sharedRoomFor) => onChange({ sharedRoomFor })}
            />
          </Field>
        ) : null}
      </Section>

      <Section id="amenities" filters={filters} title={t("sections.amenities")}>
        <AmenityList filters={filters} onChange={onChange} />
      </Section>

      {visible.propertyDetails ? (
        <Section id="property" filters={filters} title={t("sections.property")}>
          <Field label={t("size")}>
            <NumberRange
              min={filters.sizeMin}
              max={filters.sizeMax}
              unit={t("sqm")}
              lowest={1}
              onCommit={(sizeMin, sizeMax) => onChange({ sizeMin, sizeMax })}
              labels={{ min: t("sizeMin"), max: t("sizeMax") }}
            />
          </Field>
          <Field label={t("floor")}>
            <NumberRange
              min={filters.floorMin}
              max={filters.floorMax}
              lowest={-5}
              onCommit={(floorMin, floorMax) => onChange({ floorMin, floorMax })}
              labels={{ min: t("floorMin"), max: t("floorMax") }}
            />
          </Field>
          <Field label={t("condition")}>
            <CheckList
              options={CONDITIONS}
              selected={filters.condition}
              label={(value) => f(`condition.${value}`)}
              hint={(value) => f(`conditionHint.${value}`)}
              onToggle={(value) => onChange({ condition: toggle(filters.condition, value) })}
            />
          </Field>
          <Field label={t("heating")}>
            <CheckList
              options={HEATING_TYPES}
              selected={filters.heating}
              label={(value) => f(`heating.${value}`)}
              onToggle={(value) => onChange({ heating: toggle(filters.heating, value) })}
            />
          </Field>
          <Field label={t("views")}>
            <CheckList
              options={VIEW_TYPES}
              selected={filters.views}
              label={(value) => f(`view.${value}`)}
              onToggle={(value) => onChange({ views: toggle(filters.views, value) })}
            />
          </Field>
          <Field label={t("buildingAge")}>
            <ChoiceChips
              value={filters.buildingAge}
              options={[null, ...BUILDING_AGES]}
              label={(value) => (value ? f(`buildingAge.${value}`) : t("any"))}
              onChange={(buildingAge) => onChange({ buildingAge })}
            />
          </Field>
          <div className="grid gap-3">
            {visible.furnished ? (
              <CheckRow checked={filters.furnished} onChange={(furnished) => onChange({ furnished })} label={f("filter.furnished")} />
            ) : null}
            <CheckRow checked={filters.elevator} onChange={(elevator) => onChange({ elevator })} label={f("filter.elevator")} />
          </div>
        </Section>
      ) : null}

      <Section id="owner" filters={filters} title={t("sections.owner")}>
        <CheckRow
          checked={filters.verifiedOnly}
          onChange={(verifiedOnly) => onChange({ verifiedOnly })}
          label={f("filter.verifiedOnly")}
          hint={t("verifiedHint")}
        />
        <Field label={t("ownerType")}>
          <ChoiceChips
            value={filters.ownerType}
            options={[null, ...OWNER_TYPES]}
            label={(value) => (value ? f(`ownerType.${value}`) : t("any"))}
            onChange={(ownerType) => onChange({ ownerType })}
          />
        </Field>
      </Section>

      <Section id="listing" filters={filters} title={t("sections.listing")}>
        <div className="grid gap-3">
          <CheckRow checked={filters.hasPhotos} onChange={(hasPhotos) => onChange({ hasPhotos })} label={f("filter.hasPhotos")} />
          <CheckRow checked={filters.hasVideo} onChange={(hasVideo) => onChange({ hasVideo })} label={f("filter.hasVideo")} />
        </div>
        <Field label={t("postedWithin")}>
          <ChoiceChips
            value={filters.postedWithin}
            options={[null, ...POSTED_WITHIN]}
            label={(value) => (value ? f(`postedWithin.${value}`) : t("anyTime"))}
            onChange={(postedWithin) => onChange({ postedWithin })}
          />
        </Field>
      </Section>
    </div>
  );
}

// ─── Building blocks ──────────────────────────────────────────

function Section({
  id,
  title,
  filters,
  defaultOpen = false,
  children,
}: {
  id: FilterSection;
  title: string;
  filters: SearchFilters;
  defaultOpen?: boolean;
  children: ReactNode;
}) {
  const t = useTranslations("search.filters");
  const locale = useLocale();
  const count = sectionActiveCount(filters, id);
  const [open, setOpen] = useState(defaultOpen || count > 0);
  return (
    <Collapsible open={open} onOpenChange={setOpen} className="py-1">
      <h3>
        <CollapsibleTrigger className="group flex w-full items-center justify-between gap-3 rounded-lg py-3 text-start text-sm font-semibold outline-none focus-visible:ring-3 focus-visible:ring-ring/50">
          <span className="flex items-center gap-2">
            {title}
            {count > 0 ? (
              <span className="inline-flex min-w-5 items-center justify-center rounded-full bg-primary px-1.5 text-[0.7rem] leading-5 font-semibold text-primary-foreground">
                <span aria-hidden="true">{formatNumber(count, locale)}</span>
                <span className="sr-only">{t("selectedCount", { count })}</span>
              </span>
            ) : null}
          </span>
          <ChevronDown
            aria-hidden="true"
            className="size-4 text-muted-foreground transition-transform group-data-[state=open]:rotate-180 motion-reduce:transition-none"
          />
        </CollapsibleTrigger>
      </h3>
      <CollapsibleContent className="grid gap-5 pb-5">{children}</CollapsibleContent>
    </Collapsible>
  );
}

function Field({ label, children }: { label: string; children: ReactNode }) {
  const id = useId();
  return (
    <div role="group" aria-labelledby={id} className="grid gap-2.5">
      <span id={id} className="text-xs font-semibold tracking-wide text-muted-foreground uppercase">
        {label}
      </span>
      {children}
    </div>
  );
}

/** Single choice as pill buttons (aria-pressed); `null` is the "Any" option. */
function ChoiceChips<T extends string | number | null>({
  value,
  options,
  label,
  onChange,
}: {
  value: T;
  options: readonly T[];
  label: (option: T) => string;
  onChange: (value: T) => void;
}) {
  return (
    <div className="flex flex-wrap gap-2">
      {options.map((option) => {
        const active = option === value;
        return (
          <button
            key={String(option)}
            type="button"
            aria-pressed={active}
            onClick={() => onChange(option)}
            className={cn(
              "min-h-9 rounded-full border px-3.5 py-1.5 text-sm transition-colors outline-none focus-visible:ring-3 focus-visible:ring-ring/50",
              active
                ? "border-primary bg-primary font-semibold text-primary-foreground"
                : "border-border bg-background hover:border-primary/40 hover:bg-secondary",
            )}
          >
            {label(option)}
          </button>
        );
      })}
    </div>
  );
}

/** "Any · 1+ · 2+ · 3+ · 4+ · 5+". */
function MinChips({ value, onChange }: { value: number | null; onChange: (value: number | null) => void }) {
  const t = useTranslations("search.filters");
  const locale = useLocale();
  return (
    <ChoiceChips<number | null>
      value={value === null ? null : (MIN_COUNTS.find((n) => n === Math.floor(value)) ?? null)}
      options={[null, ...MIN_COUNTS]}
      label={(n) => (n === null ? t("any") : t("atLeast", { value: formatNumber(n, locale) }))}
      onChange={onChange}
    />
  );
}

function CheckRow({
  checked,
  onChange,
  label,
  hint,
}: {
  checked: boolean;
  onChange: (checked: boolean) => void;
  label: string;
  hint?: string;
}) {
  const id = useId();
  return (
    <div className="flex items-start gap-3">
      <Checkbox
        id={id}
        checked={checked}
        onCheckedChange={(value) => onChange(value === true)}
        aria-describedby={hint ? `${id}-hint` : undefined}
        className="mt-0.5 size-5"
      />
      <div className="grid gap-0.5">
        <label htmlFor={id} className="cursor-pointer text-sm leading-snug">
          {label}
        </label>
        {hint ? (
          <p id={`${id}-hint`} className="text-xs text-muted-foreground">
            {hint}
          </p>
        ) : null}
      </div>
    </div>
  );
}

function CheckList<T extends string>({
  options,
  selected,
  label,
  hint,
  onToggle,
  columns = 1,
}: {
  options: readonly T[];
  selected: readonly T[];
  label: (option: T) => string;
  hint?: (option: T) => string;
  onToggle: (option: T) => void;
  columns?: 1 | 2;
}) {
  return (
    <div className={cn("grid gap-3", columns === 2 && "sm:grid-cols-2 lg:grid-cols-1 xl:grid-cols-2")}>
      {options.map((option) => (
        <CheckRow
          key={option}
          checked={selected.includes(option)}
          onChange={() => onToggle(option)}
          label={label(option)}
          hint={hint?.(option)}
        />
      ))}
    </div>
  );
}

function AmenityList({ filters, onChange }: Pick<FiltersPanelProps, "filters" | "onChange">) {
  const t = useTranslations("search.filters");
  const f = useTranslations("listingFields");
  const [expanded, setExpanded] = useState(false);
  const hiddenSelected = AMENITY_FILTERS.slice(AMENITIES_COLLAPSED).some((a) => filters.amenities.includes(a));
  const showAll = expanded || hiddenSelected;
  const shown = showAll ? AMENITY_FILTERS : AMENITY_FILTERS.slice(0, AMENITIES_COLLAPSED);
  const listId = useId();
  return (
    <div className="grid gap-3">
      <div id={listId} className="grid gap-3">
        {shown.map((amenity) => (
          <CheckRow
            key={amenity}
            checked={filters.amenities.includes(amenity)}
            onChange={() =>
              onChange({
                amenities: filters.amenities.includes(amenity)
                  ? filters.amenities.filter((a) => a !== amenity)
                  : [...filters.amenities, amenity],
              })
            }
            label={amenity === "pets_allowed" || amenity === "smoking_allowed" ? f(`houseRule.${amenity}`) : f(`amenity.${amenity}`)}
          />
        ))}
      </div>
      {!hiddenSelected ? (
        <button
          type="button"
          aria-expanded={showAll}
          aria-controls={listId}
          onClick={() => setExpanded((v) => !v)}
          className="w-fit text-sm font-semibold text-primary underline-offset-4 hover:underline focus-visible:outline-2 focus-visible:outline-ring"
        >
          {showAll ? t("showFewerAmenities") : t("showAllAmenities", { count: AMENITY_FILTERS.length })}
        </button>
      ) : null}
    </div>
  );
}

/** Parses a typed number (Western or Arabic-Indic digits, spaces and separators allowed). */
function parseTyped(text: string): number | null {
  const western = text
    .replace(/[٠-٩]/g, (d) => String(d.charCodeAt(0) - 0x0660))
    .replace(/[۰-۹]/g, (d) => String(d.charCodeAt(0) - 0x06f0))
    .replace(/[\s,'’]/g, "");
  if (!/^-?\d+(\.\d+)?$/.test(western)) return null;
  const value = Number(western);
  return Number.isFinite(value) ? value : null;
}

const COMMIT_DELAY_MS = 700;

/** Two number inputs (min – max) that commit on blur, Enter, or a short pause in typing. */
function NumberRange({
  min,
  max,
  unit,
  lowest,
  onCommit,
  labels,
}: {
  min: number | null;
  max: number | null;
  unit?: string;
  lowest: number;
  onCommit: (min: number | null, max: number | null) => void;
  labels: { min: string; max: string };
}) {
  const t = useTranslations("search.filters");
  const [text, setText] = useState({ min: min === null ? "" : String(min), max: max === null ? "" : String(max) });
  const [synced, setSynced] = useState({ min, max });
  const timer = useRef<number | undefined>(undefined);

  if (synced.min !== min || synced.max !== max) {
    setSynced({ min, max });
    setText({ min: min === null ? "" : String(min), max: max === null ? "" : String(max) });
  }

  useEffect(() => () => window.clearTimeout(timer.current), []);

  function commit(next = text) {
    window.clearTimeout(timer.current);
    const low = parseTyped(next.min);
    const high = parseTyped(next.max);
    const cleanLow = low !== null && low >= lowest ? low : null;
    const cleanHigh = high !== null && high >= lowest ? high : null;
    if (cleanLow !== min || cleanHigh !== max) onCommit(cleanLow, cleanHigh);
  }

  function update(key: "min" | "max", value: string) {
    const next = { ...text, [key]: value };
    setText(next);
    window.clearTimeout(timer.current);
    timer.current = window.setTimeout(() => commit(next), COMMIT_DELAY_MS);
  }

  const input = (key: "min" | "max") => (
    <label className="relative flex-1">
      <span className="sr-only">{labels[key]}</span>
      <input
        type="text"
        inputMode="numeric"
        dir="ltr"
        value={text[key]}
        placeholder={key === "min" ? t("min") : t("max")}
        onChange={(event) => update(key, event.target.value)}
        onBlur={() => commit()}
        onKeyDown={(event) => {
          if (event.key === "Enter") {
            event.preventDefault();
            commit();
          }
        }}
        className={cn(
          "h-10 w-full rounded-lg border border-input bg-background px-3 text-sm outline-none placeholder:text-muted-foreground focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50",
          unit && "pe-10",
        )}
      />
      {unit ? (
        <span aria-hidden="true" className="pointer-events-none absolute inset-y-0 end-3 flex items-center text-xs text-muted-foreground">
          {unit}
        </span>
      ) : null}
    </label>
  );

  return (
    <div className="flex items-center gap-2">
      {input("min")}
      <span aria-hidden="true" className="text-muted-foreground">
        –
      </span>
      {input("max")}
    </div>
  );
}

function PriceFilter({ filters, onChange }: Pick<FiltersPanelProps, "filters" | "onChange">) {
  const t = useTranslations("search.filters");
  const locale = useLocale();
  const { currency, rates } = useCurrency();
  const config = priceSliderConfig(filters.deal, currency, rates);
  const [drag, setDrag] = useState<number[] | null>(null);

  const symbol = currencySymbol(currency);
  if (!config) {
    return (
      <NumberRange
        min={filters.priceMin}
        max={filters.priceMax}
        unit={symbol}
        lowest={0}
        onCommit={(priceMin, priceMax) => onChange({ priceMin, priceMax })}
        labels={{ min: t("priceMin"), max: t("priceMax") }}
      />
    );
  }

  const committed = sliderValue(filters.priceMin, filters.priceMax, config);
  const shown = drag ?? committed;
  const money = (amount: number) => formatMoney(amount, currency, locale, { maximumFractionDigits: 0 });
  const topLabel = (amount: number) => (amount >= config.max ? t("priceTop", { price: money(config.max) }) : money(amount));

  return (
    <div className="grid gap-4">
      <p className="text-sm font-medium" aria-hidden="true">
        <bdi dir="ltr">{money(shown[0])}</bdi>
        {" – "}
        <bdi dir="ltr">{topLabel(shown[1])}</bdi>
      </p>
      <SliderPrimitive.Root
        dir={dirFor(locale)}
        min={config.min}
        max={config.max}
        step={config.step}
        minStepsBetweenThumbs={1}
        value={shown}
        onValueChange={setDrag}
        onValueCommit={(value) => {
          setDrag(null);
          onChange(fromSliderValue(value, config));
        }}
        className="relative flex h-6 w-full touch-none items-center select-none"
      >
        <SliderPrimitive.Track className="relative h-1.5 grow overflow-hidden rounded-full bg-muted">
          <SliderPrimitive.Range className="absolute h-full bg-primary" />
        </SliderPrimitive.Track>
        {(["min", "max"] as const).map((key, index) => (
          <SliderPrimitive.Thumb
            key={key}
            aria-label={key === "min" ? t("priceMin") : t("priceMax")}
            aria-valuetext={index === 0 ? money(shown[0]) : topLabel(shown[1])}
            className="block size-5 rounded-full border-2 border-primary bg-background shadow-sm outline-none transition-shadow focus-visible:ring-4 focus-visible:ring-ring/40"
          />
        ))}
      </SliderPrimitive.Root>
      <NumberRange
        min={filters.priceMin}
        max={filters.priceMax}
        unit={symbol}
        lowest={0}
        onCommit={(priceMin, priceMax) => onChange({ priceMin, priceMax })}
        labels={{ min: t("priceMin"), max: t("priceMax") }}
      />
      <p className="text-xs text-muted-foreground">{t("priceCurrencyNote", { currency })}</p>
    </div>
  );
}
