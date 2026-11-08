import type { NextConfig } from "next";
import createNextIntlPlugin from "next-intl/plugin";
import { extraAllowedHosts } from "./src/lib/auth/dev-origins";

const withNextIntl = createNextIntlPlugin("./src/i18n/request.ts");

const securityHeaders = [
  { key: "Strict-Transport-Security", value: "max-age=63072000; includeSubDomains; preload" },
  { key: "X-Content-Type-Options", value: "nosniff" },
  { key: "X-Frame-Options", value: "DENY" },
  { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
  {
    key: "Permissions-Policy",
    value: "camera=(), microphone=(), geolocation=(self), payment=(), usb=(), interest-cohort=()",
  },
  { key: "Cross-Origin-Opener-Policy", value: "same-origin-allow-popups" },
];

/** Host of the public photo bucket (NEXT_PUBLIC_MEDIA_BASE_URL), when it is an https URL. */
const mediaHost = (() => {
  try {
    const url = new URL(process.env.NEXT_PUBLIC_MEDIA_BASE_URL ?? "");
    return url.protocol === "https:" ? url.hostname : null;
  } catch {
    return null;
  }
})();

/**
 * Extra hosts that may open the development server and call Server Actions: the forwarded
 * address of a GitHub Codespace, plus any in EXTRA_ALLOWED_ORIGINS (comma-separated, e.g. a tunnel).
 * The same list feeds Better Auth's trustedOrigins (src/lib/auth/dev-origins.ts).
 */
const extraOrigins = extraAllowedHosts();

const nextConfig: NextConfig = {
  // Separate build folders let several dev servers run side by side (NEXT_DIST_DIR=.next-a).
  distDir: process.env.NEXT_DIST_DIR || ".next",
  allowedDevOrigins: extraOrigins,
  experimental: {
    ...(extraOrigins.length > 0 && { serverActions: { allowedOrigins: extraOrigins } }),
    turbopackChunking: { maxMergeChunkSize: 3000000, minChunkSize: 3000000, requestCost: 3000000, maxChunkCountPerGroup: 1 },
  },
  poweredByHeader: false,
  turbopack: {
    rules: {
      "*.css": {
        loaders: ["@tailwindcss/turbopack"],
        as: "*.css",
      },
    },
  },
  images: {
    // AVIF first (smallest), WebP for older browsers. In development only WebP: the dev server
    // converts one photo at a time and AVIF takes ~5× longer to encode, which made photos take
    // seconds to sharpen there (bug 8.10). Production caches every size (.next/cache/images;
    // start.sh --prod warms it with scripts/warm-images.mjs).
    formats: process.env.NODE_ENV === "development" ? ["image/webp"] : ["image/avif", "image/webp"],
    // Converted photos are kept 30 days (Next's default is 4 hours, after which each size is
    // encoded again). Photo files never change in place: uploads get new keys, demo photos new names.
    minimumCacheTTL: 2592000,
    // Stock and demo photos live in public/photos (no hotlinking), so only our own bucket is remote.
    remotePatterns: [
      // Only our own bucket when its address is known, so the image optimizer cannot be used to
      // fetch and resize images from anyone else's r2.dev / supabase.co bucket at our cost.
      ...(mediaHost
        ? [{ protocol: "https" as const, hostname: mediaHost }]
        : [
            { protocol: "https" as const, hostname: "*.r2.dev" },
            { protocol: "https" as const, hostname: "*.supabase.co" },
          ]),
    ],
  },
  // Interface text is read from messages/ at runtime; make sure it ships with the server build.
  outputFileTracingIncludes: { "/**": ["./messages/**/*"] },
  serverExternalPackages: ["sharp"],
  async headers() {
    // Files in public/ have stable names but no content hash: cache them for a week and
    // revalidate in the background (sw.js and offline.html keep the default no-cache).
    const publicAssetCache = [{ key: "Cache-Control", value: "public, max-age=604800, stale-while-revalidate=86400" }];
    return [
      { source: "/:path*", headers: securityHeaders },
      { source: "/brand/:path*", headers: publicAssetCache },
      { source: "/icons/:path*", headers: publicAssetCache },
      { source: "/images/:path*", headers: publicAssetCache },
      // Fonts in public/fonts carry a version in their name (rubik-hebrew-v1.woff2): cache for a year.
      { source: "/fonts/:path*", headers: [{ key: "Cache-Control", value: "public, max-age=31536000, immutable" }] },
    ];
  },
};

export default withNextIntl(nextConfig);
