import { getTranslations } from "next-intl/server";
import { isAppLocale } from "@/i18n/locale";
import { OG_CONTENT_TYPE, OG_SIZE, brandShareImage } from "@/lib/og/share-image";
import { shareText } from "@/lib/og/share-text";

/**
 * The default share image of every page in a language (/he/opengraph-image…): purple, the white ב
 * mark, the name ("בית" in Hebrew, "Bayit" elsewhere) and the site tagline in that language.
 * Pages without their own image point og:image here (src/lib/seo.ts → defaultOgImage).
 */

export const alt = "Bayit · בית";
export const size = OG_SIZE;
export const contentType = OG_CONTENT_TYPE;

export default async function Image({ params }: { params: Promise<{ locale: string }> }) {
  const { locale: raw } = await params;
  const locale = isAppLocale(raw) ? raw : "en";
  const text = shareText(locale);
  const t = await getTranslations({ locale: text.locale, namespace: "common" });
  return brandShareImage({ name: text.name, tagline: t("siteTagline") });
}
