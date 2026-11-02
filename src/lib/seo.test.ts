import { describe, expect, it } from "vitest";
import { siteConfig } from "@/config/site";
import { absoluteUrl, localizedAlternates, localizedPath, ogLocale, pageMetadata, siteName } from "./seo";

const origin = siteConfig.url.replace(/\/+$/, "");

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
