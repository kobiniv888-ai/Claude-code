"use client";

import { useLocale, useTranslations } from "next-intl";
import { describePriceLine, formatBookingMoney, priceLineAmount } from "@/lib/booking/price-lines";
import type { PriceLine, Quote } from "@/lib/booking/pricing";
import type { CurrencyCode } from "@/config/site";
import { formatMoney, formatNumber } from "@/lib/format";
import { cn } from "@/lib/utils";

/** Left-to-right isolate for an amount inside a translated sentence ("₪420 × 3 לילות"). */
const isolate = (text: string) => `⁦${text}⁩`;

/**
 * The price of a stay, in the HOST's currency (what the guest pays at check-in), line by line
 * (round 3, brief 6.3): "₾55 × 3 לילות", weekend nights, date-price nights ("₾80 × 2 לילות (פסח)"),
 * the long-stay discount ("הנחה לשבוע −10%"), "דמי ניקיון", and the total; under it, the estimate in
 * the visitor's display currency when it differs. The lines come from the quote (before booking)
 * or from Booking.priceLines (after). Text: `booking.price`.
 */
export function PriceBreakdown({
  quote,
  className,
  compact = false,
  pending = false,
}: {
  quote: Pick<Quote, "lines" | "total" | "currency"> & Partial<Pick<Quote, "display">>;
  className?: string;
  /** Without the estimate line (the dates sheet). */
  compact?: boolean;
  /** The server is confirming: the amounts are dimmed a little (never hidden). */
  pending?: boolean;
}) {
  const t = useTranslations("booking.price");
  const locale = useLocale();
  const money = (amount: number) => formatBookingMoney(amount, quote.currency, locale);
  return (
    <div className={cn("grid gap-2 text-small transition-opacity duration-(--motion-fast)", pending && "opacity-70", className)} aria-busy={pending || undefined}>
      <PriceLinesList lines={quote.lines} total={quote.total} currency={quote.currency} label={t} money={money} locale={locale} />
      {!compact && quote.display ? (
        <p className="text-end text-caption text-muted-foreground">
          {t("estimate", { amount: isolate(`≈ ${formatMoney(quote.display.total, quote.display.currency, locale, { maximumFractionDigits: 0 })}`) })}
        </p>
      ) : null}
    </div>
  );
}

function PriceLinesList({
  lines,
  total,
  label,
  money,
  locale,
}: {
  lines: readonly PriceLine[];
  total: number;
  currency: CurrencyCode;
  label: ReturnType<typeof useTranslations<"booking.price">>;
  money: (amount: number) => string;
  locale: string;
}) {
  const text = (line: PriceLine) =>
    describePriceLine(line, (key, values) => label(key as Parameters<typeof label>[0], values as never), {
      money,
      number: (value) => formatNumber(value, locale),
      locale,
    });
  return (
    <dl className="grid gap-2">
      {lines.map((line, i) => (
        <div key={`${line.kind}-${i}`} className="flex items-baseline justify-between gap-3">
          <dt className={cn("min-w-0 text-pretty", line.kind === "discount" ? "text-success" : "text-muted-foreground")}>{text(line)}</dt>
          <dd className={cn("shrink-0 tabular-nums", line.kind === "discount" && "text-success")}>
            <bdi>{priceLineAmount(line, money)}</bdi>
          </dd>
        </div>
      ))}
      <div className="flex items-baseline justify-between gap-3 border-t border-border pt-2 text-body font-semibold">
        <dt>{label("total")}</dt>
        <dd className="shrink-0 tabular-nums">
          <bdi>{money(total)}</bdi>
        </dd>
      </div>
    </dl>
  );
}
