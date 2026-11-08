import type { NextConfig } from "next";
import createNextIntlPlugin from "next-intl/plugin";
import { imagesConfig } from "./src/config/images";
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
  // Never ship browser source maps (SECURITY_REPORT 2.2.e; Next's default, set explicitly).
  productionBrowserSourceMaps: false,
  // The optimizer's security settings live in src/config/images.ts (WebP only, our own bucket
  // only, no SVG, no local network): see that file. start.sh --prod warms the converted photos
  // with scripts/warm-images.mjs (.next/cache/images).
  images: imagesConfig(process.env),
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
