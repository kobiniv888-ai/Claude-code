import type { Metadata } from "next";
import { pageMetadata } from "@/lib/seo";

/**
 * Title, description, canonical URL and hreflang alternates for a content page.
 * `path` is the page path without the locale, e.g. "/about".
 *
 * Uses the shared pageMetadata(): a page's `openGraph` replaces the layout's, so it must carry
 * the social image, site name and locale itself (shared links showed no picture before).
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
  return pageMetadata({ locale, path, title, description });
}
