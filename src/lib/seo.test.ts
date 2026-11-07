import { describe, expect, it } from "vitest";
import { siteConfig } from "@/config/site";
import { siteUrl } from "@/lib/site-url";
import {
  absoluteUrl,
  breadcrumbJsonLd,
  homeJsonLd,
  indexingWarning,
  isPrivatePath,
  isProductionHost,
  isProductionRequest,
  localizedAlternates,
  localizedPath,
  metaDescription,
  normalizeRequestHost,
  ogLocale,
  pageMetadata,
  privateDisallowRules,
  productionHost,
  requestHosts,
  robotsFor,
  robotsHeaderFor,
  siteName,
} from "./seo";

// The permanent address (SITE_URL, else NEXT_PUBLIC_SITE_URL): @/lib/site-url.
const origin = siteUrl();

describe("absoluteUrl", () => {
  it("prefixes the site origin", () => {
    expect(absoluteUrl("/he/about")).toBe(`${origin}/he/about`);
    expect(absoluteUrl("about")).toBe(`${origin}/about`);
    expect(absoluteUrl("/")).toBe(`${origin}/`);
  });
  it("keeps absolute URLs", () => {
    expect(absoluteUrl("https://cdn.example.com/a.jpg")).toBe("https://cdn.example.com/a.jpg");
  });
});

describe("localizedPath", () => {
  it("adds the locale prefix", () => {
    expect(localizedPath("he", "/about")).toBe("/he/about");
    expect(localizedPath("ar", "/")).toBe("/ar");
    expect(localizedPath("en", "")).toBe("/en");
  });
  it("keeps the query string and hash", () => {
    expect(localizedPath("ru", "/search?deal=rent")).toBe("/ru/search?deal=rent");
    expect(localizedPath("ka", "/?ref=1")).toBe("/ka?ref=1");
    expect(localizedPath("en", "/#top")).toBe("/en#top");
  });
});

describe("localizedAlternates", () => {
  it("lists all five languages plus x-default (English)", () => {
    const { canonical, languages } = localizedAlternates("/about", "he");
    expect(canonical).toBe(`${origin}/he/about`);
    expect(Object.keys(languages).sort()).toEqual(["ar", "en", "he", "ka", "ru", "x-default"]);
    expect(languages.ka).toBe(`${origin}/ka/about`);
    expect(languages["x-default"]).toBe(`${origin}/en/about`);
  });
  it("handles the home page", () => {
    expect(localizedAlternates("/", "ar").canonical).toBe(`${origin}/ar`);
  });
  it("falls back to English for an unknown locale", () => {
    expect(localizedAlternates("/help", "fr").canonical).toBe(`${origin}/en/help`);
  });
});

describe("ogLocale / siteName", () => {
  it("maps site languages to Open Graph locales", () => {
    expect(ogLocale("he")).toBe("he_IL");
    expect(ogLocale("ka")).toBe("ka_GE");
    expect(ogLocale("xx")).toBe("en_US");
  });
  it("uses the localized brand name", () => {
    expect(siteName("he")).toBe(siteConfig.localizedName.he);
    expect(siteName("xx")).toBe(siteConfig.name);
  });
});

describe("pageMetadata", () => {
  it("builds canonical, Open Graph and Twitter metadata", () => {
    const meta = pageMetadata({ locale: "ru", path: "/safety", title: "Safety", description: "Stay safe" });
    expect(meta.title).toBe("Safety");
    expect(meta.alternates?.canonical).toBe(`${origin}/ru/safety`);
    const og = meta.openGraph as Record<string, unknown>;
    expect(og.locale).toBe("ru_RU");
    expect(og.url).toBe(`${origin}/ru/safety`);
    expect(og.alternateLocale).toEqual(["he_IL", "en_US", "ar_AR", "ka_GE"]);
    expect(og.images).toEqual([{ url: `${origin}/ru/opengraph-image`, width: 1200, height: 630, alt: "Safety" }]);
    expect((meta.twitter as Record<string, unknown>).images).toEqual([`${origin}/ru/opengraph-image`]);
    expect((meta.twitter as Record<string, unknown>).card).toBe("summary_large_image");
    expect(meta.robots).toBeUndefined();
  });
  it("uses a custom image and noindex", () => {
    const meta = pageMetadata({
      locale: "en",
      path: "/listing/12-flat",
      title: "Flat",
      description: "A flat",
      image: { url: "/api/media/a.webp", width: 1600, height: 900 },
      noIndex: true,
    });
    const og = meta.openGraph as { images: unknown[] };
    expect(og.images[0]).toEqual({ url: `${origin}/api/media/a.webp`, width: 1600, height: 900, alt: "Flat" });
    expect(meta.robots).toEqual({ index: false, follow: true });
  });
});

