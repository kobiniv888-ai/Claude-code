"use client";

import { MapPinX } from "lucide-react";
import { useTranslations } from "next-intl";
import { ActionDialog } from "@/components/admin/action-dialog";
import { useAdminAction } from "@/components/admin/use-admin-action";
import { clearVisitedAction } from "@/lib/admin/badges/actions";
import { CLEAR_NOTE_MAX } from "@/lib/admin/badges/rules";

/** Remove "ביקרנו במקום" (ADMIN only; the server checks again). The visit stays in the audit log. */
export function ClearVisitButton({ listingId, listingLabel }: { listingId: string; listingLabel: string }) {
  const t = useTranslations("admin.badges.clear");
  const { run } = useAdminAction();
  return (
    <ActionDialog
      triggerLabel={t("trigger")}
      triggerIcon={MapPinX}
      triggerVariant="ghost"
      triggerSize="sm"
      triggerClassName="h-8 text-destructive hover:text-destructive"
      title={t("title")}
      description={t("description", { listing: listingLabel })}
      confirmLabel={t("confirm")}
      destructive
      note={{ label: t("noteLabel"), max: CLEAR_NOTE_MAX, placeholder: t("notePlaceholder") }}
      onConfirm={(values) => run(() => clearVisitedAction({ listingId, note: values.note }), { success: t("done") })}
    />
  );
}
