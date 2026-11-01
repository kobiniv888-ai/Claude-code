import { useLocale, useTranslations } from "next-intl";
import {
  BadgePercentIcon,
  CheckIcon,
  ChevronDownIcon,
  BuildingIcon,
  CalendarClockIcon,
  CigaretteIcon,
  CoinsIcon,
  DoorClosedIcon,
  DoorOpenIcon,
  FlameIcon,
  MountainSnowIcon,
  PartyPopperIcon,
  PawPrintIcon,
  PiggyBankIcon,
  PlugZapIcon,
  RulerIcon,
  SofaIcon,
  SparklesIcon,
  TrendingDownIcon,
  UsersIcon,
  Volume1Icon,
  WrenchIcon,
} from "lucide-react";
import { ArrowEnd } from "@/components/common/directional-icon";
import { Ltr } from "@/components/common/ltr";
import { AMENITY_ICONS, CONDITION_ICONS } from "@/components/listing/field-icons";
import type { Amenity } from "@/lib/listing/fields";
import { formatArea, formatDate, formatMoney, formatNumber, formatTime } from "@/lib/format";
import { clockDate, priceChangePercent, pricePerSqm } from "@/lib/listing-page/helpers";
import type { ListingPageData } from "@/lib/listing-page/types";
import { cn } from "@/lib/utils";
import { InfoRow, Section } from "./section";

function useClock() {
  const locale = useLocale();
  return (value: string | null) => {
    const date = clockDate(value);
    return date ? formatTime(date, locale, "UTC") : null;
  };
}

/** House rules: check-in/out, smoking, pets, parties, quiet hours. */
export function RulesSection({ data }: { data: ListingPageData }) {
  const t = useTranslations("listing.rules");
  const clock = useClock();
  const checkIn = clock(data.checkInFrom);
  const checkOut = clock(data.checkOutUntil);
  const quietFrom = clock(data.quietHoursFrom);
  const quietTo = clock(data.quietHoursTo);
  const bools = [
    { key: "smoking", value: data.smokingAllowed, icon: CigaretteIcon },
    { key: "pets", value: data.petsAllowed, icon: PawPrintIcon },
    { key: "parties", value: data.partiesAllowed, icon: PartyPopperIcon },
  ] as const;
  const anyBool = bools.some((b) => b.value !== null);
  if (!checkIn && !checkOut && !anyBool && !(quietFrom && quietTo)) return null;
  return (
    <Section id="rules" title={t("title")}>
      <div className="grid gap-5 sm:grid-cols-2">
        {checkIn || checkOut || (quietFrom && quietTo) ? (
          <dl className="divide-y rounded-2xl bg-muted/60 px-4 dark:bg-muted">
            {checkIn ? (
              <InfoRow icon={DoorOpenIcon} label={t("checkIn")}>
                {t("from", { time: checkIn })}
              </InfoRow>
            ) : null}
            {checkOut ? (
              <InfoRow icon={DoorClosedIcon} label={t("checkOut")}>
                {t("until", { time: checkOut })}
              </InfoRow>
            ) : null}
            {quietFrom && quietTo ? (
              <InfoRow icon={Volume1Icon} label={t("quietHours")}>
                <bdi>{quietFrom}</bdi> – <bdi>{quietTo}</bdi>
              </InfoRow>
            ) : null}
          </dl>
        ) : null}
        {anyBool ? (
          <ul className="flex flex-wrap content-start gap-2">
            {bools.map(({ key, value, icon: Icon }) =>
              value === null ? null : (
                <li
                  key={key}
                  className={cn(
                    "inline-flex min-h-10 items-center gap-2 rounded-full px-3.5 text-small font-medium",
                    value ? "bg-verified-soft text-verified" : "bg-muted/80 text-foreground dark:bg-muted",
                  )}
                >
                  <Icon className="size-4.5 shrink-0" aria-hidden />
                  <span className="sr-only">{value ? t("allowed") : t("notAllowed")}: </span>
                  {t(`${key}.${value ? "yes" : "no"}`)}
                </li>
              ),
            )}
          </ul>
        ) : null}
      </div>
    </Section>
  );
}

