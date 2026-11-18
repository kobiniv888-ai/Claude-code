"use client";

import { Undo2 } from "lucide-react";
import { useTranslations } from "next-intl";
import { ActionDialog } from "@/components/admin/action-dialog";
import { useAdminAction } from "@/components/admin/use-admin-action";
import { clearNoShowAction } from "@/lib/admin/actions/flags";
import { FLAG_NOTE_MAX } from "@/lib/admin/flags";

/**
 * "Clear the no-show report" (round 3 phase-5 hardening, reviews-1): a host's "didn't arrive"
 * that was wrong. The booking is confirmed (or completed) again and the guest can review the stay.
 * A note is required (kept in the audit log only).
 */
export function ClearNoShowButton({ bookingId, label }: { bookingId: string; label: string }) {
  const t = useTranslations("admin.flags.noShowClear");
  const { run } = useAdminAction();
  return (
    <ActionDialog
      triggerLabel={t("button")}
      triggerIcon={Undo2}
      triggerClassName="h-8"
      title={t("title")}
      description={t("description", { label })}
      confirmLabel={t("confirm")}
      note={{ label: t("noteLabel"), required: true, max: FLAG_NOTE_MAX, hint: t("noteHint"), placeholder: t("notePlaceholder") }}
      onConfirm={({ note }) => run(() => clearNoShowAction({ bookingId, note }), { success: t("done") })}
    />
  );
}