describe("pageMetadata noFollow (demo listings)", () => {
  it("asks for noindex, nofollow only together with noIndex", () => {
    expect(pageMetadata({ locale: "he", path: "/listing/1-a", title: "A", description: "B", noIndex: true, noFollow: true }).robots).toEqual({ index: false, follow: false });
    expect(pageMetadata({ locale: "he", path: "/listing/1-a", title: "A", description: "B", noFollow: true }).robots).toBeUndefined();
  });
});

describe("metaDescription", () => {
  it("joins the lead and the text", () => {
    expect(metaDescription("₾120 / night · Batumi", "A flat\n\nby the sea.")).toBe("₾120 / night · Batumi · A flat by the sea.");
    expect(metaDescription("", "Only text")).toBe("Only text");
    expect(metaDescription("Only lead", "  ")).toBe("Only lead");
  });
  it("cuts at a word near 160 characters", () => {
    const text = "word ".repeat(80);
    const out = metaDescription("Lead", text);
    expect(out.length).toBeLessThanOrEqual(160);
    expect(out.endsWith("word…")).toBe(true);
  });
});

// ─── Production host (round 3, brief 10) ────────────────────────────────

const PROD = { SITE_URL: "https://bayit.ge" };

function headersOf(values: Record<string, string>) {
  const h = new Headers(values);
  return { get: (name: string) => h.get(name) };
}

describe("normalizeRequestHost", () => {
  it("lower-cases and drops default ports and a trailing dot", () => {
    expect(normalizeRequestHost("Bayit.GE")).toBe("bayit.ge");
    expect(normalizeRequestHost("bayit.ge:443")).toBe("bayit.ge");
    expect(normalizeRequestHost("bayit.ge:80")).toBe("bayit.ge");
    expect(normalizeRequestHost("bayit.ge.")).toBe("bayit.ge");
    expect(normalizeRequestHost("localhost:4691")).toBe("localhost:4691");
    expect(normalizeRequestHost("[::1]:3000")).toBe("[::1]:3000");
  });
  it("rejects anything that is not host[:port]", () => {
    for (const bad of ["", "  ", "bayit.ge/path", "user@bayit.ge", "bayit.ge:99999x", "bayit.ge, evil.com", "bayit .ge", "http://bayit.ge"]) {
      expect(normalizeRequestHost(bad), bad).toBeNull();
    }
    expect(normalizeRequestHost(null)).toBeNull();
  });
});

describe("isProductionHost (contract 2)", () => {
  it("is true only for SITE_URL's host", () => {
    expect(productionHost(PROD)).toBe("bayit.ge");
    expect(isProductionHost("bayit.ge", PROD)).toBe(true);
    expect(isProductionHost("BAYIT.ge:443", PROD)).toBe(true);
    expect(isProductionHost("www.bayit.ge", PROD)).toBe(false);
    expect(isProductionHost("bayit.ge.evil.com", PROD)).toBe(false);
    expect(isProductionHost("bayit-git-main.vercel.app", PROD)).toBe(false);
    expect(isProductionHost("name-3000.app.github.dev", PROD)).toBe(false);
    expect(isProductionHost("localhost:3000", PROD)).toBe(false);
    expect(isProductionHost(null, PROD)).toBe(false);
  });
  it("is false for every host while SITE_URL is unset or invalid (NEXT_PUBLIC_SITE_URL does not count)", () => {
    expect(isProductionHost("bayit.ge", {})).toBe(false);
    expect(isProductionHost("localhost:3000", { SITE_URL: "" })).toBe(false);
    expect(isProductionHost("bayit.ge", { SITE_URL: "not a url" })).toBe(false);
    expect(isProductionHost("bayit.ge", { SITE_URL: "ftp://bayit.ge" })).toBe(false);
    expect(isProductionHost("bayit.ge", { NEXT_PUBLIC_SITE_URL: "https://bayit.ge" } as never)).toBe(false);
  });
  it("compares the port when SITE_URL has one (a production check on localhost)", () => {
    const env = { SITE_URL: "http://localhost:4691" };
    expect(isProductionHost("localhost:4691", env)).toBe(true);
    expect(isProductionHost("localhost:3000", env)).toBe(false);
    expect(isProductionHost("127.0.0.1:4691", env)).toBe(false);
  });
});

