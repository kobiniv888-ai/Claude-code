"use client";

import { AlertTriangle, CheckCircle2, EyeOff, RotateCcw, XCircle } from "lucide-react";
import { useTranslations } from "next-intl";
import {
  dismissReport,
  hideReportedListing,
  resolveReport,
  restoreReportedListing,
  warnReportedUser,
} from "@/lib/admin/actions/reports";
import { ADMIN_TEXT_LIMITS, USER_ACTION_REASONS } from "@/lib/admin/reasons";
import { ActionDialog } from "./action-dialog";
import { useAdminAction } from "./use-admin-action";

/** Resolve / dismiss a report, hide or restore the listing, warn the reported account. */
export function ReportActions({
  reportId,
  open,
  listingStatus,
  canWarn,
  accountName,
}: {
  reportId: string;
  open: boolean;
  listingStatus: string | null;
  canWarn: boolean;
  accountName: string | null;
}) {
  const t = useTranslations("admin.reports.actions");
  const tReasons = useTranslations("admin.userReasons");
  const { run } = useAdminAction();

  return (
    <div className="flex flex-wrap gap-2">
      {open ? (
        <>
          <ActionDialog
            triggerLabel={t("resolve")}
            triggerIcon={CheckCircle2}
            triggerVariant="default"
            title={t("resolveTitle")}
            description={t("resolveDescription")}
            confirmLabel={t("resolveConfirm")}
            note={{ label: t("resolutionLabel"), required: true, max: ADMIN_TEXT_LIMITS.resolution, placeholder: t("resolutionPlaceholder") }}
            onConfirm={(v) => run(() => resolveReport({ reportId, resolution: v.note }), { success: t("resolved") })}
          />
          <ActionDialog
            triggerLabel={t("dismiss")}
            triggerIcon={XCircle}
            title={t("dismissTitle")}
            description={t("dismissDescription")}
            confirmLabel={t("dismissConfirm")}
            note={{ label: t("resolutionLabel"), max: ADMIN_TEXT_LIMITS.resolution }}
            onConfirm={(v) => run(() => dismissReport({ reportId, resolution: v.note }), { success: t("dismissed") })}
          />
        </>
      ) : null}
      {listingStatus === "LIVE" ? (
        <ActionDialog
          triggerLabel={t("hide")}
          triggerIcon={EyeOff}
          triggerVariant="destructive"
          destructive
          title={t("hideTitle")}
          description={t("hideDescription")}
          confirmLabel={t("hideConfirm")}
          onConfirm={() => run(() => hideReportedListing({ reportId }), { success: t("hidden") })}
        />
      ) : null}
      {listingStatus === "HIDDEN" ? (
        <ActionDialog
          triggerLabel={t("restore")}
          triggerIcon={RotateCcw}
          title={t("restoreTitle")}
          description={t("restoreDescription")}
          confirmLabel={t("restoreConfirm")}
          onConfirm={() => run(() => restoreReportedListing({ reportId }), { success: t("restored") })}
        />
      ) : null}
      {canWarn && accountName ? (
        <ActionDialog
          triggerLabel={t("warn")}
          triggerIcon={AlertTriangle}
          title={t("warnTitle", { name: accountName })}
          description={t("warnDescription")}
          confirmLabel={t("warnConfirm")}
          reason={{
            label: t("reasonLabel"),
            options: USER_ACTION_REASONS.map((code) => ({
              value: code,
              label: tReasons(`${code}.label`),
              hint: tReasons(`${code}.explanation`),
            })),
          }}
          note={{ label: t("noteLabel"), max: ADMIN_TEXT_LIMITS.note, hint: t("noteHint") }}
          onConfirm={(v) =>
            run(() => warnReportedUser({ reportId, reason: v.reason, note: v.note }), { success: t("warned") })
          }
        />
      ) : null}
    </div>
  );
}
