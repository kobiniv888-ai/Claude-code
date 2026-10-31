import type { MetadataRoute } from "next";
import { absoluteUrl, siteOrigin } from "@/lib/seo";

/**
 * /robots.txt — keep crawlers out of private areas (admin, account, the post wizard) and the
 * API; point them to the sitemap on NEXT_PUBLIC_SITE_URL.
 */
export default function robots(): MetadataRoute.Robots {
  return {
    rules: [
      {
        userAgent: "*",
        allow: "/",
        disallow: ["/*/admin", "/*/account", "/*/post", "/*/login", "/*/two-factor", "/*/verify-phone", "/api/"],
      },
    ],
    sitemap: absoluteUrl("/sitemap.xml"),
    host: siteOrigin(),
  };
}
