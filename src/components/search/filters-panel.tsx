"use client";

import { useState } from "react";
import { useLocale, useTranslations } from "next-intl";
import { ChevronDownIcon } from "lucide-react";
import { KosherStampIcon, type IconComponent } from "@/components/ds/jewish-icons";
import { SegmentedControl } from "@/components/ds/segmented-control";
import {
  HOTEL_JEWISH_FEATURE_ICONS,
  JEWISH_FEATURE_ICONS,
  PROPERTY_TYPE_ICONS,
  amenityFilterIcon,
} from "@/components/listing/field-icons";
import { formatNumber } from "@/lib/format";
import {
  CONDITIONS,
  HEATING_TYPES,
  HOTEL_JEWISH_FEATURES,
  JEWISH_FEATURES,
  SHARED_ROOM_FOR,
  VIEW_TYPES,
  type JewishFeature,
} from "@/lib/listing/fields";
import {
  AMENITY_FILTERS,
  BUILDING_AGES,
  DEAL_FILTERS,
  OWNER_TYPES,
  POSTED_WITHIN,
  SYNAGOGUE_WALK_OPTIONS,
  type AmenityFilter,
  type DealFilter,
  type SearchFilters,
  type SynagogueWalk,
} from "@/lib/listing/search-params";
import { filterVisibility, propertyTypesFor } from "@/lib/search/filter-sections";
import type { HolidayMark } from "@/lib/search/holiday-marks";
import type { PriceHistogram } from "@/lib/search/price-histogram";
import { cn } from "@/lib/utils";
import {
  CheckList,
  CheckRow,
  ChoiceChips,
  CollapsibleSection,
  Field,
  IconTile,
  NumberRange,
  SheetSection,
  SwitchRow,
} from "./filter-parts";
import { GuestsStepper } from "./guests-stepper";
import { HolidayCalendar } from "./holiday-calendar";
import { PriceFilter } from "./price-filter";

export type FiltersPanelProps = {
  filters: SearchFilters;
  onChange: (patch: Partial<SearchFilters>) => void;
  holidays: HolidayMark[];
  /** The price histogram (undefined while loading). */
  histogram?: PriceHistogram | null;
  className?: string;
};

const MIN_COUNTS = ["any", "1", "2", "3", "4", "5"] as const;
type MinCount = (typeof MIN_COUNTS)[number];
const AMENITIES_COLLAPSED = 8;
/** The Jewish features with their own switch row (the rest are small chips under "More"). */
const BIG_JEWISH: readonly JewishFeature[] = ["host_keeps_shabbat", "host_speaks_hebrew"];

const toggled = <T extends string>(list: readonly T[], value: T): T[] =>
  list.includes(value) ? list.filter((v) => v !== value) : [...list, value];

/**
 * The body of the filters sheet (brief 5.4): deal type, property type tiles, price histogram +
 * slider, rooms as segmented rows, "Kashrut & Shabbat" as plain switch rows, then collapsed
 * sections for dates, amenities, property details, the advertiser and the listing. Stateless:
 * the sheet keeps the draft. Filters that cannot match the deal are hidden unless set.
 */
