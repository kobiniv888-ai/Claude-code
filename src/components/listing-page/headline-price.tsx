"use client";

import { useTranslations } from "next-intl";
import { Price } from "@/components/listing/price";
import type { CurrencyCode } from "@/config/site";
import type { DealType, PricePeriod } from "@/generated/prisma/enums";
import { headlinePlan } from "@/lib/listing-page/headline";
import { useStay, useStayMoney } from "./stay-dates";

type Props = {
  dealType: DealType;
  price: number | null;
  currency: CurrencyCode;
  pricePeriod: PricePeriod;
  priceIsFrom: boolean;
  sizeSqm: number | null;
};

/**
 * The main price right under the title (round 3 brief 2.3), for every viewer, phones included:
 * sales show the full price (≈ in the visitor's currency, with the host's original) and the price
 * per m²; monthly rentals per month; short stays and hotels per night, plus the total once dates
 * are chosen. Rules: headlinePlan (src/lib/listing-page/headline.ts).
 */
export function HeadlinePrice(props: Props) {
  const plan = headlinePlan(props);
  const stay = props.dealType === "SHORT_STAY" || props.dealType === "HOTEL_ROOM";
  return (
    <div className="grid gap-0.5 pt-1" data-headline-price>
      <Price
        amount={props.price}
        currency={props.currency}
        period={plan.period}
        from={props.priceIsFrom}
        size="lg"
        stacked
        compact={false}
      />
      {plan.perSqm ? <PerSqm amount={plan.perSqm} currency={props.currency} /> : null}
      {stay && plan.stayTotal ? <StayTotal /> : null}
    </div>
  );
}

/** "≈ ₪10,600 / m²" in the visitor's currency. */
function PerSqm({ amount, currency }: { amount: number; currency: CurrencyCode }) {
  const t = useTranslations("listing.headline");
  const money = useStayMoney();
  return <p className="text-small text-muted-foreground">{t("perSqm", { price: `⁦${money(amount, currency)}⁩` })}</p>;
}

/** "3 nights · Total ≈ ₪1,310" once both dates are chosen (inside <StayProvider>). */
function StayTotal() {
  const t = useTranslations("listing.booking");
  const tc = useTranslations("listing.calendar");
  const money = useStayMoney();
  const { nights, total, price } = useStay();
  // Always in the page (empty and hidden until dates are chosen), so screen readers hear the total.
  return (
    <p className="text-small font-medium text-foreground empty:hidden" aria-live="polite">
      {nights > 0 && total !== null ? t("summary", { nights: tc("nights", { count: nights }), total: money(total, price.currency) }) : null}
    </p>
  );
}
