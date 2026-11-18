/**
 * public/sw.js, run for real in a node:vm sandbox with an in-memory Cache Storage (round 3,
 * phase-5 hardening: privacy-1, privacy-5, robustness-1, trip-offline-1/3/5/7/8). The worker is
 * plain browser JavaScript; these tests dispatch fetch events at it the way a browser does.
 */
import fs from "node:fs";
import path from "node:path";
import vm from "node:vm";
import { describe, expect, it } from "vitest";

const ORIGIN = "https://bayit.example";
const PATH = "/he/account/trips/BT-7K3Q9";
const CODE = "BT-7K3Q9";
const OWNER = "a1b2c3d4e5f6a1b2c3d4e5f6";
const SW = fs.readFileSync(path.join(process.cwd(), "public", "sw.js"), "utf8");

type Store = Map<string, Map<string, Response>>;

function keyOf(request: string | { url: string }): string {
  return new URL(typeof request === "string" ? request : request.url, ORIGIN).pathname;
}

/** A Map-backed CacheStorage (matching by path, like ignoreSearch). */
function fakeCaches() {
  const store: Store = new Map();
  const cacheOf = (entries: Map<string, Response>) => ({
    async match(request: string | { url: string }) {
      const hit = entries.get(keyOf(request));
      return hit ? hit.clone() : undefined;
    },
    async put(request: string | { url: string }, response: Response) {
      entries.set(keyOf(request), response.clone());
    },
    async delete(request: string | { url: string }) {
      return entries.delete(keyOf(request));
    },
    async keys() {
      return [...entries.keys()].map((key) => new Request(ORIGIN + key));
    },
    async addAll() {},
  });
  return {
    store,
    async has(name: string) {
      return store.has(name);
    },
    async open(name: string) {
      if (!store.has(name)) store.set(name, new Map());
      return cacheOf(store.get(name)!);
    },
    async delete(name: string) {
      return store.delete(name);
    },
    async keys() {
      return [...store.keys()];
    },
    async match(request: string | { url: string }) {
      for (const entries of store.values()) {
        const hit = entries.get(keyOf(request));
        if (hit) return hit.clone();
      }
      return undefined;
    },
  };
}

type FetchImpl = (request: unknown) => Promise<Response>;

/** Loads sw.js with this network and a fake clock for its timeout. */
function loadWorker(network: FetchImpl) {
  const caches = fakeCaches();
  const listeners: Record<string, (event: unknown) => void> = {};
  const timers: (() => void)[] = [];
  const self = {
    addEventListener: (type: string, fn: (event: unknown) => void) => (listeners[type] = fn),
    location: { origin: ORIGIN },
    registration: {},
    clients: {},
    skipWaiting() {},
  };
  const context = vm.createContext({
    self,
    caches,
    fetch: network,
    Response,
    Headers,
    Request,
    URL,
    console,
    setTimeout: (fn: () => void) => {
      timers.push(fn);
      return timers.length;
    },
    clearTimeout: () => undefined,
  });
  vm.runInContext(SW, context);
  return {
    caches,
    /** Runs every pending timer (the network timeout). */
    fireTimers: () => timers.splice(0).forEach((fn) => fn()),
    /** A navigation as the browser sends it; resolves with the answer, after every waitUntil. */
    async navigate(url = ORIGIN + PATH, { settle = true }: { settle?: boolean } = {}) {
      const waits: Promise<unknown>[] = [];
      const answers: Promise<Response>[] = [];
      listeners.fetch({
        request: { url, method: "GET", mode: "navigate" },
        preloadResponse: Promise.resolve(undefined),
        respondWith: (promise: Promise<Response>) => answers.push(promise),
        waitUntil: (promise: Promise<unknown>) => waits.push(promise),
      });
      if (answers.length !== 1) throw new Error("not handled");
      const response = await answers[0];
      if (settle) await Promise.all(waits);
      return { response, waits };
    },
  };
}

const today = new Date(Date.now() + 4 * 3600 * 1000).toISOString().slice(0, 10);
const daysFromToday = (days: number) => new Date(Date.parse(`${today}T00:00:00Z`) + days * 86_400_000).toISOString().slice(0, 10);

function entryFor(over: Record<string, unknown> = {}) {
  return {
    path: PATH,
    code: CODE,
    owner: OWNER,
    title: "דירה",
    checkIn: daysFromToday(3),
    checkOut: daysFromToday(5),
    status: "CONFIRMED",
    savedAt: "2026-10-01T10:00:00.000Z",
    keepUntil: daysFromToday(12),
    version: "0123456789abcdef",
    ...over,
  };
}

const COPY = `<html><body><div data-offline-trip="${CODE}" data-offline-saved-at="2026-10-01T10:00:00.000Z">EXACT ADDRESS + HOST PHONE (saved copy)</div></body></html>`;

