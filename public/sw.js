/*
 * Bayit service worker — makes the site installable and gives a friendly offline page.
 *
 * - /_next/static, /icons and /brand: cache-first (file names are versioned or rarely change).
 * - Page navigations: always from the network; when offline, /offline.html is shown instead.
 *   Pages are never cached automatically: they can contain the signed-in user's data.
 * - Saved trips (round 3, brief 7.1, "שמירה לשימוש בלי אינטרנט"): only after the guest taps the
 *   button, the trip page itself puts a copy of ITS page and its static files into the cache
 *   TRIPS_CACHE (src/components/trip/offline-save.tsx, rules in src/lib/trip/offline.ts). For a
 *   navigation to a trip page address (TRIP_PAGE, nothing else) the network still comes first;
 *   the saved copy opens only when the network fails, until a week after check-out. A visit
 *   online refreshes a saved copy; a "not found" or a redirect (another account, signed out)
 *   deletes it. Logging out deletes the whole cache (src/lib/auth/device-data.ts).
 * - /api and everything else: not handled (straight to the network), never cached.
 * - Push (round 3, booking alerts): shows the notification the server sent (src/lib/alerts/push.ts:
 *   { title, body, url, tag }); a click opens or focuses that page of this site.
 *
 * Bump VERSION whenever offline.html, the icons or the brand files change.
 */
const VERSION = "v3";
const STATIC_CACHE = `bayit-static-${VERSION}`;
const OFFLINE_URL = "/offline.html";
const PRECACHE = [OFFLINE_URL, "/brand/bayit-app-icon.svg", "/icons/icon-192.png"];

// Saved trips — keep equal to src/lib/trip/offline.ts (OFFLINE_TRIPS_CACHE, OFFLINE_TRIPS_INDEX,
// TRIP_PAGE_PATTERN); src/lib/trip/offline.test.ts checks it.
const TRIPS_CACHE = "bayit-trips";
const TRIPS_INDEX = "/offline-trips.json";
const TRIP_PAGE = new RegExp("^/(he|en|ru|ar|ka)/account/trips/BT-[23456789ABCDEFGHJKLMNPQRSTUVWXYZ]{5}$");
const TRIP_MARKER = "data-offline-trip";
// Kept with a saved page (src/lib/trip/offline.ts OFFLINE_PAGE_HEADERS): never cookies or caching headers.
const TRIP_PAGE_HEADERS = ["Content-Type", "Content-Security-Policy", "X-Content-Type-Options", "X-Frame-Options", "Referrer-Policy", "Permissions-Policy"];

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

async function readTripIndex(cache) {
  try {
    const response = await cache.match(TRIPS_INDEX);
    const data = response ? await response.json() : null;
    return data && Array.isArray(data.trips) ? data.trips.filter((t) => t && typeof t.path === "string" && TRIP_PAGE.test(t.path)) : [];
  } catch {
    return [];
  }
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

/** Drops copies kept past their last day (a week after check-out). */
async function pruneSavedTrips() {
  if (!(await caches.has(TRIPS_CACHE))) return;
  const cache = await caches.open(TRIPS_CACHE);
  const today = georgiaToday();
  const trips = await readTripIndex(cache);
  const keep = trips.filter((t) => typeof t.keepUntil === "string" && t.keepUntil >= today);
  for (const t of trips) if (!keep.includes(t)) await cache.delete(t.path, { ignoreSearch: true, ignoreVary: true });
  await writeTripIndex(cache, keep);
}

/** The saved copy of a trip page, if the guest saved it and it is still kept. */
async function savedTripPage(path) {
  if (!(await caches.has(TRIPS_CACHE))) return null;
  const cache = await caches.open(TRIPS_CACHE);
  const entry = (await readTripIndex(cache)).find((t) => t.path === path);
  if (!entry || typeof entry.keepUntil !== "string" || entry.keepUntil < georgiaToday()) return null;
  return (await cache.match(path, { ignoreSearch: true, ignoreVary: true })) || null;
}

/**
 * After a trip page came from the network: refresh the saved copy (a plain visit, no ?booked=1),
 * or delete it when the page is no longer this device's to keep: another account ("not found"),
 * signed out (the login page), an error. Account pages stream with HTTP 200 even then, so the
 * test is the trip's mark in the HTML (src/lib/trip/offline.ts OFFLINE_TRIP_MARKER).
 */
async function updateSavedTrip(path, search, response) {
  if (!(await caches.has(TRIPS_CACHE))) return;
  const cache = await caches.open(TRIPS_CACHE);
  if (!(await readTripIndex(cache)).some((t) => t.path === path)) return;
  const finalPath = response.url ? new URL(response.url).pathname : path;
  const type = response.headers.get("Content-Type") || "";
  const code = path.slice(path.lastIndexOf("/") + 1);
  const html = response.status === 200 && type.includes("text/html") && !response.redirected && finalPath === path ? await response.text() : "";
  if (!html.includes(`${TRIP_MARKER}="${code}"`)) {
    await forgetSavedTrip(path);
    return;
  }
  if (search) return;
  const headers = new Headers();
  for (const name of TRIP_PAGE_HEADERS) {
    const value = response.headers.get(name);
    if (value) headers.set(name, value);
  }
  await cache.put(path, new Response(html, { headers }));
}

async function networkWithOfflineFallback(event) {
  const url = new URL(event.request.url);
  const tripPage = TRIP_PAGE.test(url.pathname);
  try {
    const preloaded = await event.preloadResponse;
    const response = preloaded || (await fetch(event.request));
    if (tripPage) event.waitUntil(updateSavedTrip(url.pathname, url.search, response.clone()).catch(() => undefined));
    return response;
  } catch {
    if (tripPage) {
      const saved = await savedTripPage(url.pathname).catch(() => null);
      if (saved) return saved;
    }
    const cache = await caches.open(STATIC_CACHE);
    const offline = await cache.match(OFFLINE_URL);
    return offline || new Response("Offline", { status: 503, headers: { "Content-Type": "text/plain" } });
  }
}

self.addEventListener("fetch", (event) => {
  const { request } = event;
  if (request.method !== "GET") return;

  const url = new URL(request.url);
  if (url.origin !== self.location.origin) return;
  if (url.pathname.startsWith("/api/")) return;

  if (request.mode === "navigate") {
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
