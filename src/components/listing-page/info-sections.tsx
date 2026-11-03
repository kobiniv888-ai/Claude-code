import { useLocale, useTranslations } from "next-intl";
import { Ltr } from "@/components/common/ltr";
import { SpriteIcon } from "@/components/ds/sprite-icons";
import type { SpriteIconName } from "@/components/ds/sprite-icons.generated";
import { formatDate, formatMoney, formatNumber, formatTime } from "@/lib/format";
import { clockDate, priceChangePercent } from "@/lib/listing-page/helpers";
import { houseRules, orderedAmenities, type Highlight, type HouseRule } from "@/lib/listing-page/highlights";
import type { ListingPageData } from "@/lib/listing-page/types";
import { AMENITY_SPRITE } from "./icons";
import { MoreSheet } from "./more-sheet";
import { Section } from "./section";
import { PriceHistoryFoldedSection } from "./folded-section-island";

const AMENITIES_PREVIEW = 6;
const RULES_PREVIEW = 3;

function useClock() {
  const locale = useLocale();
  return (value: string | null) => {
    const date = clockDate(value);
    return date ? formatTime(date, locale, "UTC") : null;
  };
}

/** "What this place offers": six amenities (not the ones already highlighted), then "Show all N". */
export function AmenitiesSection({ amenities, highlights }: { amenities: string[]; highlights: Highlight[] }) {
  const t = useTranslations("listing.amenities");
  const f = useTranslations("listingFields.amenity");
  const locale = useLocale();
  const ordered = orderedAmenities(amenities, highlights);
  if (ordered.length === 0) return null;
  const list = (keys: typeof ordered) => (
    <ul className="grid gap-x-6 gap-y-3.5 sm:grid-cols-2">
      {keys.map((key) => (
        <li key={key} className="flex items-center gap-3 text-body">
          <SpriteIcon name={AMENITY_SPRITE[key]} className="size-6 shrink-0 text-muted-foreground" />
          {f(key)}
        </li>
      ))}
    </ul>
  );
  return (
    <Section id="amenities" title={t("title")}>
      <div className="grid gap-5">
        {list(ordered.slice(0, AMENITIES_PREVIEW))}
        {ordered.length > AMENITIES_PREVIEW ? (
          <MoreSheet label={t("showAll", { count: formatNumber(ordered.length, locale) })} title={t("title")}>
            {list(ordered)}
          </MoreSheet>
        ) : null}
      </div>
    </Section>
  );
}

type Row = { key: string; icon: SpriteIconName; label: string; children: React.ReactNode };

function InfoList({ rows }: { rows: Row[] }) {
  return (
    <ul className="grid gap-5">
      {rows.map(({ key, icon, label, children }) => (
        <li key={key} className="flex items-start gap-3">
          <SpriteIcon name={icon} className="mt-0.5 size-6 shrink-0 text-muted-foreground" />
          <div className="grid min-w-0 gap-0.5">
            <h3 className="text-body font-semibold">{label}</h3>
            <div className="text-small text-muted-foreground">{children}</div>
          </div>
        </li>
      ))}
    </ul>
  );
}

function RuleText({ rule }: { rule: HouseRule }) {
  const t = useTranslations("listing.rules");
  const clock = useClock();
  if (rule.key === "quietHours") {
    return (
      <>
        {t("quietHours")}: <bdi>{clock(rule.from)}</bdi> – <bdi>{clock(rule.to)}</bdi>
      </>
    );
  }
  return <>{t(`${rule.key}.${rule.allowed ? "yes" : "no"}`)}</>;
}

/**
 * "Good to know": check-in and check-out, the costs beside the rent, the house rules (three,
 * then "Show all"), the cancellation policy and the pay-at-arrival note (stays), and the
 * live-video safety tip: the ONLY safety block on the page.
 */
