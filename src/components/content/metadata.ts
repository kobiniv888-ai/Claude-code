import type { Metadata } from "next";
import { locales, siteConfig } from "@/config/site";

/**
 * Title, description, canonical URL and hreflang alternates for a content page.
 * `path` is the page path without the locale, e.g. "/about".
 */
export function contentMetadata({
  locale,
  path,
  title,
  description,
}: {
  locale: string;
  path: string;
  title: string;
  description: string;
}): Metadata {
  const languages: Record<string, string> = {};
  for (const l of locales) languages[l] = `/${l}${path}`;
  languages["x-default"] = `/en${path}`;
  return {
    // Absolute URLs for canonical/hreflang (search engines ignore relative alternates).
    metadataBase: new URL(siteConfig.url),
    title,
    description,
    alternates: { canonical: `/${locale}${path}`, languages },
    openGraph: { title, description, url: `/${locale}${path}`, type: "website" },
  };
}
