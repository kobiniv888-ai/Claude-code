"use client";

import { useEffect, useState, type ReactNode } from "react";
import Image from "next/image";
import { useLocale, useTranslations } from "next-intl";
import { BadgeCheckIcon, CheckIcon, GitCompareArrowsIcon, HeartIcon, ImageOffIcon, MinusIcon, PlusIcon, SearchIcon, XIcon } from "lucide-react";
import { ArrowEnd } from "@/components/common/directional-icon";
import { SkeletonBlock } from "@/components/common/skeletons";
import { EmptyState, ErrorState } from "@/components/common/states";
import { Price } from "@/components/listing/price";
import { Button } from "@/components/ui/button";
import { useCompare } from "@/hooks/use-compare";
import { Link } from "@/i18n/navigation";
import { getCompareItems, type CompareItem } from "@/lib/account/compare-actions";
import { formatArea, formatNumber } from "@/lib/format";
import { cn } from "@/lib/utils";

type Load = { status: "loading" } | { status: "error" } | { status: "ready"; key: string; items: CompareItem[] };

function Dash() {
  const t = useTranslations("account.compare");
  return (
    <span className="text-muted-foreground">
      <MinusIcon className="inline size-4" aria-hidden="true" />
      <span className="sr-only">{t("notSpecified")}</span>
    </span>
  );
}

function YesNo({ value }: { value: boolean | null }) {
  const t = useTranslations("account.compare");
  if (value === null) return <Dash />;
  return value ? (
    <span className="inline-flex items-center gap-1 font-medium text-success">
      <CheckIcon className="size-4" aria-hidden="true" />
      {t("yes")}
    </span>
  ) : (
    <span className="text-muted-foreground">{t("no")}</span>
  );
}

function List({ items }: { items: string[] }) {
  if (items.length === 0) return <Dash />;
  return (
    <ul className="grid gap-1">
      {items.map((item) => (
        <li key={item} className="flex gap-1.5">
          <CheckIcon className="mt-0.5 size-4 shrink-0 text-success" aria-hidden="true" />
          <span>{item}</span>
        </li>
      ))}
    </ul>
  );
}

function CompareSkeleton() {
  const t = useTranslations("account");
  return (
    <div role="status" className="grid gap-3 sm:grid-cols-3">
      <span className="sr-only">{t("loading")}</span>
      {Array.from({ length: 3 }, (_, i) => (
        <div key={i} className="grid gap-3 rounded-2xl border bg-card p-3">
          <SkeletonBlock className="aspect-[4/3] rounded-xl" />
          <SkeletonBlock className="h-5 w-3/4" />
          <SkeletonBlock className="h-4 w-1/2" />
          <SkeletonBlock className="h-24 rounded-xl" />
        </div>
      ))}
    </div>
  );
}

