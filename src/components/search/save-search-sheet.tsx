"use client";

import { useEffect, useId, useRef, useState, type FormEvent } from "react";
import { useTranslations } from "next-intl";
import { BellRingIcon, LoaderIcon } from "lucide-react";
import { BottomSheet } from "@/components/ds/bottom-sheet";
import { Button } from "@/components/ds/button";
import { Input } from "@/components/ui/input";
import { useRouter } from "@/i18n/navigation";
import { errorMessageKey } from "@/lib/errors";
import { isolate } from "@/lib/format";
import { SAVED_SEARCH_NAME_MAX } from "@/lib/saved-searches/core";
import { saveSearchAction } from "@/lib/saved-searches/actions";
import { toast } from "@/lib/toast";

/** Error codes with their own text in alerts.save.errors (the rest use the shared "errors"). */
const OWN_ERRORS = new Set(["name_required", "name_too_long", "too_many_searches"]);

/**
 * The sheet behind "שמירת חיפוש": one field with the prefilled, editable name. Loaded at the
 * first tap (./save-search-button.tsx). Saving the same search twice keeps one (the toast says
 * it was saved before).
 */
export function SaveSearchSheet({
  open,
  onOpenChange,
  defaultName,
  query,
  onReopenAfterLogin,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  defaultName: string;
  /** The search's URL parameters ("deal=short-stay&city=batumi"). */
  query: string;
  /** The session ended meanwhile: sign in again, then reopen. */
  onReopenAfterLogin: () => void;
}) {
  const t = useTranslations("alerts.save");
  const te = useTranslations("errors");
  const router = useRouter();
  const ids = useId();
  const inputRef = useRef<HTMLInputElement>(null);
  const [name, setName] = useState(defaultName);
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);
  const [openedFor, setOpenedFor] = useState({ open, defaultName });

  // Each opening starts from the current search's name.
  if (openedFor.open !== open || openedFor.defaultName !== defaultName) {
    setOpenedFor({ open, defaultName });
    if (open) {
      setName(defaultName);
      setError(null);
    }
  }

  useEffect(() => {
    if (!open) return;
    const timer = window.setTimeout(() => inputRef.current?.select(), 300);
    return () => window.clearTimeout(timer);
  }, [open]);

  const manage = { label: t("manage"), onClick: () => router.push("/account/alerts") };

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    if (pending) return;
    setPending(true);
    setError(null);
    try {
      const result = await saveSearchAction({ query, name });
      if (!result.ok) {
        if (result.error === "auth_required") {
          onOpenChange(false);
          onReopenAfterLogin();
          return;
        }
        setError(OWN_ERRORS.has(result.error) ? t(`errors.${result.error}`) : errorMessageKey(result.error) === "rate_limited" ? te("rate_limited") : t("errors.failed"));
        inputRef.current?.focus();
        return;
      }
      onOpenChange(false);
      if (result.data.status === "exists") {
        toast(t("exists", { name: isolate(result.data.name) }), { action: manage });
      } else {
        toast.success(t("saved", { name: isolate(result.data.name) }), {
          description: result.data.emailsOn ? t("savedHint") : t("savedOffHint"),
          action: manage,
        });
      }
      // The button now reads "החיפוש שמור".
      router.refresh();
    } catch {
      setError(t("errors.failed"));
    } finally {
      setPending(false);
    }
  };

  return (
    <BottomSheet
      open={open}
      onOpenChange={(next) => {
        if (!pending) onOpenChange(next);
      }}
      title={t("sheetTitle")}
      description={t("sheetLead")}
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
          maxLength={SAVED_SEARCH_NAME_MAX + 20}
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
        <div className="flex gap-2 pt-1">
          <Button type="button" variant="outline" className="min-w-0 flex-1" onClick={() => onOpenChange(false)} disabled={pending}>
            <span className="truncate">{t("cancel")}</span>
          </Button>
          <Button type="submit" className="min-w-0 flex-1" disabled={pending} aria-busy={pending || undefined}>
            {pending ? <LoaderIcon className="animate-spin" aria-hidden /> : <BellRingIcon aria-hidden />}
            <span className="truncate">{t("submit")}</span>
          </Button>
        </div>
      </form>
    </BottomSheet>
  );
}