async function seed(caches: ReturnType<typeof fakeCaches>, entries: Record<string, unknown>[] = [entryFor()]) {
  const cache = await caches.open("bayit-trips");
  for (const entry of entries) {
    await cache.put(String(entry.path), new Response(COPY.replace(CODE, String(entry.code)), { headers: { "Content-Type": "text/html" } }));
  }
  await cache.put("/_next/static/chunks/app-OLD.js", new Response("old js"));
  await cache.put("/offline-trips.json", new Response(JSON.stringify({ trips: entries }), { headers: { "Content-Type": "application/json" } }));
}

async function indexOf(caches: ReturnType<typeof fakeCaches>): Promise<{ path: string }[]> {
  if (!(await caches.has("bayit-trips"))) return [];
  const response = await (await caches.open("bayit-trips")).match("/offline-trips.json");
  return response ? ((await response.json()) as { trips: { path: string }[] }).trips : [];
}

async function pageKept(caches: ReturnType<typeof fakeCaches>, path = PATH): Promise<boolean> {
  return (await caches.has("bayit-trips")) && (await (await caches.open("bayit-trips")).match(path)) !== undefined;
}

const html = (body: string, status = 200) => new Response(`<html><body>${body}</body></html>`, { status, headers: { "Content-Type": "text/html; charset=utf-8" } });
const LIVE = `<div class="grid" data-offline-trip="${CODE}">LIVE PAGE</div>`;

