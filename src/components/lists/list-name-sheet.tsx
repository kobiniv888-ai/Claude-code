"use client";

import { useEffect, useId, useRef, useState, type FormEvent } from "react";
import { useTranslations } from "next-intl";
import { LoaderIcon } from "lucide-react";
import { BottomSheet } from "@/components/ds/bottom-sheet";
import { Button } from "@/components/ds/button";
import { Input } from "@/components/ui/input";
import { LIST_NAME_MAX } from "@/lib/lists/core";

/**
 * A sheet with one field: the name of a new list, or a new name for a list. `onSubmit` returns
 * null when it worked, or the text of the error to show under the field. Every opening starts
 * from `initial` with no error, however it was closed last time (the parent after a save,
 * Cancel, Escape, a swipe) and whichever list it is for (ui-1, ui-2).
 */
export function ListNameSheet({
  open,
  onOpenChange,
  title,
  action,
  initial = "",
  onSubmit,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: string;
  /** The submit button's label. */
  action: string;
  initial?: string;
  onSubmit: (name: string) => Promise<string | null>;
}) {
  const t = useTranslations("lists.saving.sheet");
  const ids = useId();
  const inputRef = useRef<HTMLInputElement>(null);
  const [name, setName] = useState(initial);
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);
  // Reset while rendering when the sheet opens (not in an effect: no frame with the old text).
  const [wasOpen, setWasOpen] = useState(open);
  if (open !== wasOpen) {
    setWasOpen(open);
    if (open) {
      setName(initial);
      setError(null);
    }
  }

  const close = () => {
    if (pending) return;
    onOpenChange(false);
  };

  useEffect(() => {
    if (!open) return;
    const timer = window.setTimeout(() => inputRef.current?.focus(), 300);
    return () => window.clearTimeout(timer);
  }, [open]);

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    if (pending) return;
    setPending(true);
    setError(null);
    try {
      const problem = await onSubmit(name);
      if (problem) {
        setError(problem);
        inputRef.current?.focus();
      }
    } finally {
      setPending(false);
    }
  };

  return (
    <BottomSheet
      open={open}
      onOpenChange={(next) => (next ? onOpenChange(true) : close())}
      title={title}
    >
      <form onSubmit={submit} className="grid gap-3 pb-1" noValidate>
        <label htmlFor={`${ids}-name`} className="text-small font-semibold">
          {t("nameLabel")}
        </label>
        <Input
          ref={inputRef}
          id={`${ids}-name`}
          dir="auto"
          value={name}
          maxLength={LIST_NAME_MAX + 20}
          placeholder={t("namePlaceholder")}
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
        <div className="flex gap-2">
          <Button type="button" variant="outline" className="min-w-0 flex-1" onClick={close} disabled={pending}>
            <span className="truncate">{t("cancel")}</span>
          </Button>
          <Button type="submit" className="min-w-0 flex-1" disabled={pending} aria-busy={pending || undefined}>
            {pending ? <LoaderIcon className="animate-spin" aria-hidden /> : null}
            <span className="truncate">{action}</span>
          </Button>
        </div>
      </form>
    </BottomSheet>
  );
}
