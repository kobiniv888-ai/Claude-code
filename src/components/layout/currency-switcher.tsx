"use client";

import { ChevronDown } from "lucide-react";
import { useTranslations } from "next-intl";
import { toast } from "@/lib/toast";
import { useCurrency } from "@/components/providers/currency-provider";
import { chipStyles } from "@/components/ds/chip";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuLabel,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { siteConfig, type CurrencyCode } from "@/config/site";
import { cn } from "@/lib/utils";

/** The currencies a visitor can pick (siteConfig.currencies.list with enabled: true). */
export const DISPLAY_CURRENCIES = siteConfig.currencies.list.filter((c) => c.enabled);

function useChangeCurrency() {
  const t = useTranslations("nav.currency");
  const { setCurrency } = useCurrency();
  return async (code: string) => {
    const ok = await setCurrency(code as CurrencyCode);
    if (!ok) toast.error(t("error"));
  };
}

/** Header / footer currency menu: "₪ ILS". The choice is saved in a cookie and prices refresh. */
export function CurrencySwitcher({
  variant = "header",
  align = "end",
  className,
}: {
  variant?: "header" | "footer";
  align?: "start" | "end";
  className?: string;
}) {
  const t = useTranslations("nav.currency");
  const { currency, isPending } = useCurrency();
  const change = useChangeCurrency();
  const symbol = siteConfig.currencies.list.find((c) => c.code === currency)?.symbol ?? currency;
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button
          variant={variant === "footer" ? "outline" : "ghost"}
          className={cn(
            "h-10 gap-1.5 rounded-full px-3 text-sm font-medium",
            variant === "footer" && "bg-card px-4",
            isPending && "opacity-70",
            className,
          )}
          aria-label={t("change", { current: `${currency} (${t(`names.${currency}`)})` })}
          aria-busy={isPending || undefined}
        >
          <span dir="ltr" className="flex items-center gap-1.5">
            <span aria-hidden className="text-base leading-none">
              {symbol}
            </span>
            <span>{currency}</span>
          </span>
          <ChevronDown aria-hidden className="size-3.5 opacity-60" />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align={align} sideOffset={8} className="w-64 rounded-xl p-1.5">
        <DropdownMenuLabel className="px-2 text-xs font-medium text-muted-foreground">{t("label")}</DropdownMenuLabel>
        <DropdownMenuRadioGroup value={currency} onValueChange={(value) => void change(value)}>
          {DISPLAY_CURRENCIES.map((c) => (
            <DropdownMenuRadioItem key={c.code} value={c.code} className="gap-3 py-2 ps-2">
              <span
                aria-hidden
                className="inline-flex size-7 shrink-0 items-center justify-center rounded-lg bg-muted text-sm font-semibold"
              >
                {c.symbol}
              </span>
              <span className="grid">
                <span className="font-medium" dir="ltr">
                  {c.code}
                </span>
                <span className="text-xs text-muted-foreground">{t(`names.${c.code}`)}</span>
              </span>
            </DropdownMenuRadioItem>
          ))}
        </DropdownMenuRadioGroup>
        <DropdownMenuSeparator />
        <p className="px-2 py-1.5 text-xs leading-relaxed text-muted-foreground">{t("hint")}</p>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

/** Currency chips for menus and settings pages. */
export function CurrencyChips({ className }: { className?: string }) {
  const t = useTranslations("nav.currency");
  const { currency } = useCurrency();
  const change = useChangeCurrency();
  return (
    <div role="radiogroup" aria-label={t("label")} className={cn("grid grid-cols-4 gap-2", className)}>
      {DISPLAY_CURRENCIES.map((c) => {
        const selected = c.code === currency;
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
