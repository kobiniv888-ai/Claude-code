"use client";

import { useEffect, useState, type FormEvent } from "react";
import { useLocale, useTranslations } from "next-intl";
import {
  AlertTriangleIcon,
  CheckCircle2Icon,
  CheckIcon,
  ChevronDownIcon,
  CopyIcon,
  DownloadIcon,
  PlusIcon,
  RefreshCwIcon,
  Trash2Icon,
  UploadIcon,
} from "lucide-react";
import { Button } from "@/components/ds/button";
import { Card } from "@/components/ds/card";
import { Ltr } from "@/components/common/ltr";
import { Input } from "@/components/ui/input";
import { Link } from "@/i18n/navigation";
import { HOST_BOOKINGS_PATH } from "@/lib/booking/constants";
import { saveIcalImportsAction, syncIcalNowAction, type CalendarSyncResult } from "@/lib/booking/host-actions";
import { formatRelativeTime } from "@/lib/format";
import { toast } from "@/lib/toast";
import { cn } from "@/lib/utils";
import { LIMITS } from "@/lib/wizard/schemas";

type FeedReport = CalendarSyncResult["feeds"][number];

/** Re-check the imported calendars when the page opens and the last sync is older than this. */
const STALE_MS = 30 * 60 * 1000;

function hostOf(url: string): string {
  try {
    return new URL(url).hostname.replace(/^www\./, "");
  } catch {
    return url;
  }
}

function CopyLink({ value, label }: { value: string; label: string }) {
  const t = useTranslations("hostBooking.ical");
  const [copied, setCopied] = useState(false);
  return (
    <div className="flex items-center gap-2">
      <Input readOnly value={value} dir="ltr" aria-label={label} className="h-11 min-w-0 flex-1 font-mono text-sm" onFocus={(e) => e.target.select()} />
      <Button
        type="button"
        variant="outline"
        size="sm"
        className="h-11"
        onClick={async () => {
          try {
            await navigator.clipboard.writeText(value);
            setCopied(true);
            setTimeout(() => setCopied(false), 2000);
          } catch {
            toast.error(t("copyFailed"));
          }
        }}
      >
        {copied ? <CheckIcon aria-hidden /> : <CopyIcon aria-hidden />}
        <span aria-live="polite">{copied ? t("copied") : t("copy")}</span>
      </Button>
    </div>
  );
}

function HowTo({ site, steps }: { site: string; steps: string }) {
  return (
    <details className="group rounded-xl border border-border bg-card">
      <summary className="flex min-h-11 cursor-pointer list-none items-center justify-between gap-3 px-3.5 py-2.5 text-small font-medium outline-none focus-visible:ring-3 focus-visible:ring-ring/50 [&::-webkit-details-marker]:hidden">
        {site}
        <ChevronDownIcon className="size-4 shrink-0 text-muted-foreground transition-transform duration-(--motion-fast) group-open:rotate-180" aria-hidden />
      </summary>
      <p className="px-3.5 pb-3 text-small text-pretty text-muted-foreground">{steps}</p>
    </details>
  );
}

/**
 * Calendar sync for one listing: the private Bayit export link (to paste into Airbnb / Booking.com)
 * and the calendars imported from them, with the last sync, each link's errors and "sync now".
 */