export function FiltersPanel({ filters, onChange, holidays, histogram, className }: FiltersPanelProps) {
  const t = useTranslations("search.filters");
  const s = useTranslations("search.sheet");
  const f = useTranslations("listingFields");
  const locale = useLocale();
  const visible = filterVisibility(filters);
  const types = propertyTypesFor(filters.deal);

  const dealOptions = DEAL_FILTERS.filter((deal) => deal !== "rent" || filters.deal === "rent");
  const minSegments = MIN_COUNTS.map((value) => ({
    value,
    label: value === "any" ? t("any") : t("atLeast", { value: formatNumber(Number(value), locale) }),
  }));
  const minValue = (n: number | null): MinCount => (n === null ? "any" : (MIN_COUNTS.find((v) => v === String(Math.min(5, Math.floor(n)))) ?? "any"));
  const fromMin = (v: MinCount) => (v === "any" ? null : Number(v));

  return (
    <div className={cn("divide-y divide-border", className)}>
      <SheetSection id="deal" title={t("dealType")}>
        <SegmentedControl<DealFilter | "any">
          aria-label={t("dealType")}
          size="sm"
          // Five segments on a phone: smaller text so long Georgian/Russian labels stay inside (bug 8.3).
          className="max-sm:[&_[role=radio]]:px-1 max-sm:[&_[role=radio]]:text-xs"
          value={filters.deal ?? "any"}
          options={[
            { value: "any", label: s("dealShort.any") },
            ...dealOptions.map((deal) => ({ value: deal, label: s(`dealShort.${deal}`) })),
          ]}
          onValueChange={(value) => {
            const deal = value === "any" ? null : value;
            onChange({ deal, propertyTypes: filters.propertyTypes.filter((type) => propertyTypesFor(deal).includes(type)) });
          }}
        />
        <Field label={t("propertyType")}>
          <div className="grid grid-cols-3 gap-2">
            {types.map((type) => (
              <IconTile
                key={type}
                icon={PROPERTY_TYPE_ICONS[type]}
                label={f(`propertyType.${type}`)}
                pressed={filters.propertyTypes.includes(type)}
                onToggle={() => onChange({ propertyTypes: toggled(filters.propertyTypes, type) })}
              />
            ))}
          </div>
        </Field>
      </SheetSection>

      <SheetSection id="price" title={t("sections.price")}>
        <PriceFilter filters={filters} onChange={onChange} histogram={histogram} />
      </SheetSection>

      <SheetSection id="rooms" title={t("sections.rooms")}>
        {(["rooms", "bedrooms", "bathrooms"] as const).map((key) => (
          <Field key={key} label={t(key)}>
            <SegmentedControl<MinCount>
              aria-label={t(key)}
              size="sm"
              tone="card"
              value={minValue(filters[key])}
              options={minSegments}
              onValueChange={(value) => onChange({ [key]: fromMin(value) } as Partial<SearchFilters>)}
            />
          </Field>
        ))}
        {visible.bigFamily ? (
          <SwitchRow checked={filters.bigFamily} onChange={(bigFamily) => onChange({ bigFamily })} label={f("filter.bigFamily")} />
        ) : null}
      </SheetSection>

      <JewishSection filters={filters} onChange={onChange} />

      {visible.dates ? (
        <CollapsibleSection id="dates" filters={filters} title={visible.moveIn ? t("sections.moveIn") : t("sections.dates")}>
          <div className="-mx-1 overflow-x-auto">
            {visible.moveIn ? (
              <HolidayCalendar
                mode="single"
                holidays={holidays}
                checkIn={filters.checkIn}
                onChange={(checkIn) => onChange({ checkIn, checkOut: null })}
                className="mx-auto [--cell-size:--spacing(10)]"
              />
            ) : (
              <HolidayCalendar
                mode="range"
                holidays={holidays}
                checkIn={filters.checkIn}
                checkOut={filters.checkOut}
                onChange={(checkIn, checkOut) => onChange({ checkIn, checkOut: checkIn && checkOut ? checkOut : null })}
                className="mx-auto [--cell-size:--spacing(10)]"
              />
            )}
          </div>
          {filters.checkIn ? (
            <button
              type="button"
              onClick={() => onChange({ checkIn: null, checkOut: null })}
              className="min-h-11 w-fit text-sm font-semibold text-primary underline-offset-4 outline-none hover:underline focus-visible:ring-3 focus-visible:ring-ring/50"
            >
              {t("clearDates")}
            </button>
          ) : null}
          {visible.guests ? (
            <GuestsStepper value={filters.guests ?? 0} onChange={(guests) => onChange({ guests: guests > 0 ? guests : null })} />
          ) : null}
        </CollapsibleSection>
      ) : null}

      <CollapsibleSection id="amenities" filters={filters} title={t("sections.amenities")}>
        <AmenityGrid filters={filters} onChange={onChange} />
      </CollapsibleSection>

      {visible.propertyDetails ? (
        <CollapsibleSection id="property" filters={filters} title={t("sections.property")}>
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
              onToggle={(value) => onChange({ condition: toggled(filters.condition, value) })}
            />
          </Field>
          <Field label={t("heating")}>
            <CheckList
              options={HEATING_TYPES}
              selected={filters.heating}
              label={(value) => f(`heating.${value}`)}
              onToggle={(value) => onChange({ heating: toggled(filters.heating, value) })}
            />
          </Field>
          <Field label={t("views")}>
            <CheckList
              options={VIEW_TYPES}
              selected={filters.views}
              label={(value) => f(`view.${value}`)}
              onToggle={(value) => onChange({ views: toggled(filters.views, value) })}
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
        </CollapsibleSection>
      ) : null}

      <CollapsibleSection id="owner" filters={filters} title={t("sections.owner")}>
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
      </CollapsibleSection>

      <CollapsibleSection id="listing" filters={filters} title={t("sections.listing")}>
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
      </CollapsibleSection>
    </div>
  );
}

