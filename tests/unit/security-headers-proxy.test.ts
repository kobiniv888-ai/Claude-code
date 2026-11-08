/**
 * The real proxy (src/proxy.ts) on page requests: the Content-Security-Policy headers
 * (SECURITY_REPORT 10.2) and the booking page's X-Robots-Tag (10.4.d). The static headers (HSTS,
 * COOP…) are checked on next.config.ts in src/config/security-headers.test.ts.
 */
import { afterEach, describe, expect, it, vi } from "vitest";
import { NextRequest, NextResponse } from "next/server";

vi.mock("server-only", () => ({}));
vi.mock("next-intl/middleware", () => ({ default: () => () => NextResponse.next() }));

async function loadProxy(env: Record<string, string>) {
  vi.resetModules();
  for (const [key, value] of Object.entries(env)) vi.stubEnv(key, value);
  return (await import("@/proxy")).default as (request: NextRequest) => Promise<Response>;
}

afterEach(() => {
  vi.unstubAllEnvs();
});

const PRODUCTION = {
  NODE_ENV: "production",
  SITE_ENV: "production",
  SITE_URL: "https://bayit.ge",
  NEXT_PUBLIC_MEDIA_BASE_URL: "https://media.bayit.ge",
  CSP_STRICT: "",
};

function directive(csp: string | null, name: string): string[] | undefined {
  const part = csp
    ?.split(";")
    .map((p) => p.trim())
    .find((p) => p === name || p.startsWith(`${name} `));
  return part?.split(/\s+/).slice(1);
}

describe("the proxy's Content-Security-Policy", () => {
  it("enforces the nonce policy with base-uri 'none' and trials the strict one as Report-Only", async () => {
    const proxy = await loadProxy(PRODUCTION);
    const res = await proxy(new NextRequest("https://bayit.ge/he", { headers: { host: "bayit.ge" } }));
    const enforced = res.headers.get("content-security-policy");
    const reportOnly = res.headers.get("content-security-policy-report-only");
    expect(directive(enforced, "base-uri")).toEqual(["'none'"]);
    expect(directive(enforced, "object-src")).toEqual(["'none'"]);
    expect(directive(enforced, "frame-ancestors")).toEqual(["'none'"]);
    expect(directive(enforced, "script-src")).not.toContain("'unsafe-eval'");
    expect(directive(enforced, "report-uri")).toEqual(["/api/csp-report"]);
    expect(reportOnly).not.toBeNull();
    const images = directive(reportOnly, "img-src")!;
    expect(images).not.toContain("https:");
    expect(images).toEqual(expect.arrayContaining(["'self'", "data:", "blob:", "https://media.bayit.ge"]));
    expect(directive(reportOnly, "media-src")).toEqual(["'self'", "blob:", "https://media.bayit.ge"]);
    expect(res.headers.get("reporting-endpoints")).toBe('csp-endpoint="/api/csp-report"');
  });

  it("uses a fresh nonce on every request, the same one in both policies", async () => {
    const proxy = await loadProxy(PRODUCTION);
    const nonces = await Promise.all(
      [1, 2].map(async () => {
        const res = await proxy(new NextRequest("https://bayit.ge/en/search", { headers: { host: "bayit.ge" } }));
        const enforced = /'nonce-([^']+)'/.exec(res.headers.get("content-security-policy") ?? "")?.[1];
        const trial = /'nonce-([^']+)'/.exec(res.headers.get("content-security-policy-report-only") ?? "")?.[1];
        expect(trial).toBe(enforced);
        return enforced;
      }),
    );
    expect(nonces[0]).toBeTruthy();
    expect(nonces[0]).not.toBe(nonces[1]);
  });

  it("enforces the strict policy (no report-only) with CSP_STRICT=enforce", async () => {
    const proxy = await loadProxy({ ...PRODUCTION, CSP_STRICT: "enforce" });
    const res = await proxy(new NextRequest("https://bayit.ge/he", { headers: { host: "bayit.ge" } }));
    expect(directive(res.headers.get("content-security-policy"), "img-src")).not.toContain("https:");
    expect(res.headers.get("content-security-policy-report-only")).toBeNull();
  });
});

