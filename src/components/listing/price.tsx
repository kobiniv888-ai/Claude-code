"use client";

import { useLocale, useTranslations } from "next-intl";
import type { CurrencyCode } from "@/config/site";
import type { PricePeriod } from "@/generated/prisma/enums";
import { Ltr } from "@/components/common/ltr";
import { useCurrency } from "@/components/providers/currency-provider";
import { formatMoney } from "@/lib/format";
import { cn } from "@/lib/utils";

/** Left-to-right isolate for a price inside a translated sentence (same as <bdi dir="ltr">). */
const isolate = (text: string) => `⁦${text}⁩`;

const PERIODS_WITH_SUFFIX = ["NIGHT", "WEEK", "MONTH"] as const;

const sizes = {
  sm: { main: "text-sm font-semibold", extra: "text-xs" },
  md: { main: "text-base font-semibold", extra: "text-xs" },
  lg: { main: "text-2xl font-bold tracking-tight", extra: "text-sm" },
} as const;

export type PriceProps = {
  /** In the owner's currency; null shows "Price on request". */
  amount: number | null;
  currency: CurrencyCode;
  period?: PricePeriod;
  /** "from ₾120" (cheapest room type). */
  from?: boolean;
  /** Also show the owner's original price when the display currency differs (default true). */
  showOriginal?: boolean;
  size?: keyof typeof sizes;
  /** Put the original price on its own line instead of after a dot. */
  stacked?: boolean;
  className?: string;
};

/**
 * A price in the visitor's display currency, plus the owner's original when it differs:
 * "≈ ₪440 / night · ₾320 original". Converted amounts are rounded and marked "≈".
 */
export function Price({
  amount,
  currency,
  period = "TOTAL",
  from = false,
  showOriginal = true,
  size = "md",
  stacked = false,
  className,
}: PriceProps) {
  const t = useTranslations("listingCard.price");
  const locale = useLocale();
  const { currency: display, format } = useCurrency();
  const style = sizes[size];

  if (amount === null || !Number.isFinite(amount) || amount <= 0) {
    return <span className={cn(style.main, "text-muted-foreground", className)}>{t("onRequest")}</span>;
  }

  const converted = display !== currency;
  const original = formatMoney(amount, currency, locale);
  const shown = converted ? format(amount, currency, { maximumFractionDigits: 0 }) : original;
  const value = converted ? t("approx", { price: isolate(shown) }) : shown;
  const main = from ? t("from", { price: isolate(value) }) : value;
  const suffix = (PERIODS_WITH_SUFFIX as readonly string[]).includes(period)
    ? t(`per.${period as (typeof PERIODS_WITH_SUFFIX)[number]}`)
    : null;

  return (
    <span
      className={cn(stacked ? "flex flex-col" : "inline-flex flex-wrap items-baseline gap-x-1.5", className)}
      title={converted ? t("approxHint", { price: isolate(original) }) : undefined}
    >
      <span className="inline-flex flex-wrap items-baseline gap-x-1">
        <span className={cn(style.main, "text-foreground")}>
          {from ? main : <Ltr>{main}</Ltr>}
        </span>
        {suffix && <span className={cn(style.extra, "text-muted-foreground")}>{suffix}</span>}
      </span>
      {converted && showOriginal && (
        <span className={cn(style.extra, "text-muted-foreground")}>
          {!stacked && <span aria-hidden="true">· </span>}
          {t("original", { price: isolate(original) })}
        </span>
      )}
    </span>
  );
}
