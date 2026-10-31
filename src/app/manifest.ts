import type { MetadataRoute } from "next";
import common from "../../messages/en/common.json";
import nav from "../../messages/en/nav.json";
import { siteConfig } from "@/config/site";

/**
 * Web app manifest (/manifest.webmanifest) — makes the site installable ("Add to Home Screen").
 * "/" and the shortcuts redirect to the visitor's language (/he, /en…) through the proxy.
 * Icons are generated from public/brand/logo-mark.svg by scripts/generate-icons.mjs.
 * A manifest has one language; it uses the English text (the fallback language).
 */
export default function manifest(): MetadataRoute.Manifest {
  return {
    id: "/",
    name: siteConfig.name,
    short_name: siteConfig.name,
    description: common.siteTagline,
    start_url: "/",
    scope: "/",
    display: "standalone",
    orientation: "portrait",
    background_color: siteConfig.colors.background,
    theme_color: siteConfig.colors.primary,
    lang: "en",
    dir: "ltr",
    categories: ["travel", "lifestyle", "business"],
    icons: [
      { src: "/icons/icon-192.png", sizes: "192x192", type: "image/png", purpose: "any" },
      { src: "/icons/icon-512.png", sizes: "512x512", type: "image/png", purpose: "any" },
      { src: "/icons/maskable-192.png", sizes: "192x192", type: "image/png", purpose: "maskable" },
      { src: "/icons/maskable-512.png", sizes: "512x512", type: "image/png", purpose: "maskable" },
    ],
    shortcuts: [
      {
        name: nav.searchHomes,
        short_name: nav.bottomNav.search,
        url: "/search",
        icons: [{ src: "/icons/icon-192.png", sizes: "192x192", type: "image/png" }],
      },
      {
        name: nav.post,
        short_name: nav.bottomNav.post,
        url: "/post",
        icons: [{ src: "/icons/icon-192.png", sizes: "192x192", type: "image/png" }],
      },
    ],
  };
}
