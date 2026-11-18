"use client";

import { Archive, ArchiveRestore } from "lucide-react";
import { useTranslations } from "next-intl";
import { ActionDialog } from "@/components/admin/action-dialog";
import { useAdminAction } from "@/components/admin/use-admin-action";
import { setReferencePriceActiveAction } from "@/lib/admin/actions/reference-prices";

/** Deactivate a reference price (hidden from the price guide) or turn it back on. */
export function ReferenceActiveButton({ id, active, label }: { id: string; active: boolean; label: string }) {
  const t = useTranslations("admin.referencePrices.active");
  const { run } = useAdminAction();
  return (
    <ActionDialog
      triggerLabel={active ? t("deactivate") : t("reactivate")}
      triggerIcon={active ? Archive : ArchiveRestore}
      triggerClassName="h-8"
      title={active ? t("deactivateTitle") : t("reactivateTitle")}
      description={active ? t("deactivateDescription", { label }) : t("reactivateDescription", { label })}
      confirmLabel={active ? t("deactivateConfirm") : t("reactivateConfirm")}
      destructive={active}
      onConfirm={() => run(() => setReferencePriceActiveAction({ id, active: !active }), { success: active ? t("deactivated") : t("reactivated") })}
    />
  );
}