/** All costs: deposit, cleaning, utilities, minimum stay, discounts; sales: price per m² and price drops. */
export function CostsSection({ data }: { data: ListingPageData }) {
  const t = useTranslations("listing.costs");
  const locale = useLocale();
  const money = (amount: number) => <Ltr>{formatMoney(amount, data.currency, locale)}</Ltr>;
  const isSale = data.dealType === "SALE";
  const perSqm = isSale ? pricePerSqm(data.price, data.sizeSqm) : null;
  const rows: { key: string; icon: typeof CoinsIcon; label: string; value: React.ReactNode }[] = [];

  if (perSqm) rows.push({ key: "sqm", icon: RulerIcon, label: t("pricePerSqm"), value: t("perSqm", { price: formatMoney(perSqm, data.currency, locale) }) });
  if (!isSale) {
    if (data.deposit) rows.push({ key: "deposit", icon: PiggyBankIcon, label: t("deposit"), value: money(data.deposit) });
    if (data.cleaningFee) rows.push({ key: "cleaning", icon: SparklesIcon, label: t("cleaningFee"), value: money(data.cleaningFee) });
    if (data.utilitiesIncluded !== null || data.utilitiesEstimate) {
      rows.push({
        key: "utilities",
        icon: PlugZapIcon,
        label: t("utilities"),
        value: data.utilitiesIncluded
          ? t("utilitiesIncluded")
          : data.utilitiesEstimate
            ? t("utilitiesEstimate", { amount: formatMoney(data.utilitiesEstimate, data.currency, locale) })
            : t("utilitiesNotIncluded"),
      });
    }
    if (data.minStayNights) rows.push({ key: "minStay", icon: CalendarClockIcon, label: t("minStay"), value: t("nights", { count: data.minStayNights }) });
    if (data.weeklyDiscountPct) rows.push({ key: "weekly", icon: BadgePercentIcon, label: t("weeklyDiscount"), value: t("percentOff", { count: data.weeklyDiscountPct }) });
    if (data.monthlyDiscountPct) rows.push({ key: "monthly", icon: BadgePercentIcon, label: t("monthlyDiscount"), value: t("percentOff", { count: data.monthlyDiscountPct }) });
  }
  const history = isSale ? data.priceChanges : [];
  if (rows.length === 0 && history.length === 0) return null;

  return (
    <Section id="costs" title={isSale ? t("titleSale") : t("title")}>
      {rows.length ? (
        <dl className="divide-y rounded-2xl bg-muted/60 px-4 dark:bg-muted">
          {rows.map(({ key, icon, label, value }) => (
            <InfoRow key={key} icon={icon} label={label}>
              {value}
            </InfoRow>
          ))}
        </dl>
      ) : null}
      {history.length ? (
        <div className="mt-6 grid gap-3">
          <h3 className="flex items-center gap-2 font-semibold">
            <TrendingDownIcon className="size-5 text-verified" aria-hidden />
            {t("priceHistory")}
          </h3>
          <ol className="grid gap-2">
            {history.map((change) => {
              const pct = priceChangePercent(change.oldPrice, change.newPrice);
              return (
                <li key={change.changedAt} className="flex flex-wrap items-center gap-x-3 gap-y-1 rounded-xl bg-muted/60 px-3 py-2 text-sm">
                  <time dateTime={change.changedAt} className="text-muted-foreground">
                    {formatDate(change.changedAt, locale, { day: "numeric", month: "short", year: "numeric" })}
                  </time>
                  <span className="inline-flex items-center gap-1.5 font-medium">
                    <bdi className="text-muted-foreground line-through">{formatMoney(change.oldPrice, change.currency, locale)}</bdi>
                    <ArrowEnd className="size-3.5 text-muted-foreground" aria-hidden />
                    <bdi>{formatMoney(change.newPrice, change.currency, locale)}</bdi>
                  </span>
                  {pct !== null ? (
                    <span className={pct < 0 ? "font-semibold text-verified" : "font-semibold text-warning"}>
                      <Ltr>{`${pct > 0 ? "+" : ""}${formatNumber(pct, locale)}%`}</Ltr>
                    </span>
                  ) : null}
                </li>
              );
            })}
          </ol>
        </div>
      ) : null}
    </Section>
  );
}

