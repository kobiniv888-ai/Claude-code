import { describe, expect, it } from "vitest";
import { buildCsp, CSP_REPORT_PATH, cspHeaders, mediaOriginFrom, strictCspEnforced, tileOriginsFrom } from "./csp";

const CARTO = [
  { url: "https://{s}.basemaps.cartocdn.com/rastertiles/voyager/{z}/{x}/{y}{r}.png?key=k", subdomains: "abcd" },
  { url: "https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png?key=k", subdomains: "abcd" },
];
const TILES = tileOriginsFrom(CARTO);
const BUCKET = "https://media.bayit.example";

/** "img-src 'self' data:" → { "img-src": ["'self'", "data:"] } */
function directives(csp: string): Record<string, string[]> {
  return Object.fromEntries(
    csp
      .split(";")
      .map((part) => part.trim().split(/\s+/))
      .filter((words) => words[0])
      .map(([name, ...values]) => [name!, values]),
  );
}

describe("the Content-Security-Policy (SECURITY_REPORT 10.2)", () => {
  const strict = directives(buildCsp({ nonce: "abc", dev: false, strictMedia: true, mediaOrigin: BUCKET, tileOrigins: TILES }));
  const loose = directives(buildCsp({ nonce: "abc", dev: false, strictMedia: false, mediaOrigin: BUCKET, tileOrigins: TILES }));

  it("keeps the nonce-based script rules, no plugins, no framing, base-uri 'none' (10.2.a)", () => {
    for (const policy of [strict, loose]) {
      expect(policy["script-src"]).toEqual(["'self'", "'nonce-abc'", "'strict-dynamic'", "https://challenges.cloudflare.com"]);
      expect(policy["object-src"]).toEqual(["'none'"]);
      expect(policy["base-uri"]).toEqual(["'none'"]);
      expect(policy["frame-ancestors"]).toEqual(["'none'"]);
      // Forms post to us only (10.2.a): Google / Apple sign-in navigate with window.location, not a form.
      expect(policy["form-action"]).toEqual(["'self'"]);
      expect(policy).toHaveProperty("upgrade-insecure-requests");
      expect(policy["report-uri"]).toEqual([CSP_REPORT_PATH]);
    }
  });

  it("never allows 'unsafe-eval' outside next dev (10.2.d)", () => {
    expect(JSON.stringify(strict)).not.toContain("unsafe-eval");
    expect(JSON.stringify(loose)).not.toContain("unsafe-eval");
    const dev = directives(buildCsp({ nonce: "n", dev: true, strictMedia: true, mediaOrigin: null, tileOrigins: [] }));
    expect(dev["script-src"]).toContain("'unsafe-eval'");
    expect(dev).not.toHaveProperty("upgrade-insecure-requests");
  });

  it("limits images to us, data:/blob:, the photo bucket, the map tiles and Google account photos (10.2.b)", () => {
    expect(strict["img-src"]).toEqual([
      "'self'",
      "data:",
      "blob:",
      BUCKET,
      "https://a.basemaps.cartocdn.com",
      "https://b.basemaps.cartocdn.com",
      "https://c.basemaps.cartocdn.com",
      "https://d.basemaps.cartocdn.com",
      "https://lh3.googleusercontent.com",
    ]);
    expect(strict["media-src"]).toEqual(["'self'", "blob:", BUCKET]);
    expect(strict["img-src"]).not.toContain("https:");
    expect(strict["media-src"]).not.toContain("https:");
    // Frames and connections were already narrow.
    expect(strict["frame-src"]).toEqual(["https://challenges.cloudflare.com", "https://www.youtube-nocookie.com", "https://www.youtube.com", "https://player.vimeo.com"]);
    expect(strict["connect-src"]).toEqual(["'self'", "https://*.ingest.sentry.io", "https://*.ingest.de.sentry.io"]);
  });

  it("sends the strict policy as Report-Only first, and enforces it only with CSP_STRICT=enforce (10.2.c)", () => {
    const trial = cspHeaders({ nonce: "n1", dev: false, env: { NEXT_PUBLIC_MEDIA_BASE_URL: BUCKET }, tileOrigins: TILES });
    expect(directives(trial.enforced)["img-src"]).toContain("https:");
    expect(directives(trial.enforced)["base-uri"]).toEqual(["'none'"]);
    expect(trial.reportOnly).not.toBeNull();
    expect(directives(trial.reportOnly!)["img-src"]).not.toContain("https:");
    expect(trial.reportingEndpoints).toBe(`csp-endpoint="${CSP_REPORT_PATH}"`);
    // Browsers ignore (and warn about) upgrade-insecure-requests in a report-only policy.
    expect(directives(trial.reportOnly!)).not.toHaveProperty("upgrade-insecure-requests");
    expect(directives(trial.enforced)).toHaveProperty("upgrade-insecure-requests");

    const enforced = cspHeaders({ nonce: "n1", dev: false, env: { NEXT_PUBLIC_MEDIA_BASE_URL: BUCKET, CSP_STRICT: "enforce" }, tileOrigins: TILES });
    expect(enforced.reportOnly).toBeNull();
    expect(directives(enforced.enforced)["img-src"]).not.toContain("https:");
    expect(directives(enforced.enforced)).toHaveProperty("upgrade-insecure-requests");
    expect(strictCspEnforced({ CSP_STRICT: " Enforce " })).toBe(true);
    expect(strictCspEnforced({ CSP_STRICT: "yes" })).toBe(false);
    expect(strictCspEnforced({})).toBe(false);
  });

  it("takes only a plain https bucket origin and https tile hosts", () => {
    expect(mediaOriginFrom({ NEXT_PUBLIC_MEDIA_BASE_URL: "https://media.bayit.example/photos/" })).toBe(BUCKET);
    expect(mediaOriginFrom({ NEXT_PUBLIC_MEDIA_BASE_URL: "http://media.bayit.example" })).toBeNull();
    expect(mediaOriginFrom({ NEXT_PUBLIC_MEDIA_BASE_URL: "https://u:p@media.bayit.example" })).toBeNull();
    expect(mediaOriginFrom({ NEXT_PUBLIC_MEDIA_BASE_URL: "" })).toBeNull();
    expect(tileOriginsFrom([{ url: "http://{s}.tiles.example/{z}/{x}/{y}.png", subdomains: "ab" }])).toEqual([]);
    expect(tileOriginsFrom([{ url: "https://tiles.example/{z}/{x}/{y}.png" }])).toEqual(["https://tiles.example"]);
  });
});
