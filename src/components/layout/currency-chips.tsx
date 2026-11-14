"use client";

import { useTranslations } from "next-intl";
import { chipStyles } from "@/components/ds/chip";
import { useCurrency } from "@/components/providers/currency-provider";
import { siteConfig, type CurrencyCode } from "@/config/site";
import { cn } from "@/lib/utils";
import { toast } from "@/lib/toast";

// The chips (side menu) live apart from the dropdown menus in ./currency-switcher.tsx, so the side
// menu, which loads once the page is idle, does not bring the dropdown menu code with it.

/** The currencies a visitor can pick (siteConfig.currencies.list with enabled: true). */
export const DISPLAY_CURRENCIES = siteConfig.currencies.list.filter((c) => c.enabled);

/** "Automatic (by language)": the value the switchers use for forgetting the visitor's choice. */
export const AUTO = "auto";

export function useChangeCurrency() {
  const t = useTranslations("nav.currency");
  const { setCurrency } = useCurrency();
  return async (code: string) => {
    const ok = await setCurrency(code === AUTO ? AUTO : (code as CurrencyCode));
    if (!ok) toast.error(t("error"));
  };
}

/** Currency chips for menus and settings pages. */
export function CurrencyChips({ className }: { className?: string }) {
  const t = useTranslations("nav.currency");
  const { currency, chosen, automatic } = useCurrency();
  const change = useChangeCurrency();
  const automaticSymbol = DISPLAY_CURRENCIES.find((c) => c.code === automatic)?.symbol ?? automatic;
  return (
    <div role="radiogroup" aria-label={t("label")} className={cn("grid grid-cols-4 gap-2", className)}>
      {/* Round 3, bug 2.8: back to the language's currency (he/ru/ar ₪, en $, ka ₾). */}
      <button
        type="button"
        role="radio"
        aria-checked={!chosen}
        onClick={() => void change(AUTO)}
        className={cn(chipStyles({ size: "sm", active: !chosen }), "col-span-4 w-full justify-center gap-1.5 px-3")}
      >
        <span className="truncate text-xs">{t("auto")}</span>
        <span aria-hidden className="text-xs opacity-60">
          ·
        </span>
        <span aria-hidden className="text-sm leading-none">
          {automaticSymbol}
        </span>
      </button>
      {DISPLAY_CURRENCIES.map((c) => {
        const selected = chosen && c.code === currency;
        return (
          <button
            key={c.code}
            type="button"
            role="radio"
            aria-checked={selected}
            aria-label={`${c.code} — ${t(`names.${c.code}`)}`}
            onClick={() => void change(c.code)}
            className={cn(chipStyles({ size: "sm", active: selected }), "w-full gap-1 px-1.5")}
          >
            <span aria-hidden className="text-base leading-none">
              {c.symbol}
            </span>
            <span dir="ltr" className="text-xs">
              {c.code}
            </span>
          </button>
        );
      })}
    </div>
  );
}
