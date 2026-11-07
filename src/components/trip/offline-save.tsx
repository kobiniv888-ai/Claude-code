"use client";

import { useCallback, useEffect, useState } from "react";
import { useLocale, useTranslations } from "next-intl";
import { CircleCheckIcon, CloudDownloadIcon, Trash2Icon, WifiOffIcon } from "lucide-react";
import { Button } from "@/components/ds/button";
import { SPRITE_URL } from "@/components/ds/sprite-icons.generated";
import { formatDate, formatTime } from "@/lib/format";
import { toast } from "@/lib/toast";
import {
  OFFLINE_TRIPS_CACHE,
  OFFLINE_TRIPS_INDEX,
  hasTripMarker,
  isTripPagePath,
  offlineAssetUrls,
  offlinePageHeaders,
  offlineKeepUntil,
  parseOfflineIndex,
  withOfflineEntry,
  type OfflineTripEntry,
} from "@/lib/trip/offline";

/**
 * "שמירה לשימוש בלי אינטרנט" (round 3, brief 7.1, founder's answer 10: on a tap, never by itself).
 * The rules are in src/lib/trip/offline.ts; public/sw.js opens the saved copy when the network
 * fails. Text: trips.offline.
 */

export type OfflineTripProps = {
  /** The canonical page address with its language: "/he/account/trips/BT-7K3Q9". */
  path: string;
  code: string;
  title: string;
  checkIn: string;
  checkOut: string;
  status: string;
};

function cacheSupported(): boolean {
  return typeof window !== "undefined" && window.isSecureContext && "caches" in window && "serviceWorker" in navigator;
}

/** The service worker that would open the copy offline (it registers on page load in production). */
async function hasServiceWorker(): Promise<boolean> {
  if (await navigator.serviceWorker.getRegistration("/").catch(() => undefined)) return true;
  const ready = navigator.serviceWorker.ready.then(() => true).catch(() => false);
  return Promise.race([ready, new Promise<boolean>((resolve) => window.setTimeout(() => resolve(false), 5000))]);
}

async function readIndex(cache: Cache): Promise<OfflineTripEntry[]> {
  const response = await cache.match(OFFLINE_TRIPS_INDEX);
  return response ? parseOfflineIndex(await response.json().catch(() => null)) : [];
}

async function writeIndex(cache: Cache, entries: OfflineTripEntry[]): Promise<void> {
  if (entries.length === 0) {
    await caches.delete(OFFLINE_TRIPS_CACHE);
    return;
  }
  await cache.put(OFFLINE_TRIPS_INDEX, new Response(JSON.stringify({ trips: entries }), { headers: { "Content-Type": "application/json" } }));
}

async function savedEntry(path: string): Promise<OfflineTripEntry | null> {
  if (!(await caches.has(OFFLINE_TRIPS_CACHE))) return null;
  return (await readIndex(await caches.open(OFFLINE_TRIPS_CACHE))).find((entry) => entry.path === path) ?? null;
}

/** The static files this page loaded: scripts, styles, fonts and the icon sprite (same origin only). */
function pageAssets(): string[] {
  const urls = [
    ...performance.getEntriesByType("resource").map((entry) => entry.name),
    ...Array.from(document.querySelectorAll<HTMLScriptElement>("script[src]"), (script) => script.src),
    ...Array.from(document.querySelectorAll<HTMLLinkElement>("link[href]"))
      .filter((link) => /(^|\s)(stylesheet|preload|modulepreload)(\s|$)/.test(link.rel))
      .map((link) => link.href),
    new URL(SPRITE_URL, location.origin).href,
  ];
  return offlineAssetUrls(urls, location.origin);
}

/** Saves a fresh copy of this page (from the server, as this account sees it) and its files. */
async function savePage(props: OfflineTripProps): Promise<OfflineTripEntry> {
  if (!isTripPagePath(props.path)) throw new Error("not_a_trip_page");
  const response = await fetch(props.path, { credentials: "same-origin", cache: "no-store", headers: { Accept: "text/html" } });
  const type = response.headers.get("Content-Type") ?? "";
  if (!response.ok || response.redirected || new URL(response.url).pathname !== props.path || !type.includes("text/html")) {
    throw new Error("page_not_saved");
  }
  const html = await response.text();
  if (!hasTripMarker(html, props.code)) throw new Error("page_not_saved");
  const cache = await caches.open(OFFLINE_TRIPS_CACHE);
  await cache.put(props.path, new Response(html, { headers: offlinePageHeaders(response.headers) }));
  await Promise.all(
    pageAssets().map(async (url) => {
      try {
        const cached = await caches.match(url);
        if (cached) await cache.put(url, cached);
        else await cache.add(url);
      } catch {
        // A file that can't be saved now: the page may look plainer offline, it still opens.
      }
    }),
  );
  const entry: OfflineTripEntry = {
    path: props.path,
    code: props.code,
    title: props.title,
    checkIn: props.checkIn,
    checkOut: props.checkOut,
    status: props.status,
    savedAt: new Date().toISOString(),
    keepUntil: offlineKeepUntil(props.checkOut),
  };
  await writeIndex(cache, withOfflineEntry(await readIndex(cache), entry));
  return entry;
}

