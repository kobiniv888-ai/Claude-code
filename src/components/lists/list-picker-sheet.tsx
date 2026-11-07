"use client";

import { useEffect, useId, useRef, useState, type FormEvent } from "react";
import { useLocale, useTranslations } from "next-intl";
import { CheckIcon, HeartIcon, HeartOffIcon, ListIcon, LoaderIcon, PlusIcon } from "lucide-react";
import { BottomSheet } from "@/components/ds/bottom-sheet";
import { Button } from "@/components/ds/button";
import { Skeleton } from "@/components/ds/skeleton";
import { Input } from "@/components/ui/input";
import { errorMessageKey } from "@/lib/errors";
import { formatNumber } from "@/lib/format";
import { toggleFavorite } from "@/lib/listing/favorites";
import { createListAction, getSaveTargetsAction, saveToListAction } from "@/lib/lists/actions";
import {
  DEVICE_DEFAULT_KEY,
  LIST_NAME_MAX,
  deviceCounts,
  deviceCreateList,
  deviceListOf,
  deviceRemove,
  deviceSave,
  type DeviceLists,
  type ListSummary,
} from "@/lib/lists/core";
import { newDeviceListKey, readDeviceLists, useDeviceLists, writeDeviceLists } from "@/lib/lists/device";
import { mergeDeviceListsIntoAccount } from "@/lib/lists/merge-client";
import { toast } from "@/lib/toast";
import { cn } from "@/lib/utils";
import { displayListName, isListErrorCode } from "./list-text";

type Option = { id: string; name: string; isDefault: boolean; count: number };

/** Account lists from the server, or the device copy (signed out); "error" offers a retry. */
type Source = { kind: "loading" } | { kind: "error" } | { kind: "device" } | { kind: "account"; lists: ListSummary[]; currentId: string | null };

async function loadSource(listingId: string): Promise<Source> {
  try {
    // Lists this device kept while signed out go into the account first.
    if ((await mergeDeviceListsIntoAccount()) === "signed_out") return { kind: "device" };
    const result = await getSaveTargetsAction(listingId);
    if (result.ok) return { kind: "account", lists: result.data.lists, currentId: result.data.currentListId };
    return result.error === "auth_required" ? { kind: "device" } : { kind: "error" };
  } catch {
    return { kind: "error" };
  }
}

function deviceOptions(device: DeviceLists): Option[] {
  const counts = deviceCounts(device);
  return [
    { id: DEVICE_DEFAULT_KEY, name: "", isDefault: true, count: counts[DEVICE_DEFAULT_KEY] ?? 0 },
    ...device.lists.map((list) => ({ id: list.key, name: list.name, isDefault: false, count: counts[list.key] ?? 0 })),
  ];
}

/**
 * "Save to a list" (round 3, brief 7.2): opened by a long press on the heart, its "Change list"
 * button or toast, and the saved page's "Move". Lists the user's lists (or this device's, signed
 * out) with the current one checked; choosing one saves the place there, or MOVES it (one list per
 * place). "New list" makes one and saves into it. Loaded on demand (next/dynamic).
 */