describe("indexingWarning (seo-3: SITE_URL decides indexing)", () => {
  it("is a loud error on a real domain without SITE_URL: every page would be noindex", () => {
    const env = { NODE_ENV: "production", SITE_URL: "", NEXT_PUBLIC_SITE_URL: "https://bayit.ge" };
    // The silent failure the warning is for: canonicals on bayit.ge, yet the request is not production.
    expect(isProductionRequest(headersOf({ host: "bayit.ge" }), env)).toBe(false);
    expect(robotsHeaderFor({ headers: headersOf({ host: "bayit.ge" }), pathname: "/he" }, env)).toBe("noindex, nofollow");
    const warning = indexingWarning(env);
    expect(warning?.level).toBe("error");
    expect(warning?.text).toContain("SITE_URL is not set");
    expect(warning?.text).toContain("Google will NOT index");
    expect(indexingWarning({ ...env, SITE_URL: "not a url" })?.level).toBe("error");
    expect(indexingWarning({ ...env, VERCEL: "1", VERCEL_ENV: "production" })?.level).toBe("error");
  });
  it("is only a note on a test or preview address, and silent in development or on a Vercel preview", () => {
    expect(indexingWarning({ NODE_ENV: "production", NEXT_PUBLIC_SITE_URL: "http://localhost:4693" })?.level).toBe("info");
    expect(indexingWarning({ NODE_ENV: "production", NEXT_PUBLIC_SITE_URL: "https://bayit-xyz.vercel.app" })?.level).toBe("info");
    expect(indexingWarning({ NODE_ENV: "development", NEXT_PUBLIC_SITE_URL: "https://bayit.ge" })).toBeNull();
    expect(indexingWarning({ NODE_ENV: "production", NEXT_PUBLIC_SITE_URL: "https://bayit.ge", VERCEL: "1", VERCEL_ENV: "preview" })).toBeNull();
  });
  it("is silent once SITE_URL is set, unless Vercel serves production on another host (apex against www)", () => {
    expect(indexingWarning({ NODE_ENV: "production", SITE_URL: "https://bayit.ge" })).toBeNull();
    expect(indexingWarning({ NODE_ENV: "production", SITE_URL: "https://bayit.ge", VERCEL: "1", VERCEL_ENV: "production", VERCEL_PROJECT_PRODUCTION_URL: "bayit.ge" })).toBeNull();
    const mismatch = indexingWarning({ NODE_ENV: "production", SITE_URL: "https://www.bayit.ge", VERCEL: "1", VERCEL_ENV: "production", VERCEL_PROJECT_PRODUCTION_URL: "bayit.ge" });
    expect(mismatch?.level).toBe("error");
    expect(mismatch?.text).toContain("www.bayit.ge");
    expect(mismatch?.text).toContain("Vercel's production domain is bayit.ge");
  });
});

describe("isProductionRequest", () => {
  it("needs every host of the request to be the site's", () => {
    expect(isProductionRequest(headersOf({ host: "bayit.ge" }), PROD)).toBe(true);
    expect(isProductionRequest(headersOf({ host: "bayit.ge", "x-forwarded-host": "bayit.ge" }), PROD)).toBe(true);
    // A preview that forwards to a server answering for the real domain is still a preview.
    expect(isProductionRequest(headersOf({ host: "bayit.ge", "x-forwarded-host": "bayit-abc.vercel.app" }), PROD)).toBe(false);
    expect(isProductionRequest(headersOf({ host: "localhost:3000", "x-forwarded-host": "bayit.ge" }), PROD)).toBe(false);
    expect(isProductionRequest(headersOf({ host: "bayit.ge", "x-forwarded-host": "bayit.ge, evil.example" }), PROD)).toBe(false);
    expect(isProductionRequest(headersOf({ host: "bayit.ge", forwarded: 'for=1.2.3.4;host="evil.example";proto=https' }), PROD)).toBe(false);
    expect(isProductionRequest(headersOf({ host: "bayit.ge", forwarded: "for=1.2.3.4;host=bayit.ge;proto=https" }), PROD)).toBe(true);
  });
  it("is false without a host or without SITE_URL", () => {
    expect(isProductionRequest(headersOf({}), PROD)).toBe(false);
    expect(isProductionRequest(headersOf({ host: "bayit.ge" }), {})).toBe(false);
  });
  it("lists the hosts a request names", () => {
    expect(requestHosts(headersOf({ host: "a.ge", "x-forwarded-host": "b.ge, c.ge", forwarded: "host=d.ge, for=1.1.1.1;host=e.ge" }))).toEqual(["a.ge", "b.ge", "c.ge", "d.ge", "e.ge"]);
  });
});

