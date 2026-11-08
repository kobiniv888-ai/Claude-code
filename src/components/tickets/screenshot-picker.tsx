"use client";

import { ImagePlus, RotateCcw, TriangleAlert, X } from "lucide-react";
import { useLocale, useTranslations } from "next-intl";
import { useCallback, useEffect, useId, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { errorMessageKey } from "@/lib/errors";
import { formatNumber } from "@/lib/format";
import { isHeicFile, UPLOAD_IMAGE_ACCEPT } from "@/lib/media";
import { TICKET_LIMITS } from "@/lib/tickets/constants";
import type { TicketAttachment } from "@/lib/tickets/attachments";
import { cn } from "@/lib/utils";

/**
 * Up to 5 screenshots for a ticket message. Each file is uploaded right away to
 * POST /api/uploads/private (purpose "ticket", stored encrypted); the parent gets the list of
 * finished uploads ({ key, mime, bytes, name }) through `onChange` and `onBusyChange` while
 * anything is still uploading. Thumbnails come from the local file, never from the server.
 * Pass stable callbacks (state setters or useCallback).
 */

/** JPEG, PNG and WebP (SECURITY_REPORT 9.a): an iPhone then sends JPEG on its own. */
const ACCEPT = UPLOAD_IMAGE_ACCEPT;

type Item = {
  id: string;
  file: File;
  preview: string;
  state: "uploading" | "done" | "error";
  attachment?: TicketAttachment;
  error?: string;
};

export function ScreenshotPicker({
  onChange,
  onBusyChange,
  disabled,
  clearSignal = 0,
  describedBy,
}: {
  onChange: (attachments: TicketAttachment[]) => void;
  onBusyChange?: (busy: boolean) => void;
  disabled?: boolean;
  /** Change this number to empty the picker (e.g. after the message was sent). */
  clearSignal?: number;
  describedBy?: string;
}) {
  const t = useTranslations("tickets.screenshots");
  const tErrors = useTranslations("errors");
  const locale = useLocale();
  const inputId = useId();
  const inputRef = useRef<HTMLInputElement>(null);
  const [items, setItems] = useState<Item[]>([]);
  const [notice, setNotice] = useState<string | null>(null);
  const itemsRef = useRef(items);

  useEffect(() => {
    itemsRef.current = items;
    onChange(items.filter((i) => i.state === "done" && i.attachment).map((i) => i.attachment!));
    onBusyChange?.(items.some((i) => i.state === "uploading"));
  }, [items, onChange, onBusyChange]);

  // Free the object URLs when the picker goes away.
  useEffect(() => () => itemsRef.current.forEach((i) => URL.revokeObjectURL(i.preview)), []);

  const lastClear = useRef(clearSignal);
  useEffect(() => {
    if (clearSignal === lastClear.current) return;
    lastClear.current = clearSignal;
    setItems((current) => {
      current.forEach((i) => URL.revokeObjectURL(i.preview));
      return [];
    });
    setNotice(null);
  }, [clearSignal]);

  const upload = useCallback(
    async (item: Item) => {
      const body = new FormData();
      body.set("purpose", "ticket");
      body.set("file", item.file);
      let next: Partial<Item>;
      try {
        const res = await fetch("/api/uploads/private", { method: "POST", body });
        const data = (await res.json().catch(() => null)) as (TicketAttachment & { error?: string }) | null;
        if (res.ok && data?.key) {
          next = {
            state: "done",
            attachment: { key: data.key, mime: data.mime, bytes: data.bytes, name: data.name || item.file.name },
          };
        } else {
          next = { state: "error", error: tErrors(errorMessageKey(data?.error ?? "server_error")) };
        }
      } catch {
        next = { state: "error", error: tErrors("network") };
      }
      setItems((current) => current.map((i) => (i.id === item.id ? { ...i, ...next } : i)));
    },
    [tErrors],
  );

  function addFiles(list: FileList | null) {
    if (!list?.length) return;
    setNotice(null);
    const room = TICKET_LIMITS.maxAttachments - items.length;
    const files = Array.from(list);
    if (files.length > room) setNotice(t("tooMany", { max: String(TICKET_LIMITS.maxAttachments) }));
    const added: Item[] = [];
    for (const file of files.slice(0, Math.max(0, room))) {
      if (isHeicFile(file)) {
        setNotice(tErrors("heic_not_supported"));
        continue;
      }
      if (!file.type.startsWith("image/")) {
        setNotice(tErrors("file_type_not_allowed"));
        continue;
      }
      if (file.size > TICKET_LIMITS.maxAttachmentBytes) {
        setNotice(tErrors("file_too_large"));
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

  const full = items.length >= TICKET_LIMITS.maxAttachments;

  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-wrap items-center gap-3">
        <input
          ref={inputRef}
          id={inputId}
          type="file"
          accept={ACCEPT}
          multiple
          disabled={disabled || full}
          aria-describedby={describedBy}
          className="peer sr-only"
          onChange={(e) => {
            addFiles(e.target.files);
            e.target.value = "";
          }}
        />
        <label
          htmlFor={inputId}
          aria-disabled={disabled || full}
          className={cn(
            "inline-flex h-11 cursor-pointer items-center gap-2 rounded-xl border border-dashed border-input bg-background px-4 text-sm font-medium transition-colors hover:bg-muted peer-focus-visible:ring-3 peer-focus-visible:ring-ring/50",
            (disabled || full) && "pointer-events-none opacity-50",
          )}
        >
          <ImagePlus aria-hidden="true" className="size-5 text-primary" />
          {t("add")}
        </label>
        <span className="text-xs text-muted-foreground">
          {t("count", {
            current: formatNumber(items.length, locale),
            max: formatNumber(TICKET_LIMITS.maxAttachments, locale),
          })}
        </span>
      </div>

      {notice ? (
        <p role="alert" className="flex items-center gap-1.5 text-sm text-destructive">
          <TriangleAlert aria-hidden="true" className="size-4 shrink-0" />
          {notice}
        </p>
      ) : null}

      {items.length ? (
        <ul aria-label={t("listLabel")} className="grid grid-cols-3 gap-2 sm:grid-cols-5">
          {items.map((item, index) => (
            <li key={item.id} className="relative">
              <div
                className={cn(
                  "relative aspect-square overflow-hidden rounded-xl border bg-muted",
                  item.state === "error" && "border-destructive",
                )}
              >
                {/* Local preview of the chosen file (blob: URL). */}
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={item.preview}
                  alt={t("thumbAlt", { number: String(index + 1) })}
                  className={cn("size-full object-cover", item.state !== "done" && "opacity-60")}
                />
                {item.state === "uploading" ? (
                  <div className="absolute inset-0 flex items-end bg-background/30">
                    <span className="sr-only">{t("uploading")}</span>
                    <span aria-hidden="true" className="h-1 w-full animate-pulse bg-primary" />
                  </div>
                ) : null}
                {item.state === "error" ? (
                  <div className="absolute inset-0 flex flex-col items-center justify-center gap-1 bg-background/80 p-1 text-center">
                    <TriangleAlert aria-hidden="true" className="size-4 text-destructive" />
                    <Button type="button" size="xs" variant="outline" onClick={() => retry(item)}>
                      <RotateCcw aria-hidden="true" />
                      {t("retry")}
                    </Button>
                  </div>
                ) : null}
              </div>
              <Button
                type="button"
                size="icon-sm"
                variant="secondary"
                className="absolute -top-2 -end-2 rounded-full border bg-card shadow-card"
                onClick={() => remove(item.id)}
                aria-label={t("remove", { number: String(index + 1) })}
              >
                <X aria-hidden="true" />
              </Button>
              {item.error ? (
                <p role="alert" className="mt-1 line-clamp-3 text-xs text-destructive">
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
