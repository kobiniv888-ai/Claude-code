"use client";

import { StickyNote } from "lucide-react";
import { useTranslations } from "next-intl";
import { useState } from "react";
import { useAdminAction } from "@/components/admin/use-admin-action";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { saveReportNote } from "@/lib/admin/actions/reports";
import { ADMIN_TEXT_LIMITS } from "@/lib/admin/reasons";

/** The report's internal notes (Report.adminNote): staff only, never sent to the guest or the host. */
export function ReportNoteForm({ reportId, initial, readOnly }: { reportId: string; initial: string; readOnly: boolean }) {
  const t = useTranslations("admin.reports.notes");
  const [body, setBody] = useState(initial);
  const { run, pending } = useAdminAction();
  const changed = body.trim() !== initial.trim();
  return (
    <form
      className="flex flex-col gap-2"
      onSubmit={(e) => {
        e.preventDefault();
        if (!changed) return;
        void run(() => saveReportNote({ reportId, note: body }), { success: t("saved") });
      }}
    >
      <Label htmlFor="report-admin-note" className="sr-only">
        {t("label")}
      </Label>
      <Textarea
        id="report-admin-note"
        dir={body ? "auto" : undefined}
        rows={4}
        maxLength={ADMIN_TEXT_LIMITS.adminNote}
        placeholder={t("placeholder")}
        value={body}
        readOnly={readOnly}
        onChange={(e) => setBody(e.target.value)}
        className="bg-surface-muted/40"
      />
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="text-xs text-muted-foreground">{t("hint")}</p>
        {readOnly ? null : (
          <Button type="submit" size="sm" disabled={pending || !changed}>
            <StickyNote aria-hidden />
            {t("save")}
          </Button>
        )}
      </div>
    </form>
  );
}
