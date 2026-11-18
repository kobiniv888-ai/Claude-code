import { createRequire } from "node:module";
import type { MetadataRoute } from "next";
import { describe, expect, it } from "vitest";
import { locales, type AppLocale } from "@/config/site";
import type { CityPageEntry } from "@/lib/city-pages/core";
import { siteUrl } from "@/lib/site-url";
import { STATIC_SITEMAP_PAGES, buildSitemap, listingCapacity, pageEntries, xmlEscapeUrl, type SitemapListing } from "./seo-sitemap";

// Next's own sitemap writer (what /sitemap.xml serves): it puts the URLs into the XML as they are.
const { resolveSitemap } = createRequire(import.meta.url)("next/dist/build/webpack/loaders/metadata/resolve-route-data.js") as {
  resolveSitemap: (data: MetadataRoute.Sitemap) => string;
};

const XML_ENTITIES: Record<string, string> = { amp: "&", lt: "<", gt: ">", quot: '"', apos: "'" };

/** XML text or attribute value → its characters; throws on a raw "<" or a "&" that starts no entity. */
function xmlText(raw: string, where: string): string {
  if (raw.includes("<")) throw new Error(`raw "<" in ${where}: ${raw}`);
  return raw.replace(/&([^;]*);?/g, (match, name: string) => {
    if (!match.endsWith(";")) throw new Error(`bare "&" in ${where}: ${raw}`);
    if (name in XML_ENTITIES) return XML_ENTITIES[name];
    const code = /^#x([0-9a-f]+)$/i.exec(name)?.[1] ?? /^#(\d+)$/.exec(name)?.[1];
    if (!code) throw new Error(`unknown entity &${name}; in ${where}`);
    return String.fromCodePoint(Number.parseInt(code, name.startsWith("#x") ? 16 : 10));
  });
}

/**
 * A small strict XML reader (no package needed): every tag closes in order, attribute values are
 * quoted, text and values hold no raw "<" or bare "&". Returns the parsed <loc> values and the
 * hreflang hrefs, unescaped — what Google reads.
 */
function parseSitemapXml(xml: string): { locs: string[]; hrefs: string[] } {
  const body = xml.replace(/^<\?xml[^>]*\?>\s*/, "");
  const stack: string[] = [];
  const locs: string[] = [];
  const hrefs: string[] = [];
  const token = /<(\/?)([A-Za-z_][\w:.-]*)((?:\s+[\w:.-]+="[^"]*")*)\s*(\/?)>|([^<]+)|(<)/gy;
  let match: RegExpExecArray | null;
  let lastText = "";
  let end = 0;
  while ((match = token.exec(body))) {
    end = token.lastIndex;
    const [, closing, name, attrs, selfClosing, text, stray] = match;
    if (stray) throw new Error(`malformed markup at ${match.index}: ${body.slice(match.index, match.index + 60)}`);
    if (text !== undefined) {
      lastText = xmlText(text, `text at ${match.index}`);
      continue;
    }
    for (const attr of attrs.matchAll(/([\w:.-]+)="([^"]*)"/g)) {
      const value = xmlText(attr[2], `${name}@${attr[1]}`);
      if (name === "xhtml:link" && attr[1] === "href") hrefs.push(value);
    }
    if (closing) {
      if (stack.pop() !== name) throw new Error(`</${name}> closes the wrong element`);
      if (name === "loc") locs.push(lastText);
    } else if (!selfClosing) stack.push(name);
    lastText = "";
  }
  if (end < body.length) throw new Error("could not read to the end");
  if (stack.length > 0) throw new Error(`unclosed: ${stack.join(", ")}`);
  return { locs, hrefs };
}

const origin = siteUrl();
const at = new Date("2026-11-01T10:00:00Z");

function city(citySlug: string, type: CityPageEntry["type"], realCount: number, updatedAt: Date | null = at): CityPageEntry {
  return { citySlug, type, realCount, indexable: realCount >= 3, updatedAt };
}

function listing(publicId: number): SitemapListing {
  const paths = Object.fromEntries(locales.map((locale) => [locale, `/listing/${publicId}-${locale}-slug`])) as Record<AppLocale, string>;
  return { paths, lastModified: at };
}

const urls = (entries: { url: string }[]) => entries.map((entry) => entry.url);

