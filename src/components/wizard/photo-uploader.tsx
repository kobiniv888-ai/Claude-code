"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useLocale, useTranslations } from "next-intl";
import { CircleAlertIcon, ImagePlusIcon, LoaderCircleIcon, RotateCcwIcon, UploadIcon, XIcon } from "lucide-react";
import { Button } from "@/components/ui/button";
import { siteConfig } from "@/config/site";
import { formatNumber } from "@/lib/format";
import { cn } from "@/lib/utils";
import type { WizardPhoto } from "@/lib/wizard/types";

/**
 * Photo uploads for the wizard: compress in the browser (browser-image-compression, max 2400 px,
 * ≈1.5 MB, orientation kept), then POST /api/uploads/listing-photo with progress, three at a
 * time, retrying network/server failures twice before showing "Retry".
 */

export type UploadItem = {
  key: string;
  name: string;
  preview: string;
  status: "queued" | "compressing" | "uploading" | "done" | "error";
  progress: number;
  error?: string;
  attempts: number;
  /** Position in the batch (new photos are ordered like the owner picked them). */
  order: number;
};

const CONCURRENCY = 3;
const AUTO_RETRIES = 2;
/** Bigger originals are refused before compressing (phones rarely exceed 25 MB). */
const MAX_ORIGINAL_BYTES = 40 * 1024 * 1024;
const ACCEPT = "image/jpeg,image/png,image/webp,image/avif,image/heic,image/heif,image/gif";

type UploadResponse = { id: string; url: string; thumbUrl: string; width: number; height: number; isCover: boolean };

class UploadError extends Error {
  constructor(
    readonly code: string,
    readonly retryable: boolean,
  ) {
    super(code);
  }
}

async function compress(file: File): Promise<File> {
  if (file.type === "image/gif" || file.type === "image/heic" || file.type === "image/heif") return file;
  try {
    const { default: imageCompression } = await import("browser-image-compression");
    const output = await imageCompression(file, {
      maxSizeMB: 1.5,
      maxWidthOrHeight: 2400,
      initialQuality: 0.86,
      // No worker: the worker build would be fetched from a third-party CDN.
      useWebWorker: false,
      preserveExif: false,
    });
    // Keep the smaller one (a tiny, already-optimized JPEG may grow).
    return output.size < file.size ? new File([output], file.name, { type: output.type, lastModified: file.lastModified }) : file;
  } catch {
    // Formats the browser cannot decode (e.g. HEIC outside Safari) go up as they are.
    return file;
  }
}

function send(
  file: File,
  fields: Record<string, string>,
  onProgress: (fraction: number) => void,
  signal: AbortSignal,
): Promise<UploadResponse> {
  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    xhr.open("POST", "/api/uploads/listing-photo");
    xhr.responseType = "json";
    xhr.upload.onprogress = (event) => {
      if (event.lengthComputable) onProgress(event.loaded / event.total);
    };
    xhr.onload = () => {
      const body = (xhr.response ?? {}) as Partial<UploadResponse> & { error?: string };
      if (xhr.status >= 200 && xhr.status < 300 && body.id) {
        resolve(body as UploadResponse);
        return;
      }
      const code = body.error ?? (xhr.status >= 500 ? "server_error" : "invalid_input");
      reject(new UploadError(code, xhr.status >= 500 || xhr.status === 429 || xhr.status === 0));
    };
    xhr.onerror = () => reject(new UploadError("network", true));
    xhr.ontimeout = () => reject(new UploadError("network", true));
    signal.addEventListener("abort", () => xhr.abort());
    const form = new FormData();
    for (const [key, value] of Object.entries(fields)) form.set(key, value);
    form.set("file", file, file.name);
    xhr.send(form);
  });
}

