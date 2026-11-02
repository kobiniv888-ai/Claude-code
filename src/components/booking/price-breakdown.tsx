"use client";

import { useLocale, useTranslations } from "next-intl";
import type { Quote } from "@/lib/booking/pricing";
import { formatMoney } from "@/lib/format";
import { cn } from "@/lib/utils";

/** Left-to-right isolate for an amount inside a translated sentence ("₪420 × 3 לילות"). */
const isolate = (text: string) => `⁦${text}⁩`;

/**
 * The price of a stay, in the HOST's currency (what the guest pays at check-in): "₪420 × 3 nights"
 * (weekday and weekend lines), the cleaning fee, and the total; under it, the estimate in the
 * visitor's display currency when it differs. Text: `booking.price`.
 */
export function PriceBreakdown({
  quote,
  className,
  compact = false,
  pending = false,
}: {
  quote: Pick<Quote, "lines" | "cleaningFee" | "total" | "currency" | "display">;
  className?: string;
  /** Without the estimate line (the dates sheet). */
  compact?: boolean;
  /** The server is confirming: the amounts are dimmed a little (never hidden). */
  pending?: boolean;
}) {
  const t = useTranslations("booking.price");
  const locale = useLocale();
  const money = (amount: number) => formatMoney(amount, quote.currency, locale);
  return (
    <div className={cn("grid gap-2 text-small transition-opacity duration-(--motion-fast)", pending && "opacity-70", className)} aria-busy={pending || undefined}>
      <dl className="grid gap-2">
      {quote.lines.map((line) => (
        <div key={line.kind} className="flex items-baseline justify-between gap-3">
          <dt className="min-w-0 text-muted-foreground">
            {t(line.kind === "weekend" ? "weekendTimes" : "times", {
              price: isolate(money(line.price)),
              nights: t("nights", { count: line.nights }),
            })}
          </dt>
          <dd className="shrink-0 tabular-nums">
            <bdi>{money(line.amount)}</bdi>
          </dd>
        </div>
      ))}
      {quote.cleaningFee > 0 ? (
        <div className="flex items-baseline justify-between gap-3">
          <dt className="text-muted-foreground">{t("cleaningFee")}</dt>
          <dd className="shrink-0 tabular-nums">
            <bdi>{money(quote.cleaningFee)}</bdi>
          </dd>
        </div>
      ) : null}
      <div className="flex items-baseline justify-between gap-3 border-t border-border pt-2 text-body font-semibold">
        <dt>{t("total")}</dt>
        <dd className="shrink-0 tabular-nums">
          <bdi>{money(quote.total)}</bdi>
        </dd>
      </div>
      </dl>
      {!compact && quote.display ? (
        <p className="text-end text-caption text-muted-foreground">
          {t("estimate", { amount: isolate(`≈ ${formatMoney(quote.display.total, quote.display.currency, locale, { maximumFractionDigits: 0 })}`) })}
        </p>
      ) : null}
    </div>
  );
}
