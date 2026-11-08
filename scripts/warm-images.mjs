#!/usr/bin/env node
/**
 * Warms the production server's caches right after `next start` (bug 8.10: "photos took about
 * 4 seconds to sharpen"). The image optimizer converts each photo to WebP (the only format: AVIF
 * is off, SECURITY_REPORT 2.2.b) at each width on its first request, so the very first visitor
 * waits for every photo on the screen. This script opens the main pages once (which also renders
 * them) and requests the WebP version of every photo width a phone or a laptop picks, two at a
 * time, so that later visitors get them from the cache (.next/cache/images).
 *
 *   node scripts/warm-images.mjs [base-url]      (default http://localhost:3000)
 *
 * .devcontainer/start.sh --prod runs it in the background after the server answers. It only
 * reads pages; it is safe to stop at any time.
 */

const base = (process.argv[2] ?? process.env.WARM_BASE_URL ?? "http://localhost:3000").replace(/\/+$/, "");
const MAX_WIDTH = 1200; // phones (up to 3x) and laptops; the 1920+ variants are made on demand
const CONCURRENCY = 2;
const MAX_LISTINGS = 12;

const PAGES = ["/he", "/en", "/ru", "/ar", "/ka", "/he/search", "/he/search?city=tbilisi", "/he/search?city=batumi", "/he/rent", "/he/buy", "/he/hotels", "/he/jewish-life"];

async function get(path, headers = {}) {
  const started = Date.now();
  const response = await fetch(base + path, { headers: { "user-agent": "bayit-warm-cache", ...headers }, redirect: "follow" });
  const body = Buffer.from(await response.arrayBuffer());
  return { status: response.status, body, ms: Date.now() - started };
}

const decode = (value) => value.replaceAll("&amp;", "&");

/** Every /_next/image URL in the page's src and srcset attributes, up to MAX_WIDTH. */
function imageUrls(html) {
  const urls = new Set();
  for (const match of html.matchAll(/(?:src|srcSet|srcset)="([^"]+)"/g)) {
    for (const candidate of decode(match[1]).split(",")) {
      const url = candidate.trim().split(/\s+/)[0];
      if (!url.startsWith("/_next/image?")) continue;
      const width = Number(new URL(url, base).searchParams.get("w"));
      if (width && width <= MAX_WIDTH) urls.add(url);
    }
  }
  return urls;
}

async function main() {
  const startedAt = Date.now();
  const images = new Set();
  const listings = new Set();
  for (const path of PAGES) {
    try {
      const page = await get(path);
      const html = page.body.toString("utf8");
      for (const url of imageUrls(html)) images.add(url);
      for (const match of html.matchAll(/href="(\/he\/listing\/\d+-[^"?#]+)"/g)) listings.add(match[1]);
      console.log(`page ${page.status} ${page.ms}ms ${path}`);
    } catch (error) {
      console.log(`page failed ${path}: ${error.message}`);
    }
  }
  for (const path of [...listings].slice(0, MAX_LISTINGS)) {
    try {
      const page = await get(path);
      for (const url of imageUrls(page.body.toString("utf8"))) images.add(url);
      console.log(`page ${page.status} ${page.ms}ms ${path}`);
    } catch (error) {
      console.log(`page failed ${path}: ${error.message}`);
    }
  }

  const queue = [...images];
  let done = 0;
  let slow = 0;
  async function worker() {
    for (let url = queue.shift(); url; url = queue.shift()) {
      try {
        const image = await get(url, { accept: "image/webp,image/*,*/*;q=0.8" });
        if (image.ms > 300) slow++;
      } catch {
        // The server may be restarting; the next visitor makes this one.
      }
      done++;
    }
  }
  await Promise.all(Array.from({ length: CONCURRENCY }, worker));
  console.log(`warmed ${done} photo sizes (${slow} were encoded now) in ${Math.round((Date.now() - startedAt) / 1000)}s`);
}

main().catch((error) => {
  console.log(`warm-up stopped: ${error.message}`);
});