describe("service worker: saved trip pages", () => {
  it("serves the saved copy when the network fails", async () => {
    const worker = loadWorker(async () => {
      throw new TypeError("Failed to fetch");
    });
    await seed(worker.caches);
    const { response } = await worker.navigate();
    expect(await response.text()).toContain("saved copy");
  });

  // robustness-1 / trip-offline-1: a server error keeps the copy AND shows it.
  it.each([500, 502, 503, 504])("a %i keeps the copy and serves it", async (status) => {
    const worker = loadWorker(async () => html("Gateway timeout", status));
    await seed(worker.caches);
    const { response } = await worker.navigate();
    expect(await response.text()).toContain("saved copy");
    expect(await pageKept(worker.caches)).toBe(true);
    expect(await indexOf(worker.caches)).toHaveLength(1);
  });

  it("a 200 page with neither mark (an error page) keeps the copy and serves it", async () => {
    const worker = loadWorker(async () => html("<div>account.error.title</div>"));
    await seed(worker.caches);
    const { response } = await worker.navigate();
    expect(await response.text()).toContain("saved copy");
    expect(await pageKept(worker.caches)).toBe(true);
  });

  it("a non-HTML or opaque answer keeps the copy", async () => {
    const worker = loadWorker(async () => new Response("{}", { status: 200, headers: { "Content-Type": "application/json" } }));
    await seed(worker.caches);
    await worker.navigate();
    expect(await pageKept(worker.caches)).toBe(true);
  });

  it("the 'gone' mark (another account's not found) deletes the copy and shows the live page", async () => {
    const worker = loadWorker(async () => html('<div class="grid gap-2 py-6" data-offline-trip-gone="1">not found</div>'));
    await seed(worker.caches);
    const { response } = await worker.navigate();
    expect(await response.text()).toContain("not found");
    expect(await caches(worker)).toBe(false);
  });

  it("the name of the 'gone' mark inside the page's data stream does NOT delete the copy", async () => {
    const worker = loadWorker(async () => html(`${LIVE}<script>self.__next_f.push([1,"{\\"data-offline-trip-gone\\":\\"1\\"}"])</script>`));
    await seed(worker.caches);
    const { response } = await worker.navigate();
    expect(await response.text()).toContain("LIVE PAGE");
    expect(await pageKept(worker.caches)).toBe(true);
  });

  it.each([401, 403, 404, 410])("a %i deletes the copy", async (status) => {
    const worker = loadWorker(async () => html("nope", status));
    await seed(worker.caches);
    const { response } = await worker.navigate();
    expect(response.status).toBe(status);
    expect(await caches(worker)).toBe(false);
  });

  it("a redirect (signed out: the login page) deletes the copy and is passed to the browser", async () => {
    const redirect = Object.defineProperty(new Response(null, { status: 200 }), "type", { value: "opaqueredirect" });
    const worker = loadWorker(async () => redirect);
    await seed(worker.caches);
    const { response } = await worker.navigate();
    expect(response.type).toBe("opaqueredirect");
    expect(await caches(worker)).toBe(false);
  });

  // trip-offline-8: the cancelled trip page (and a ?report=1 link from the cancellation email).
  it("a cancelled trip page (with ?report=1) deletes the copy", async () => {
    const worker = loadWorker(async () => html(`<div class="grid" data-offline-trip="${CODE}" data-offline-trip-gone="1">CANCELLED_BY_HOST</div>`));
    await seed(worker.caches);
    const { response } = await worker.navigate(`${ORIGIN}${PATH}?report=1`);
    expect(await response.text()).toContain("CANCELLED_BY_HOST");
    expect(await caches(worker)).toBe(false);
  });

  // trip-offline-3: the worker never rewrites the copy (the page refreshes it with its files and index).
  it("the live page is shown as it came and the copy is left as saved", async () => {
    const worker = loadWorker(async () => html(`<script src="/_next/static/chunks/app-NEW.js"></script>${LIVE}`));
    await seed(worker.caches);
    const { response } = await worker.navigate();
    expect(await response.text()).toContain("LIVE PAGE");
    const cache = await worker.caches.open("bayit-trips");
    expect(await (await cache.match(PATH))!.text()).toContain("saved copy");
    expect(await indexOf(worker.caches)).toEqual([entryFor()]);
  });

  // trip-offline-7: a stalled network or a page that breaks off mid-way shows the copy.
  it("shows the copy when the network stalls past the timeout, and still decides later", async () => {
    let answer!: (response: Response) => void;
    const worker = loadWorker(() => new Promise<Response>((resolve) => (answer = resolve)));
    await seed(worker.caches);
    const pending = worker.navigate(undefined, { settle: false });
    await new Promise((resolve) => setTimeout(resolve, 10));
    worker.fireTimers();
    const { response, waits } = await pending;
    expect(await response.text()).toContain("saved copy");
    // The answer arrives late: a "not found" still deletes the copy.
    answer(html('<div data-offline-trip-gone="1">not found</div>'));
    await Promise.all(waits);
    expect(await caches(worker)).toBe(false);
  });

  it("shows the copy when the page breaks off mid-stream", async () => {
    const worker = loadWorker(async () => {
      const body = new ReadableStream({
        start(controller) {
          controller.enqueue(new TextEncoder().encode("<html><head>"));
          setTimeout(() => controller.error(new TypeError("network reset")), 5);
        },
      });
      return new Response(body, { status: 200, headers: { "Content-Type": "text/html" } });
    });
    await seed(worker.caches);
    const { response } = await worker.navigate();
    expect(await response.text()).toContain("saved copy");
    expect(await pageKept(worker.caches)).toBe(true);
  });

  it("a trip page without a saved copy streams the network answer as it is", async () => {
    const worker = loadWorker(async () => html("Gateway timeout", 502));
    const { response } = await worker.navigate();
    expect(response.status).toBe(502);
  });

  // privacy-5 / trip-offline-5: expired copies go on any navigation, not only when a new worker activates.
  it("deletes copies past their last day on any navigation, and never serves them", async () => {
    const other = entryFor({ path: "/he/account/trips/BT-22222", code: "BT-22222" });
    const worker = loadWorker(async () => {
      throw new TypeError("Failed to fetch");
    });
    await seed(worker.caches, [entryFor({ keepUntil: daysFromToday(-1) }), other]);
    const { response } = await worker.navigate();
    expect(await response.text()).not.toContain("saved copy");
    expect(await pageKept(worker.caches)).toBe(false);
    expect((await indexOf(worker.caches)).map((t) => t.path)).toEqual([other.path]);
    expect(await pageKept(worker.caches, other.path)).toBe(true);
  });

  it("deletes the whole cache when the last copy expires (on a navigation to any page)", async () => {
    const worker = loadWorker(async () => html("home"));
    await seed(worker.caches, [entryFor({ keepUntil: daysFromToday(-1) })]);
    await worker.navigate(`${ORIGIN}/he`);
    expect(await caches(worker)).toBe(false);
  });

  // privacy-1: copies saved before owners existed are never served, and are deleted.
  it("ignores and deletes an entry without an owner", async () => {
    const { owner: _owner, ...legacy } = entryFor();
    void _owner;
    const worker = loadWorker(async () => {
      throw new TypeError("Failed to fetch");
    });
    await seed(worker.caches, [legacy]);
    const { response } = await worker.navigate();
    expect(await response.text()).not.toContain("saved copy");
    expect(await caches(worker)).toBe(false);
  });

  it("other pages never touch the saved copy and fall back to the offline page", async () => {
    const worker = loadWorker(async () => {
      throw new TypeError("Failed to fetch");
    });
    await seed(worker.caches);
    const { response } = await worker.navigate(`${ORIGIN}/he/account`);
    expect(response.status).toBe(503);
    expect(await pageKept(worker.caches)).toBe(true);
  });
});

async function caches(worker: ReturnType<typeof loadWorker>): Promise<boolean> {
  return worker.caches.has("bayit-trips");
}
