"use client";

import { useEffect, useId, useRef, useState, useTransition, type FormEvent } from "react";
import { useTranslations } from "next-intl";
import { BellOffIcon, BellRingIcon, CalendarXIcon, LoaderIcon, PencilIcon, SearchIcon, Trash2Icon } from "lucide-react";
import { BottomSheet } from "@/components/ds/bottom-sheet";
import { Button, buttonStyles } from "@/components/ds/button";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import { Link, useRouter } from "@/i18n/navigation";
import { isolate } from "@/lib/format";
import { SAVED_SEARCH_NAME_MAX } from "@/lib/saved-searches/core";
import { deleteSavedSearchAction, renameSavedSearchAction, setSavedSearchActiveAction } from "@/lib/saved-searches/actions";
import { toast } from "@/lib/toast";
import { cn } from "@/lib/utils";

export type SavedSearchItem = {
  id: string;
  /** User text (dir="auto"). */
  name: string;
  /** "בטומי · לטווח קצר · 10–14 בדצמ׳ · 2 אורחים" (in the page language). */
  summary: string;
  /** "/search?city=batumi" */
  path: string;
  active: boolean;
  datesPassed: boolean;
  /** "מייל אחרון: 5 בנוב׳", or the "no email yet" line. */
  sentLine: string;
};

const OWN_ERRORS = new Set(["name_required", "name_too_long", "not_found"]);

/** The saved searches of /account/alerts: pause/resume, rename, delete, open (round 3, brief 7.4). */
export function SavedSearchList({ items }: { items: SavedSearchItem[] }) {
  const t = useTranslations("alerts.page.searches");
  const te = useTranslations("alerts.page.errors");
  const router = useRouter();
  const [active, setActive] = useState<Record<string, boolean>>(() => Object.fromEntries(items.map((item) => [item.id, item.active])));
  const [renaming, setRenaming] = useState<SavedSearchItem | null>(null);
  const [deleting, setDeleting] = useState<SavedSearchItem | null>(null);
  const [, startTransition] = useTransition();

  // Fresh rows from the server (after a refresh) win.
  const [seen, setSeen] = useState(items);
  if (seen !== items) {
    setSeen(items);
    setActive(Object.fromEntries(items.map((item) => [item.id, item.active])));
  }

  const errorText = (code: string | undefined) => (code && OWN_ERRORS.has(code) ? te(code) : te("failed"));

  const toggle = (item: SavedSearchItem, on: boolean) => {
    setActive((a) => ({ ...a, [item.id]: on }));
    startTransition(async () => {
      const result = await setSavedSearchActiveAction({ id: item.id, active: on }).catch(() => null);
      if (!result?.ok) {
        setActive((a) => ({ ...a, [item.id]: !on }));
        toast.error(errorText(result?.ok === false ? result.error : undefined));
        return;
      }
      toast.success(on ? t("resumed") : t("paused"));
      router.refresh();
    });
  };

  return (
    <>
      <ul className="grid gap-3" aria-label={t("title")}>
        {items.map((item) => {
          const on = active[item.id] ?? item.active;
          const StatusIcon = item.datesPassed ? CalendarXIcon : on ? BellRingIcon : BellOffIcon;
          const status = item.datesPassed ? t("status.datesPassed") : on ? t("status.active") : t("status.paused");
          return (
            <li key={item.id} data-saved-search={item.id} className="rounded-2xl border bg-card p-4">
              <div className="flex items-start gap-3">
                <span
                  className={cn(
                    "mt-0.5 flex size-10 shrink-0 items-center justify-center rounded-full",
                    on && !item.datesPassed ? "bg-primary-tint text-primary-text" : "bg-muted text-muted-foreground",
                  )}
                  aria-hidden="true"
                >
                  <StatusIcon className="size-5" />
                </span>
                <div className="grid min-w-0 flex-1 gap-1">
                  {/* The name keeps its own direction; the line keeps the page's alignment. */}
                  <h3 className="font-semibold break-words text-foreground">
                    <bdi dir="auto">{item.name}</bdi>
                  </h3>
                  <p className="text-sm text-pretty text-muted-foreground">{item.summary}</p>
                  <p className="text-xs text-muted-foreground">
                    <span className={cn("font-medium", on && !item.datesPassed ? "text-primary-text" : "text-foreground")}>{status}</span>
                    <span aria-hidden="true"> · </span>
                    {item.sentLine}
                  </p>
                </div>
                <Switch
                  checked={on}
                  onCheckedChange={(next) => toggle(item, next)}
                  aria-label={t("switchLabel", { name: item.name })}
                  className="mt-2.5 after:-inset-x-3 after:-inset-y-3.5"
                />
              </div>
              {item.datesPassed ? <p className="mt-3 rounded-xl bg-surface-muted px-3 py-2 text-sm text-pretty">{t("datesPassed")}</p> : null}
              <div className="mt-3 flex flex-wrap gap-1.5 border-t pt-3">
                <Link href={item.path} className={buttonStyles({ variant: "secondary", className: "min-h-11 max-w-full px-3" })}>
                  <SearchIcon aria-hidden="true" />
                  <span className="truncate">{t("open")}</span>
                </Link>
                <Button variant="ghost" size="sm" className="min-h-11 px-3" onClick={() => setRenaming(item)}>
                  <PencilIcon aria-hidden="true" />
                  {t("rename")}
                </Button>
                {/* A trash icon at the end keeps the row on one line on phones; it has its own name. */}
                <Button
                  variant="ghost"
                  size="icon"
                  className="ms-auto text-destructive hover:text-destructive"
                  aria-label={t("deleteLabel", { name: item.name })}
                  title={t("delete")}
                  onClick={() => setDeleting(item)}
                >
                  <Trash2Icon aria-hidden="true" />
                </Button>
              </div>
            </li>
          );
        })}
      </ul>
      <RenameSheet item={renaming} onClose={() => setRenaming(null)} errorText={errorText} />
      <DeleteSheet item={deleting} onClose={() => setDeleting(null)} errorText={errorText} />
    </>
  );
}

