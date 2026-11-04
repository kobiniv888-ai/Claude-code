"use client";

import { ImagePlusIcon, RotateCcwIcon, TriangleAlertIcon, XIcon } from "lucide-react";
import { useLocale, useTranslations } from "next-intl";
import { useCallback, useEffect, useId, useRef, useState } from "react";
import { Button } from "@/components/ds/button";
import { errorMessageKey } from "@/lib/errors";
import { formatNumber } from "@/lib/format";
import { REPORT_SCREENSHOTS, screenshotProblem, type ReportAttachment } from "@/lib/reports/turned-away";
import { cn } from "@/lib/utils";

/**
 * Up to 5 screenshots for a turned-away report (JPEG, PNG or WebP, 5 MB each). Each file is
 * uploaded right away to POST /api/uploads/private (purpose "report"): the server checks the real
 * format, re-encodes it without its metadata (location, phone model) and stores it encrypted.
 * The parent gets the finished uploads through `onChange` and `onBusyChange` while any is still
 * uploading. Thumbnails come from the local file, never from the server.
 */

const ACCEPT = REPORT_SCREENSHOTS.mimeTypes.join(",");
const MAX_MB = REPORT_SCREENSHOTS.maxBytes / (1024 * 1024);

type Item = {
  id: string;
  file: File;
  preview: string;
  state: "uploading" | "done" | "error";
  attachment?: ReportAttachment;
  error?: string;
};