async function removePage(path: string): Promise<void> {
  if (!(await caches.has(OFFLINE_TRIPS_CACHE))) return;
  const cache = await caches.open(OFFLINE_TRIPS_CACHE);
  await cache.delete(path);
  await writeIndex(cache, (await readIndex(cache)).filter((entry) => entry.path !== path));
}

function useSavedAt() {
  const locale = useLocale();
  return (iso: string) => ({ date: formatDate(iso, locale, { day: "numeric", month: "long" }), time: formatTime(iso, locale) });
}

type State = "checking" | "unsupported" | "idle" | "saving" | "saved" | "removing";

/** The card part: what the button does in plain words, the button, and the saved state. */
export function OfflineSave(props: OfflineTripProps) {
  const t = useTranslations("trips.offline");
  const savedAt = useSavedAt();
  const [state, setState] = useState<State>("checking");
  const [entry, setEntry] = useState<OfflineTripEntry | null>(null);
  const [error, setError] = useState(false);

  useEffect(() => {
    let alive = true;
    (async () => {
      if (!cacheSupported() || !(await hasServiceWorker())) {
        if (alive) setState("unsupported");
        return;
      }
      let saved = await savedEntry(props.path).catch(() => null);
      // The booking changed since the copy was saved (cancelled, completed): keep the copy current.
      if (saved && saved.status !== props.status && navigator.onLine) saved = await savePage(props).catch(() => saved);
      if (!alive) return;
      setEntry(saved);
      setState(saved ? "saved" : "idle");
    })();
    return () => {
      alive = false;
    };
    // Re-check when the page's data changes (router.refresh after a cancellation).
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [props.path, props.status]);

  const save = useCallback(async () => {
    setError(false);
    setState("saving");
    try {
      const saved = await savePage(props);
      setEntry(saved);
      setState("saved");
      toast.success(t("savedToast"));
    } catch {
      setError(true);
      setState("idle");
    }
  }, [props, t]);

  const remove = useCallback(async () => {
    setState("removing");
    await removePage(props.path).catch(() => undefined);
    setEntry(null);
    setState("idle");
    toast.success(t("removed"));
  }, [props.path, t]);

  if (state === "unsupported") {
    return <p className="text-small text-muted-foreground">{t("unsupported")}</p>;
  }

  const saved = state === "saved" || state === "removing";
  return (
    <div className="grid gap-3">
      {saved && entry ? (
        <div role="status" className="flex items-start gap-2 rounded-input bg-success/10 p-3 text-small">
          <CircleCheckIcon className="mt-0.5 size-5 shrink-0 text-success" aria-hidden />
          <span className="grid gap-0.5">
            <span className="font-medium text-foreground">{t("saved")}</span>
            <span className="text-caption text-muted-foreground">{t("savedAt", savedAt(entry.savedAt))}</span>
          </span>
        </div>
      ) : (
        <p className="text-small text-muted-foreground">{t("text")}</p>
      )}
      {error ? (
        <p role="alert" className="text-small text-destructive">
          {t("failed")}
        </p>
      ) : null}
      {saved ? (
        <Button variant="secondary" size="md" className="justify-self-start" onClick={remove} disabled={state === "removing"} aria-busy={state === "removing" || undefined}>
          <Trash2Icon aria-hidden />
          {state === "removing" ? t("removing") : t("remove")}
        </Button>
      ) : (
        <Button
          variant="soft"
          size="md"
          className="h-auto min-h-12 justify-self-start py-2 text-start whitespace-normal"
          onClick={save}
          disabled={state !== "idle"}
          aria-busy={state === "saving" || undefined}
        >
          <CloudDownloadIcon aria-hidden />
          {state === "saving" ? t("saving") : t("save")}
        </Button>
      )}
    </div>
  );
}

/** At the top of the page, only while offline: this is the saved copy (and from when). */
export function OfflineNotice({ path }: { path: string }) {
  const t = useTranslations("trips.offline");
  const savedAt = useSavedAt();
  const [offline, setOffline] = useState(false);
  const [entry, setEntry] = useState<OfflineTripEntry | null>(null);

  useEffect(() => {
    const update = () => {
      setOffline(!navigator.onLine);
      if (!navigator.onLine && cacheSupported()) savedEntry(path).then(setEntry, () => setEntry(null));
    };
    update();
    window.addEventListener("online", update);
    window.addEventListener("offline", update);
    return () => {
      window.removeEventListener("online", update);
      window.removeEventListener("offline", update);
    };
  }, [path]);

  if (!offline) return null;
  return (
    <p role="status" className="flex items-start gap-2 rounded-card border border-border bg-warning-soft p-3 text-small text-foreground">
      <WifiOffIcon className="mt-0.5 size-5 shrink-0" aria-hidden />
      <span>{entry ? t("offlineCopy", savedAt(entry.savedAt)) : t("offlineNow")}</span>
    </p>
  );
}
