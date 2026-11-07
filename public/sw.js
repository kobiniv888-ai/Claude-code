/*
 * Bayit service worker — makes the site installable and gives a friendly offline page.
 *
 * - /_next/static, /icons and /brand: cache-first (file names are versioned or rarely change).
 * - Page navigations: always from the network; when offline, /offline.html is shown instead.
 *   Pages are never cached automatically: they can contain the signed-in user's data.
 * - Saved trips (round 3, brief 7.1, "שמירה לשימוש בלי אינטרנט"): only after the guest taps the
 *   button, the trip page itself puts a copy of ITS page and its static files into the cache
 *   TRIPS_CACHE, with an index naming the account that saved it (src/lib/trip/offline-device.ts,
 *   rules in src/lib/trip/offline.ts). For a navigation to a trip page address (TRIP_PAGE, nothing
 *   else) the network still comes first; when that page has a saved copy, the whole answer is
 *   awaited (at most TRIP_NETWORK_TIMEOUT_MS) and the copy is shown instead when the network
 *   fails, stalls, breaks off mid-page, answers with a server error or with a page carrying
 *   neither trip mark (an error page). Kept until a week after check-out (pruned on every
 *   navigation). The copy is deleted only on positive evidence that it is no longer this device's
 *   to keep: a redirect (signed out), 401/403/404/410, or the "gone" mark (another account's "not
 *   found", a cancelled trip). This worker never rewrites a copy: the page refreshes it (with its
 *   files and the index). Every page also checks the owner of the copies (PrivateCacheGuard), and
 *   logging out deletes the whole cache (src/lib/auth/device-data.ts).
 * - /api and everything else: not handled (straight to the network), never cached.
 * - Push (round 3, booking alerts): shows the notification the server sent (src/lib/alerts/push.ts:
 *   { title, body, url, tag }); a click opens or focuses that page of this site.
 *
 * Bump VERSION whenever offline.html, the icons or the brand files change.
 */
const VERSION = "v4";
const STATIC_CACHE = `bayit-static-${VERSION}`;
const OFFLINE_URL = "/offline.html";
const PRECACHE = [OFFLINE_URL, "/brand/bayit-app-icon.svg", "/icons/icon-192.png"];

// Saved trips — keep equal to src/lib/trip/offline.ts (OFFLINE_TRIPS_CACHE, OFFLINE_TRIPS_INDEX,
// TRIP_PAGE_PATTERN, OFFLINE_TRIP_MARKER, OFFLINE_TRIP_GONE_MARKER); src/lib/trip/trip.test.ts
// checks it and src/lib/trip/sw.test.ts runs this file.
const TRIPS_CACHE = "bayit-trips";
const TRIPS_INDEX = "/offline-trips.json";
const TRIP_PAGE = new RegExp("^/(he|en|ru|ar|ka)/account/trips/BT-[23456789ABCDEFGHJKLMNPQRSTUVWXYZ]{5}$");
const TRIP_MARKER = "data-offline-trip";
// As written in HTML (the page's data stream mentions the name in another form).
const TRIP_GONE_MARK = 'data-offline-trip-gone="1"';
// A trip page with a saved copy waits this long for the whole answer before the copy is shown.
const TRIP_NETWORK_TIMEOUT_MS = 8000;
// Never copied onto a buffered answer (its body is already decoded).
const DROPPED_HEADERS = ["Content-Encoding", "Content-Length", "Transfer-Encoding"];

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches
      .open(STATIC_CACHE)
      .then((cache) => cache.addAll(PRECACHE.map((url) => new Request(url, { cache: "reload" }))))
      .then(() => self.skipWaiting()),
  );
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    (async () => {
      const keys = await caches.keys();
      await Promise.all(
        keys
          .filter((key) => key.startsWith("bayit-") && key !== STATIC_CACHE && key !== TRIPS_CACHE)
          .map((key) => caches.delete(key)),
      );
      await pruneSavedTrips().catch(() => undefined);
      if (self.registration.navigationPreload) await self.registration.navigationPreload.enable();
      await self.clients.claim();
    })(),
  );
});

function isStaticAsset(url) {
  return (
    url.pathname.startsWith("/_next/static/") ||
    url.pathname.startsWith("/icons/") ||
    url.pathname.startsWith("/brand/")
  );
}

async function cacheFirst(request) {
  const cache = await caches.open(STATIC_CACHE);
  const cached = await cache.match(request);
  if (cached) return cached;
  // A saved trip keeps the files its page needs (they may be gone from the static cache).
  if (await caches.has(TRIPS_CACHE)) {
    const saved = await (await caches.open(TRIPS_CACHE)).match(request);
    if (saved) return saved;
  }
  const response = await fetch(request);
  if (response.ok && response.type === "basic") cache.put(request, response.clone());
  return response;
}

