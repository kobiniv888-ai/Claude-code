import type { Metadata } from "next";
import { locales, siteConfig, type AppLocale } from "@/config/site";
import { isAppLocale } from "@/i18n/locale";
import { absoluteUrl as siteAbsoluteUrl, siteUrl } from "@/lib/site-url";

/**
 * SEO helpers for generateMetadata — canonical URLs, hreflang alternates, Open Graph and
 * Twitter cards. Client-safe (pure).
 *
 *   export async function generateMetadata({ params }: PageProps<"/[locale]/about">) {
 *     const { locale } = await params;
 *     const t = await getTranslations({ locale, namespace: "about" });
 *     return pageMetadata({ locale, path: "/about", title: t("metaTitle"), description: t("metaDescription") });
 *   }
 */

/** The language search engines get when none of the five matches the visitor. */
export const X_DEFAULT_LOCALE: AppLocale = "en";

/**
 * The brand share image (1200×630) of a language, drawn by src/app/[locale]/opengraph-image.tsx:
 * purple, the white mark, the name and the tagline in that language.
 */
export function defaultOgImage(locale: AppLocale | string): { url: string; width: number; height: number } {
  const current = isAppLocale(locale) ? locale : X_DEFAULT_LOCALE;
  return { url: `/${current}/opengraph-image`, width: 1200, height: 630 };
}

/** The English brand share image (pages that know their language use `defaultOgImage(locale)`). */
export const DEFAULT_OG_IMAGE = defaultOgImage(X_DEFAULT_LOCALE);

const OG_LOCALES: Record<AppLocale, string> = {
  he: "he_IL",
  en: "en_US",
  ru: "ru_RU",
  ar: "ar_AR",
  ka: "ka_GE",
};

/** Open Graph locale for a site language: "he" → "he_IL". */
export function ogLocale(locale: AppLocale | string): string {
  return isAppLocale(locale) ? OG_LOCALES[locale] : OG_LOCALES[X_DEFAULT_LOCALE];
}

/** The brand name as written in `locale` ("בית" in Hebrew). */
export function siteName(locale: AppLocale | string): string {
  return isAppLocale(locale) ? siteConfig.localizedName[locale] : siteConfig.name;
}

/** The site's public address (SITE_URL, see @/lib/site-url), without a trailing slash. */
export function siteOrigin(): string {
  return siteUrl();
}

/** "/about" → "https://bayit.example/about". Absolute URLs are returned unchanged. */
export function absoluteUrl(path: string = "/"): string {
  return siteAbsoluteUrl(path);
}

/** "/about" in Hebrew → "/he/about"; "/" → "/he". Keeps a query string or hash. */
export function localizedPath(locale: AppLocale | string, pathWithoutLocale: string = "/"): string {
  const path = pathWithoutLocale.startsWith("/") ? pathWithoutLocale : `/${pathWithoutLocale}`;
  const rest = /^\/(?=[?#]|$)/.test(path) ? path.slice(1) : path;
  return `/${locale}${rest}`;
}

/**
 * Canonical URL and hreflang alternates for a page that exists in all five languages.
 * `pathWithoutLocale` is the page path as the site links it: "/about", "/listing/1234-vake".
 */
export function localizedAlternates(
  pathWithoutLocale: string,
  locale: AppLocale | string,
): { canonical: string; languages: Record<AppLocale | "x-default", string> } {
  const languages = Object.fromEntries(
    locales.map((l) => [l, absoluteUrl(localizedPath(l, pathWithoutLocale))]),
  ) as Record<AppLocale | "x-default", string>;
  languages["x-default"] = absoluteUrl(localizedPath(X_DEFAULT_LOCALE, pathWithoutLocale));
  const current = isAppLocale(locale) ? locale : X_DEFAULT_LOCALE;
  return { canonical: languages[current], languages };
}

export type SeoImage = string | { url: string; width?: number; height?: number; alt?: string };

export type PageMetadataInput = {
  locale: AppLocale | string;
  /** Page path without the locale: "/about", "/search", "/listing/1234-sunny-flat". */
  path: string;
  /** Page title without the site name (the layout adds " · Bayit"). */
  title: string;
  description: string;
  /**
   * Social image (a photo…). Defaults to the brand image of the page's language. "route": leave
   * og:image and twitter:image to the route's own opengraph-image file (Next 16 only uses that file
   * when the page's metadata sets no images), e.g. the listing page's photo-with-logo image.
   */
  image?: SeoImage | "route";
  /** Keep the page out of search results (account pages, filtered result pages…). */
  noIndex?: boolean;
  /** Open Graph type; "article" for guides. */
  type?: "website" | "article";
};

function normalizeImage(image: SeoImage | undefined, alt: string, locale: AppLocale) {
  if (!image) {
    const fallback = defaultOgImage(locale);
    return { ...fallback, url: absoluteUrl(fallback.url), alt };
  }
  if (typeof image === "string") return { url: absoluteUrl(image), alt };
  return { ...image, url: absoluteUrl(image.url), alt: image.alt ?? alt };
}

/** Complete metadata for a page: title, description, canonical, hreflang, Open Graph and Twitter. */
export function pageMetadata({
  locale,
  path,
  title,
  description,
  image,
  noIndex = false,
  type = "website",
}: PageMetadataInput): Metadata {
  const alternates = localizedAlternates(path, locale);
  const current = isAppLocale(locale) ? locale : X_DEFAULT_LOCALE;
  const ogImage = image === "route" ? null : normalizeImage(image, title, current);
  return {
    title,
    description,
    alternates,
    openGraph: {
      type,
      siteName: siteName(current),
      locale: ogLocale(current),
      alternateLocale: locales.filter((l) => l !== current).map((l) => OG_LOCALES[l]),
      url: alternates.canonical,
      title,
      description,
      ...(ogImage ? { images: [ogImage] } : {}),
    },
    twitter: {
      card: "summary_large_image",
      title,
      description,
      ...(ogImage ? { images: [ogImage.url] } : {}),
    },
    ...(noIndex ? { robots: { index: false, follow: true } } : {}),
  };
}
