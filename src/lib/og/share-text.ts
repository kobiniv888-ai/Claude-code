import { siteConfig, type AppLocale } from "@/config/site";

/**
 * The language a share image is written in, and the name on it. Arabic pages get the Latin name
 * and English text: Satori (next/og) cannot shape Arabic letters (it throws), and unjoined,
 * reversed Arabic would look broken. Every other language is drawn in its own script.
 */
export function shareText(locale: AppLocale): { locale: AppLocale; name: string } {
  const textLocale: AppLocale = locale === "ar" ? "en" : locale;
  return { locale: textLocale, name: siteConfig.localizedName[textLocale] };
}