/** Synagogue walking times offered in the "כשרות ושבת" group (≤10 / ≤20 min); 20 when switched on. */
const WALK_CHOICES = [10, 20] as const satisfies readonly SynagogueWalk[];
const DEFAULT_WALK: SynagogueWalk = 20;

/**
 * "כשרות ושבת" (round 2): plain switch rows — kosher kitchen, kosher meals (hotels), Shabbat-friendly,
 * a synagogue within walking distance (≤10 / ≤20 min), the host keeps Shabbat, the host speaks
 * Hebrew. The "כשר ושבת" quick chip shows here as its own row while it is on. Everything else
 * (kasherable kitchens, mezuzot, Pesach-ready, hotel extras, shared rooms) is under "More".
 */
function JewishSection({ filters, onChange }: Pick<FiltersPanelProps, "filters" | "onChange">) {
  const t = useTranslations("search.filters");
  const s = useTranslations("search.sheet");
  const f = useTranslations("listingFields");
  const visible = filterVisibility(filters);
  const [more, setMore] = useState(false);

  const walkChoices: SynagogueWalk[] =
    filters.synagogueMaxWalk !== null && !(WALK_CHOICES as readonly number[]).includes(filters.synagogueMaxWalk)
      ? [...SYNAGOGUE_WALK_OPTIONS].filter((m) => (WALK_CHOICES as readonly number[]).includes(m) || m === filters.synagogueMaxWalk)
      : [...WALK_CHOICES];
  const moreHotel = HOTEL_JEWISH_FEATURES.filter((feature) => feature !== "kosher_meals");
  const others = JEWISH_FEATURES.filter((feature) => !BIG_JEWISH.includes(feature));
  const moreActive =
    filters.kitchen === "kosher_or_kasherable" ||
    filters.sharedRoomFor !== null ||
    others.some((feature) => filters.jewish.includes(feature)) ||
    moreHotel.some((feature) => filters.hotel.includes(feature));
  const showMore = more || moreActive;

  return (
    <SheetSection id="jewish" title={s("jewishTitle")}>
      <div className="-my-1 grid divide-y divide-border">
        {filters.kosherShabbat ? (
          <SwitchRow
            checked
            onChange={(on) => onChange({ kosherShabbat: on })}
            label={t("kosherShabbat")}
            hint={t("kosherShabbatHint")}
          />
        ) : null}
        <SwitchRow
          checked={filters.kitchen === "kosher"}
          onChange={(on) => onChange({ kitchen: on ? "kosher" : null })}
          label={f("kitchenFilter.kosher")}
        />
        {visible.hotel ? (
          <SwitchRow
            checked={filters.hotel.includes("kosher_meals")}
            onChange={() => onChange({ hotel: toggled(filters.hotel, "kosher_meals") })}
            label={f("hotelJewishFeature.kosher_meals")}
          />
        ) : null}
        <SwitchRow
          checked={filters.shabbatFriendly}
          onChange={(on) => onChange({ shabbatFriendly: on })}
          label={f("filter.shabbatFriendly")}
          hint={filters.shabbatFriendly ? t("shabbatFriendlyHint") : undefined}
        />
        <SwitchRow
          checked={filters.synagogueMaxWalk !== null}
          onChange={(on) => onChange({ synagogueMaxWalk: on ? DEFAULT_WALK : null })}
          label={s("synagogueNear")}
        >
          <ChoiceChips
            value={filters.synagogueMaxWalk}
            options={walkChoices}
            label={(minutes) => t("walkUpTo", { count: minutes ?? 0 })}
            onChange={(synagogueMaxWalk) => onChange({ synagogueMaxWalk })}
          />
        </SwitchRow>
        {BIG_JEWISH.map((feature) => (
          <SwitchRow
            key={feature}
            checked={filters.jewish.includes(feature)}
            onChange={() => onChange({ jewish: toggled(filters.jewish, feature) })}
            label={f(`jewishFeature.${feature}`)}
          />
        ))}
      </div>

      <button
        type="button"
        aria-expanded={showMore}
        onClick={() => setMore((v) => !v)}
        disabled={moreActive}
        className="group inline-flex min-h-11 w-fit items-center gap-1.5 text-small font-semibold text-primary outline-none focus-visible:ring-3 focus-visible:ring-ring/50 disabled:opacity-100"
      >
        {s("jewishMore")}
        <ChevronDownIcon
          aria-hidden="true"
          className={cn("size-4 transition-transform duration-(--motion-base) motion-reduce:transition-none", showMore && "rotate-180")}
        />
      </button>
      {showMore ? (
        <div className="grid gap-4">
          <div className="flex flex-wrap gap-2">
            <SmallToggle
              icon={KosherStampIcon}
              label={f("kitchenFilter.kosher_or_kasherable")}
              pressed={filters.kitchen === "kosher_or_kasherable"}
              onToggle={() => onChange({ kitchen: filters.kitchen === "kosher_or_kasherable" ? null : "kosher_or_kasherable" })}
            />
            {others.map((feature) => (
              <SmallToggle
                key={feature}
                icon={JEWISH_FEATURE_ICONS[feature]}
                label={f(`jewishFeature.${feature}`)}
                pressed={filters.jewish.includes(feature)}
                onToggle={() => onChange({ jewish: toggled(filters.jewish, feature) })}
              />
            ))}
            {visible.hotel
              ? moreHotel.map((feature) => (
                  <SmallToggle
                    key={feature}
                    icon={HOTEL_JEWISH_FEATURE_ICONS[feature]}
                    label={f(`hotelJewishFeature.${feature}`)}
                    pressed={filters.hotel.includes(feature)}
                    onToggle={() => onChange({ hotel: toggled(filters.hotel, feature) })}
                  />
                ))
              : null}
          </div>
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
        </div>
      ) : null}
    </SheetSection>
  );
}

