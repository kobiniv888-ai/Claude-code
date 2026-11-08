/**
 * Round 3, brief 10: "any host that isn't SITE_URL sends noindex on every page". Runs the real
 * proxy (src/proxy.ts) on requests with different hosts and checks its X-Robots-Tag.
 */
import { afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import { NextRequest, NextResponse } from "next/server";

vi.mock("server-only", () => ({}));
// next-intl's middleware (the language redirect) is not what is tested here, and its ESM build
// does not load under vitest: "/" redirects to "/he", every other path passes.
vi.mock("next-intl/middleware", () => ({
  default: () => (req: NextRequest) =>
    req.nextUrl.pathname === "/" ? NextResponse.redirect(new URL("/he", req.url), 307) : NextResponse.next(),
}));

let proxy: (request: NextRequest) => Promise<Response>;

beforeAll(async () => {
  proxy = (await import("@/proxy")).default as never;
});

afterEach(() => {
  vi.unstubAllEnvs();
});

function request(path: string, headers: Record<string, string>): NextRequest {
  const host = headers.host ?? "localhost";
  return new NextRequest(`http://${host}${path}`, { headers });
}

describe("the proxy's X-Robots-Tag", () => {
  it("says noindex, nofollow on every page while SITE_URL is unset (a codespace, a test server)", async () => {
    vi.stubEnv("SITE_URL", "");
    for (const path of ["/he", "/en/search", "/ru/listing/12-flat", "/he/batumi/short-stays"]) {
      const response = await proxy(request(path, { host: "localhost:4691" }));
      expect(response.headers.get("x-robots-tag"), path).toBe("noindex, nofollow");
    }
  });

  it("says noindex on a preview or Codespaces address even when SITE_URL is the real domain", async () => {
    vi.stubEnv("SITE_URL", "https://bayit.ge");
    vi.stubEnv("SITE_ENV", "production");
    const variants: Record<string, string>[] = [
      { host: "bayit-git-main.vercel.app" },
      { host: "localhost:3000", "x-forwarded-host": "name-3000.app.github.dev" },
      // A forged Host on a preview: the platform's forwarded host still gives it away.
      { host: "bayit.ge", "x-forwarded-host": "bayit-abc.vercel.app" },
    ];
    for (const headers of variants) {
      const response = await proxy(request("/he", headers));
      expect(response.headers.get("x-robots-tag"), JSON.stringify(headers)).toBe("noindex, nofollow");
    }
  });

  it("sends no X-Robots-Tag on the real site's public pages, but keeps it on private ones", async () => {
    vi.stubEnv("SITE_URL", "https://bayit.ge");
    vi.stubEnv("SITE_ENV", "production");
    const home = await proxy(request("/he", { host: "bayit.ge", "x-forwarded-host": "bayit.ge" }));
    expect(home.headers.get("x-robots-tag")).toBeNull();
    const search = await proxy(request("/en/search?deal=hotels", { host: "bayit.ge" }));
    expect(search.headers.get("x-robots-tag")).toBeNull();
    for (const path of ["/he/account/trips/AB12CD", "/he/lists/some-token", "/en/admin", "/he/post"]) {
      const response = await proxy(request(path, { host: "bayit.ge" }));
      expect(response.headers.get("x-robots-tag"), path).toBe("noindex, nofollow");
    }
  });

  it("marks every non-page response of a non-production host too: API, images, public files, robots.txt, sitemap.xml (seo-4)", async () => {
    vi.stubEnv("SITE_URL", "https://bayit.ge");
    vi.stubEnv("SITE_ENV", "production");
    const paths = [
      "/robots.txt",
      "/sitemap.xml",
      "/manifest.webmanifest",
      "/photos/cities/kobuleti.webp",
      "/icons/icon-512.png",
      "/_next/image?url=%2Fphotos%2Fcities%2Fkobuleti.webp&w=640&q=75",
      "/api/media/abc.webp",
      "/api/auth/get-session",
    ];
    for (const path of paths) {
      const response = await proxy(request(path, { host: "bayit-git-main.vercel.app" }));
      expect(response.headers.get("x-robots-tag"), path).toBe("noindex, nofollow");
      // Only the header: no language redirect, CSP or device cookie on files and the API.
      expect(response.status, path).toBe(200);
      expect(response.headers.get("content-security-policy"), path).toBeNull();
      expect(response.headers.get("set-cookie"), path).toBeNull();
    }
    // The real site's files and API carry none (robots.txt keeps crawlers out of /api/ there).
    for (const path of ["/robots.txt", "/sitemap.xml", "/photos/cities/kobuleti.webp", "/_next/image?url=%2Fx.webp&w=64&q=75", "/api/media/abc.webp"]) {
      const response = await proxy(request(path, { host: "bayit.ge" }));
      expect(response.headers.get("x-robots-tag"), path).toBeNull();
    }
  });

  it("runs on those paths: the matcher covers the API, /_next/image and files, but not /_next/static", async () => {
    const { config } = await import("@/proxy");
    const patterns = config.matcher;
    expect(patterns).toEqual(expect.arrayContaining(["/api/:path*", "/_next/image"]));
    // The file pattern is a plain regular expression group, anchored by Next to the whole path.
    const files = new RegExp(`^${patterns[3]}$`);
    for (const path of ["/robots.txt", "/sitemap.xml", "/manifest.webmanifest", "/photos/cities/kobuleti.webp", "/sw.js"]) {
      expect(files.test(path), path).toBe(true);
    }
    expect(files.test("/_next/static/chunks/main.js")).toBe(false);
    expect(files.test("/he/batumi")).toBe(false);
  });

  it("also marks the language redirect of a non-production host", async () => {
    vi.stubEnv("SITE_URL", "");
    const response = await proxy(request("/", { host: "localhost:4691", "accept-language": "he" }));
    expect(response.status).toBeGreaterThanOrEqual(300);
    expect(response.headers.get("x-robots-tag")).toBe("noindex, nofollow");
  });
});

describe("hreflang", () => {
  it("comes only from the page's HTML: next-intl sends no Link hreflang header (seo-2)", async () => {
    const { routing } = await import("@/i18n/routing");
    expect(routing.alternateLinks).toBe(false);
  });
});
