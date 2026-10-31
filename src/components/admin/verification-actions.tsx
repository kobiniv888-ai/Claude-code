"use client";

import { Check, MessageSquareWarning, XCircle } from "lucide-react";
import { useTranslations } from "next-intl";
import { useRouter } from "@/i18n/navigation";
import { approveVerification, rejectVerification } from "@/lib/admin/actions/verifications";
import { ADMIN_TEXT_LIMITS, VERIFICATION_REASONS } from "@/lib/admin/reasons";
import { ActionDialog } from "./action-dialog";
import { useAdminAction } from "./use-admin-action";

/** Approve / reject / ask for more information. The documents are deleted after any decision. */
export function VerificationActions({
  requestId,
  typeLabel,
  name,
  canApprove,
}: {
  requestId: string;
  typeLabel: string;
  name: string;
  canApprove: boolean;
}) {
  const t = useTranslations("admin.verifications.actions");
  const tReasons = useTranslations("admin.verificationReasons");
  const router = useRouter();
  const { run } = useAdminAction();
  const reason = {
    label: t("reasonLabel"),
    options: VERIFICATION_REASONS.map((code) => ({ value: code, label: tReasons(`${code}.label`), hint: tReasons(`${code}.explanation`) })),
  };
  const note = { label: t("noteLabel"), max: ADMIN_TEXT_LIMITS.note, hint: t("noteHint") };
  const back = () => router.push("/admin/verifications");

  return (
    <div className="flex flex-wrap gap-2">
      <ActionDialog
        triggerLabel={t("approve")}
        triggerIcon={Check}
        triggerVariant="default"
        shortcut="a"
        disabled={!canApprove}
        title={t("approveTitle", { type: typeLabel })}
        description={t("approveDescription", { name })}
        confirmLabel={t("approveConfirm")}
        onConfirm={() => run(() => approveVerification({ requestId }), { success: t("approved"), onSuccess: back })}
      />
      <ActionDialog
        triggerLabel={t("needMoreInfo")}
        triggerIcon={MessageSquareWarning}
        shortcut="m"
        title={t("needMoreInfoTitle")}
        description={t("needMoreInfoDescription")}
        confirmLabel={t("needMoreInfoConfirm")}
        reason={reason}
        note={note}
        onConfirm={(v) =>
          run(() => rejectVerification({ requestId, outcome: "NEEDS_MORE_INFO", reason: v.reason, note: v.note }), {
            success: t("sentBack"),
            onSuccess: back,
          })
        }
      />
      <ActionDialog
        triggerLabel={t("reject")}
        triggerIcon={XCircle}
        triggerVariant="destructive"
        destructive
        shortcut="r"
        title={t("rejectTitle")}
        description={t("rejectDescription")}
        confirmLabel={t("rejectConfirm")}
        reason={reason}
        note={note}
        onConfirm={(v) =>
          run(() => rejectVerification({ requestId, outcome: "REJECTED", reason: v.reason, note: v.note }), {
            success: t("rejected"),
            onSuccess: back,
          })
        }
      />
    </div>
  );
}
