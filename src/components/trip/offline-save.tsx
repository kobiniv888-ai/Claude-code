"use client";

import { useCallback, useEffect, useState } from "react";
import { useLocale, useTranslations } from "next-intl";
import { CircleCheckIcon, CloudDownloadIcon, RefreshCwIcon, Trash2Icon, WifiOffIcon } from "lucide-react";
import { Button } from "@/components/ds/button";
import { SPRITE_URL } from "@/components/ds/sprite-icons.generated";
import { formatDate, formatTime } from "@/lib/format";
import { toast } from "@/lib/toast";
import { OFFLINE_SAVED_AT_ATTR, needsResave, type OfflineTripEntry } from "@/lib/trip/offline";
import {
  cacheStorageAvailable,
  reconcileOfflineTrips,
  removeOfflinePage,
  saveOfflinePage,
  savedOfflineEntry,
  type OfflineTripProps,
} from "@/lib/trip/offline-device";

export type { OfflineTripProps } from "@/lib/trip/offline-device";

/**
 * "שמירה לשימוש בלי אינטרנט" (round 3, brief 7.1, founder's answer 10: on a tap, never by itself).
 * The rules are in src/lib/trip/offline.ts, the cache helpers in src/lib/trip/offline-device.ts;
 * public/sw.js opens the saved copy when the network fails. Text: trips.offline.
 */

function cacheSupported(): boolean {
  return cacheStorageAvailable() && "serviceWorker" in navigator;
}

/** The service worker that would open the copy offline (it registers on page load in production). */
async function hasServiceWorker(): Promise<boolean> {
  if (await navigator.serviceWorker.getRegistration("/").catch(() => undefined)) return true;
  const ready = navigator.serviceWorker.ready.then(() => true).catch(() => false);
  return Promise.race([ready, new Promise<boolean>((resolve) => window.setTimeout(() => resolve(false), 5000))]);
}

/** The saved copy's time when this document IS the saved copy (sw.js served it), else null. */
function savedCopyTime(): string | null {
  if (typeof document === "undefined") return null;
  return document.querySelector(`[${OFFLINE_SAVED_AT_ATTR}]`)?.getAttribute(OFFLINE_SAVED_AT_ATTR) ?? null;
}

function savePage(props: OfflineTripProps): Promise<OfflineTripEntry> {
  return saveOfflinePage(props, SPRITE_URL);
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
      // Copies of another account or past their last day go first (the layout's guard does the
      // same on every page; this covers a page that stayed open).
      if (navigator.onLine) await reconcileOfflineTrips(props.owner).catch(() => undefined);
      const saved = await savedOfflineEntry(props.path, props.owner).catch(() => null);
      if (!alive) return;
      setEntry(saved);
      setState(saved ? "saved" : "idle");
      // Keep the copy current: the booking or what the page shows changed (the host moved the
      // check-in time, the address, the contact buttons…), or the copy is old. In the background.
      if (saved && navigator.onLine && needsResave(saved, props, Date.now())) {
        const fresh = await savePage(props).catch(() => null);
        if (alive && fresh) setEntry(fresh);
      }
    })();
    return () => {
      alive = false;
    };
    // Re-check when the page's data changes (router.refresh after a change of the booking).
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [props.path, props.status, props.version, props.owner]);

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
    await removeOfflinePage(props.path).catch(() => undefined);
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

/**
 * A trip page that may not (or no longer) be kept offline — a cancelled booking, a stay past its
 * keep window: deletes a copy saved earlier on this device (in-app navigation never reaches the
 * service worker, which does the same for a full page load). Renders nothing.
 */
export function OfflineForget({ path }: { path: string }) {
  useEffect(() => {
    if (cacheStorageAvailable()) void removeOfflinePage(path).catch(() => undefined);
  }, [path]);
  return null;
}

/**
 * At the top of the page: on the SAVED copy (the service worker served it: no internet, a network
 * that answers nothing, a server error), "this is the copy from …, it may be out of date" — with
 * "load the latest" while the device says it is online; on the live page, only while offline.
 */
export function OfflineNotice() {
  const t = useTranslations("trips.offline");
  const savedAt = useSavedAt();
  const [offline, setOffline] = useState(false);
  const [copyAt, setCopyAt] = useState<string | null>(null);

  useEffect(() => {
    const update = () => {
      setCopyAt(savedCopyTime());
      setOffline(!navigator.onLine);
    };
    update();
    window.addEventListener("online", update);
    window.addEventListener("offline", update);
    return () => {
      window.removeEventListener("online", update);
      window.removeEventListener("offline", update);
    };
  }, []);

  if (!copyAt && !offline) return null;
  return (
    <div role="status" className="flex items-start gap-2 rounded-card border border-border bg-warning-soft p-3 text-small text-foreground">
      <WifiOffIcon className="mt-0.5 size-5 shrink-0" aria-hidden />
      <div className="grid gap-2">
        <span>{copyAt ? t(offline ? "offlineCopy" : "savedCopy", savedAt(copyAt)) : t("offlineNow")}</span>
        {copyAt && !offline ? (
          <Button variant="secondary" size="sm" className="justify-self-start" onClick={() => window.location.reload()}>
            <RefreshCwIcon aria-hidden />
            {t("reload")}
          </Button>
        ) : null}
      </div>
    </div>
  );
}