export function ListPickerSheet({
  open,
  onOpenChange,
  listingId,
  title,
  onSaved,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** Listing.id */
  listingId: string;
  /** The listing's title (the sheet's subtitle). */
  title: string;
  /** After a save, move or removal: whether the place is saved now, and where. */
  onSaved?: (saved: boolean, kind: "account" | "device") => void;
}) {
  const t = useTranslations("lists.saving");
  const tc = useTranslations("listingCard.favorite");
  const te = useTranslations("errors");
  const locale = useLocale();
  const ids = useId();
  const inputRef = useRef<HTMLInputElement>(null);
  const device = useDeviceLists();
  const [source, setSource] = useState<Source>({ kind: "loading" });
  const [attempt, setAttempt] = useState(0);
  const [busy, setBusy] = useState<string | null>(null);
  const [creating, setCreating] = useState(false);
  const [name, setName] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [nameError, setNameError] = useState<string | null>(null);
  const defaultName = t("defaultName");

  // (Re)load each time the sheet opens; the last lists stay visible until the new ones arrive.
  useEffect(() => {
    if (!open) return;
    let live = true;
    void loadSource(listingId).then((next) => {
      if (live) setSource(next);
    });
    return () => {
      live = false;
    };
  }, [open, listingId, attempt]);

  useEffect(() => {
    if (creating) inputRef.current?.focus();
  }, [creating]);

  const options: Option[] = source.kind === "account" ? source.lists : source.kind === "device" ? deviceOptions(device) : [];
  const currentId = source.kind === "account" ? source.currentId : source.kind === "device" ? deviceListOf(device, listingId) : null;
  const errorText = (code: string) => (isListErrorCode(code) ? t(`errors.${code}`) : te(errorMessageKey(code)));

  const close = () => {
    setCreating(false);
    setName("");
    setError(null);
    setNameError(null);
    onOpenChange(false);
  };

  const savedToast = (list: { name: string; isDefault: boolean }, moved: boolean, kind: "account" | "device") => {
    const shown = displayListName(list, defaultName);
    if (kind === "device") toast.success(t("heart.savedOnDeviceInList", { name: shown }), { description: t("heart.deviceHint") });
    else if (moved) toast.success(t("heart.movedTo", { name: shown }));
    else toast.success(list.isDefault ? tc("saved") : t("heart.savedToList", { name: shown }));
  };

  const writeDevice = (next: DeviceLists | null): boolean => {
    if (!next) {
      setError(t("errors.device_full"));
      return false;
    }
    if (!writeDeviceLists(next)) {
      setError(t("errors.storage_blocked"));
      return false;
    }
    return true;
  };

  const choose = async (option: Option) => {
    if (busy) return;
    if (option.id === currentId) return close();
    setError(null);
    if (source.kind === "device") {
      const moved = currentId !== null;
      if (!writeDevice(deviceSave(readDeviceLists(), listingId, option.id))) return;
      onSaved?.(true, "device");
      savedToast(option, moved, "device");
      return close();
    }
    setBusy(option.id);
    try {
      const result = await saveToListAction({ listingId, listId: option.id });
      if (!result.ok) return setError(errorText(result.error));
      onSaved?.(true, "account");
      savedToast(result.data.list, result.data.moved, "account");
      close();
    } catch {
      setError(t("errors.failed"));
    } finally {
      setBusy(null);
    }
  };

  const create = async (event: FormEvent) => {
    event.preventDefault();
    if (busy) return;
    setError(null);
    setNameError(null);
    if (source.kind === "device") {
      const made = deviceCreateList(readDeviceLists(), name, newDeviceListKey());
      if (!made.ok) {
        setNameError(t(`errors.${made.error === "not_found" ? "failed" : made.error}`));
        return inputRef.current?.focus();
      }
      if (!writeDevice(deviceSave(made.state, listingId, made.key))) return;
      onSaved?.(true, "device");
      savedToast({ name: name.trim(), isDefault: false }, false, "device");
      return close();
    }
    setBusy("create");
    try {
      const result = await createListAction({ name, listingId });
      if (!result.ok) {
        if (isListErrorCode(result.error) && result.error.startsWith("name_")) {
          setNameError(errorText(result.error));
          inputRef.current?.focus();
        } else setError(errorText(result.error));
        return;
      }
      onSaved?.(true, "account");
      savedToast(result.data.list, false, "account");
      close();
    } catch {
      setError(t("errors.failed"));
    } finally {
      setBusy(null);
    }
  };

  const remove = async () => {
    if (busy) return;
    setError(null);
    if (source.kind === "device") {
      if (!writeDevice(deviceRemove(readDeviceLists(), listingId))) return;
      onSaved?.(false, "device");
      toast(tc("removed"));
      return close();
    }
    setBusy("remove");
    try {
      const result = await toggleFavorite(listingId, false);
      if (!result.ok) return setError(errorText(result.error));
      onSaved?.(false, "account");
      toast(tc("removed"));
      close();
    } catch {
      setError(t("errors.failed"));
    } finally {
      setBusy(null);
    }
  };

  const countText = (count: number) => t("count", { count, countText: formatNumber(count, locale) });

  return (
    <BottomSheet
      open={open}
      onOpenChange={(next) => (next ? onOpenChange(true) : close())}
      title={t("sheet.title")}
      description={
        <span dir="auto" className="line-clamp-2">
          {title}
        </span>
      }
      footer={
        currentId !== null ? (
          <Button variant="ghost" block onClick={remove} disabled={busy !== null} aria-busy={busy === "remove" || undefined}>
            {busy === "remove" ? <LoaderIcon className="animate-spin" aria-hidden /> : <HeartOffIcon aria-hidden />}
            {t("sheet.remove")}
          </Button>
        ) : undefined
      }
    >
      <div className="grid gap-3">
        {source.kind === "loading" ? (
          <div role="status" className="grid gap-2">
            <span className="sr-only">{t("sheet.loading")}</span>
            {[0, 1, 2].map((i) => (
              <Skeleton key={i} className="h-16 rounded-input" />
            ))}
          </div>
        ) : source.kind === "error" ? (
          <div className="grid justify-items-start gap-3 rounded-input bg-surface-muted p-4">
            <p role="alert" className="text-small">
              {t("sheet.loadError")}
            </p>
            <Button variant="secondary" onClick={() => setAttempt((n) => n + 1)}>
              {t("sheet.retry")}
            </Button>
          </div>
        ) : (
          <>
            <ul aria-label={t("sheet.listsLabel")} className="grid gap-2">
              {options.map((option) => {
                const current = option.id === currentId;
                return (
                  <li key={option.id}>
                    <button
                      type="button"
                      onClick={() => void choose(option)}
                      disabled={busy !== null}
                      aria-current={current ? "true" : undefined}
                      className={cn(
                        "flex min-h-16 w-full items-center gap-3 rounded-input border px-3 py-2 text-start outline-none",
                        "transition-colors duration-(--motion-fast) focus-visible:ring-3 focus-visible:ring-ring/50 disabled:opacity-60",
                        current ? "border-primary bg-primary-tint" : "border-border bg-card hover:border-border-strong hover:bg-surface-muted",
                      )}
                    >
                      <span
                        aria-hidden
                        className={cn(
                          "flex size-10 shrink-0 items-center justify-center rounded-full",
                          current ? "bg-card text-primary-text" : "bg-surface-muted text-muted-foreground",
                        )}
                      >
                        {option.isDefault ? <HeartIcon className="size-5" /> : <ListIcon className="size-5" />}
                      </span>
                      <span className="grid min-w-0 flex-1 gap-0.5">
                        <span className="truncate text-body font-medium">
                          <span dir="auto">{displayListName(option, defaultName)}</span>
                        </span>
                        <span className="text-small text-muted-foreground">{countText(option.count)}</span>
                      </span>
                      {busy === option.id ? (
                        <LoaderIcon className="size-5 shrink-0 animate-spin text-muted-foreground" aria-hidden />
                      ) : current ? (
                        <>
                          <CheckIcon className="size-5 shrink-0 text-primary-text" aria-hidden />
                          <span className="sr-only">{t("sheet.current")}</span>
                        </>
                      ) : null}
                    </button>
                  </li>
                );
              })}
            </ul>

            {creating ? (
              <form onSubmit={create} className="grid gap-2 rounded-input border border-border bg-card p-3" noValidate>
                <label htmlFor={`${ids}-name`} className="text-small font-semibold">
                  {t("sheet.nameLabel")}
                </label>
                <Input
                  ref={inputRef}
                  id={`${ids}-name`}
                  dir="auto"
                  value={name}
                  maxLength={LIST_NAME_MAX + 20}
                  placeholder={t("sheet.namePlaceholder")}
                  onChange={(event) => {
                    setName(event.target.value);
                    setNameError(null);
                  }}
                  aria-invalid={nameError ? true : undefined}
                  aria-describedby={nameError ? `${ids}-name-error` : undefined}
                  autoComplete="off"
                  enterKeyHint="done"
                  className="h-12 text-body"
                />
                {nameError ? (
                  <p id={`${ids}-name-error`} role="alert" className="text-small text-destructive">
                    {nameError}
                  </p>
                ) : null}
                <div className="flex flex-wrap justify-end gap-2">
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    className="h-11"
                    onClick={() => {
                      setCreating(false);
                      setNameError(null);
                    }}
                    disabled={busy !== null}
                  >
                    {t("sheet.cancel")}
                  </Button>
                  <Button type="submit" size="sm" className="h-11" disabled={busy !== null} aria-busy={busy === "create" || undefined}>
                    {busy === "create" ? <LoaderIcon className="animate-spin" aria-hidden /> : null}
                    {t("sheet.create")}
                  </Button>
                </div>
              </form>
            ) : (
              <button
                type="button"
                onClick={() => setCreating(true)}
                disabled={busy !== null}
                className="flex min-h-14 w-full items-center gap-3 rounded-input border border-dashed border-border-strong px-3 py-2 text-start font-medium text-primary-text outline-none hover:bg-surface-muted focus-visible:ring-3 focus-visible:ring-ring/50"
              >
                <span aria-hidden className="flex size-10 shrink-0 items-center justify-center rounded-full bg-primary-tint">
                  <PlusIcon className="size-5" />
                </span>
                {t("sheet.newList")}
              </button>
            )}

            {error ? (
              <p role="alert" className="rounded-input bg-destructive/10 px-3 py-2 text-small text-destructive">
                {error}
              </p>
            ) : null}
            <p className="text-small text-pretty text-muted-foreground">
              {t("sheet.onePerPlace")}
              {source.kind === "device" ? ` ${t("sheet.onDevice")}` : null}
            </p>
          </>
        )}
      </div>
    </BottomSheet>
  );
}