export function IcalPanel({
  listingId,
  exportUrl,
  importUrls,
  syncedAt: initialSyncedAt,
  importedNights,
}: {
  listingId: string;
  exportUrl: string;
  importUrls: string[];
  syncedAt: string | null;
  importedNights: Record<string, number>;
}) {
  const t = useTranslations("hostBooking.ical");
  const locale = useLocale();
  const [urls, setUrls] = useState(importUrls);
  const [syncedAt, setSyncedAt] = useState(initialSyncedAt);
  const [report, setReport] = useState<Record<string, FeedReport> | null>(null);
  const [conflicts, setConflicts] = useState(0);
  const [busy, setBusy] = useState<"sync" | "save" | null>(null);
  const [draft, setDraft] = useState("");
  const [draftError, setDraftError] = useState<string | null>(null);

  const applyResult = (result: CalendarSyncResult) => {
    setSyncedAt(result.syncedAt);
    setReport(Object.fromEntries(result.feeds.map((feed) => [feed.url, feed])));
    setConflicts(result.conflicts);
  };

  const errorText = (code: string) => (t.has(`errors.${code}`) ? t(`errors.${code}`) : t("errors.failed"));

  const syncNow = async (quiet = false) => {
    setBusy("sync");
    const result = await syncIcalNowAction({ listingId }).catch(() => null);
    setBusy(null);
    if (result?.ok) {
      applyResult(result.data);
      if (!quiet) {
        const failed = result.data.feeds.filter((f) => f.error).length;
        if (failed > 0) toast.error(t("syncedWithErrors", { count: failed }));
        else toast.success(t("synced"));
      }
    } else if (!quiet) {
      toast.error(errorText(result?.error ?? "failed"));
    }
  };

  // Show fresh results (and any broken link) when the page opens after a while.
  useEffect(() => {
    if (importUrls.length === 0) return;
    const last = initialSyncedAt ? Date.parse(initialSyncedAt) : 0;
    if (Date.now() - last <= STALE_MS) return;
    const timer = window.setTimeout(() => void syncNow(true), 300);
    return () => window.clearTimeout(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps -- once, on mount
  }, []);

  const save = async (next: string[]) => {
    setBusy("save");
    const result = await saveIcalImportsAction({ listingId, urls: next }).catch(() => null);
    setBusy(null);
    if (result?.ok) {
      setUrls(result.data.urls);
      applyResult(result.data);
      return true;
    }
    const code = result?.error ?? "failed";
    setDraftError(errorText(code));
    return false;
  };

  const onAdd = async (event: FormEvent) => {
    event.preventDefault();
    const url = draft.trim();
    setDraftError(null);
    if (!url) return;
    if (!/^https:\/\/\S+$/i.test(url)) {
      setDraftError(t("errors.bad_url"));
      return;
    }
    if (urls.includes(url)) {
      setDraft("");
      return;
    }
    if (await save([...urls, url])) {
      setDraft("");
      toast.success(t("added"));
    }
  };

  const onRemove = async (url: string) => {
    setDraftError(null);
    if (await save(urls.filter((u) => u !== url))) toast.success(t("removed"));
  };

  const full = urls.length >= LIMITS.maxIcalImports;

  return (
    <div className="grid gap-4 lg:grid-cols-2 lg:items-start">
      <Card as="section" padding="lg" className="grid gap-4" aria-labelledby="ical-export-title">
        <header className="flex items-start gap-3">
          <span className="flex size-10 shrink-0 items-center justify-center rounded-full bg-primary-tint text-primary-text">
            <UploadIcon className="size-5" aria-hidden />
          </span>
          <div className="grid gap-0.5 pt-0.5">
            <h2 id="ical-export-title" className="text-h3">
              {t("exportTitle")}
            </h2>
            <p className="text-small text-pretty text-muted-foreground">{t("exportBody")}</p>
          </div>
        </header>
        <CopyLink value={exportUrl} label={t("exportTitle")} />
        <p className="text-small text-pretty text-muted-foreground">{t("exportPrivacy")}</p>
        <div className="grid gap-2">
          <p className="text-small font-medium">{t("howTo")}</p>
          <HowTo site="Airbnb" steps={t("howToAirbnb")} />
          <HowTo site="Booking.com" steps={t("howToBooking")} />
        </div>
      </Card>

      <Card as="section" padding="lg" className="grid gap-4" aria-labelledby="ical-import-title">
        <header className="flex items-start gap-3">
          <span className="flex size-10 shrink-0 items-center justify-center rounded-full bg-primary-tint text-primary-text">
            <DownloadIcon className="size-5" aria-hidden />
          </span>
          <div className="grid gap-0.5 pt-0.5">
            <h2 id="ical-import-title" className="text-h3">
              {t("importTitle")}
            </h2>
            <p className="text-small text-pretty text-muted-foreground">{t("importBody", { count: LIMITS.maxIcalImports })}</p>
          </div>
        </header>

        {urls.length > 0 && (
          <ul className="grid gap-2">
            {urls.map((url) => {
              const feed = report?.[url];
              const host = hostOf(url);
              const nights = importedNights[feed?.label ?? host] ?? importedNights[host] ?? 0;
              return (
                <li key={url} className="flex items-start gap-3 rounded-xl border border-border p-3">
                  {feed?.error ? (
                    <AlertTriangleIcon className="mt-0.5 size-5 shrink-0 text-destructive" aria-hidden />
                  ) : (
                    <CheckCircle2Icon className={cn("mt-0.5 size-5 shrink-0", feed ? "text-success" : "text-muted-foreground")} aria-hidden />
                  )}
                  <div className="grid min-w-0 flex-1 gap-0.5">
                    <p className="font-medium">
                      <Ltr>{host}</Ltr>
                    </p>
                    <p className="truncate text-caption text-muted-foreground" title={url}>
                      <Ltr>{url}</Ltr>
                    </p>
                    <p className={cn("text-small", feed?.error ? "font-medium text-destructive" : "text-muted-foreground")} aria-live="polite">
                      {feed?.error
                        ? errorText(feed.error)
                        : feed
                          ? t("feedOk", { count: feed.events })
                          : t("feedNights", { count: nights })}
                    </p>
                  </div>
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon"
                    disabled={busy !== null}
                    onClick={() => void onRemove(url)}
                    aria-label={t("remove", { site: host })}
                  >
                    <Trash2Icon aria-hidden />
                  </Button>
                </li>
              );
            })}
          </ul>
        )}

        {conflicts > 0 && (
          <p className="flex items-start gap-2 rounded-xl bg-surface-muted p-3 text-small text-pretty" role="alert">
            <AlertTriangleIcon className="mt-0.5 size-4 shrink-0 text-destructive" aria-hidden />
            <span>
              {t("conflicts", { count: conflicts })}{" "}
              <Link href={HOST_BOOKINGS_PATH} className="font-medium text-primary-text underline underline-offset-4">
                {t("conflictsLink")}
              </Link>
            </span>
          </p>
        )}

        {!full ? (
          <form onSubmit={(e) => void onAdd(e)} className="grid gap-2" noValidate>
            <label htmlFor="ical-new" className="text-small font-semibold">
              {t("addLabel")}
            </label>
            <div className="flex items-center gap-2">
              <Input
                id="ical-new"
                type="url"
                dir="ltr"
                inputMode="url"
                value={draft}
                maxLength={LIMITS.urlMax}
                placeholder="https://www.airbnb.com/calendar/ical/….ics"
                aria-invalid={draftError ? true : undefined}
                aria-describedby={draftError ? "ical-new-error" : "ical-new-help"}
                onChange={(e) => {
                  setDraft(e.target.value);
                  setDraftError(null);
                }}
                className="h-11 min-w-0 flex-1 text-base"
              />
              <Button type="submit" variant="outline" size="sm" className="h-11" disabled={busy !== null || draft.trim() === ""}>
                <PlusIcon aria-hidden />
                {t("add")}
              </Button>
            </div>
            {draftError ? (
              <p id="ical-new-error" className="text-small font-medium text-destructive">
                {draftError}
              </p>
            ) : (
              <p id="ical-new-help" className="text-caption text-pretty text-muted-foreground">
                {t("addHelp")}
              </p>
            )}
          </form>
        ) : (
          <p className="text-small text-muted-foreground">{t("full", { count: LIMITS.maxIcalImports })}</p>
        )}

        {urls.length > 0 && (
          <div className="flex flex-wrap items-center justify-between gap-2 border-t border-border pt-3">
            <p className="text-small text-muted-foreground" aria-live="polite">
              {busy === "sync"
                ? t("syncing")
                : syncedAt
                  ? t("lastSync", { time: formatRelativeTime(syncedAt, locale) })
                  : t("neverSynced")}
            </p>
            <Button type="button" variant="secondary" disabled={busy !== null} onClick={() => void syncNow()}>
              <RefreshCwIcon className={cn(busy === "sync" && "motion-safe:animate-spin")} aria-hidden />
              {t("syncNow")}
            </Button>
          </div>
        )}
        <p className="text-caption text-pretty text-muted-foreground">{t("hourly")}</p>
      </Card>
    </div>
  );
}