/** Up to 3 listings side by side, from the compare list kept in this browser. */
export function CompareView() {
  const t = useTranslations("account.compare");
  const tf = useTranslations("listingFields");
  const locale = useLocale();
  const compare = useCompare();
  const key = compare.ids.join(",");
  const [load, setLoad] = useState<Load>({ status: "loading" });
  const [attempt, setAttempt] = useState(0);

  useEffect(() => {
    let cancelled = false;
    const ids = key ? key.split(",").map(Number) : [];
    if (ids.length === 0) return;
    getCompareItems(ids).then((result) => {
      if (cancelled) return;
      if (!result.ok) {
        setLoad({ status: "error" });
        return;
      }
      setLoad({ status: "ready", key, items: result.data });
      // Listings that are no longer on the site leave the compare list.
      const found = new Set(result.data.map((item) => item.publicId));
      for (const id of ids) if (!found.has(id)) compare.remove(id);
    });
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- compare.remove is a stable module function
  }, [key, attempt]);

  if (compare.ids.length === 0) {
    return (
      <EmptyState
        bordered
        icon={GitCompareArrowsIcon}
        title={t("emptyTitle")}
        description={t("emptyBody", { count: compare.max, countText: formatNumber(compare.max, locale) })}
        action={{ label: t("search"), href: "/search", icon: SearchIcon }}
        secondaryAction={{ label: t("favorites"), href: "/account/favorites", icon: HeartIcon }}
      />
    );
  }
  if (load.status === "error") {
    return (
      <ErrorState
        bordered
        title={t("errorTitle")}
        description={t("errorBody")}
        action={{
          label: t("retry"),
          onClick: () => {
            setLoad({ status: "loading" });
            setAttempt((n) => n + 1);
          },
        }}
      />
    );
  }
  if (load.status === "loading") return <CompareSkeleton />;

  // While a change reloads, the previous table stays (minus removed listings).
  const items = load.items.filter((item) => compare.has(item.publicId));
  if (items.length === 0) return <CompareSkeleton />;

  const money = (amount: number | null, currency: CompareItem["costs"]["currency"]) =>
    amount === null ? <Dash /> : <Price amount={amount} currency={currency} size="sm" showOriginal={false} />;
  const count = (value: number | null) => (value === null ? <Dash /> : formatNumber(value, locale));
  const minutes = (value: number | null) => (value === null ? <Dash /> : t("walkMinutes", { count: value, countText: formatNumber(value, locale) }));
  const percent = (value: number | null) => (value === null || value <= 0 ? <Dash /> : formatNumber(value / 100, locale, { style: "percent" }));
  const featureLabel = (code: string) => {
    const [group, key] = code.split(":");
    const ns = group === "shabbat" ? "shabbatFeature" : group === "hotel" ? "hotelJewishFeature" : "jewishFeature";
    return tf.has(`${ns}.${key}`) ? tf(`${ns}.${key}`) : key;
  };

  type Row = { label: string; cell: (item: CompareItem) => ReactNode };
  const sections: { title: string; rows: Row[] }[] = [
    {
      title: t("sections.basics"),
      rows: [
        {
          label: t("rows.price"),
          cell: (i) => <Price amount={i.price.amount} currency={i.price.currency} period={i.price.period} from={i.price.from} stacked size="md" />,
        },
        { label: t("rows.location"), cell: (i) => i.place ?? <Dash /> },
        { label: t("rows.type"), cell: (i) => `${tf(`dealType.${i.dealType}`)} · ${tf(`propertyType.${i.propertyType}`)}` },
        {
          label: t("rows.verified"),
          cell: (i) =>
            i.verified ? (
              <span className="inline-flex items-center gap-1 font-medium text-success">
                <BadgeCheckIcon className="size-4" aria-hidden="true" />
                {t("verified")}
              </span>
            ) : (
              <span className="text-muted-foreground">{t("notVerified")}</span>
            ),
        },
      ],
    },
    {
      title: t("sections.facts"),
      rows: [
        { label: t("rows.rooms"), cell: (i) => count(i.facts.rooms) },
        { label: t("rows.bedrooms"), cell: (i) => (i.facts.bedrooms === 0 ? tf("facts.studio") : count(i.facts.bedrooms)) },
        { label: t("rows.bathrooms"), cell: (i) => count(i.facts.bathrooms) },
        { label: t("rows.size"), cell: (i) => (i.facts.sizeSqm ? formatArea(i.facts.sizeSqm, locale) : <Dash />) },
        { label: t("rows.guests"), cell: (i) => count(i.facts.maxGuests) },
        {
          label: t("rows.floor"),
          cell: (i) =>
            i.facts.floor === null ? (
              <Dash />
            ) : i.facts.totalFloors ? (
              t("floorOf", { floor: formatNumber(i.facts.floor, locale), total: formatNumber(i.facts.totalFloors, locale) })
            ) : (
              formatNumber(i.facts.floor, locale)
            ),
        },
        { label: t("rows.minStay"), cell: (i) => (i.facts.minStayNights ? t("nights", { count: i.facts.minStayNights, countText: formatNumber(i.facts.minStayNights, locale) }) : <Dash />) },
      ],
    },
    {
      title: t("sections.jewish"),
      rows: [
        { label: t("rows.shabbatFriendly"), cell: (i) => <YesNo value={i.jewish.shabbatFriendly} /> },
        { label: t("rows.kitchen"), cell: (i) => (i.jewish.kitchenKosher ? tf(`kitchenKosher.${i.jewish.kitchenKosher}`) : <Dash />) },
        { label: t("rows.kosherCert"), cell: (i) => (i.jewish.kosherCertName ? <span dir="auto">{i.jewish.kosherCertName}</span> : <Dash />) },
        { label: t("rows.synagogue"), cell: (i) => minutes(i.jewish.synagogueWalkMin) },
        { label: t("rows.chabad"), cell: (i) => minutes(i.jewish.chabadWalkMin) },
        { label: t("rows.jewishFeatures"), cell: (i) => <List items={i.jewish.features.map(featureLabel)} /> },
      ],
    },
    {
      title: t("sections.amenities"),
      rows: [
        {
          label: t("rows.amenities"),
          cell: (i) => <List items={i.amenities.map((a) => (tf.has(`amenity.${a}`) ? tf(`amenity.${a}`) : a))} />,
        },
      ],
    },
    {
      title: t("sections.costs"),
      rows: [
        { label: t("rows.deposit"), cell: (i) => money(i.costs.deposit, i.costs.currency) },
        { label: t("rows.cleaningFee"), cell: (i) => money(i.costs.cleaningFee, i.costs.currency) },
        {
          label: t("rows.utilities"),
          cell: (i) =>
            i.costs.utilitiesIncluded ? (
              t("utilitiesIncluded")
            ) : i.costs.utilitiesEstimate ? (
              <span className="inline-flex flex-wrap items-center gap-1">
                {t("utilitiesAbout")} {money(i.costs.utilitiesEstimate, i.costs.currency)}
              </span>
            ) : (
              <YesNo value={i.costs.utilitiesIncluded} />
            ),
        },
        { label: t("rows.weeklyDiscount"), cell: (i) => percent(i.costs.weeklyDiscountPct) },
        { label: t("rows.monthlyDiscount"), cell: (i) => percent(i.costs.monthlyDiscountPct) },
      ],
    },
  ];

  const stickyCell = "sticky start-0 z-10 bg-card";

  return (
    <div className="grid min-w-0 grid-cols-1 gap-4">
      {items.length === 1 ? (
        <p className="flex items-center gap-2 rounded-2xl border border-dashed bg-muted/40 px-4 py-3 text-sm">
          <PlusIcon className="size-4 shrink-0 text-primary" aria-hidden="true" />
          <span>{t("addMore")}</span>
          <Link href="/account/favorites" className="ms-auto shrink-0 font-medium text-primary hover:underline">
            {t("favorites")}
          </Link>
        </p>
      ) : null}

      <div className="relative min-w-0 overflow-x-auto rounded-2xl border bg-card shadow-xs">
        <table className="w-full min-w-max border-collapse text-sm">
          <caption className="sr-only">{t("caption")}</caption>
          <thead>
            <tr>
              <td className={cn(stickyCell, "w-28 border-e p-3 align-bottom sm:w-44")}>
                {compare.count > 1 ? (
                  <Button variant="ghost" className="h-9 rounded-lg px-2 text-muted-foreground" onClick={() => compare.clear()}>
                    <XIcon aria-hidden="true" />
                    {t("clear")}
                  </Button>
                ) : null}
              </td>
              {items.map((item) => (
                <th key={item.publicId} scope="col" className="w-56 min-w-56 p-3 text-start align-top font-normal sm:w-64">
                  <div className="grid gap-2">
                    <div className="relative aspect-[4/3] overflow-hidden rounded-xl bg-muted">
                      {item.photo ? (
                        <Image src={item.photo.url} alt={item.photo.alt} fill sizes="256px" className="object-cover" />
                      ) : (
                        <div className="flex size-full items-center justify-center text-muted-foreground">
                          <ImageOffIcon className="size-6" aria-hidden="true" />
                        </div>
                      )}
                      <button
                        type="button"
                        onClick={() => compare.remove(item.publicId)}
                        aria-label={t("removeFrom", { title: item.title })}
                        className="absolute end-2 top-2 inline-flex size-9 items-center justify-center rounded-full bg-card/90 shadow-sm outline-none hover:bg-card focus-visible:ring-3 focus-visible:ring-ring/60"
                      >
                        <XIcon className="size-4" aria-hidden="true" />
                      </button>
                    </div>
                    <Link href={item.href} className="line-clamp-2 font-semibold hover:underline" dir="auto">
                      {item.title}
                    </Link>
                  </div>
                </th>
              ))}
            </tr>
          </thead>
          {sections.map((section) => (
            <tbody key={section.title}>
              <tr>
                <th scope="colgroup" colSpan={items.length + 1} className="bg-muted/60 px-3 py-2 text-start text-xs font-semibold tracking-wide text-muted-foreground uppercase">
                  <span className="sticky start-3">{section.title}</span>
                </th>
              </tr>
              {section.rows.map((row) => (
                <tr key={row.label} className="border-t">
                  <th scope="row" className={cn(stickyCell, "border-e p-3 text-start align-top text-xs font-medium text-muted-foreground sm:text-sm")}>
                    {row.label}
                  </th>
                  {items.map((item) => (
                    <td key={item.publicId} className="p-3 align-top">
                      {row.cell(item)}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          ))}
          <tfoot>
            <tr className="border-t">
              <td className={cn(stickyCell, "border-e p-3")} />
              {items.map((item) => (
                <td key={item.publicId} className="p-3">
                  <Button asChild className="h-10 w-full rounded-xl">
                    <Link href={item.href}>
                      {t("view")}
                      <ArrowEnd aria-hidden />
                    </Link>
                  </Button>
                </td>
              ))}
            </tr>
          </tfoot>
        </table>
      </div>
    </div>
  );
}