export function ImportantToKnow({ data }: { data: ListingPageData }) {
  const t = useTranslations("listing.important");
  const tr = useTranslations("listing.rules");
  const tc = useTranslations("listing.costs");
  const locale = useLocale();
  const clock = useClock();
  const stay = data.dealType === "SHORT_STAY" || data.dealType === "HOTEL_ROOM";
  const sale = data.dealType === "SALE";
  const money = (amount: number) => <Ltr>{formatMoney(amount, data.currency, locale)}</Ltr>;
  const rows: Row[] = [];

  const checkIn = clock(data.checkInFrom);
  const checkOut = clock(data.checkOutUntil);
  if (!sale && (checkIn || checkOut)) {
    rows.push({
      key: "times",
      icon: "clock",
      label: t("times"),
      children: (
        <p>
          {checkIn ? tr("checkInFrom", { time: checkIn }) : null}
          {checkIn && checkOut ? <span aria-hidden="true" className="px-1.5">·</span> : null}
          {checkOut ? tr("checkOutUntil", { time: checkOut }) : null}
        </p>
      ),
    });
  }

  const costs: React.ReactNode[] = [];
  if (!sale) {
    if (data.deposit) costs.push(<>{tc("deposit")}: {money(data.deposit)}</>);
    if (data.cleaningFee) costs.push(<>{tc("cleaningFee")}: {money(data.cleaningFee)}</>);
    if (data.utilitiesIncluded !== null && !stay) {
      costs.push(
        data.utilitiesIncluded
          ? tc("utilitiesIncluded")
          : data.utilitiesEstimate
            ? tc("utilitiesEstimate", { amount: formatMoney(data.utilitiesEstimate, data.currency, locale) })
            : tc("utilitiesNotIncluded"),
      );
    }
    // Rentals store the minimum in nights (90 = about three months): say it in months from four weeks up.
    if (data.minStayNights && !stay) {
      costs.push(
        data.minStayNights >= 28
          ? tc("minStayText", { count: Math.round(data.minStayNights / 30) })
          : tc("minStayNightsText", { count: data.minStayNights }),
      );
    }
    if (data.weeklyDiscountPct) costs.push(tc("weeklyDiscountText", { count: formatNumber(data.weeklyDiscountPct, locale) }));
    if (data.monthlyDiscountPct) costs.push(tc("monthlyDiscountText", { count: formatNumber(data.monthlyDiscountPct, locale) }));
  }
  if (costs.length) {
    rows.push({
      key: "costs",
      icon: "hand-coins",
      label: t("costs"),
      children: (
        <ul className="grid gap-0.5">
          {costs.map((cost, i) => (
            <li key={i}>{cost}</li>
          ))}
        </ul>
      ),
    });
  }

  const rules = sale ? [] : houseRules(data);
  if (rules.length) {
    const list = (items: HouseRule[]) => (
      <ul className="grid gap-0.5">
        {items.map((rule) => (
          <li key={rule.key}>
            <RuleText rule={rule} />
          </li>
        ))}
      </ul>
    );
    rows.push({
      key: "rules",
      icon: "door-open",
      label: t("rules"),
      children: (
        <div className="grid gap-2">
          {list(rules.slice(0, RULES_PREVIEW))}
          {rules.length > RULES_PREVIEW ? (
            <MoreSheet label={t("showAll")} title={t("rules")} className="h-11">
              <div className="text-body">{list(rules)}</div>
            </MoreSheet>
          ) : null}
        </div>
      ),
    });
  }

  if (stay) {
    rows.push({
      key: "cancel",
      icon: "calendar-x",
      label: t("cancellation"),
      children: <p>{data.cancellationPolicy ? t(`policy.${data.cancellationPolicy}`) : t("policy.none")}</p>,
    });
    rows.push({ key: "payment", icon: "wallet", label: t("payment"), children: <p>{t("paymentText")}</p> });
  }

  rows.push({
    key: "video",
    icon: "video",
    label: t("safety"),
    children: <p>{t.rich("videoTip", { id: data.publicId, ltr: (chunks) => <Ltr>{chunks}</Ltr> })}</p>,
  });

  return (
    <Section id="good-to-know" title={t("title")}>
      <InfoList rows={rows} />
    </Section>
  );
}

