import { getTranslations } from "next-intl/server";
import type { CurrencyCode } from "@/config/site";
import { describePriceLine, formatBookingMoney, priceLineAmount } from "@/lib/booking/price-lines";
import type { PriceLine } from "@/lib/booking/pricing";
import { formatNumber } from "@/lib/format";
import { cn } from "@/lib/utils";

/**
 * A booking's itemized price on the server (the trip page, the host's booking page, the admin
 * booking page): the lines the guest confirmed (Booking.priceLines, or rebuilt for older
 * bookings), e.g. "₾55 × 3 לילות", "₾80 × 2 לילות (פסח)", "הנחה לשבוע −10%", "דמי ניקיון", and the
 * total. The same words as the review page's PriceBreakdown (`booking.price`), without client code.
 */
export async function BookingPriceLines({
  lines,
  total,
  currency,
  locale,
  className,
  totalClassName,
}: {
  lines: readonly PriceLine[];
  total: number;
  currency: CurrencyCode;
  locale: string;
  className?: string;
  /** The total row (e.g. larger on the host's page). */
  totalClassName?: string;
}) {
  const t = await getTranslations({ locale, namespace: "booking.price" });
  const money = (amount: number) => formatBookingMoney(amount, currency, locale);
  const text = (line: PriceLine) =>
    describePriceLine(line, (key, values) => t(key as Parameters<typeof t>[0], values as never), {
      money,
      number: (value) => formatNumber(value, locale),
      locale,
    });
  return (
    <dl className={cn("grid gap-2 text-small", className)}>
      {lines.map((line, i) => (
        <div key={`${line.kind}-${i}`} className="flex items-baseline justify-between gap-3">
          <dt className={cn("min-w-0 text-pretty", line.kind === "discount" ? "text-success" : "text-muted-foreground")}>{text(line)}</dt>
          <dd className={cn("shrink-0 tabular-nums", line.kind === "discount" && "text-success")}>
            <bdi>{priceLineAmount(line, money)}</bdi>
          </dd>
        </div>
      ))}
      <div className={cn("flex items-baseline justify-between gap-3 border-t border-border pt-2 text-body font-semibold", totalClassName)}>
        <dt>{t("total")}</dt>
        <dd className="shrink-0 tabular-nums">
          <bdi>{money(total)}</bdi>
        </dd>
      </div>
    </dl>
  );
}
