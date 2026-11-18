/**
 * The site's languages (re-exported by ./site, where the rest of the configuration lives).
 * A file of its own so that client code that only needs the language list (the locale helpers in
 * @/i18n/locale, the last-resort error page) does not download the whole site configuration.
 */

export const locales = ["he", "en", "ru", "ar", "ka"] as const;
export type AppLocale = (typeof locales)[number];

export const rtlLocales: readonly AppLocale[] = ["he", "ar"];

export type Localized<T = string> = Record<AppLocale, T>;
