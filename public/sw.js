/*
 * Bayit service worker — makes the site installable and gives a friendly offline page.
 *
 * - /_next/static, /icons and /brand: cache-first (file names are versioned or rarely change).
 * - Page navigations: always from the network; when offline, /offline.html is shown instead.
 *   Pages are never cached: they can contain the signed-in user's data.
 * - /api and everything else: not handled (straight to the network).
 * - Push (round 3, booking alerts): shows the notification the server sent (src/lib/alerts/push.ts:
 *   { title, body, url, tag }); a click opens or focuses that page of this site.
 *
 * Bump VERSION whenever offline.html, the icons or the brand files change.
 */
const VERSION = "v2";
const STATIC_CACHE = `bayit-static-${VERSION}`;
const OFFLINE_URL = "/offline.html";
const PRECACHE = [OFFLINE_URL, "/brand/bayit-app-icon.svg", "/icons/icon-192.png"];

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
        keys.filter((key) => key.startsWith("bayit-") && key !== STATIC_CACHE).map((key) => caches.delete(key)),
      );
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
  const response = await fetch(request);
  if (response.ok && response.type === "basic") cache.put(request, response.clone());
  return response;
}

async function networkWithOfflineFallback(event) {
  try {
    const preloaded = await event.preloadResponse;
    if (preloaded) return preloaded;
    return await fetch(event.request);
  } catch {
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
