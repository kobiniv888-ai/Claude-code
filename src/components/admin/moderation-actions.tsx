"use client";

import { Check, PencilLine, RotateCcw, Undo2, XCircle } from "lucide-react";
import { useTranslations } from "next-intl";
import type { ListingStatus } from "@/generated/prisma/enums";
import { useRouter } from "@/i18n/navigation";
import {
  approveListingAction,
  rejectListingAction,
  requestChangesAction,
  restoreListingAction,
} from "@/lib/admin/actions/moderation";
import { ADMIN_TEXT_LIMITS } from "@/lib/admin/reasons";
import { MODERATION_REASONS } from "@/lib/listing/fields";
import { ActionDialog } from "./action-dialog";
import { useAdminAction } from "./use-admin-action";

const CAN_APPROVE: ListingStatus[] = ["IN_REVIEW", "NEEDS_CHANGES", "REJECTED"];
const CAN_REQUEST_CHANGES: ListingStatus[] = ["IN_REVIEW", "LIVE", "HIDDEN", "PAUSED"];
const CAN_REJECT: ListingStatus[] = ["IN_REVIEW", "NEEDS_CHANGES", "LIVE", "HIDDEN", "PAUSED", "EXPIRED"];

/**
 * Approve / ask for changes / reject / restore for one listing. Keyboard: A, C, R, U (restore).
 * After a decision on a listing in review, the next one in the queue opens.
 */
export function ModerationActions({
  listingId,
  status,
  title,
  ownerLocaleLabel,
}: {
  listingId: string;
  status: ListingStatus;
  title: string;
  ownerLocaleLabel: string;
}) {
  const t = useTranslations("admin.moderation.actions");
  const tReasons = useTranslations("moderation.reasons");
  const router = useRouter();
  const { run } = useAdminAction();
  const inReview = status === "IN_REVIEW";

  const reasonOptions = MODERATION_REASONS.map((code) => ({
    value: code,
    label: tReasons(`${code}.label`),
    hint: tReasons(`${code}.explanation`),
  }));

  const goNext = (next: { id: string } | null) => {
    if (inReview && next) router.push(`/admin/moderation/${next.id}`);
    else if (inReview) router.push("/admin/moderation");
  };

  const note = {
    label: t("noteLabel"),
    max: ADMIN_TEXT_LIMITS.note,
    placeholder: t("notePlaceholder"),
    hint: t("noteHint", { language: ownerLocaleLabel }),
  };

  return (
    <div className="flex flex-wrap gap-2">
      {CAN_APPROVE.includes(status) ? (
        <ActionDialog
          triggerLabel={t("approve")}
          triggerIcon={Check}
          triggerVariant="default"
          shortcut="a"
          title={t("approveTitle")}
          description={t("approveDescription", { title })}
          confirmLabel={t("approveConfirm")}
          onConfirm={() =>
            run(() => approveListingAction({ listingId }), { success: t("approved"), onSuccess: (d) => goNext(d.next) })
          }
        />
      ) : null}
      {status === "HIDDEN" ? (
        <ActionDialog
          triggerLabel={t("restore")}
          triggerIcon={RotateCcw}
          triggerVariant="default"
          shortcut="u"
          title={t("restoreTitle")}
          description={t("restoreDescription")}
          confirmLabel={t("restoreConfirm")}
          onConfirm={() => run(() => restoreListingAction({ listingId }), { success: t("restored") })}
        />
      ) : null}
      {CAN_REQUEST_CHANGES.includes(status) ? (
        <ActionDialog
          triggerLabel={t("requestChanges")}
          triggerIcon={PencilLine}
          shortcut="c"
          title={t("requestChangesTitle")}
          description={t("requestChangesDescription")}
          confirmLabel={t("requestChangesConfirm")}
          reason={{ label: t("reasonLabel"), options: reasonOptions }}
          note={note}
          onConfirm={(v) =>
            run(() => requestChangesAction({ listingId, reason: v.reason, note: v.note }), {
              success: t("changesRequested"),
              onSuccess: (d) => goNext(d.next),
            })
          }
        />
      ) : null}
      {CAN_REJECT.includes(status) ? (
        <ActionDialog
          triggerLabel={t("reject")}
          triggerIcon={status === "NEEDS_CHANGES" ? Undo2 : XCircle}
          triggerVariant="destructive"
          destructive
          shortcut="r"
          title={t("rejectTitle")}
          description={t("rejectDescription")}
          confirmLabel={t("rejectConfirm")}
          reason={{ label: t("reasonLabel"), options: reasonOptions }}
          note={note}
          onConfirm={(v) =>
            run(() => rejectListingAction({ listingId, reason: v.reason, note: v.note }), {
              success: t("rejected"),
              onSuccess: (d) => goNext(d.next),
            })
          }
        />
      ) : null}
    </div>
  );
}
