"use client";

import { createContext, useCallback, useContext, useMemo, useState, useTransition, type ReactNode } from "react";
import { useLocale } from "next-intl";
import type { CurrencyCode } from "@/config/site";
import { useRouter } from "@/i18n/navigation";
import { convert as convertAmount, isEnabledCurrency, type Rates } from "@/lib/currency/convert";
import { setDisplayCurrency } from "@/lib/currency/actions";
import { formatMoney, type FormatMoneyOptions } from "@/lib/format";

/**
 * Display currency for the whole page. The layout passes what the server decided:
 *
 *   <CurrencyProvider currency={await getDisplayCurrency(user?.currency)} rates={await getRates()}>
 *
 * Client components then show prices with:
 *   const { format } = useCurrency();
 *   <Ltr>{format(listing.price, listing.currency)}</Ltr>
 */

type CurrencyContextValue = {
  currency: CurrencyCode;
  rates: Rates;
  /** Saves the choice (cookie) and refreshes server-rendered prices. */
  setCurrency: (code: CurrencyCode) => Promise<boolean>;
  /** True while a new currency is being saved. */
  isPending: boolean;
  /** Converts an amount to the display currency. */
  convert: (amount: number, from: CurrencyCode) => number;
  /** Converts to the display currency and formats it ("₪1,250"). */
  format: (amount: number, from: CurrencyCode, options?: FormatMoneyOptions) => string;
};

const CurrencyContext = createContext<CurrencyContextValue | null>(null);

export function CurrencyProvider({
  currency: serverCurrency,
  rates,
  children,
}: {
  currency: CurrencyCode;
  rates: Rates;
  children: ReactNode;
}) {
  const locale = useLocale();
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [selected, setSelected] = useState<{ value: CurrencyCode; server: CurrencyCode }>({
    value: serverCurrency,
    server: serverCurrency,
  });

  // A new value from the server (after refresh or navigation) wins over the local choice.
  let currency = selected.value;
  if (selected.server !== serverCurrency) {
    currency = serverCurrency;
    setSelected({ value: serverCurrency, server: serverCurrency });
  }

  const setCurrency = useCallback(
    async (code: CurrencyCode) => {
      if (!isEnabledCurrency(code)) return false;
      const previous = currency;
      setSelected((s) => ({ ...s, value: code }));
      const result = await setDisplayCurrency(code).catch(() => null);
      if (!result?.ok) {
        setSelected((s) => ({ ...s, value: previous }));
        return false;
      }
      startTransition(() => router.refresh());
      return true;
    },
    [currency, router],
  );

  const value = useMemo<CurrencyContextValue>(
    () => ({
      currency,
      rates,
      setCurrency,
      isPending,
      convert: (amount, from) => convertAmount(amount, from, currency, rates),
      format: (amount, from, options) => formatMoney(convertAmount(amount, from, currency, rates), currency, locale, options),
    }),
    [currency, rates, setCurrency, isPending, locale],
  );

  return <CurrencyContext.Provider value={value}>{children}</CurrencyContext.Provider>;
}

export function useCurrency(): CurrencyContextValue {
  const context = useContext(CurrencyContext);
  if (!context) throw new Error("useCurrency() must be used inside <CurrencyProvider>");
  return context;
}
