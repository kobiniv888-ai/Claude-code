#!/usr/bin/env node
/**
 * Development-server warm-up: opens the main pages once, with their scripts and styles, so the
 * first real visit (on the phone) doesn't wait while each page is built. The development server
 * builds every page the first time it is opened, which takes minutes in a codespace. The built
 * pages are also kept on disk for the next start.
 *
 *   node scripts/warm-dev.mjs http://localhost:3000
 *
 * .devcontainer/start.sh runs it in the background after a development start (log:
 * /tmp/bayit-warm.log). Signed out on purpose: it never logs in or sends a login code, so it can't
 * use up a demo account's code limit. The admin pages answer with a redirect then, which still
 * builds them on the server.
 */
const base = (process.argv[2] ?? "http://localhost:3000").replace(/\/$/, "");

/** In the order a visitor (or the founder, checking listings) usually goes. */
const PAGES = [
  "/he",
  "/en",
  "/he/login",
  "/api/auth/get-session",
  "/he/admin",
  "/he/admin/moderation",
  "/he/search?city=tbilisi",
  "/he/account",
  "/he/account/listings",
  "/he/post",
  "/he/jewish-life",
];

const TIMEOUT_MS = 300_000;
const ASSET_CONCURRENCY = 4;

async function get(path) {
  const started = Date.now();
  try {
    const res = await fetch(base + path, { redirect: "manual", signal: AbortSignal.timeout(TIMEOUT_MS) });
    const body = res.headers.get("content-type")?.includes("text/html") ? await res.text() : (await res.arrayBuffer(), "");
    return { status: res.status, body, ms: Date.now() - started };
  } catch (error) {
    return { status: 0, body: "", ms: Date.now() - started, error: String(error?.message ?? error) };
  }
}

/** Script and style files of a page (/_next/static/…), so the browser parts are built too. */
function assetsOf(html) {
  const found = new Set();
  for (const match of html.matchAll(/(?:src|href)="(\/_next\/static\/[^"]+\.(?:js|css))"/g)) found.add(match[1]);
  return [...found];
}

async function warmAssets(paths) {
  const queue = [...paths];
  const worker = async () => {
    while (queue.length > 0) await get(queue.shift());
  };
  await Promise.all(Array.from({ length: ASSET_CONCURRENCY }, worker));
}

const seenAssets = new Set();
async function warm(path) {
  const page = await get(path);
  const fresh = assetsOf(page.body).filter((asset) => !seenAssets.has(asset));
  fresh.forEach((asset) => seenAssets.add(asset));
  const assetsStarted = Date.now();
  await warmAssets(fresh);
  const note = page.error ? ` (${page.error})` : "";
  console.log(
    `${String(page.status).padEnd(3)} ${path.padEnd(28)} ${(page.ms / 1000).toFixed(1)}s` +
      (fresh.length ? ` + ${fresh.length} files ${((Date.now() - assetsStarted) / 1000).toFixed(1)}s` : "") +
      note,
  );
  return page;
}

const started = Date.now();
for (const path of PAGES) {
  const page = await warm(path);
  // The search page links to listings: warm the first one too (the listing page).
  if (path.startsWith("/he/search")) {
    const listing = page.body.match(/href="(\/he\/listing\/[^"?#]+)"/)?.[1];
    if (listing) await warm(listing);
  }
}
console.log(`Main pages ready in ${Math.round((Date.now() - started) / 1000)}s.`);
