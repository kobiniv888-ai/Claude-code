"use client";

import { CheckCheck } from "lucide-react";
import { useTranslations } from "next-intl";
import { useRouter } from "@/i18n/navigation";
import { ActionDialog } from "@/components/admin/action-dialog";
import { useAdminAction } from "@/components/admin/use-admin-action";
import { markBookingFlagReviewedAction, markHostFlagReviewedAction } from "@/lib/admin/actions/flags";
import { FLAG_NOTE_MAX } from "@/lib/admin/flags";

/**
 * "Mark reviewed" with a required note, for a booking flag or a host's report flag. A host flag
 * sends the newest report the page showed (`seenLatest`, ISO): one that arrived meanwhile refuses
 * ("changed_since_view") and the page reloads, so nobody closes a report they never saw.
 */
export function FlagReviewButton({
  target,
  label,
}: {
  target: { bookingId: string } | { userId: string; seenLatest: string | null };
  label: string;
}) {
  const t = useTranslations("admin.flags.review");
  const { run } = useAdminAction();
  const router = useRouter();
  const isBooking = "bookingId" in target;
  return (
    <ActionDialog
      triggerLabel={t("button")}
      triggerIcon={CheckCheck}
      triggerClassName="h-8"
      title={t(isBooking ? "bookingTitle" : "hostTitle")}
      description={t(isBooking ? "bookingDescription" : "hostDescription", { label })}
      confirmLabel={t("confirm")}
      note={{ label: t("noteLabel"), required: true, max: FLAG_NOTE_MAX, hint: t("noteHint"), placeholder: t("notePlaceholder") }}
      onConfirm={({ note }) =>
        run(
          () =>
            "bookingId" in target
              ? markBookingFlagReviewedAction({ bookingId: target.bookingId, note })
              : markHostFlagReviewedAction({ userId: target.userId, note, seenLatest: target.seenLatest }),
          { success: t("done"), onError: (code) => (code === "changed_since_view" ? router.refresh() : undefined) },
        )
      }
    />
  );
}
