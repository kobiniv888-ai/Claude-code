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
  // hreflang alternate links are sent as HTTP Link headers too.
  alternateLinks: true,
});
