"use client";

import { MapPinCheck, Pencil } from "lucide-react";
import { useTranslations } from "next-intl";
import { useId, useState, type FormEvent } from "react";
import { useAdminAction } from "@/components/admin/use-admin-action";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { setVisitedAction } from "@/lib/admin/badges/actions";
import { VISIT_NOTE_MAX, VISIT_NOTE_MIN, earliestVisitDay, visitDateProblem } from "@/lib/admin/badges/rules";

/**
 * "Set the visit" / "Edit the visit" (ADMIN only; the server checks again): the visit date (not in
 * the future) and the internal note saying who visited. The note never reaches the public site.
 */
export function VisitDialog({
  listingId,
  listingLabel,
  today,
  current,
}: {
  listingId: string;
  /** "#1234 · Sunny flat in Vake", for the dialog text. */
  listingLabel: string;
  /** Today in the listing's country ("YYYY-MM-DD"): the latest day the picker allows. */
  today: string;
  /** The saved visit, when editing. */
  current: { visitedOn: string; note: string } | null;
}) {
  const t = useTranslations("admin.badges.dialog");
  const tDialog = useTranslations("admin.dialog");
  const { run } = useAdminAction();
  const id = useId();
  const [open, setOpen] = useState(false);
  const [visitedOn, setVisitedOn] = useState(current?.visitedOn ?? today);
  const [note, setNote] = useState(current?.note ?? "");
  const [busy, setBusy] = useState(false);
  const [showErrors, setShowErrors] = useState(false);

  const dateProblem = visitDateProblem(visitedOn, today);
  const noteMissing = note.trim().length < VISIT_NOTE_MIN;

  function onOpenChange(next: boolean) {
    if (busy) return;
    if (next) {
      setVisitedOn(current?.visitedOn ?? today);
      setNote(current?.note ?? "");
      setShowErrors(false);
    }
    setOpen(next);
  }

  async function submit(event: FormEvent) {
    event.preventDefault();
    if (dateProblem || noteMissing) {
      setShowErrors(true);
      return;
    }
    setBusy(true);
    try {
      const done = await run(() => setVisitedAction({ listingId, visitedOn, note: note.trim() }), {
        success: current ? t("updated") : t("saved"),
      });
      if (done) setOpen(false);
    } finally {
      setBusy(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogTrigger asChild>
        <Button type="button" variant={current ? "outline" : "default"} size="sm" className="h-8 min-h-11 sm:min-h-0">
          {current ? <Pencil aria-hidden /> : <MapPinCheck aria-hidden />}
          {current ? t("editTrigger") : t("setTrigger")}
        </Button>
      </DialogTrigger>
      <DialogContent className="sm:max-w-lg">
        <form onSubmit={submit} className="flex flex-col gap-4" noValidate>
          <DialogHeader>
            <DialogTitle>{current ? t("editTitle") : t("setTitle")}</DialogTitle>
            <DialogDescription>
              <bdi dir="auto">{listingLabel}</bdi>
              <span className="mt-1 block">{t("description")}</span>
            </DialogDescription>
          </DialogHeader>

          <div className="flex flex-col gap-1.5">
            <Label htmlFor={`${id}-date`}>{t("dateLabel")}</Label>
            <Input
              id={`${id}-date`}
              type="date"
              dir="ltr"
              min={earliestVisitDay(today)}
              max={today}
              value={visitedOn}
              onChange={(e) => setVisitedOn(e.target.value)}
              aria-invalid={showErrors && dateProblem ? true : undefined}
              aria-describedby={`${id}-date-hint`}
              className="w-full sm:w-56"
              required
            />
            <p id={`${id}-date-hint`} className="text-xs text-muted-foreground">
              {showErrors && dateProblem ? <span className="text-destructive">{t(`dateErrors.${dateProblem}`)}</span> : t("dateHint")}
            </p>
          </div>

          <div className="flex flex-col gap-1.5">
            <Label htmlFor={`${id}-note`}>{t("noteLabel")}</Label>
            <Textarea
              id={`${id}-note`}
              dir={note ? "auto" : undefined}
              rows={3}
              maxLength={VISIT_NOTE_MAX}
              placeholder={t("notePlaceholder")}
              value={note}
              onChange={(e) => setNote(e.target.value)}
              aria-invalid={showErrors && noteMissing ? true : undefined}
              aria-describedby={`${id}-note-hint`}
              required
            />
            <p id={`${id}-note-hint`} className="text-xs text-muted-foreground">
              {showErrors && noteMissing ? <span className="text-destructive">{tDialog("noteRequired")}</span> : t("noteHint")}
            </p>
          </div>

          <DialogFooter className="gap-2">
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)} disabled={busy}>
              {tDialog("cancel")}
            </Button>
            <Button type="submit" disabled={busy}>
              {busy ? tDialog("working") : t("confirm")}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