// ─── Saved trips ───────────────────────────────────────────────

/** Today in Georgia (UTC+4 all year), "YYYY-MM-DD" — like src/lib/booking/dates.ts tbilisiToday. */
function georgiaToday() {
  return new Date(Date.now() + 4 * 3600 * 1000).toISOString().slice(0, 10);
}

/** A usable index entry: a trip page, the account that saved it, a last day. */
function validTrip(t) {
  return !!t && typeof t.path === "string" && TRIP_PAGE.test(t.path) && typeof t.owner === "string" && t.owner.length > 0 && typeof t.keepUntil === "string";
}

/** The raw index list (null when there is no index). */
async function readRawTripIndex(cache) {
  try {
    const response = await cache.match(TRIPS_INDEX);
    if (!response) return null;
    const data = await response.json();
    return data && Array.isArray(data.trips) ? data.trips : [];
  } catch {
    return [];
  }
}

async function readTripIndex(cache) {
  return ((await readRawTripIndex(cache)) || []).filter(validTrip);
}

async function writeTripIndex(cache, trips) {
  if (trips.length === 0) {
    await caches.delete(TRIPS_CACHE);
    return;
  }
  await cache.put(TRIPS_INDEX, new Response(JSON.stringify({ trips }), { headers: { "Content-Type": "application/json" } }));
}

/** Removes one saved page (and the whole cache with the last one). */
async function forgetSavedTrip(path) {
  if (!(await caches.has(TRIPS_CACHE))) return;
  const cache = await caches.open(TRIPS_CACHE);
  await cache.delete(path, { ignoreSearch: true, ignoreVary: true });
  const trips = await readTripIndex(cache);
  await writeTripIndex(cache, trips.filter((t) => t.path !== path));
}

/**
 * Drops copies kept past their last day (a week after check-out) and entries without an owner
 * (saved before owners existed), with their pages. Runs on every navigation: cheap when there is
 * nothing to drop (one check, one read, no write). Without an index nothing is touched (a save
 * may be under way).
 */
async function pruneSavedTrips() {
  if (!(await caches.has(TRIPS_CACHE))) return;
  const cache = await caches.open(TRIPS_CACHE);
  const raw = await readRawTripIndex(cache);
  if (raw === null) return;
  const today = georgiaToday();
  const keep = (list) => list.filter((t) => validTrip(t) && t.keepUntil >= today);
  if (keep(raw).length === raw.length) return;
  for (const t of raw) {
    if (!keep([t]).length && t && typeof t.path === "string" && TRIP_PAGE.test(t.path)) {
      await cache.delete(t.path, { ignoreSearch: true, ignoreVary: true });
    }
  }
  // Read again just before writing (a page may have saved a copy meanwhile).
  await writeTripIndex(cache, keep((await readRawTripIndex(cache)) || []));
}

/** The saved copy of a trip page, if the guest saved it and it is still kept. */
async function savedTripPage(path) {
  if (!(await caches.has(TRIPS_CACHE))) return null;
  const cache = await caches.open(TRIPS_CACHE);
  const entry = (await readTripIndex(cache)).find((t) => t.path === path);
  if (!entry || entry.keepUntil < georgiaToday()) return null;
  return (await cache.match(path, { ignoreSearch: true, ignoreVary: true })) || null;
}

/** The trip page itself, as HTML, from this address (not a redirect, an error or another page). */
function isTripHtml(path, response) {
  const type = response.headers.get("Content-Type") || "";
  const finalPath = response.url ? new URL(response.url).pathname : path;
  return response.status === 200 && response.type !== "opaqueredirect" && !response.redirected && finalPath === path && type.includes("text/html");
}

/**
 * Positive evidence that a saved copy is no longer this device's to keep: a redirect (over TLS
 * only our server sends one: the login page for a signed-out visitor), 401/403/404/410, or the
 * "gone" mark (another account's "not found", a cancelled trip, past the keep window). A server
 * error, a page without any mark (an error page) or a broken answer keep the copy.
 */
function tripPageGone(path, response, html) {
  if (response.type === "opaqueredirect" || (response.status >= 300 && response.status < 400)) return true;
  if (response.redirected && response.url && new URL(response.url).pathname !== path) return true;
  if ([401, 403, 404, 410].includes(response.status)) return true;
  return typeof html === "string" && html.includes(TRIP_GONE_MARK);
}

