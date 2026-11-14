import { defineRouting } from "next-intl/routing";
import { locales, siteConfig } from "@/config/site";

export const routing = defineRouting({
  locales,
  // First visit: match the browser language if it is one of the five, otherwise English.
  defaultLocale: siteConfig.i18n.fallbackLocale,
  // Every language has its own address: /he, /en, /ru, /ar, /ka
  localePrefix: "always",
  localeDetection: true,
  // Remember the visitor's choice for a year.
  localeCookie: { name: "NEXT_LOCALE", maxAge: 60 * 60 * 24 * 365 },
  // No HTTP "Link" hreflang header: next-intl builds it by swapping the locale prefix, so it would
  // name the wrong per-language listing slugs, drop a landing's query and point x-default at a
  // redirect, contradicting the page. hreflang comes only from the HTML <link rel="alternate">
  // written by pageMetadata / localizedAlternates (@/lib/seo) and the listing page's getListingPaths.
  alternateLinks: false,
});
