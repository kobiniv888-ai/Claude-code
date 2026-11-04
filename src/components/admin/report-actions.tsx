"use client";

import { AlertTriangle, CheckCircle2, EyeOff, RotateCcw, UserRoundX, UserRoundSearch, XCircle } from "lucide-react";
import { useTranslations } from "next-intl";
import {
  dismissReport,
  hideHostListings,
  hideReportedListing,
  removeReportedHost,
  resolveReport,
  restoreReportedListing,
  revealReporter,
  warnReportedUser,
} from "@/lib/admin/actions/reports";
import { ADMIN_TEXT_LIMITS, USER_ACTION_REASONS } from "@/lib/admin/reasons";
import { ActionDialog } from "./action-dialog";
import { useAdminAction } from "./use-admin-action";

/**
 * The decisions on a report (round 3, brief 8.2): dismiss (nobody is emailed), warn the host,
 * hide all the host's listings, remove the host — each with a reason, each closes the report —
 * and, separately, "tell the host who reported" (turned-away reports). Listing reports keep
 * "resolve" and hide / restore THE listing.
 */
export function ReportActions({
  reportId,
  kind,
  open,
  listingStatus,
  host,
  canRemove,
  reveal,
}: {
  reportId: string;
  kind: "GENERAL" | "TURNED_AWAY";
  open: boolean;
  listingStatus: string | null;
  /** The host the report is about, when staff may act on the account. */
  host: { name: string; canWarn: boolean; canAct: boolean; liveListings: number; upcomingBookings: number } | null;
  /** "users.manage" too (removing a host bans the account). */
  canRemove: boolean;
  /** Turned-away reports not yet revealed: the reporter's first name. */
  reveal: { reporterName: string } | null;
}) {
  const t = useTranslations("admin.reports.actions");
  const tReasons = useTranslations("admin.userReasons");
  const { run } = useAdminAction();
  const reasonField = {
    label: t("reasonLabel"),
    options: USER_ACTION_REASONS.map((code) => ({ value: code, label: tReasons(`${code}.label`), hint: tReasons(`${code}.explanation`) })),
  };
  const noteField = { label: t("noteLabel"), max: ADMIN_TEXT_LIMITS.note, hint: t("noteHint") };
  const upcoming =
    host && host.upcomingBookings > 0 ? (
      <p className="rounded-lg bg-destructive/10 p-3 text-sm text-destructive">{t("upcomingWarning", { count: host.upcomingBookings })}</p>
    ) : null;

  return (
    <div className="flex flex-col gap-3">
      {open ? (
        <div className="flex flex-wrap gap-2">
          {host?.canWarn ? (
            <ActionDialog
              triggerLabel={t("warn")}
              triggerIcon={AlertTriangle}
              triggerVariant="default"
              title={t("warnTitle", { name: host.name })}
              description={t("warnDescription")}
              confirmLabel={t("warnConfirm")}
              reason={reasonField}
              note={noteField}
              onConfirm={(v) => run(() => warnReportedUser({ reportId, reason: v.reason, note: v.note }), { success: t("warned") })}
            />
          ) : null}
          {host?.canAct && host.liveListings > 0 ? (
            <ActionDialog
              triggerLabel={t("hideAll")}
              triggerIcon={EyeOff}
              triggerVariant="destructive"
              destructive
              title={t("hideAllTitle", { name: host.name })}
              description={t("hideAllDescription", { count: host.liveListings })}
              confirmLabel={t("hideAllConfirm")}
              reason={reasonField}
              note={noteField}
              onConfirm={(v) => run(() => hideHostListings({ reportId, reason: v.reason, note: v.note }), { success: t("hiddenAll", { count: host.liveListings }) })}
            >
              {upcoming}
            </ActionDialog>
          ) : null}
          {host?.canAct && canRemove ? (
            <ActionDialog
              triggerLabel={t("remove")}
              triggerIcon={UserRoundX}
              triggerVariant="destructive"
              destructive
              title={t("removeTitle", { name: host.name })}
              description={t("removeDescription")}
              confirmLabel={t("removeConfirm")}
              reason={reasonField}
              note={noteField}
              onConfirm={(v) => run(() => removeReportedHost({ reportId, reason: v.reason, note: v.note }), { success: t("removed") })}
            >
              {upcoming}
            </ActionDialog>
          ) : null}
          {kind === "GENERAL" ? (
            <ActionDialog
              triggerLabel={t("resolve")}
              triggerIcon={CheckCircle2}
              title={t("resolveTitle")}
              description={t("resolveDescription")}
              confirmLabel={t("resolveConfirm")}
              note={{ label: t("resolutionLabel"), required: true, max: ADMIN_TEXT_LIMITS.resolution, placeholder: t("resolutionPlaceholder") }}
              onConfirm={(v) => run(() => resolveReport({ reportId, resolution: v.note }), { success: t("resolved") })}
            />
          ) : null}
          <ActionDialog
            triggerLabel={t("dismiss")}
            triggerIcon={XCircle}
            title={t("dismissTitle")}
            description={t("dismissDescription")}
            confirmLabel={t("dismissConfirm")}
            note={{ label: t("internalReasonLabel"), required: true, max: ADMIN_TEXT_LIMITS.resolution }}
            onConfirm={(v) => run(() => dismissReport({ reportId, resolution: v.note }), { success: t("dismissed") })}
          />
        </div>
      ) : null}

      {listingStatus === "LIVE" || listingStatus === "HIDDEN" || reveal ? (
        <div className="flex flex-wrap gap-2">
          {listingStatus === "LIVE" ? (
            <ActionDialog
              triggerLabel={t("hide")}
              triggerIcon={EyeOff}
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
          {reveal ? (
            <ActionDialog
              triggerLabel={t("reveal")}
              triggerIcon={UserRoundSearch}
              triggerVariant="ghost"
              title={t("revealTitle")}
              description={t("revealDescription", { name: reveal.reporterName })}
              confirmLabel={t("revealConfirm")}
              note={{ label: t("internalReasonLabel"), required: true, max: ADMIN_TEXT_LIMITS.resolution }}
              onConfirm={(v) => run(() => revealReporter({ reportId, resolution: v.note }), { success: t("revealed") })}
            />
          ) : null}
        </div>
      ) : null}
    </div>
  );
}
