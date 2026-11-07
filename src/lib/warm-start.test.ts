import { afterEach, describe, expect, it, vi } from "vitest";
import { locales } from "@/config/locales";
import { preloadedImageUrls, warmBaseUrl, warmOnStart, WARM_MAX_IMAGE_WIDTH, WARM_PATHS, WARM_REST_AFTER_MS } from "./warm-start";

const PROD = { NODE_ENV: "production", NEXT_RUNTIME: "nodejs", PORT: "3000" };

describe("warmBaseUrl", () => {
  it("warms the running production Node server itself", () => {
    expect(warmBaseUrl(PROD)).toBe("http://127.0.0.1:3000");
    expect(warmBaseUrl({ ...PROD, PORT: "4692" })).toBe("http://127.0.0.1:4692");
  });

  it("is off in development, on the edge runtime, on Vercel, when switched off, or without a port", () => {
    expect(warmBaseUrl({ ...PROD, NODE_ENV: "development" })).toBeNull();
    expect(warmBaseUrl({ ...PROD, NODE_ENV: "test" })).toBeNull();
    expect(warmBaseUrl({ ...PROD, NEXT_RUNTIME: "edge" })).toBeNull();
    expect(warmBaseUrl({ ...PROD, VERCEL: "1" })).toBeNull();
    expect(warmBaseUrl({ ...PROD, WARM_ON_START: "0" })).toBeNull();
    expect(warmBaseUrl({ ...PROD, WARM_ON_START: "false" })).toBeNull();
    expect(warmBaseUrl({ ...PROD, PORT: undefined })).toBeNull();
    expect(warmBaseUrl({ ...PROD, PORT: "abc" })).toBeNull();
    expect(warmBaseUrl({ ...PROD, PORT: "0" })).toBeNull();
    expect(warmBaseUrl({ ...PROD, PORT: "70000" })).toBeNull();
  });
});

describe("WARM_PATHS", () => {
  it("is the home page in every language, then the search page", () => {
    expect(WARM_PATHS).toEqual([...locales.map((l) => `/${l}`), "/he/search"]);
  });
});

describe("preloadedImageUrls", () => {
  const set = [256, 384, 640, 750, 828, 1080, 1920]
    .map((w) => `/_next/image?url=%2Fphotos%2Fa.webp&amp;w=${w}&amp;q=75 ${w}w`)
    .join(", ");

  it("takes the phone widths of the photos the page preloads, in order, once each", () => {
    const html = `<head><link rel="preload" as="image" imageSrcSet="${set}" imageSizes="62vw" fetchPriority="high"/>
      <link rel="preload" as="image" imageSrcSet="${set}"/></head><body><img src="/_next/image?url=%2Fphotos%2Fb.webp&amp;w=640&amp;q=75"></body>`;
    expect(preloadedImageUrls(html)).toEqual(
      [256, 384, 640, 750, 828].map((w) => `/_next/image?url=%2Fphotos%2Fa.webp&w=${w}&q=75`),
    );
    expect(WARM_MAX_IMAGE_WIDTH).toBe(828);
  });

  it("reads a plain href too, and ignores other preloads and other image hosts", () => {
    const html = [
      `<link rel="preload" as="image" href="/_next/image?url=%2Fx.webp&amp;w=640&amp;q=75">`,
      `<link rel="preload" as="font" href="/fonts/a.woff2">`,
      `<link rel="preload" as="image" href="https://cdn.example/a.jpg">`,
      `<link rel="stylesheet" href="/_next/image?url=%2Fy.webp&amp;w=640&amp;q=75">`,
    ].join("");
    expect(preloadedImageUrls(html)).toEqual(["/_next/image?url=%2Fx.webp&w=640&q=75"]);
    expect(preloadedImageUrls("<p>no preloads</p>")).toEqual([]);
  });

  it("honours a smaller width limit", () => {
    const html = `<link rel="preload" as="image" imageSrcSet="${set}">`;
    expect(preloadedImageUrls(html, 384)).toHaveLength(2);
  });
});

describe("warmOnStart", () => {
  afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllGlobals();
  });

  it("does nothing when warming is off", () => {
    vi.useFakeTimers();
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);
    warmOnStart({ ...PROD, NODE_ENV: "development" });
    vi.runAllTimers();
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("warms the main home page and its photos first, the other pages later, each photo once", async () => {
    vi.useFakeTimers();
    const page = `<link rel="preload" as="image" imageSrcSet="/_next/image?url=%2Fa.webp&amp;w=640&amp;q=75 640w">`;
    const fetchMock = vi.fn(async () => new Response(page, { status: 200 }));
    vi.stubGlobal("fetch", fetchMock);
    const info = vi.spyOn(console, "info").mockImplementation(() => {});
    const urls = () => fetchMock.mock.calls.map((call) => String((call as unknown[])[0]));
    const photo = "http://127.0.0.1:3000/_next/image?url=%2Fa.webp&w=640&q=75";
    warmOnStart(PROD);
    expect(fetchMock).not.toHaveBeenCalled(); // never during the server's start itself
    await vi.advanceTimersByTimeAsync(1000);
    expect(urls()).toEqual(["http://127.0.0.1:3000/he", photo]);
    const imageInit = (fetchMock.mock.calls[1] as unknown[])[1] as { headers: Record<string, string> };
    expect(imageInit.headers.accept).toMatch(/^image\/avif/);
    await vi.advanceTimersByTimeAsync(WARM_REST_AFTER_MS + 1000);
    await vi.waitFor(() => expect(info).toHaveBeenCalledTimes(1));
    // The other pages; their photo was already prepared, so it is not requested again.
    expect(urls().slice(2)).toEqual(WARM_PATHS.slice(1).map((p) => `http://127.0.0.1:3000${p}`));
    info.mockRestore();
  });

  it("stops quietly at the first failure", async () => {
    vi.useFakeTimers();
    const fetchMock = vi.fn(async () => new Response("down", { status: 503 }));
    vi.stubGlobal("fetch", fetchMock);
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    warmOnStart(PROD);
    await vi.runAllTimersAsync();
    await vi.waitFor(() => expect(warn).toHaveBeenCalledTimes(1));
    expect(fetchMock).toHaveBeenCalledTimes(1);
    warn.mockRestore();
  });
});