describe("the booking page's X-Robots-Tag (10.4.d)", () => {
  it("says noindex on /<locale>/listing/<id>/book on the real host too, and not on the listing itself", async () => {
    const proxy = await loadProxy(PRODUCTION);
    for (const path of ["/he/listing/12-flat/book", "/en/listing/12/book?from=2026-12-01"]) {
      const res = await proxy(new NextRequest(`https://bayit.ge${path}`, { headers: { host: "bayit.ge", "x-forwarded-host": "bayit.ge" } }));
      expect(res.headers.get("x-robots-tag"), path).toBe("noindex, nofollow");
    }
    const listing = await proxy(new NextRequest("https://bayit.ge/he/listing/12-flat", { headers: { host: "bayit.ge", "x-forwarded-host": "bayit.ge" } }));
    expect(listing.headers.get("x-robots-tag")).toBeNull();
  });
});

// SECURITY_REPORT 10.2.a / 10.2.c (csp-dotted-paths-1): a path with a dot can still render an app
// page (a listing id with a dot, the not-found page of "/x.txt"); it gets the same CSP, and a
// visitor's own x-nonce / x-pathname / content-security-policy request headers never reach the app.
describe("paths with a dot, the API, and request headers only the proxy may set", () => {
  /** What the app receives: NextResponse.next({ request: { headers } }) lists the overridden headers. */
  function forwarded(res: Response, name: string): string | null {
    const overridden = (res.headers.get("x-middleware-override-headers") ?? "").split(",").map((h) => h.trim());
    if (!overridden.includes(name)) return null;
    return res.headers.get(`x-middleware-request-${name}`);
  }

  it.each(["/x.txt", "/he/listing/89-x.y", "/he/foo.php"])("%s gets both CSP headers and its own nonce", async (path) => {
    const proxy = await loadProxy(PRODUCTION);
    const res = await proxy(
      new NextRequest(`https://bayit.ge${path}`, {
        headers: { host: "bayit.ge", "x-nonce": "evil", "x-pathname": "/evil", "content-security-policy": "default-src *" },
      }),
    );
    const enforced = res.headers.get("content-security-policy");
    expect(directive(enforced, "base-uri")).toEqual(["'none'"]);
    expect(res.headers.get("content-security-policy-report-only")).not.toBeNull();
    expect(res.headers.get("reporting-endpoints")).toBe('csp-endpoint="/api/csp-report"');
    const nonce = /'nonce-([^']+)'/.exec(enforced ?? "")?.[1];
    expect(nonce).toBeTruthy();
    expect(forwarded(res, "x-nonce")).toBe(nonce);
    expect(forwarded(res, "x-pathname")).toBe(path);
    expect(forwarded(res, "content-security-policy")).toBe(enforced);
  });

  it("the API gets no CSP, and the visitor's x-nonce / x-pathname are removed there too", async () => {
    const proxy = await loadProxy(PRODUCTION);
    const res = await proxy(
      new NextRequest("https://bayit.ge/api/places?q=x", {
        headers: { host: "bayit.ge", "x-nonce": "evil", "x-pathname": "/evil", "content-security-policy": "default-src *" },
      }),
    );
    expect(res.headers.get("content-security-policy")).toBeNull();
    const overridden = (res.headers.get("x-middleware-override-headers") ?? "").split(",").map((h) => h.trim());
    expect(overridden).not.toContain("x-nonce");
    expect(overridden).not.toContain("x-pathname");
    expect(overridden).not.toContain("content-security-policy");
    expect(res.headers.get("x-middleware-request-x-nonce")).toBeNull();
    expect(res.headers.get("x-middleware-request-x-pathname")).toBeNull();
  });

  it("a page request carrying x-nonce: evil reaches the app with the proxy's nonce instead", async () => {
    const proxy = await loadProxy(PRODUCTION);
    const request = new NextRequest("https://bayit.ge/he", { headers: { host: "bayit.ge", "x-nonce": "evil", "x-pathname": "/evil" } });
    const res = await proxy(request);
    const nonce = /'nonce-([^']+)'/.exec(res.headers.get("content-security-policy") ?? "")?.[1];
    expect(request.headers.get("x-nonce")).toBe(nonce);
    expect(request.headers.get("x-nonce")).not.toBe("evil");
    expect(request.headers.get("x-pathname")).toBe("/he");
  });
});
