import type { NextConfig } from "next";
import createNextIntlPlugin from "next-intl/plugin";

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

const nextConfig: NextConfig = {
  // Separate build folders let several dev servers run side by side (NEXT_DIST_DIR=.next-a).
  distDir: process.env.NEXT_DIST_DIR || ".next",
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
    formats: ["image/avif", "image/webp"],
    remotePatterns: [
      { protocol: "https", hostname: "images.unsplash.com" },
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
    return [{ source: "/:path*", headers: securityHeaders }];
  },
};

export default withNextIntl(nextConfig);
