/**
 * The image optimizer's security settings (SECURITY_REPORT 2.2.a–d), used by next.config.ts and
 * checked by src/config/images.test.ts against the resolved config. Pure: no server imports, so
 * next.config.ts can load it.
 *
 * - WebP only. AVIF stays off (founder's OK, 8 November 2026): the October 2026 advisories were
 *   remote code execution in AVIF processing, and Next's fixed versions turn it off too.
 * - Remote images: ONLY our own public photo bucket (NEXT_PUBLIC_MEDIA_BASE_URL), with protocol,
 *   host, port, path and query all explicit. A left-out field is a wildcard, so nothing is left
 *   out. Without the bucket address there are no remote images at all (development, the codespace,
 *   local storage). A production site (SITE_ENV=production) without a valid https bucket address
 *   fails the build and the start: photos would otherwise silently break.
 * - Local images: only our photo folders (public/photos and uploads served at /api/media), with no
 *   query string (Next 16: a query on a local image needs an explicit pattern).
 * - SVG and local network addresses never go through the optimizer.
 */

export type ImageEnv = Partial<Record<string, string | undefined>>;

export type RemoteImagePattern = {
  protocol: "https";
  hostname: string;
  port: "";
  pathname: string;
  search: "";
};

export type LocalImagePattern = { pathname: string; search: "" };

export const IMAGE_FORMATS = ["image/webp"] as const;

export const LOCAL_IMAGE_PATTERNS: LocalImagePattern[] = [
  { pathname: "/photos/**", search: "" },
  { pathname: "/api/media/**", search: "" },
];

/**
 * The one remote pattern built from the bucket's public address, or null when it is not set.
 * Throws when it is set but is not a plain https URL (no user, port, query or fragment).
 */
export function mediaRemotePattern(env: ImageEnv): RemoteImagePattern | null {
  const raw = env.NEXT_PUBLIC_MEDIA_BASE_URL?.trim();
  if (!raw) return null;
  let url: URL;
  try {
    url = new URL(raw);
  } catch {
    throw new Error(`NEXT_PUBLIC_MEDIA_BASE_URL is not a valid URL: "${raw}"`);
  }
  if (url.protocol !== "https:" || url.username || url.password || url.port || url.search || url.hash) {
    throw new Error("NEXT_PUBLIC_MEDIA_BASE_URL must be a plain https address (no port, login, query or #), e.g. https://media.bayit.example");
  }
  const prefix = url.pathname.replace(/\/+$/, "");
  return { protocol: "https", hostname: url.hostname.toLowerCase(), port: "", pathname: `${prefix}/**`, search: "" };
}

/** `images` for next.config.ts. */
export function imagesConfig(env: ImageEnv) {
  const media = mediaRemotePattern(env);
  if (!media && env.SITE_ENV?.trim() === "production") {
    throw new Error(
      "SITE_ENV=production needs NEXT_PUBLIC_MEDIA_BASE_URL (the https address of the public photo bucket, the same as S3_PUBLIC_URL).",
    );
  }
  return {
    formats: [...IMAGE_FORMATS],
    // Converted photos are kept 30 days (Next's default is 4 hours, after which each size is
    // encoded again). Photo files never change in place: uploads get new keys, demo photos new names.
    minimumCacheTTL: 2592000,
    remotePatterns: media ? [media] : [],
    localPatterns: LOCAL_IMAGE_PATTERNS,
    dangerouslyAllowSVG: false,
    dangerouslyAllowLocalIP: false,
  };
}
