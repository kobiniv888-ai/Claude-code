import type { Metadata } from "next";
import ar from "../../messages/ar/states.json";
import en from "../../messages/en/states.json";
import he from "../../messages/he/states.json";
import ka from "../../messages/ka/states.json";
import ru from "../../messages/ru/states.json";
import { fontStyle } from "@/components/layout/fonts";
import { locales, siteConfig, type AppLocale } from "@/config/site";
import { dirFor } from "@/i18n/locale";
import "./globals.css";

/**
 * 404 for addresses outside the five language sections (e.g. /something.php). The language is
 * unknown here, so the page offers all five.
 */

const messages: Record<AppLocale, typeof en> = { he, en, ru, ar, ka };

export const metadata: Metadata = {
  robots: { index: false, follow: false },
};

export default function GlobalNotFound() {
  return (
    <html lang="en" style={fontStyle}>
      <body className="bg-background text-foreground">
        <title>{`${en.global.notFoundTitle} · ${siteConfig.name}`}</title>
        <main className="flex min-h-dvh items-center justify-center px-4 py-10">
          <div className="w-full max-w-lg rounded-3xl border bg-card p-6 shadow-card sm:p-8">
            {/* eslint-disable-next-line @next/next/no-img-element -- static brand mark, no layout here */}
            <img src={siteConfig.logo.mark} alt={siteConfig.name} width={48} height={48} className="mx-auto" />
            <p className="mt-4 text-center text-sm font-semibold text-muted-foreground" dir="ltr">
              404
            </p>
            <ul className="mt-4 grid gap-2">
              {locales.map((locale) => (
                <li key={locale} lang={locale} dir={dirFor(locale)}>
                  <a
                    href={`/${locale}`}
                    className="group flex items-center justify-between gap-4 rounded-2xl border bg-background px-4 py-3 outline-none transition-colors hover:bg-muted focus-visible:ring-3 focus-visible:ring-ring/50"
                  >
                    <span className="grid gap-0.5">
                      <span className="font-semibold">{messages[locale].global.notFoundTitle}</span>
                      <span className="text-sm text-muted-foreground">{messages[locale].global.home}</span>
                    </span>
                    <span className="shrink-0 rounded-full bg-secondary px-3 py-1 text-sm font-medium text-secondary-foreground">
                      {siteConfig.i18n.nativeNames[locale]}
                    </span>
                  </a>
                </li>
              ))}
            </ul>
          </div>
        </main>
      </body>
    </html>
  );
}
