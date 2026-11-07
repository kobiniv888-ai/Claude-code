"use client";

import { EyeIcon, EyeOffIcon } from "lucide-react";
import { useTranslations } from "next-intl";
import { useId, useState } from "react";
import { useAdminAction } from "@/components/admin/use-admin-action";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { hideReviewAction, showReviewAction } from "@/lib/reviews/admin-actions";
import { REVIEW_HIDE_REASONS, type ReviewHideReason } from "@/lib/reviews/rules";

/**
 * Hide a review that breaks the rules (a reason and a note, both logged) or show it again (a
 * note). Never edit: the text and the stars stay as the guest wrote them. The guest and the host
 * are told by email with the reason's name, never the note.
 */
export function ReviewModerationForm({ reviewId, reportId, hidden }: { reviewId: string; reportId?: string; hidden: boolean }) {
  const t = useTranslations("reviews.admin");
  const id = useId();
  const { run, pending } = useAdminAction();
  const [reason, setReason] = useState<ReviewHideReason | "">("");
  const [note, setNote] = useState("");
  const [error, setError] = useState<string | null>(null);

  function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!hidden && !reason) return setError(t("reasonRequired"));
    if (note.trim().length < 2) return setError(t("noteRequired"));
    setError(null);
    void run(
      () => (hidden ? showReviewAction({ reviewId, note, reportId }) : hideReviewAction({ reviewId, reason, note, reportId })),
      { success: hidden ? t("shownDone") : t("hiddenDone"), onSuccess: () => setNote("") },
    );
  }

  return (
    <form onSubmit={submit} noValidate className="grid gap-3">
      {!hidden ? (
        <div className="grid gap-1.5">
          <Label htmlFor={`${id}-reason`} className="text-sm font-medium">
            {t("reasonLabel")}
          </Label>
          <select
            id={`${id}-reason`}
            value={reason}
            onChange={(e) => setReason(e.target.value as ReviewHideReason)}
            className="h-10 rounded-md border bg-background px-3 text-sm outline-none focus-visible:ring-3 focus-visible:ring-ring/50"
          >
            <option value="">{t("reasonPlaceholder")}</option>
            {REVIEW_HIDE_REASONS.map((code) => (
              <option key={code} value={code}>
                {t(`reasons.${code}`)}
              </option>
            ))}
          </select>
        </div>
      ) : null}
      <div className="grid gap-1.5">
        <Label htmlFor={`${id}-note`} className="text-sm font-medium">
          {hidden ? t("showNoteLabel") : t("noteLabel")}
        </Label>
        <Textarea
          id={`${id}-note`}
          dir={note ? "auto" : undefined}
          rows={3}
          maxLength={2000}
          value={note}
          onChange={(e) => setNote(e.target.value)}
          placeholder={t("notePlaceholder")}
        />
        <p className="text-xs text-muted-foreground">{t("noteHint")}</p>
      </div>
      {error ? (
        <p role="alert" className="text-sm text-destructive">
          {error}
        </p>
      ) : null}
      <div>
        <Button type="submit" variant={hidden ? "outline" : "destructive"} disabled={pending} className="min-h-11">
          {hidden ? <EyeIcon aria-hidden /> : <EyeOffIcon aria-hidden />}
          {hidden ? t("show") : t("hide")}
        </Button>
      </div>
    </form>
  );
}