/** Rentals and sales: the building and the flat (the Georgian frame terms first), six then "Show all". */
export function DetailsSection({ data }: { data: ListingPageData }) {
  const t = useTranslations("listing.details");
  const f = useTranslations("listingFields");
  const locale = useLocale();
  const yesNo = (value: boolean) => (value ? t("yes") : t("no"));
  const rows: { key: string; label: string; value: React.ReactNode }[] = [
    { key: "type", label: t("propertyType"), value: f(`propertyType.${data.propertyType}`) },
  ];
  if (data.floor !== null) {
    rows.push({
      key: "floor",
      label: t("floor"),
      value: data.totalFloors !== null ? t("floorOf", { floor: formatNumber(data.floor, locale), total: formatNumber(data.totalFloors, locale) }) : formatNumber(data.floor, locale),
    });
  }
  if (data.elevator !== null) rows.push({ key: "elevator", label: t("elevator"), value: yesNo(data.elevator) });
  if (data.furnished !== null) rows.push({ key: "furnished", label: t("furnished"), value: yesNo(data.furnished) });
  if (data.heating.length) rows.push({ key: "heating", label: t("heating"), value: data.heating.map((h) => f(`heating.${h}`)).join(", ") });
  if (data.views.length) rows.push({ key: "views", label: t("views"), value: data.views.map((v) => f(`view.${v}`)).join(", ") });
  if (data.buildingAge) rows.push({ key: "age", label: t("building"), value: f(`buildingAge.${data.buildingAge}`) });
  if (data.yearBuilt) rows.push({ key: "year", label: t("yearBuilt"), value: <Ltr>{String(data.yearBuilt)}</Ltr> });
  if (data.sharedRoomFor) rows.push({ key: "shared", label: t("sharedRoomFor"), value: f(`sharedRoomFor.${data.sharedRoomFor}`) });

  const list = (items: typeof rows) => (
    <dl className="grid gap-x-8 sm:grid-cols-2">
      {items.map(({ key, label, value }) => (
        <div key={key} className="flex items-baseline justify-between gap-3 border-b border-border py-2.5">
          <dt className="text-muted-foreground">{label}</dt>
          <dd className="text-end font-medium">{value}</dd>
        </div>
      ))}
    </dl>
  );

  return (
    <Section id="details" title={t("title")}>
      <div className="grid gap-4">
        {data.condition ? (
          <div className="grid gap-0.5 rounded-card bg-surface-muted p-4">
            <p className="font-semibold">
              {t("condition")}: {f(`condition.${data.condition}`)}
            </p>
            <p className="text-small text-muted-foreground">{f(`conditionHint.${data.condition}`)}</p>
          </div>
        ) : null}
        {list(rows.slice(0, 6))}
        {rows.length > 6 ? (
          <MoreSheet label={t("showAll", { count: rows.length })} title={t("title")}>
            {list(rows)}
          </MoreSheet>
        ) : null}
      </div>
    </Section>
  );
}

/**
 * Sales: the price history folded under "Price history". The full price and the price per m² are
 * under the title (<HeadlinePrice>, round 3 brief 2.3).
 */
export function SalePriceSection({ data }: { data: ListingPageData }) {
  const t = useTranslations("listing.costs");
  const locale = useLocale();
  const history = data.priceChanges;
  if (history.length === 0) return null;
  return (
    <Section id="price" title={t("titleSale")}>
      <div className="grid gap-2">
        {history.length ? (
          <PriceHistoryFoldedSection value="history" title={t("priceHistory")}>
            <ol className="grid gap-2">
              {history.map((change) => {
                const pct = priceChangePercent(change.oldPrice, change.newPrice);
                return (
                  <li key={change.changedAt} className="flex flex-wrap items-center gap-x-3 gap-y-1 text-small">
                    <time dateTime={change.changedAt} className="text-muted-foreground">
                      {formatDate(change.changedAt, locale, { day: "numeric", month: "short", year: "numeric" })}
                    </time>
                    <span className="inline-flex items-center gap-1.5 font-medium">
                      <bdi className="text-muted-foreground">{formatMoney(change.oldPrice, change.currency, locale)}</bdi>
                      <SpriteIcon name="arrow-right" className="size-3.5 text-muted-foreground rtl:-scale-x-100" />
                      <bdi>{formatMoney(change.newPrice, change.currency, locale)}</bdi>
                    </span>
                    {pct !== null ? (
                      <span className="font-semibold">
                        <Ltr>{`${pct > 0 ? "+" : ""}${formatNumber(pct, locale)}%`}</Ltr>
                      </span>
                    ) : null}
                  </li>
                );
              })}
            </ol>
          </PriceHistoryFoldedSection>
        ) : null}
      </div>
    </Section>
  );
}