function SmallToggle({ icon: Icon, label, pressed, onToggle }: { icon: IconComponent; label: string; pressed: boolean; onToggle: () => void }) {
  return (
    <button
      type="button"
      aria-pressed={pressed}
      onClick={onToggle}
      className={cn(
        "inline-flex min-h-10 items-center gap-1.5 rounded-full border px-3.5 text-sm font-medium transition-colors duration-(--motion-fast) outline-none focus-visible:ring-3 focus-visible:ring-ring/50 [&_svg]:size-4 [&_svg]:shrink-0",
        pressed ? "border-primary-tint-border bg-primary-tint text-primary-text" : "border-border bg-card hover:border-input hover:bg-muted",
      )}
    >
      <Icon aria-hidden="true" />
      {label}
    </button>
  );
}

/** Amenities as two columns of small icon toggles; the first 8, then "Show all". */
function AmenityGrid({ filters, onChange }: Pick<FiltersPanelProps, "filters" | "onChange">) {
  const t = useTranslations("search.filters");
  const f = useTranslations("listingFields");
  const [expanded, setExpanded] = useState(false);
  const hiddenSelected = AMENITY_FILTERS.slice(AMENITIES_COLLAPSED).some((a) => filters.amenities.includes(a));
  const showAll = expanded || hiddenSelected;
  const shown = showAll ? AMENITY_FILTERS : AMENITY_FILTERS.slice(0, AMENITIES_COLLAPSED);
  const label = (amenity: AmenityFilter) =>
    amenity === "pets_allowed" || amenity === "smoking_allowed" ? f(`houseRule.${amenity}`) : f(`amenity.${amenity}`);
  return (
    <div className="grid gap-3">
      <div className="flex flex-wrap gap-2">
        {shown.map((amenity) => (
          <SmallToggle
            key={amenity}
            icon={amenityFilterIcon(amenity)}
            label={label(amenity)}
            pressed={filters.amenities.includes(amenity)}
            onToggle={() => onChange({ amenities: toggled(filters.amenities, amenity) })}
          />
        ))}
      </div>
      {!hiddenSelected ? (
        <button
          type="button"
          aria-expanded={showAll}
          onClick={() => setExpanded((v) => !v)}
          className="min-h-11 w-fit text-sm font-semibold text-primary underline-offset-4 outline-none hover:underline focus-visible:ring-3 focus-visible:ring-ring/50"
        >
          {showAll ? t("showFewerAmenities") : t("showAllAmenities", { count: AMENITY_FILTERS.length })}
        </button>
      ) : null}
    </div>
  );
}
