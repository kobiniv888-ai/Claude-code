import { useLocale, useTranslations } from "next-intl";
import { MapPinIcon } from "lucide-react";
import { Ltr } from "@/components/common/ltr";
import { BadgeRow, type BadgeItem } from "@/components/ds/badges";
import { CurrencySwitcher } from "@/components/layout/currency-switcher";
import { Price } from "@/components/listing/price";
import { formatDate, formatMoney, formatNumber } from "@/lib/format";
import { pricePerSqm } from "@/lib/listing-page/helpers";
import type { ListingPageData } from "@/lib/listing-page/types";
import { cn } from "@/lib/utils";
import { ListingTitle } from "./listing-text";

/**
 * The top of the listing: the badge row ("Welcomes Israelis" · verified · demo…), the big title,
 * city · neighborhood with a pin, and a livo-style meta line (posted · views · listing number).
 * Real data only.
 */
export function TitleBlock({ data, badges, actions }: { data: ListingPageData; badges: BadgeItem[]; actions?: React.ReactNode }) {
  const t = useTranslations("listing.header");
  const locale = useLocale();
  const place = [data.city?.name, data.neighborhoodName].filter(Boolean).join(" · ");
  const posted = data.publishedAt ?? data.contentUpdatedAt;
  return (
    <header className="grid content-start gap-3">
      {badges.length ? <BadgeRow items={badges} max={6} size="md" /> : null}
      <ListingTitle />
      {place ? (
        <p className="flex items-center gap-1.5 text-body font-medium text-foreground/85">
          <MapPinIcon className="size-5 shrink-0 text-primary-text" aria-hidden />
          <span>{place}</span>
        </p>
      ) : null}
      <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-2">
        <p className="flex flex-wrap items-center gap-x-2 gap-y-1 text-small text-muted-foreground">
          <time dateTime={posted}>
            {t(data.publishedAt ? "posted" : "updated", { date: formatDate(posted, locale, { day: "numeric", month: "short", year: "numeric" }) })}
          </time>
          <span aria-hidden>·</span>
          <span>{t("views", { count: data.viewCount, formatted: formatNumber(data.viewCount, locale) })}</span>
          <span aria-hidden>·</span>
          <span>{t.rich("listingId", { id: data.publicId, ltr: (chunks) => <Ltr>{chunks}</Ltr> })}</span>
        </p>
        {actions}
      </div>
    </header>
  );
}

/** The price with its unit, a compact currency switch, and one helpful line under it. */
export function PriceBlock({ data, priceDropped, className }: { data: ListingPageData; priceDropped: boolean; className?: string }) {
  const t = useTranslations("listing.price");
  const f = useTranslations("listingFields");
  const locale = useLocale();
  const perSqm = data.dealType === "SALE" ? pricePerSqm(data.price, data.sizeSqm) : null;
  const notes = [
    perSqm ? t("perSqm", { price: formatMoney(perSqm, data.currency, locale) }) : null,
    data.minStayNights && data.dealType !== "SALE" ? f("facts.minStay", { count: data.minStayNights }) : null,
    priceDropped ? t("dropped") : null,
  ].filter((note): note is string => !!note);
  return (
    <div className={cn("grid gap-1", className)}>
      <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
        <Price amount={data.price} currency={data.currency} period={data.pricePeriod} from={data.priceIsFrom} size="hero" />
        {data.price ? <CurrencySwitcher align="start" className="h-9 bg-muted px-2.5 hover:bg-muted/70" /> : null}
      </div>
      {notes.length ? <p className="text-small text-muted-foreground">{notes.join(" · ")}</p> : null}
    </div>
  );
}
