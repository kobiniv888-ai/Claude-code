"use client";

import { useEffect, useSyncExternalStore } from "react";
import ar from "../../messages/ar/states.json";
import en from "../../messages/en/states.json";
import he from "../../messages/he/states.json";
import ka from "../../messages/ka/states.json";
import ru from "../../messages/ru/states.json";
import { BrandLockup } from "@/components/brand/mark";
import { fontStyle } from "@/components/layout/fonts";
import { locales, siteConfig, type AppLocale } from "@/config/site";
import { dirFor, isAppLocale } from "@/i18n/locale";
import "./globals.css";

/**
 * Last-resort error page (the root layout itself failed, so translations and the site frame are
 * not available). Shows the message in the visitor's language — taken from the address — and
 * the other four below it.
 */

const messages: Record<AppLocale, typeof en> = { he, en, ru, ar, ka };

const subscribe = () => () => {};
function useAddressLocale(): AppLocale {
  return useSyncExternalStore(
    subscribe,
    () => {
      const segment = window.location.pathname.split("/")[1];
      return isAppLocale(segment) ? segment : "en";
    },
    () => "en" as AppLocale,
  );
}

export default function GlobalError({ error, retry }: { error: unknown; retry: () => void }) {
  const locale = useAddressLocale();
  const m = messages[locale].global;

  useEffect(() => {
    console.error(error);
  }, [error]);

  return (
    <html lang={locale} dir={dirFor(locale)} style={fontStyle}>
      <body className="bg-background text-foreground">
        <title>{`${m.errorTitle} · ${siteConfig.name}`}</title>
        <main className="flex min-h-dvh items-center justify-center px-4 py-10">
          <div className="w-full max-w-lg rounded-3xl border bg-card p-6 text-center shadow-card sm:p-8">
            <div className="flex justify-center">
              <BrandLockup locale={locale} size={26} />
            </div>
            <h1 className="mt-5 text-2xl font-bold tracking-tight">{m.errorTitle}</h1>
            <p className="mt-2 text-pretty text-muted-foreground">{m.errorDescription}</p>
            <div className="mt-6 flex flex-col justify-center gap-2 sm:flex-row">
              <button
                type="button"
                onClick={() => retry()}
                className="inline-flex h-11 items-center justify-center rounded-xl bg-primary px-5 text-sm font-semibold text-primary-foreground outline-none hover:bg-primary/90 focus-visible:ring-3 focus-visible:ring-ring/50"
              >
                {m.reload}
              </button>
              <a
                href={`/${locale}`}
                className="inline-flex h-11 items-center justify-center rounded-xl border bg-card px-5 text-sm font-semibold outline-none hover:bg-muted focus-visible:ring-3 focus-visible:ring-ring/50"
              >
                {m.home}
              </a>
            </div>
            <ul className="mt-8 grid gap-3 border-t pt-6 text-start text-sm">
              {locales
                .filter((l) => l !== locale)
                .map((l) => (
                  <li key={l} lang={l} dir={dirFor(l)}>
                    <p className="font-semibold">{messages[l].global.errorTitle}</p>
                    <p className="text-muted-foreground">{messages[l].global.errorDescription}</p>
                  </li>
                ))}
            </ul>
          </div>
        </main>
      </body>
    </html>
  );
}
