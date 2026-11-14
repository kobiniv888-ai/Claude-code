"use client";

import { CheckCheck } from "lucide-react";
import { useTranslations } from "next-intl";
import { useRouter } from "@/i18n/navigation";
import { ActionDialog } from "@/components/admin/action-dialog";
import { useAdminAction } from "@/components/admin/use-admin-action";
import {
  markBookingFlagReviewedAction,
  markGuestFlagReviewedAction,
  markHostFlagReviewedAction,
  markLongStayReviewedAction,
  markDeviceFlagReviewedAction,
} from "@/lib/admin/actions/flags";
import { FLAG_NOTE_MAX } from "@/lib/admin/flags";

type Target =
  | { bookingId: string }
  | { userId: string; seenLatest: string | null }
  /** A long stay (decision 7): the "reviewed" marker is an audit entry only. */
  | { longStayId: string }
  /** A guest with repeated cancellations or no-shows (decision 7): an audit entry only. */
  | { guestId: string; seenLatest: string | null }
  /** An account over the accounts-per-device cap (SECURITY_REPORT 3.8.b): an audit entry only. */
  | { deviceUserId: string; seenLatest: string | null };

function kindOf(target: Target): "booking" | "host" | "longStay" | "guest" | "device" {
  if ("bookingId" in target) return "booking";
  if ("deviceUserId" in target) return "device";
  if ("longStayId" in target) return "longStay";
  if ("guestId" in target) return "guest";
  return "host";
}

function send(target: Target, note: string) {
  if ("bookingId" in target) return markBookingFlagReviewedAction({ bookingId: target.bookingId, note });
  if ("longStayId" in target) return markLongStayReviewedAction({ bookingId: target.longStayId, note });
  if ("guestId" in target) return markGuestFlagReviewedAction({ userId: target.guestId, note, seenLatest: target.seenLatest });
  if ("deviceUserId" in target) return markDeviceFlagReviewedAction({ userId: target.deviceUserId, note, seenLatest: target.seenLatest });
  return markHostFlagReviewedAction({ userId: target.userId, note, seenLatest: target.seenLatest });
}

/**
 * "Mark reviewed" with a required note, for a booking flag, a host's report flag, a long stay or a
 * guest's repeat flag. A host or guest flag sends the newest event the page showed (`seenLatest`,
 * ISO): one that arrived meanwhile refuses ("changed_since_view") and the page reloads, so nobody
 * closes something they never saw. The server checks everything again.
 */
export function FlagReviewButton({ target, label }: { target: Target; label: string }) {
  const t = useTranslations("admin.flags.review");
  const { run } = useAdminAction();
  const router = useRouter();
  const kind = kindOf(target);
  return (
    <ActionDialog
      triggerLabel={t("button")}
      triggerIcon={CheckCheck}
      triggerClassName="h-8"
      title={t(`${kind}Title`)}
      description={t(`${kind}Description`, { label })}
      confirmLabel={t("confirm")}
      note={{ label: t("noteLabel"), required: true, max: FLAG_NOTE_MAX, hint: t("noteHint"), placeholder: t("notePlaceholder") }}
      onConfirm={({ note }) =>
        run(() => send(target, note), { success: t("done"), onError: (code) => (code === "changed_since_view" ? router.refresh() : undefined) })
      }
    />
  );
}
