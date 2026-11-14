"use client";

import { Send } from "lucide-react";
import { useTranslations } from "next-intl";
import { ActionDialog } from "@/components/admin/action-dialog";
import { useAdminAction } from "@/components/admin/use-admin-action";
import { resendOutboxEmailAction } from "@/lib/admin/actions/outbox";
import { toast } from "@/lib/toast";

/** "Send again" for an email that was only kept in the outbox (shown once Resend is set up). */
export function ResendButton({ id, to, when }: { id: string; to: string; when: string }) {
  const t = useTranslations("adminContent.outbox.resend");
  const { run } = useAdminAction();
  return (
    <ActionDialog
      triggerLabel={t("button")}
      triggerIcon={Send}
      triggerVariant="default"
      title={t("title")}
      description={t("description", { to: `\u2068${to}\u2069`, when })}
      confirmLabel={t("confirm")}
      onConfirm={() =>
        run(() => resendOutboxEmailAction({ id }), {
          onSuccess: (data) => (data.sent ? toast.success(t("sent")) : toast.error(t("failed"))),
        })
      }
    />
  );
}