/** Every basic and Georgian market detail the owner filled in. */
export function DetailsSection({ data }: { data: ListingPageData }) {
  const t = useTranslations("listing.details");
  const f = useTranslations("listingFields");
  const locale = useLocale();
  const yesNo = (value: boolean) => (value ? t("yes") : t("no"));
  const rows: { key: string; icon: typeof CoinsIcon; label: string; value: React.ReactNode }[] = [
    { key: "deal", icon: CoinsIcon, label: t("dealType"), value: f(`dealType.${data.dealType}`) },
    { key: "type", icon: BuildingIcon, label: t("propertyType"), value: f(`propertyType.${data.propertyType}`) },
  ];
  if (data.rooms) rows.push({ key: "rooms", icon: DoorOpenIcon, label: t("rooms"), value: formatNumber(data.rooms, locale) });
  if (data.bedrooms !== null) rows.push({ key: "bedrooms", icon: DoorOpenIcon, label: t("bedrooms"), value: formatNumber(data.bedrooms, locale) });
  if (data.bathrooms !== null) rows.push({ key: "bathrooms", icon: DoorOpenIcon, label: t("bathrooms"), value: formatNumber(data.bathrooms, locale) });
  const beds = [
    data.bedsDouble ? t("bedsDouble", { count: data.bedsDouble }) : null,
    data.bedsSingle ? t("bedsSingle", { count: data.bedsSingle }) : null,
    data.bedsSofa ? t("bedsSofa", { count: data.bedsSofa }) : null,
  ].filter(Boolean);
  if (beds.length) rows.push({ key: "beds", icon: SofaIcon, label: t("beds"), value: beds.join(", ") });
  if (data.maxGuests && data.dealType !== "SALE") rows.push({ key: "guests", icon: UsersIcon, label: t("maxGuests"), value: formatNumber(data.maxGuests, locale) });
  if (data.sharedRoomFor) rows.push({ key: "shared", icon: UsersIcon, label: t("sharedRoomFor"), value: f(`sharedRoomFor.${data.sharedRoomFor}`) });
  if (data.sizeSqm) rows.push({ key: "size", icon: RulerIcon, label: t("size"), value: formatArea(data.sizeSqm, locale) });
  if (data.floor !== null) {
    rows.push({
      key: "floor",
      icon: BuildingIcon,
      label: t("floor"),
      value: data.totalFloors !== null ? t("floorOf", { floor: formatNumber(data.floor, locale), total: formatNumber(data.totalFloors, locale) }) : formatNumber(data.floor, locale),
    });
  }
  if (data.elevator !== null) rows.push({ key: "elevator", icon: BuildingIcon, label: t("elevator"), value: yesNo(data.elevator) });
  if (data.buildingAge) rows.push({ key: "age", icon: BuildingIcon, label: t("building"), value: f(`buildingAge.${data.buildingAge}`) });
  if (data.yearBuilt) rows.push({ key: "year", icon: CalendarClockIcon, label: t("yearBuilt"), value: <Ltr>{String(data.yearBuilt)}</Ltr> });
  if (data.furnished !== null) rows.push({ key: "furnished", icon: SofaIcon, label: t("furnished"), value: yesNo(data.furnished) });
  if (data.heating.length) rows.push({ key: "heating", icon: FlameIcon, label: t("heating"), value: data.heating.map((h) => f(`heating.${h}`)).join(", ") });
  if (data.views.length) rows.push({ key: "views", icon: MountainSnowIcon, label: t("views"), value: data.views.map((v) => f(`view.${v}`)).join(", ") });

  const ConditionIcon = data.condition ? CONDITION_ICONS[data.condition] : WrenchIcon;
  return (
    <Section id="details" title={t("title")}>
      {data.condition ? (
        <div className="mb-4 flex gap-3 rounded-xl border bg-muted/40 p-4">
          <ConditionIcon className="mt-0.5 size-5 shrink-0 text-primary" aria-hidden />
          <div className="grid gap-0.5">
            <p className="font-semibold">
              {t("condition")}: {f(`condition.${data.condition}`)}
            </p>
            <p className="text-sm text-muted-foreground">{f(`conditionHint.${data.condition}`)}</p>
          </div>
        </div>
      ) : null}
      <details className="group rounded-2xl border bg-card">
        <summary className="flex min-h-12 cursor-pointer list-none items-center justify-between gap-3 rounded-2xl px-4 font-semibold outline-none select-none focus-visible:ring-3 focus-visible:ring-ring/50 [&::-webkit-details-marker]:hidden">
          {t("showAll", { count: rows.length })}
          <ChevronDownIcon className="size-5 shrink-0 transition-transform duration-(--motion-fast) group-open:rotate-180 motion-reduce:transition-none" aria-hidden />
        </summary>
        <dl className="grid divide-y border-t px-4 sm:grid-cols-2 sm:gap-x-8 sm:divide-y-0 [&>div]:sm:border-b [&>div:nth-last-child(-n+2)]:sm:border-b-0">
          {rows.map(({ key, icon, label, value }) => (
            <InfoRow key={key} icon={icon} label={label}>
              {value}
            </InfoRow>
          ))}
        </dl>
      </details>
    </Section>
  );
}

/** What the place has, as chips with icons. */
export function AmenitiesSection({ amenities }: { amenities: string[] }) {
  const t = useTranslations("listing.amenities");
  const f = useTranslations("listingFields");
  const known = amenities.filter((key): key is Amenity => key in AMENITY_ICONS);
  if (known.length === 0) return null;
  return (
    <Section id="amenities" title={t("title")}>
      <ul className="flex flex-wrap gap-2">
        {known.map((key) => {
          const Icon = AMENITY_ICONS[key] ?? CheckIcon;
          return (
            <li key={key} className="inline-flex min-h-10 items-center gap-2 rounded-full bg-muted/80 px-3.5 text-small font-medium dark:bg-muted">
              <Icon className="size-4.5 shrink-0 text-navy" aria-hidden />
              {f(`amenity.${key}`)}
            </li>
          );
        })}
      </ul>
    </Section>
  );
}