export function usePhotoUploads({
  listingId,
  roomTypeId,
  remaining,
  onUploaded,
  onBatchDone,
}: {
  listingId: string;
  roomTypeId?: string;
  /** How many more photos are allowed. */
  remaining: number;
  onUploaded: (photo: WizardPhoto, order: number) => void;
  /** Every queued upload finished (successfully or not). */
  onBatchDone: (uploaded: { id: string; order: number }[]) => void;
}) {
  const [items, setItems] = useState<UploadItem[]>([]);
  const [rejected, setRejected] = useState<string | null>(null);
  const files = useRef(new Map<string, File>());
  const running = useRef(0);
  const counter = useRef(0);
  const uploadedInBatch = useRef<{ id: string; order: number }[]>([]);
  const controller = useRef<AbortController | null>(null);
  const itemsRef = useRef(items);
  useEffect(() => {
    itemsRef.current = items;
  }, [items]);
  const callbacks = useRef({ onUploaded, onBatchDone });
  useEffect(() => {
    callbacks.current = { onUploaded, onBatchDone };
  }, [onUploaded, onBatchDone]);

  const update = (key: string, patch: Partial<UploadItem>) =>
    setItems((list) => list.map((item) => (item.key === key ? { ...item, ...patch } : item)));

  const pump = useCallback(() => {
    const queue = itemsRef.current.filter((i) => i.status === "queued");
    while (running.current < CONCURRENCY && queue.length > 0) {
      const item = queue.shift()!;
      running.current += 1;
      itemsRef.current = itemsRef.current.map((i) => (i.key === item.key ? { ...i, status: "compressing" } : i));
      void runUpload(item).finally(() => {
        running.current -= 1;
        const active = itemsRef.current.some((i) => i.status === "queued" || i.status === "compressing" || i.status === "uploading");
        if (active) pump();
        else if (running.current === 0) {
          const done = uploadedInBatch.current;
          uploadedInBatch.current = [];
          callbacks.current.onBatchDone(done);
        }
      });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const runUpload = async (item: UploadItem) => {
    const original = files.current.get(item.key);
    if (!original) return;
    update(item.key, { status: "compressing", progress: 0, error: undefined });
    const file = await compress(original);
    if (file.size > siteConfig.listings.maxPhotoBytes) {
      update(item.key, { status: "error", error: "file_too_large" });
      itemsRef.current = itemsRef.current.map((i) => (i.key === item.key ? { ...i, status: "error" } : i));
      return;
    }
    controller.current ??= new AbortController();
    let attempt = item.attempts;
    for (;;) {
      attempt += 1;
      update(item.key, { status: "uploading", attempts: attempt });
      try {
        const fields: Record<string, string> = { listingId };
        if (roomTypeId) fields.roomTypeId = roomTypeId;
        const result = await send(file, fields, (fraction) => update(item.key, { progress: fraction }), controller.current.signal);
        update(item.key, { status: "done", progress: 1 });
        itemsRef.current = itemsRef.current.map((i) => (i.key === item.key ? { ...i, status: "done" } : i));
        files.current.delete(item.key);
        uploadedInBatch.current.push({ id: result.id, order: item.order });
        callbacks.current.onUploaded(
          {
            id: result.id,
            url: result.url,
            thumbUrl: result.thumbUrl,
            width: result.width,
            height: result.height,
            isCover: result.isCover && !roomTypeId,
            alt: "",
            roomTypeId: roomTypeId ?? null,
          },
          item.order,
        );
        // The preview is no longer needed once the real thumbnail shows.
        setTimeout(() => {
          URL.revokeObjectURL(item.preview);
          setItems((list) => list.filter((i) => i.key !== item.key));
        }, 600);
        return;
      } catch (error) {
        const e = error instanceof UploadError ? error : new UploadError("network", true);
        if (e.retryable && attempt - item.attempts <= AUTO_RETRIES && !controller.current.signal.aborted) {
          await new Promise((r) => setTimeout(r, 800 * attempt));
          continue;
        }
        update(item.key, { status: "error", error: e.code });
        itemsRef.current = itemsRef.current.map((i) => (i.key === item.key ? { ...i, status: "error" } : i));
        return;
      }
    }
  };

  const add = useCallback(
    (list: FileList | File[]) => {
      const incoming = Array.from(list);
      const images = incoming.filter((f) => f.type.startsWith("image/") || /\.(heic|heif)$/i.test(f.name));
      const tooBig = images.filter((f) => f.size > MAX_ORIGINAL_BYTES);
      const accepted = images.filter((f) => f.size <= MAX_ORIGINAL_BYTES);
      const active = itemsRef.current.filter((i) => i.status !== "done" && i.status !== "error").length;
      const room = Math.max(0, remaining - active);
      const taken = accepted.slice(0, room);
      if (incoming.length > images.length) setRejected("notImage");
      else if (tooBig.length > 0) setRejected("tooBig");
      else if (accepted.length > room) setRejected("tooMany");
      else setRejected(null);
      if (taken.length === 0) return;

      const newItems = taken.map((file) => {
        const key = `u${(counter.current += 1)}`;
        files.current.set(key, file);
        return {
          key,
          name: file.name,
          preview: URL.createObjectURL(file),
          status: "queued" as const,
          progress: 0,
          attempts: 0,
          order: counter.current,
        };
      });
      itemsRef.current = [...itemsRef.current, ...newItems];
      setItems((current) => [...current, ...newItems]);
      pump();
    },
    [remaining, pump],
  );

  const retry = useCallback(
    (key: string) => {
      itemsRef.current = itemsRef.current.map((i) => (i.key === key ? { ...i, status: "queued", error: undefined } : i));
      setItems((list) => list.map((i) => (i.key === key ? { ...i, status: "queued", error: undefined } : i)));
      pump();
    },
    [pump],
  );

  const dismiss = useCallback((key: string) => {
    const item = itemsRef.current.find((i) => i.key === key);
    if (item) URL.revokeObjectURL(item.preview);
    files.current.delete(key);
    itemsRef.current = itemsRef.current.filter((i) => i.key !== key);
    setItems((list) => list.filter((i) => i.key !== key));
  }, []);

  useEffect(() => {
    const ctrl = controller;
    return () => ctrl.current?.abort();
  }, []);

  const busy = items.some((i) => i.status === "queued" || i.status === "compressing" || i.status === "uploading");
  return { items, add, retry, dismiss, busy, rejected, clearRejected: () => setRejected(null) };
}

/** Drag-and-drop zone with a "Choose photos" button (multiple files). */
export function PhotoDropZone({
  onFiles,
  disabled,
  compact,
  remaining,
}: {
  onFiles: (files: FileList | File[]) => void;
  disabled?: boolean;
  compact?: boolean;
  remaining: number;
}) {
  const t = useTranslations("wizard.photos");
  const locale = useLocale();
  const input = useRef<HTMLInputElement>(null);
  const [over, setOver] = useState(false);
  return (
    <div
      onDragOver={(e) => {
        if (disabled) return;
        e.preventDefault();
        setOver(true);
      }}
      onDragLeave={() => setOver(false)}
      onDrop={(e) => {
        e.preventDefault();
        setOver(false);
        if (!disabled && e.dataTransfer.files.length > 0) onFiles(e.dataTransfer.files);
      }}
      className={cn(
        "flex flex-col items-center justify-center gap-3 rounded-card border-2 border-dashed text-center transition-colors",
        compact ? "p-4" : "p-6 sm:p-10",
        over ? "border-primary bg-primary-tint" : "border-primary/25 bg-primary-tint/40",
        disabled && "opacity-60",
      )}
    >
      {!compact && (
        <span className="flex size-16 items-center justify-center rounded-full bg-card text-primary-text shadow-card">
          <ImagePlusIcon className="size-8" aria-hidden />
        </span>
      )}
      {!compact && (
        <div className="grid gap-1">
          <p className="text-h3">{t("dropTitle")}</p>
          <p className="text-small text-muted-foreground">{t("dropHelp")}</p>
        </div>
      )}
      <Button type="button" onClick={() => input.current?.click()} disabled={disabled} className="h-12 rounded-full px-6 text-base">
        <UploadIcon aria-hidden />
        {t("choose")}
      </Button>
      <p className="text-xs text-muted-foreground">
        {remaining > 0 ? t("remaining", { count: remaining, formatted: formatNumber(remaining, locale) }) : t("limitReached")}
      </p>
      <input
        ref={input}
        type="file"
        accept={ACCEPT}
        multiple
        className="sr-only"
        tabIndex={-1}
        aria-hidden
        onChange={(e) => {
          if (e.target.files && e.target.files.length > 0) onFiles(e.target.files);
          e.target.value = "";
        }}
      />
    </div>
  );
}

/** Progress list of the uploads in flight (and failed ones with Retry). */
export function UploadQueue({
  items,
  onRetry,
  onDismiss,
}: {
  items: UploadItem[];
  onRetry: (key: string) => void;
  onDismiss: (key: string) => void;
}) {
  const t = useTranslations("wizard.photos");
  const tErrors = useTranslations("wizard.uploadErrors");
  const locale = useLocale();
  if (items.length === 0) return null;
  return (
    <ul className="grid gap-2" aria-label={t("queueLabel")}>
      {items.map((item) => (
        <li
          key={item.key}
          className={cn(
            "flex items-center gap-3 rounded-xl border bg-card p-2.5",
            item.status === "error" ? "border-destructive/40" : "border-border",
          )}
        >
          {/* eslint-disable-next-line @next/next/no-img-element -- local object URL preview */}
          <img src={item.preview} alt="" className="size-12 shrink-0 rounded-lg object-cover" />
          <div className="grid min-w-0 flex-1 gap-1.5">
            <div className="flex items-center justify-between gap-2 text-sm">
              <span className="truncate font-medium" dir="auto">
                {item.name}
              </span>
              <span className="shrink-0 text-xs text-muted-foreground tabular-nums">
                {item.status === "uploading" && `${formatNumber(Math.round(item.progress * 100), locale)}%`}
                {item.status === "compressing" && t("compressing")}
                {item.status === "queued" && t("queued")}
                {item.status === "done" && t("uploaded")}
              </span>
            </div>
            {item.status === "error" ? (
              <p className="flex items-center gap-1.5 text-xs font-medium text-destructive" role="alert">
                <CircleAlertIcon className="size-3.5 shrink-0" aria-hidden />
                {item.error && tErrors.has(item.error) ? tErrors(item.error) : tErrors("server_error")}
              </p>
            ) : (
              <div
                className="h-1.5 overflow-hidden rounded-full bg-muted"
                role="progressbar"
                aria-label={t("uploading", { name: item.name })}
                aria-valuemin={0}
                aria-valuemax={100}
                aria-valuenow={Math.round(item.progress * 100)}
              >
                <div
                  className={cn(
                    "h-full rounded-full transition-[width]",
                    item.status === "done" ? "bg-success" : "bg-primary",
                    item.status === "compressing" && "w-1/5 animate-pulse",
                  )}
                  style={item.status === "compressing" ? undefined : { width: `${Math.max(4, item.progress * 100)}%` }}
                />
              </div>
            )}
          </div>
          {item.status === "error" ? (
            <div className="flex shrink-0 gap-1">
              <Button type="button" size="icon" variant="outline" onClick={() => onRetry(item.key)} aria-label={t("retry", { name: item.name })}>
                <RotateCcwIcon aria-hidden />
              </Button>
              <Button type="button" size="icon" variant="ghost" onClick={() => onDismiss(item.key)} aria-label={t("dismiss", { name: item.name })}>
                <XIcon aria-hidden />
              </Button>
            </div>
          ) : item.status !== "done" ? (
            <LoaderCircleIcon className="size-4 shrink-0 animate-spin text-muted-foreground" aria-hidden />
          ) : null}
        </li>
      ))}
    </ul>
  );
}