describe("private areas", () => {
  it("knows the private paths in every language", () => {
    for (const path of ["/he/account", "/en/account/trips/ABC123", "/ru/admin/users", "/ar/post", "/ka/post/12", "/he/login", "/he/two-factor/setup", "/en/verify-phone", "/he/saved", "/he/lists/tok", "/en/unsubscribe"]) {
      expect(isPrivatePath(path), path).toBe(true);
    }
    for (const path of ["/he", "/he/search", "/he/listing/12-flat", "/he/batumi/short-stays", "/he/postville", "/he/accounting", "/fr/account", "/account"]) {
      expect(isPrivatePath(path), path).toBe(false);
    }
  });
});

describe("robotsHeaderFor (the proxy's X-Robots-Tag)", () => {
  const prod = headersOf({ host: "bayit.ge" });
  it("says noindex, nofollow on every page of another host", () => {
    for (const host of ["localhost:4691", "name-3000.app.github.dev", "bayit-git-x.vercel.app", "10.0.0.1"]) {
      expect(robotsHeaderFor({ headers: headersOf({ host }), pathname: "/he" }, PROD), host).toBe("noindex, nofollow");
    }
    expect(robotsHeaderFor({ headers: prod, pathname: "/he" }, {})).toBe("noindex, nofollow");
  });
  it("leaves the real site's public pages alone and marks its private ones", () => {
    expect(robotsHeaderFor({ headers: prod, pathname: "/he" }, PROD)).toBeNull();
    expect(robotsHeaderFor({ headers: prod, pathname: "/en/listing/12-flat" }, PROD)).toBeNull();
    expect(robotsHeaderFor({ headers: prod, pathname: "/he/account/trips/X" }, PROD)).toBe("noindex, nofollow");
    expect(robotsHeaderFor({ headers: prod, pathname: "/he/lists/token" }, PROD)).toBe("noindex, nofollow");
  });
});

/** Google's robots.txt matching: the longest matching rule wins, Allow wins a tie; "*" and "$". */
function allowedBy(rules: { allow: string[]; disallow: string[] }, path: string): boolean {
  const toRegex = (rule: string) =>
    new RegExp(`^${rule.replace(/[.+?^{}()|[\]\\]/g, "\\$&").replace(/\*/g, ".*").replace(/\\\$$/, "$")}`);
  const longest = (list: string[]) => Math.max(-1, ...list.filter((rule) => toRegex(rule).test(path)).map((rule) => rule.length));
  return longest(rules.allow) >= longest(rules.disallow);
}