describe("the sitemap", () => {
  const sitemap = buildSitemap({
    searchPaths: ["/search", "/search?deal=hotels"],
    cityPages: [city("batumi", "short-stays", 3), city("batumi", "hotels", 2), city("tbilisi", "monthly", 0, null)],
    guides: [{ slug: "shabbat-in-tbilisi", updatedAt: at }],
    listings: [listing(44), listing(43)],
  });
  const all = urls(sitemap);

  it("lists every static page in the five languages with hreflang and x-default", () => {
    for (const { path } of STATIC_SITEMAP_PAGES) {
      for (const locale of locales) expect(all).toContain(`${origin}/${locale}${path === "/" ? "" : path}`);
    }
    const home = sitemap.find((entry) => entry.url === `${origin}/he`)!;
    expect(home.alternates?.languages).toEqual({
      he: `${origin}/he`,
      en: `${origin}/en`,
      ru: `${origin}/ru`,
      ar: `${origin}/ar`,
      ka: `${origin}/ka`,
      "x-default": `${origin}/en`,
    });
  });

  it("lists only the indexable city pages, and the overviews that have one, with their lastmod", () => {
    expect(all).toContain(`${origin}/he/batumi/short-stays`);
    expect(all).toContain(`${origin}/ka/batumi`);
    expect(all.some((url) => url.includes("/batumi/hotels"))).toBe(false);
    expect(all.some((url) => /\/(he|en|ru|ar|ka)\/tbilisi(\/|$)/.test(url))).toBe(false);
    expect(sitemap.find((entry) => entry.url === `${origin}/en/batumi/short-stays`)?.lastModified).toEqual(at);
  });

  it("lists the given search landings, guides and listings (each language its own slug)", () => {
    expect(all).toContain(`${origin}/ru/search?deal=hotels`);
    expect(all).toContain(`${origin}/he/jewish-life/guides/shabbat-in-tbilisi`);
    expect(all).toContain(`${origin}/ka/listing/44-ka-slug`);
    const entry = sitemap.find((item) => item.url === `${origin}/he/listing/43-he-slug`)!;
    expect(entry.lastModified).toEqual(at);
    expect(entry.alternates?.languages?.["x-default"]).toBe(`${origin}/en/listing/43-en-slug`);
  });

  it("is well-formed XML once Next writes it, even for a landing with '&' (seo-1)", () => {
    const rent = buildSitemap({ searchPaths: ["/search?deal=rent&city=batumi"], cityPages: [], guides: [], listings: [listing(7)] });
    const xml = resolveSitemap(rent);
    expect(xml).not.toMatch(/&(?!amp;|lt;|gt;|quot;|apos;)/);
    const { locs, hrefs } = parseSitemapXml(xml);
    // Google reads the URL itself, not "&amp;" (and never "&amp;amp;": no double escaping).
    expect(locs).toContain(`${origin}/he/search?deal=rent&city=batumi`);
    expect(locs).toContain(`${origin}/ka/listing/7-ka-slug`);
    expect(hrefs).toContain(`${origin}/en/search?deal=rent&city=batumi`);
    expect(locs).toHaveLength(rent.length);
    expect(locs.some((loc) => loc.includes("&amp;"))).toBe(false);
  });

  it("escapes the five XML characters of a URL", () => {
    expect(xmlEscapeUrl(`https://a.ge/x?a=1&b=<2>"'`)).toBe("https://a.ge/x?a=1&amp;b=&lt;2&gt;&quot;&apos;");
    expect(xmlEscapeUrl("https://a.ge/he/batumi")).toBe("https://a.ge/he/batumi");
  });

  it("has no duplicate URLs", () => {
    expect(new Set(all).size).toBe(all.length);
  });

  it("never has more than 50,000 URLs: the listings get what the pages leave", () => {
    const pages = pageEntries({ searchPaths: [], cityPages: [], guides: [] });
    expect(listingCapacity(pages.length)).toBe(Math.floor((50_000 - pages.length) / 5));
    const many = Array.from({ length: 10_100 }, (_, index) => listing(index + 1));
    const big = buildSitemap({ searchPaths: [], cityPages: [], guides: [], listings: many });
    expect(big.length).toBeLessThanOrEqual(50_000);
    expect(big.length).toBeGreaterThan(49_900);
    // Whole listings only: every listing kept has all five languages.
    expect((big.length - pages.length) % 5).toBe(0);
    expect(listingCapacity(60_000)).toBe(0);
  });
});
