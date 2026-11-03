"use client";

import { createContext, useCallback, useContext, useMemo, useState, useTransition, type ReactNode } from "react";
import { useLocale } from "next-intl";
import type { CurrencyCode } from "@/config/site";
import { useRouter } from "@/i18n/navigation";
import { convert as convertAmount, isEnabledCurrency, type Rates } from "@/lib/currency/convert";
import { clearDisplayCurrency, setDisplayCurrency } from "@/lib/currency/actions";
import { defaultCurrencyForLocale } from "@/lib/currency/defaults";
import { formatMoney, type FormatMoneyOptions } from "@/lib/format";

/**
 * Display currency for the whole page. The layout passes what the server decided:
 *
 *   const { currency, chosen } = await getDisplayCurrencyState(user?.currency);
 *   <CurrencyProvider currency={currency} chosen={chosen} rates={await getRates()}>
 *
 * Client components then show prices with:
 *   const { format } = useCurrency();
 *   <Ltr>{format(listing.price, listing.currency)}</Ltr>
 */

/** A currency, or "auto": follow the page language (he/ru/ar ₪, en $, ka ₾). */
export type CurrencyChoice = CurrencyCode | "auto";

type CurrencyContextValue = {
  currency: CurrencyCode;
  /** False while prices follow the language automatically (no cookie, no account setting). */
  chosen: boolean;
  /** The currency "auto" gives on this page (the language default). */
  automatic: CurrencyCode;
  rates: Rates;
  /** Saves the choice (cookie; "auto" forgets it) and refreshes server-rendered prices. */
  setCurrency: (code: CurrencyChoice) => Promise<boolean>;
  /** True while a new currency is being saved. */
  isPending: boolean;
  /** Converts an amount to the display currency. */
  convert: (amount: number, from: CurrencyCode) => number;
  /** Converts to the display currency and formats it ("₪1,250"). */
  format: (amount: number, from: CurrencyCode, options?: FormatMoneyOptions) => string;
};

const CurrencyContext = createContext<CurrencyContextValue | null>(null);

type Selected = { value: CurrencyCode; chosen: boolean; server: CurrencyCode; serverChosen: boolean };

export function CurrencyProvider({
  currency: serverCurrency,
  chosen: serverChosen = true,
  rates,
  children,
}: {
  currency: CurrencyCode;
  /** The visitor picked `currency` (cookie or account); false = automatic, by language. */
  chosen?: boolean;
  rates: Rates;
  children: ReactNode;
}) {
  const locale = useLocale();
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [selected, setSelected] = useState<Selected>({
    value: serverCurrency,
    chosen: serverChosen,
    server: serverCurrency,
    serverChosen,
  });
  const languageDefault = defaultCurrencyForLocale(locale);
  const automatic: CurrencyCode = isEnabledCurrency(languageDefault) ? languageDefault : serverCurrency;

  // A new value from the server (after refresh or navigation) wins over the local choice.
  let currency = selected.value;
  let chosen = selected.chosen;
  if (selected.server !== serverCurrency || selected.serverChosen !== serverChosen) {
    currency = serverCurrency;
    chosen = serverChosen;
    setSelected({ value: serverCurrency, chosen: serverChosen, server: serverCurrency, serverChosen });
  }

  const setCurrency = useCallback(
    async (code: CurrencyChoice) => {
      const auto = code === "auto";
      if (!auto && !isEnabledCurrency(code)) return false;
      const previous = { value: currency, chosen };
      setSelected((s) => ({ ...s, value: auto ? automatic : code, chosen: !auto }));
      const result = await (auto ? clearDisplayCurrency() : setDisplayCurrency(code)).catch(() => null);
      if (!result?.ok) {
        setSelected((s) => ({ ...s, ...previous }));
        return false;
      }
      startTransition(() => router.refresh());
      return true;
    },
    [currency, chosen, automatic, router],
  );

  const value = useMemo<CurrencyContextValue>(
    () => ({
      currency,
      chosen,
      automatic,
      rates,
      setCurrency,
      isPending,
      convert: (amount, from) => convertAmount(amount, from, currency, rates),
      format: (amount, from, options) => formatMoney(convertAmount(amount, from, currency, rates), currency, locale, options),
    }),
    [currency, chosen, automatic, rates, setCurrency, isPending, locale],
  );

  return <CurrencyContext.Provider value={value}>{children}</CurrencyContext.Provider>;
}

export function useCurrency(): CurrencyContextValue {
  const context = useContext(CurrencyContext);
  if (!context) throw new Error("useCurrency() must be used inside <CurrencyProvider>");
  return context;
}