describe("robots.txt", () => {
  it("opens everything on other hosts (so their noindex is read) and names no sitemap", () => {
    const robots = robotsFor(false);
    expect(robots.rules).toEqual([{ userAgent: "*", allow: "/" }]);
    expect(JSON.stringify(robots)).not.toContain("disallow");
    expect(robots.sitemap).toBeUndefined();
  });

  it("on the real site: public pages open, private areas and the API closed, the sitemap named", () => {
    const robots = robotsFor(true);
    const rule = (Array.isArray(robots.rules) ? robots.rules[0] : robots.rules)!;
    const rules = { allow: [rule.allow ?? []].flat(), disallow: [rule.disallow ?? []].flat() };
    expect(rule.userAgent).toBe("*");
    expect(robots.sitemap).toBe(absoluteUrl("/sitemap.xml"));
    for (const path of ["/", "/he", "/en/search?deal=hotels", "/he/listing/12-flat", "/he/batumi/short-stays", "/ka/tbilisi", "/he/jewish-life", "/ru/legal/terms", "/he/postville/monthly", "/he/accounting", "/he/adminville", "/he/lists/token", "/sitemap.xml"]) {
      expect(allowedBy(rules, path), path).toBe(true);
    }
    for (const path of ["/he/admin", "/ru/admin/users", "/he/account", "/en/account/trips/AB12", "/ka/account?tab=x", "/api/auth/session", "/api/media/x.webp"]) {
      expect(allowedBy(rules, path), path).toBe(false);
    }
  });

  it("leaves the private pages that public pages link to crawlable, so their noindex is read (seo-4)", () => {
    const robots = robotsFor(true);
    const rule = (Array.isArray(robots.rules) ? robots.rules[0] : robots.rules)!;
    const rules = { allow: [rule.allow ?? []].flat(), disallow: [rule.disallow ?? []].flat() };
    // Linked from the header, footer, bottom bar or emails of every page: blocking them would only
    // leave bare "blocked by robots.txt" results. They still say noindex (proxy + meta).
    for (const path of ["/he/post", "/ru/post/5", "/ar/login?next=/he", "/ka/two-factor", "/he/verify-phone", "/he/saved", "/en/unsubscribe?token=x", "/he/lists/token"]) {
      expect(allowedBy(rules, path), path).toBe(true);
      expect(isPrivatePath(path.split("?")[0]), path).toBe(true);
    }
    for (const area of ["post", "login", "two-factor", "verify-phone", "saved", "lists", "unsubscribe"]) {
      expect(privateDisallowRules().some((r) => r.includes(`/${area}`)), area).toBe(false);
    }
    expect(privateDisallowRules()).toEqual(expect.arrayContaining(["/he/account$", "/he/account/", "/he/account?", "/en/admin$", "/api/"]));
    expect(privateDisallowRules()).toHaveLength(5 * 2 * 3 + 1);
  });
});

// ─── Structured data ────────────────────────────────────────────────────

/** Every "@type" anywhere in a JSON-LD object. */
function typesIn(value: unknown): string[] {
  if (Array.isArray(value)) return value.flatMap(typesIn);
  if (value && typeof value === "object") {
    return Object.entries(value).flatMap(([key, inner]) => (key === "@type" ? [String(inner)] : typesIn(inner)));
  }
  return [];
}

describe("breadcrumbJsonLd (contract 2)", () => {
  it("builds a BreadcrumbList with positions and absolute URLs in the page's language", () => {
    const data = breadcrumbJsonLd(
      [
        { name: "בית", path: "/" },
        { name: " בטומי ", path: "/batumi" },
        { name: "", path: "/skipped" },
        { name: "דירות לטווח קצר בבטומי", path: "/batumi/short-stays" },
      ],
      "he",
    );
    expect(data).toEqual({
      "@context": "https://schema.org",
      "@type": "BreadcrumbList",
      itemListElement: [
        { "@type": "ListItem", position: 1, name: "בית", item: `${origin}/he` },
        { "@type": "ListItem", position: 2, name: "בטומי", item: `${origin}/he/batumi` },
        { "@type": "ListItem", position: 3, name: "דירות לטווח קצר בבטומי", item: `${origin}/he/batumi/short-stays` },
      ],
    });
    // Valid JSON for a <script type="application/ld+json">.
    expect(JSON.parse(JSON.stringify(data))).toEqual(data);
  });
  it("keeps a query string in an item and falls back to English for an unknown locale", () => {
    const data = breadcrumbJsonLd([{ name: "Search", path: "/search?city=batumi" }], "xx") as { itemListElement: { item: string }[] };
    expect(data.itemListElement[0].item).toBe(`${origin}/en/search?city=batumi`);
  });
});

describe("homeJsonLd", () => {
  it("has a WebSite and an Organization and nothing Google would not show", () => {
    const data = homeJsonLd("ru") as { "@graph": Record<string, unknown>[] };
    expect(typesIn(data).sort()).toEqual(["Organization", "WebSite"]);
    const [site, org] = data["@graph"];
    expect(site.url).toBe(`${origin}/ru`);
    expect(site.inLanguage).toBe("ru");
    expect(site.name).toBe(siteName("ru"));
    expect(site.publisher).toEqual({ "@id": org["@id"] });
    expect(org.name).toBe(siteConfig.name);
    expect(org.logo).toBe(`${origin}/icons/icon-512.png`);
    const json = JSON.stringify(data);
    // No search box (retired by Google), no reviews or ratings, no contact details.
    for (const banned of ["SearchAction", "potentialAction", "Review", "AggregateRating", "telephone", "email", "sameAs"]) {
      expect(json).not.toContain(banned);
    }
  });
});