function RenameSheet({ item, onClose, errorText }: { item: SavedSearchItem | null; onClose: () => void; errorText: (code?: string) => string }) {
  const t = useTranslations("alerts.page.searches");
  const router = useRouter();
  const ids = useId();
  const inputRef = useRef<HTMLInputElement>(null);
  const [name, setName] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);
  const [current, setCurrent] = useState<SavedSearchItem | null>(null);
  // Remember the last item, so the sheet keeps its text while it slides away.
  if (item && item !== current) {
    setCurrent(item);
    setName(item.name);
    setError(null);
  }

  useEffect(() => {
    if (!item) return;
    const timer = window.setTimeout(() => inputRef.current?.select(), 300);
    return () => window.clearTimeout(timer);
  }, [item]);

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    if (!current || pending) return;
    setPending(true);
    setError(null);
    try {
      const result = await renameSavedSearchAction({ id: current.id, name });
      if (!result.ok) {
        setError(errorText(result.error));
        inputRef.current?.focus();
        return;
      }
      onClose();
      toast.success(t("renamed"));
      router.refresh();
    } catch {
      setError(errorText());
    } finally {
      setPending(false);
    }
  };

  return (
    <BottomSheet open={item !== null} onOpenChange={(open) => !open && !pending && onClose()} title={t("renameTitle")}>
      <form onSubmit={submit} className="grid gap-3 pb-1" noValidate>
        <label htmlFor={`${ids}-name`} className="text-small font-semibold">
          {t("nameLabel")}
        </label>
        <Input
          ref={inputRef}
          id={`${ids}-name`}
          dir="auto"
          value={name}
          maxLength={SAVED_SEARCH_NAME_MAX + 20}
          onChange={(event) => {
            setName(event.target.value);
            setError(null);
          }}
          aria-invalid={error ? true : undefined}
          aria-describedby={error ? `${ids}-error` : undefined}
          autoComplete="off"
          enterKeyHint="done"
          className="h-12 text-body"
        />
        {error ? (
          <p id={`${ids}-error`} role="alert" className="text-small text-destructive">
            {error}
          </p>
        ) : null}
        <div className="flex gap-2 pt-1">
          <Button type="button" variant="outline" className="min-w-0 flex-1" onClick={onClose} disabled={pending}>
            <span className="truncate">{t("cancel")}</span>
          </Button>
          <Button type="submit" className="min-w-0 flex-1" disabled={pending} aria-busy={pending || undefined}>
            {pending ? <LoaderIcon className="animate-spin" aria-hidden /> : null}
            <span className="truncate">{t("renameSubmit")}</span>
          </Button>
        </div>
      </form>
    </BottomSheet>
  );
}

function DeleteSheet({ item, onClose, errorText }: { item: SavedSearchItem | null; onClose: () => void; errorText: (code?: string) => string }) {
  const t = useTranslations("alerts.page.searches");
  const router = useRouter();
  const [pending, setPending] = useState(false);
  const [current, setCurrent] = useState<SavedSearchItem | null>(null);
  if (item && item !== current) setCurrent(item);

  const confirm = async () => {
    if (!current || pending) return;
    setPending(true);
    try {
      const result = await deleteSavedSearchAction({ id: current.id });
      if (!result.ok) {
        toast.error(errorText(result.error));
        return;
      }
      onClose();
      toast.success(t("deleted"));
      router.refresh();
    } catch {
      toast.error(errorText());
    } finally {
      setPending(false);
    }
  };

  return (
    <BottomSheet
      open={item !== null}
      onOpenChange={(open) => !open && !pending && onClose()}
      title={t("deleteTitle")}
      description={current ? t("deleteBody", { name: isolate(current.name) }) : null}
    >
      <div className="flex gap-2 pb-1">
        <Button type="button" variant="outline" className="min-w-0 flex-1" onClick={onClose} disabled={pending}>
          <span className="truncate">{t("cancel")}</span>
        </Button>
        <Button type="button" className="min-w-0 flex-1 bg-destructive text-destructive-foreground hover:bg-destructive/90 active:bg-destructive/90" onClick={confirm} disabled={pending} aria-busy={pending || undefined}>
          {pending ? <LoaderIcon className="animate-spin" aria-hidden /> : <Trash2Icon aria-hidden />}
          <span className="truncate">{t("deleteConfirm")}</span>
        </Button>
      </div>
    </BottomSheet>
  );
}
