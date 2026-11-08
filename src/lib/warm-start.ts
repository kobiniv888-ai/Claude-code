import { locales } from "@/config/locales";

/**
 * Warms the production server right after it starts, so that its first real visitor (or a speed
 * test such as Lighthouse) does not pay for work that is done once per server:
 *
 * - the first render of the home page in each language (server code is loaded and compiled on
 *   first use, the database pool opens, the interface text is read): ~0.9 s on the first request
 *   on a small machine, ~0.1 s after;
 * - the photos at the top of those pages: the image optimizer converts each photo to WebP on its
 *   first request (0.3–1 s per photo and width). The first card photo is the largest paint of the
 *   home page on phones, so on a fresh server it alone cost ~0.6 s of "largest contentful paint"
 *   (Lighthouse 86 instead of 91).
 *
 * Only the photos a page asks the browser to preload (its first screen) and only the widths a phone
 * picks are requested; scripts/warm-images.mjs (run by .devcontainer/start.sh --prod) does every
 * photo. Fire and forget: it never delays the start, never throws, and stops at the first failure.
 * Off on Vercel (each function instance would warm itself) and with WARM_ON_START=0.
 */

/** Pages warmed, in order: the home page in every language, then the (Hebrew) search page. */
export const WARM_PATHS: readonly string[] = [...locales.map((locale) => `/${locale}`), `/${locales[0]}/search`];

/** Phones: 360–430 px wide at 2–3× (the 1080 w file and up are made on demand). */
export const WARM_MAX_IMAGE_WIDTH = 828;

type WarmEnv = Partial<Record<"NODE_ENV" | "NEXT_RUNTIME" | "VERCEL" | "WARM_ON_START" | "PORT", string>>;

/** The address to warm (this server itself), or null when warming is off for this process. */
export function warmBaseUrl(env: WarmEnv): string | null {
  if (env.NODE_ENV !== "production" || env.NEXT_RUNTIME !== "nodejs") return null;
  if (env.VERCEL || env.WARM_ON_START === "0" || env.WARM_ON_START === "false") return null;
  const port = Number(env.PORT);
  if (!Number.isInteger(port) || port <= 0 || port > 65535) return null;
  return `http://127.0.0.1:${port}`;
}

const decode = (value: string) => value.replaceAll("&amp;", "&");

/**
 * The image optimizer URLs of the photos that `html` preloads (<link rel="preload" as="image">,
 * which next/image writes for its `priority` photos), up to `maxWidth`, in page order.
 */
export function preloadedImageUrls(html: string, maxWidth: number = WARM_MAX_IMAGE_WIDTH): string[] {
  const urls: string[] = [];
  for (const link of html.matchAll(/<link\b[^>]*>/gi)) {
    const tag = link[0];
    if (!/\brel="preload"/i.test(tag) || !/\bas="image"/i.test(tag)) continue;
    const sources = [/\bimageSrcSet="([^"]*)"/i.exec(tag)?.[1], /\bhref="([^"]*)"/i.exec(tag)?.[1]];
    for (const source of sources) {
      if (!source) continue;
      for (const candidate of decode(source).split(",")) {
        const url = candidate.trim().split(/\s+/)[0];
        if (!url?.startsWith("/_next/image?")) continue;
        const width = Number(new URLSearchParams(url.slice(url.indexOf("?") + 1)).get("w"));
        if (width > 0 && width <= maxWidth && !urls.includes(url)) urls.push(url);
      }
    }
  }
  return urls;
}

const HEADERS = { "user-agent": "bayit-warm-start", "x-bayit-warm": "1" };

async function get(url: string, accept?: string): Promise<string> {
  const response = await fetch(url, {
    headers: accept ? { ...HEADERS, accept } : HEADERS,
    redirect: "follow",
    cache: "no-store",
    signal: AbortSignal.timeout(30_000),
  });
  const body = await response.text();
  if (!response.ok) throw new Error(`${response.status} ${url}`);
  return body;
}

/** The first page (the main language's home page) is warmed at once, the others this much later. */
export const WARM_REST_AFTER_MS = 20_000;

/**
 * Runs the warm-up in the background (call once, from instrumentation's register()): the main
 * language's home page and its first-screen photos right away, the other pages 20 s later, so the
 * work that matters most is done first and the rest does not compete with the first visitors.
 */
export function warmOnStart(env: WarmEnv = process.env as WarmEnv): void {
  const base = warmBaseUrl(env);
  if (!base) return;
  const done = new Set<string>();
  // Pages one after the other, then their new photos one at a time (the optimizer's encoding is
  // CPU-bound and visitors may already be arriving).
  const warm = async (paths: readonly string[]) => {
    const images: string[] = [];
    for (const path of paths) {
      const html = await get(base + path);
      for (const url of preloadedImageUrls(html)) if (!done.has(url) && !images.includes(url)) images.push(url);
    }
    for (const url of images) {
      await get(base + url, "image/webp,image/*");
      done.add(url);
    }
  };
  const [first, ...rest] = WARM_PATHS;
  const started = Date.now();
  // After the start: register() runs while the server is initializing, and requests wait for that.
  setTimeout(() => {
    void (async () => {
      try {
        await warm([first]);
        await new Promise((resolve) => setTimeout(resolve, WARM_REST_AFTER_MS));
        await warm(rest);
        console.info(`[warm-start] ${WARM_PATHS.length} pages and ${done.size} first-screen photos ready (${Math.round((Date.now() - started) / 1000)} s after the start)`);
      } catch (error) {
        console.warn(`[warm-start] stopped: ${error instanceof Error ? error.message : String(error)}`);
      }
    })();
  }, 250);
}