export function ReportScreenshots({
  onChange,
  onBusyChange,
  disabled,
  describedBy,
}: {
  onChange: (attachments: ReportAttachment[]) => void;
  onBusyChange: (busy: boolean) => void;
  disabled?: boolean;
  describedBy?: string;
}) {
  const t = useTranslations("report.turnedAway.screenshots");
  const tErrors = useTranslations("errors");
  const locale = useLocale();
  const inputId = useId();
  const inputRef = useRef<HTMLInputElement>(null);
  const [items, setItems] = useState<Item[]>([]);
  const [notice, setNotice] = useState<string | null>(null);
  const itemsRef = useRef(items);

  useEffect(() => {
    itemsRef.current = items;
    onChange(items.flatMap((i) => (i.state === "done" && i.attachment ? [i.attachment] : [])));
    onBusyChange(items.some((i) => i.state === "uploading"));
  }, [items, onChange, onBusyChange]);

  // Free the object URLs when the form goes away.
  useEffect(() => () => itemsRef.current.forEach((i) => URL.revokeObjectURL(i.preview)), []);

  const upload = useCallback(
    async (item: Item) => {
      const body = new FormData();
      body.set("purpose", "report");
      body.set("file", item.file);
      let next: Partial<Item>;
      try {
        const res = await fetch("/api/uploads/private", { method: "POST", body });
        const data = (await res.json().catch(() => null)) as (ReportAttachment & { error?: string }) | null;
        if (res.ok && data?.key) {
          next = { state: "done", attachment: { key: data.key, mime: data.mime, bytes: data.bytes, name: data.name || item.file.name } };
        } else {
          const code = data?.error ?? "server_error";
          next = { state: "error", error: code === "file_too_large" ? t("tooLarge", { size: formatNumber(MAX_MB, locale) }) : tErrors(errorMessageKey(code)) };
        }
      } catch {
        next = { state: "error", error: tErrors("network") };
      }
      setItems((current) => current.map((i) => (i.id === item.id ? { ...i, ...next } : i)));
    },
    [t, tErrors, locale],
  );

  function addFiles(list: FileList | null) {
    if (!list?.length) return;
    setNotice(null);
    const room = REPORT_SCREENSHOTS.maxFiles - items.length;
    const files = Array.from(list);
    if (files.length > room) setNotice(t("tooMany", { max: formatNumber(REPORT_SCREENSHOTS.maxFiles, locale) }));
    const added: Item[] = [];
    for (const file of files.slice(0, Math.max(0, room))) {
      const problem = screenshotProblem(file);
      if (problem === "file_type_not_allowed") {
        setNotice(t("wrongType"));
        continue;
      }
      if (problem === "file_too_large") {
        setNotice(t("tooLarge", { size: formatNumber(MAX_MB, locale) }));
        continue;
      }
      added.push({ id: crypto.randomUUID(), file, preview: URL.createObjectURL(file), state: "uploading" });
    }
    if (!added.length) return;
    setItems((current) => [...current, ...added]);
    added.forEach((item) => void upload(item));
  }

  function remove(id: string) {
    setItems((current) => {
      const item = current.find((i) => i.id === id);
      if (item) URL.revokeObjectURL(item.preview);
      return current.filter((i) => i.id !== id);
    });
    inputRef.current?.focus();
  }

  function retry(item: Item) {
    setItems((current) => current.map((i) => (i.id === item.id ? { ...i, state: "uploading", error: undefined } : i)));
    void upload({ ...item, state: "uploading" });
  }

  const full = items.length >= REPORT_SCREENSHOTS.maxFiles;

  return (
    <div className="grid gap-3">
      <div className="flex flex-wrap items-center gap-3">
        <input
          ref={inputRef}
          id={inputId}
          type="file"
          accept={ACCEPT}
          multiple
          disabled={disabled || full}
          aria-describedby={describedBy}
          aria-label={t("add")}
          className="peer sr-only"
          onChange={(e) => {
            addFiles(e.target.files);
            e.target.value = "";
          }}
        />
        <label
          htmlFor={inputId}
          aria-hidden="true"
          className={cn(
            "inline-flex min-h-11 cursor-pointer items-center gap-2 rounded-button border border-dashed border-border-strong bg-card px-4 text-small font-medium transition-colors hover:bg-surface-muted peer-focus-visible:ring-3 peer-focus-visible:ring-ring/50",
            (disabled || full) && "pointer-events-none opacity-50",
          )}
        >
          <ImagePlusIcon aria-hidden="true" className="size-5 text-primary-text" />
          {t("add")}
        </label>
        <span className="text-caption text-muted-foreground">
          {t("count", { current: formatNumber(items.length, locale), max: formatNumber(REPORT_SCREENSHOTS.maxFiles, locale) })}
        </span>
      </div>

      {notice ? (
        <p role="alert" className="flex items-center gap-1.5 text-small text-destructive">
          <TriangleAlertIcon aria-hidden="true" className="size-4 shrink-0" />
          {notice}
        </p>
      ) : null}

      {items.length ? (
        <ul aria-label={t("listLabel")} className="grid grid-cols-3 gap-3 sm:grid-cols-5">
          {items.map((item, index) => (
            <li key={item.id} className="relative">
              <div className={cn("relative aspect-square overflow-hidden rounded-xl border border-border bg-surface-muted", item.state === "error" && "border-destructive")}>
                {/* A local preview of the chosen file (blob: URL). */}
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={item.preview}
                  alt={t("thumbAlt", { number: formatNumber(index + 1, locale) })}
                  className={cn("size-full object-cover", item.state !== "done" && "opacity-60")}
                />
                {item.state === "uploading" ? (
                  <div className="absolute inset-0 flex items-end">
                    <span className="sr-only">{t("uploading")}</span>
                    <span aria-hidden="true" className="h-1 w-full animate-pulse bg-primary motion-reduce:animate-none" />
                  </div>
                ) : null}
                {item.state === "error" ? (
                  <div className="absolute inset-0 flex items-center justify-center bg-background/85 p-1">
                    <Button type="button" size="sm" variant="secondary" className="h-9 px-2.5" onClick={() => retry(item)}>
                      <RotateCcwIcon aria-hidden="true" />
                      {t("retry")}
                    </Button>
                  </div>
                ) : null}
              </div>
              <button
                type="button"
                className="absolute -top-2.5 -end-2.5 inline-flex size-9 items-center justify-center rounded-full border border-border bg-card text-foreground shadow-sm outline-none after:absolute after:-inset-1 after:content-[''] hover:bg-surface-muted focus-visible:ring-3 focus-visible:ring-ring/50"
                onClick={() => remove(item.id)}
                aria-label={t("remove", { number: formatNumber(index + 1, locale) })}
              >
                <XIcon aria-hidden="true" className="size-4" />
              </button>
              {item.error ? (
                <p role="alert" className="mt-1 line-clamp-3 text-caption text-destructive">
                  {item.error}
                </p>
              ) : null}
            </li>
          ))}
        </ul>
      ) : null}
    </div>
  );
}
