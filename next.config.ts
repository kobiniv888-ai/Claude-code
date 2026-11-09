import type { NextConfig } from "next";
import createNextIntlPlugin from "next-intl/plugin";
import { imagesConfig } from "./src/config/images";
import { SECURITY_HEADERS } from "./src/config/security-headers";
import { reactTaintEnabled } from "./src/config/taint";
import { extraAllowedHosts } from "./src/lib/auth/dev-origins";

const withNextIntl = createNextIntlPlugin("./src/i18n/request.ts");

// HSTS, nosniff, framing, referrer, permissions and COOP (same-origin): src/config/security-headers.ts.
// The per-request Content-Security-Policy is set by src/proxy.ts (src/lib/security/csp.ts).
const securityHeaders = [...SECURITY_HEADERS];

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
    // React's taint API (SECURITY_REPORT 5.k): secrets, sessions and raw rows with the exact
    // address or contact values can never be passed to the browser (src/lib/security/taint.ts).
    // It also switches the app directory to React's experimental build that carries the API.
    // The one switch: src/config/taint.ts.
    taint: reactTaintEnabled(),
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
  // heic-decode / libheif-js: the HEIC decoder (WebAssembly, several MB), loaded with require() at
  // run time only on the HEIC upload path instead of being bundled (src/lib/images.ts).
  serverExternalPackages: ["sharp", "heic-decode", "libheif-js"],
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
