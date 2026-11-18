/**
 * The resolved Next.js config keeps its security settings (SECURITY_REPORT 2.2 "config test":
 * 2.2.a no SVG, 2.2.b WebP only, 2.2.c only our bucket with every pattern field explicit, 2.2.d no
 * local network, 2.2.e no browser source maps, 2.2.f no X-Powered-By). The optimizer's own
 * matcher (next/dist/shared/lib/match-remote-pattern, match-local-pattern) decides what it fetches.
 */
import { afterEach, describe, expect, it, vi } from "vitest";
import { hasLocalMatch } from "next/dist/shared/lib/match-local-pattern";
import { hasRemoteMatch } from "next/dist/shared/lib/match-remote-pattern";
import { imagesConfig, mediaRemotePattern } from "./images";

const BUCKET = "https://media.bayit.example";

async function loadNextConfig(env: Record<string, string | undefined>) {
  vi.resetModules();
  for (const [key, value] of Object.entries(env)) vi.stubEnv(key, value);
  const mod = await import("../../next.config");
  return mod.default;
}

afterEach(() => {
  vi.unstubAllEnvs();
});

describe("mediaRemotePattern", () => {
  it("builds one fully explicit pattern from the bucket address", () => {
    expect(mediaRemotePattern({ NEXT_PUBLIC_MEDIA_BASE_URL: BUCKET })).toEqual({
      protocol: "https",
      hostname: "media.bayit.example",
      port: "",
      pathname: "/**",
      search: "",
    });
    expect(mediaRemotePattern({ NEXT_PUBLIC_MEDIA_BASE_URL: "https://abc.supabase.co/storage/v1/object/public/photos/" })).toMatchObject({
      hostname: "abc.supabase.co",
      pathname: "/storage/v1/object/public/photos/**",
    });
  });

  it("has no remote host at all without a bucket address", () => {
    expect(mediaRemotePattern({})).toBeNull();
    expect(mediaRemotePattern({ NEXT_PUBLIC_MEDIA_BASE_URL: "  " })).toBeNull();
  });

  it("refuses anything but a plain https address", () => {
    for (const bad of ["http://media.bayit.example", "https://u:p@media.bayit.example", "https://media.bayit.example:8443", "https://media.bayit.example/?x=1", "not a url"]) {
      expect(() => mediaRemotePattern({ NEXT_PUBLIC_MEDIA_BASE_URL: bad }), bad).toThrow();
    }
  });
});

describe("imagesConfig", () => {
  it("a production site without the bucket address does not build or start", () => {
    expect(() => imagesConfig({ SITE_ENV: "production" })).toThrow(/NEXT_PUBLIC_MEDIA_BASE_URL/);
    expect(() => imagesConfig({ SITE_ENV: "production", NEXT_PUBLIC_MEDIA_BASE_URL: BUCKET })).not.toThrow();
    expect(() => imagesConfig({ SITE_ENV: "staging" })).not.toThrow();
    expect(() => imagesConfig({ SITE_ENV: "development" })).not.toThrow();
  });

  it("only our bucket matches; other buckets on the same services do not", () => {
    const config = { ...imagesConfig({ NEXT_PUBLIC_MEDIA_BASE_URL: `${BUCKET}/photos` }), domains: [] as string[] };
    expect(hasRemoteMatch([], config.remotePatterns, new URL(`${BUCKET}/photos/listings/a.webp`))).toBe(true);
    expect(hasRemoteMatch([], config.remotePatterns, new URL(`${BUCKET}/other/a.webp`))).toBe(false);
    expect(hasRemoteMatch([], config.remotePatterns, new URL(`${BUCKET}/photos/a.webp?x=1`))).toBe(false);
    expect(hasRemoteMatch([], config.remotePatterns, new URL("http://media.bayit.example/photos/a.webp"))).toBe(false);
    expect(hasRemoteMatch([], config.remotePatterns, new URL("https://media.bayit.example:444/photos/a.webp"))).toBe(false);
    expect(hasRemoteMatch([], config.remotePatterns, new URL("https://foo.r2.dev/x.png"))).toBe(false);
    expect(hasRemoteMatch([], config.remotePatterns, new URL("https://x.supabase.co/x.png"))).toBe(false);
  });

  it("local images: only our photo folders, never with a query string", () => {
    const { localPatterns } = imagesConfig({});
    expect(hasLocalMatch(localPatterns, "/photos/cities/batumi.webp")).toBe(true);
    expect(hasLocalMatch(localPatterns, "/api/media/listings/l1/a-lg.webp")).toBe(true);
    expect(hasLocalMatch(localPatterns, "/photos/cities/batumi.webp?v=1")).toBe(false);
    expect(hasLocalMatch(localPatterns, "/brand/bayit-mark.svg")).toBe(false);
    expect(hasLocalMatch(localPatterns, "/api/auth/session")).toBe(false);
  });
});

describe("resolved next.config.ts", () => {
  it("keeps every security setting (development site, no bucket)", async () => {
    const config = await loadNextConfig({ SITE_ENV: "development", NEXT_PUBLIC_MEDIA_BASE_URL: "" });
    expect(config.poweredByHeader).toBe(false);
    expect(config.productionBrowserSourceMaps).toBe(false);
    expect(config.images?.formats).toEqual(["image/webp"]);
    expect(config.images?.dangerouslyAllowSVG).toBe(false);
    expect(config.images?.dangerouslyAllowLocalIP).toBe(false);
    expect(config.images?.remotePatterns).toEqual([]);
    expect(config.images?.localPatterns?.length).toBeGreaterThan(0);
    for (const pattern of config.images?.localPatterns ?? []) expect(pattern.search).toBe("");
  });

  it("production with the bucket: exactly one remote pattern, every field set", async () => {
    const config = await loadNextConfig({ SITE_ENV: "production", NEXT_PUBLIC_MEDIA_BASE_URL: BUCKET });
    expect(config.images?.formats).not.toContain("image/avif");
    expect(config.images?.remotePatterns).toEqual([{ protocol: "https", hostname: "media.bayit.example", port: "", pathname: "/**", search: "" }]);
  });

  it("production without the bucket: loading the config fails (build and start refuse)", async () => {
    await expect(loadNextConfig({ SITE_ENV: "production", NEXT_PUBLIC_MEDIA_BASE_URL: "" })).rejects.toThrow(/NEXT_PUBLIC_MEDIA_BASE_URL/);
  });
});
