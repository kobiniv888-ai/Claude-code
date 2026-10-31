"use client";

import type { LucideIcon } from "lucide-react";
import { useTranslations } from "next-intl";
import { useEffect, useId, useState, type FormEvent, type ReactNode } from "react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Kbd } from "@/components/ui/kbd";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { cn } from "@/lib/utils";

/**
 * A button that opens a confirmation dialog, optionally asking for a reason, a note and/or a
 * date, then runs `onConfirm`. `shortcut` opens it from the keyboard (ignored while typing).
 */

export type ActionDialogValues = { reason: string; note: string; date: string };

type ButtonVariant = "default" | "outline" | "secondary" | "ghost" | "destructive";

export function ActionDialog({
  triggerLabel,
  triggerIcon: Icon,
  triggerVariant = "outline",
  triggerClassName,
  title,
  description,
  confirmLabel,
  destructive = false,
  reason,
  note,
  date,
  children,
  shortcut,
  disabled,
  onConfirm,
}: {
  triggerLabel: string;
  triggerIcon?: LucideIcon;
  triggerVariant?: ButtonVariant;
  triggerClassName?: string;
  title: string;
  description?: ReactNode;
  confirmLabel: string;
  destructive?: boolean;
  reason?: { label: string; options: { value: string; label: string; hint?: string }[] };
  note?: { label: string; required?: boolean; max: number; placeholder?: string; hint?: string; rows?: number };
  date?: { label: string; min: string; max?: string };
  children?: ReactNode;
  shortcut?: string;
  disabled?: boolean;
  onConfirm: (values: ActionDialogValues) => Promise<boolean>;
}) {
  const t = useTranslations("admin.dialog");
  const id = useId();
  const [open, setOpen] = useState(false);
  const [values, setValues] = useState<ActionDialogValues>({ reason: "", note: "", date: "" });
  const [busy, setBusy] = useState(false);
  const [showErrors, setShowErrors] = useState(false);

  useEffect(() => {
    if (!shortcut || disabled) return;
    function onKey(event: KeyboardEvent) {
      if (event.defaultPrevented || event.metaKey || event.ctrlKey || event.altKey) return;
      const target = event.target as HTMLElement | null;
      if (target && (target.closest("input, textarea, select, [contenteditable=true], [role=dialog], [role=listbox]") !== null)) return;
      if (event.key.toLowerCase() === shortcut) {
        event.preventDefault();
        setOpen(true);
      }
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [shortcut, disabled]);

  const missingReason = !!reason && !values.reason;
  const missingNote = !!note?.required && values.note.trim().length < 2;
  const missingDate = !!date && (!values.date || values.date < date.min || (!!date.max && values.date > date.max));
  const selected = reason?.options.find((o) => o.value === values.reason);

  async function submit(event: FormEvent) {
    event.preventDefault();
    if (missingReason || missingNote || missingDate) {
      setShowErrors(true);
      return;
    }
    setBusy(true);
    try {
      const done = await onConfirm({ ...values, note: values.note.trim() });
      if (done) {
        setOpen(false);
        setValues({ reason: "", note: "", date: "" });
        setShowErrors(false);
      }
    } finally {
      setBusy(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={(next) => !busy && setOpen(next)}>
      <DialogTrigger asChild>
        <Button
          type="button"
          variant={triggerVariant}
          disabled={disabled}
          aria-keyshortcuts={shortcut}
          className={cn("h-9", triggerClassName)}
        >
          {Icon ? <Icon aria-hidden /> : null}
          {triggerLabel}
          {shortcut ? (
            <Kbd className="ms-1 hidden uppercase md:inline-flex" aria-hidden>
              {shortcut}
            </Kbd>
          ) : null}
        </Button>
      </DialogTrigger>
      <DialogContent className="sm:max-w-lg">
        <form onSubmit={submit} className="flex flex-col gap-4" noValidate>
          <DialogHeader>
            <DialogTitle>{title}</DialogTitle>
            {description ? <DialogDescription>{description}</DialogDescription> : null}
          </DialogHeader>

          {children}

          {reason ? (
            <div className="flex flex-col gap-1.5">
              <Label htmlFor={`${id}-reason`}>{reason.label}</Label>
              <Select value={values.reason} onValueChange={(v) => setValues((s) => ({ ...s, reason: v }))}>
                <SelectTrigger
                  id={`${id}-reason`}
                  className="w-full"
                  aria-invalid={showErrors && missingReason ? true : undefined}
                  aria-describedby={`${id}-reason-hint`}
                >
                  <SelectValue placeholder={t("chooseReason")} />
                </SelectTrigger>
                <SelectContent className="max-h-72">
                  {reason.options.map((o) => (
                    <SelectItem key={o.value} value={o.value}>
                      {o.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <p id={`${id}-reason-hint`} className="text-xs text-muted-foreground">
                {showErrors && missingReason ? (
                  <span className="text-destructive">{t("reasonRequired")}</span>
                ) : selected?.hint ? (
                  <>
                    <span className="font-medium">{t("userWillRead")}</span> {selected.hint}
                  </>
                ) : null}
              </p>
            </div>
          ) : null}

          {date ? (
            <div className="flex flex-col gap-1.5">
              <Label htmlFor={`${id}-date`}>{date.label}</Label>
              <Input
                id={`${id}-date`}
                type="date"
                dir="ltr"
                min={date.min}
                max={date.max}
                value={values.date}
                onChange={(e) => setValues((s) => ({ ...s, date: e.target.value }))}
                aria-invalid={showErrors && missingDate ? true : undefined}
                className="w-full sm:w-56"
              />
              {showErrors && missingDate ? <p className="text-xs text-destructive">{t("dateRequired")}</p> : null}
            </div>
          ) : null}

          {note ? (
            <div className="flex flex-col gap-1.5">
              <Label htmlFor={`${id}-note`}>
                {note.label}
                {!note.required ? <span className="ms-1 font-normal text-muted-foreground">{t("optional")}</span> : null}
              </Label>
              <Textarea
                id={`${id}-note`}
                dir="auto"
                rows={note.rows ?? 3}
                maxLength={note.max}
                placeholder={note.placeholder}
                value={values.note}
                onChange={(e) => setValues((s) => ({ ...s, note: e.target.value }))}
                aria-invalid={showErrors && missingNote ? true : undefined}
              />
              {showErrors && missingNote ? (
                <p className="text-xs text-destructive">{t("noteRequired")}</p>
              ) : note.hint ? (
                <p className="text-xs text-muted-foreground">{note.hint}</p>
              ) : null}
            </div>
          ) : null}

          <DialogFooter className="gap-2">
            <Button type="button" variant="outline" onClick={() => setOpen(false)} disabled={busy}>
              {t("cancel")}
            </Button>
            <Button type="submit" variant={destructive ? "destructive" : "default"} disabled={busy}>
              {busy ? t("working") : confirmLabel}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