/** The answer's headers for a buffered copy of it. */
function bufferedHeaders(response) {
  const headers = new Headers(response.headers);
  for (const name of DROPPED_HEADERS) headers.delete(name);
  return headers;
}

function withTimeout(promise, ms) {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error("timeout")), ms);
    promise.then(
      (value) => {
        clearTimeout(timer);
        resolve(value);
      },
      (error) => {
        clearTimeout(timer);
        reject(error);
      },
    );
  });
}

async function offlinePage() {
  const cache = await caches.open(STATIC_CACHE);
  const offline = await cache.match(OFFLINE_URL);
  return offline || new Response("Offline", { status: 503, headers: { "Content-Type": "text/plain" } });
}

async function networkWithOfflineFallback(event) {
  const url = new URL(event.request.url);
  const network = Promise.resolve(event.preloadResponse).then((preloaded) => preloaded || fetch(event.request));
  // Not a saved trip: the network answer as it streams in.
  const saved = TRIP_PAGE.test(url.pathname) ? await savedTripPage(url.pathname).catch(() => null) : null;
  if (!saved) {
    try {
      return await network;
    } catch {
      return offlinePage();
    }
  }
  const path = url.pathname;
  // A saved trip: wait for the whole page (a weak link that stalls or breaks off mid-page shows
  // the copy instead of a half-loaded page), and keep deciding about the copy even when the
  // answer comes after the copy was shown.
  const answer = network.then(async (response) => ({ response, html: isTripHtml(path, response) ? await response.text() : null }));
  event.waitUntil(
    answer
      .then(({ response, html }) => (tripPageGone(path, response, html) ? forgetSavedTrip(path) : undefined))
      .catch(() => undefined),
  );
  try {
    const { response, html } = await withTimeout(answer, TRIP_NETWORK_TIMEOUT_MS);
    if (html !== null) {
      // The live trip page or its "gone" page; an error page without any mark → the copy.
      if (html.includes(`${TRIP_MARKER}="${path.slice(path.lastIndexOf("/") + 1)}"`) || html.includes(TRIP_GONE_MARK)) {
        return new Response(html, { status: response.status, statusText: response.statusText, headers: bufferedHeaders(response) });
      }
      return saved;
    }
    if (response.status >= 500) return saved;
    return response;
  } catch {
    return saved;
  }
}

self.addEventListener("fetch", (event) => {
  const { request } = event;
  if (request.method !== "GET") return;

  const url = new URL(request.url);
  if (url.origin !== self.location.origin) return;
  if (url.pathname.startsWith("/api/")) return;

  if (request.mode === "navigate") {
    // Saved trips past their last day go, whatever page is opened.
    event.waitUntil(pruneSavedTrips().catch(() => undefined));
    event.respondWith(networkWithOfflineFallback(event));
    return;
  }

  if (isStaticAsset(url)) {
    event.respondWith(cacheFirst(request));
  }
});

// ─── Booking alerts (browser / app notifications) ──────────────

/** Only paths on this site are opened from a notification. */
function sameSiteUrl(value) {
  try {
    const url = new URL(typeof value === "string" ? value : "/", self.location.origin);
    return url.origin === self.location.origin ? url.href : self.location.origin + "/";
  } catch {
    return self.location.origin + "/";
  }
}

self.addEventListener("push", (event) => {
  let data = {};
  try {
    data = event.data ? event.data.json() : {};
  } catch {
    data = { body: event.data ? event.data.text() : "" };
  }
  const title = typeof data.title === "string" && data.title ? data.title : "Bayit";
  event.waitUntil(
    self.registration.showNotification(title, {
      body: typeof data.body === "string" ? data.body : "",
      icon: "/icons/icon-192.png",
      badge: "/icons/icon-192.png",
      tag: typeof data.tag === "string" && data.tag ? data.tag : undefined,
      renotify: typeof data.tag === "string" && data.tag.length > 0,
      data: { url: sameSiteUrl(data.url) },
      lang: typeof data.lang === "string" ? data.lang : undefined,
    }),
  );
});

self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  const target = sameSiteUrl(event.notification.data && event.notification.data.url);
  event.waitUntil(
    (async () => {
      const windows = await self.clients.matchAll({ type: "window", includeUncontrolled: true });
      for (const client of windows) {
        if (client.url === target && "focus" in client) return client.focus();
      }
      for (const client of windows) {
        if (new URL(client.url).origin !== self.location.origin || !("navigate" in client)) continue;
        try {
          const navigated = await client.navigate(target);
          if (navigated) return navigated.focus();
        } catch {
          // A page this worker doesn't control can't be navigated: open a new one below.
        }
      }
      return self.clients.openWindow(target);
    })(),
  );
});
