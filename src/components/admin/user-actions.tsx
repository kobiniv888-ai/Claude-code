"use client";

import { AlertTriangle, BadgeCheck, Ban, BadgeX, Clock, ShieldCheck, Undo2 } from "lucide-react";
import { useTranslations } from "next-intl";
import { useState } from "react";
import { toast } from "@/lib/toast";
import { documentChecksOn } from "@/config/verification";
import type { UserRole, UserStatus } from "@/generated/prisma/enums";
import {
  banUserAction,
  changeRole,
  reactivateUserAction,
  setIdVerified,
  suspendUserAction,
  warnUserAction,
} from "@/lib/admin/actions/users";
import { ADMIN_TEXT_LIMITS, USER_ACTION_REASONS } from "@/lib/admin/reasons";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { ActionDialog } from "./action-dialog";
import { useAdminAction } from "./use-admin-action";

function isoDay(offsetDays: number): string {
  const d = new Date(Date.now() + offsetDays * 24 * 3600 * 1000);
  return d.toISOString().slice(0, 10);
}

/** Verify / warn / suspend / ban / reactivate an account ("users.manage"). */
export function UserActions({
  userId,
  name,
  status,
  idVerified,
  canManage,
}: {
  userId: string;
  name: string;
  status: UserStatus;
  idVerified: boolean;
  canManage: boolean;
}) {
  const t = useTranslations("admin.users.actions");
  const tReasons = useTranslations("admin.userReasons");
  const { run } = useAdminAction();
  if (!canManage) return null;

  const reason = {
    label: t("reasonLabel"),
    options: USER_ACTION_REASONS.map((code) => ({ value: code, label: tReasons(`${code}.label`), hint: tReasons(`${code}.explanation`) })),
  };
  const note = { label: t("noteLabel"), max: ADMIN_TEXT_LIMITS.note, hint: t("noteHint") };
  const blocked = status === "BANNED" || status === "SUSPENDED";

  return (
    <div className="flex flex-wrap gap-2">
      {!documentChecksOn() ? null : idVerified ? (
        <ActionDialog
          triggerLabel={t("unverify")}
          triggerIcon={BadgeX}
          title={t("unverifyTitle")}
          description={t("unverifyDescription", { name })}
          confirmLabel={t("unverifyConfirm")}
          destructive
          onConfirm={() => run(() => setIdVerified({ userId, verified: false }), { success: t("unverified") })}
        />
      ) : (
        <ActionDialog
          triggerLabel={t("verify")}
          triggerIcon={BadgeCheck}
          title={t("verifyTitle")}
          description={t("verifyDescription", { name })}
          confirmLabel={t("verifyConfirm")}
          onConfirm={() => run(() => setIdVerified({ userId, verified: true }), { success: t("verified") })}
        />
      )}
      {!blocked && status !== "DELETED" ? (
        <>
          <ActionDialog
            triggerLabel={t("warn")}
            triggerIcon={AlertTriangle}
            title={t("warnTitle", { name })}
            description={t("warnDescription")}
            confirmLabel={t("warnConfirm")}
            reason={reason}
            note={note}
            onConfirm={(v) => run(() => warnUserAction({ userId, reason: v.reason, note: v.note }), { success: t("warned") })}
          />
          <ActionDialog
            triggerLabel={t("suspend")}
            triggerIcon={Clock}
            triggerVariant="destructive"
            destructive
            title={t("suspendTitle", { name })}
            description={t("suspendDescription")}
            confirmLabel={t("suspendConfirm")}
            date={{ label: t("untilLabel"), min: isoDay(1), max: isoDay(3650) }}
            reason={reason}
            note={note}
            onConfirm={(v) =>
              run(() => suspendUserAction({ userId, reason: v.reason, note: v.note, until: v.date }), { success: t("suspended") })
            }
          />
        </>
      ) : null}
      {status !== "BANNED" && status !== "DELETED" ? (
        <ActionDialog
          triggerLabel={t("ban")}
          triggerIcon={Ban}
          triggerVariant="destructive"
          destructive
          title={t("banTitle", { name })}
          description={t("banDescription")}
          confirmLabel={t("banConfirm")}
          reason={reason}
          note={note}
          onConfirm={(v) =>
            run(() => banUserAction({ userId, reason: v.reason, note: v.note }), {
              success: t("banned"),
              onSuccess: (d) => {
                if (d.listingsPaused > 0) toast.info(t("listingsPaused", { count: d.listingsPaused }));
              },
            })
          }
        />
      ) : null}
      {status !== "ACTIVE" && status !== "DELETED" ? (
        <ActionDialog
          triggerLabel={status === "BANNED" ? t("unban") : t("reactivate")}
          triggerIcon={Undo2}
          title={status === "BANNED" ? t("unbanTitle", { name }) : t("reactivateTitle", { name })}
          description={t("reactivateDescription")}
          confirmLabel={t("reactivateConfirm")}
          note={{ label: t("internalNoteLabel"), max: ADMIN_TEXT_LIMITS.note }}
          onConfirm={(v) => run(() => reactivateUserAction({ userId, note: v.note }), { success: t("reactivated") })}
        />
      ) : null}
    </div>
  );
}

const ROLES: UserRole[] = ["USER", "SUPPORT", "EDITOR", "MODERATOR", "ADMIN"];

/** Role change (ADMIN only). Staff need 2-step login before they can open the panel. */
export function RoleChanger({ userId, role, twoFactorEnabled }: { userId: string; role: UserRole; twoFactorEnabled: boolean }) {
  const t = useTranslations("admin.users.role");
  const tRoles = useTranslations("admin.roles");
  const [value, setValue] = useState<UserRole>(role);
  const { run, pending } = useAdminAction();
  const willBeStaff = value !== "USER";

  return (
    <div className="flex flex-col gap-2">
      <div className="flex flex-wrap items-end gap-2">
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="role-select" className="text-xs text-muted-foreground">
            {t("label")}
          </Label>
          <Select value={value} onValueChange={(v) => setValue(v as UserRole)}>
            <SelectTrigger id="role-select" className="h-9 w-48">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {ROLES.map((r) => (
                <SelectItem key={r} value={r}>
                  {tRoles(r)}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <Button
          type="button"
          size="sm"
          className="h-9"
          disabled={pending || value === role}
          onClick={() =>
            run(() => changeRole({ userId, role: value }), {
              success: t("changed"),
              onSuccess: (d) => {
                if (d.needsTwoFactor) toast.warning(t("needsTwoFactor"));
              },
            })
          }
        >
          <ShieldCheck aria-hidden />
          {t("save")}
        </Button>
      </div>
      {willBeStaff && !twoFactorEnabled ? <p className="rounded-md bg-surface-muted px-2 py-1 text-xs text-foreground">{t("twoFactorWarning")}</p> : null}
      <p className="text-xs text-muted-foreground">{t("hint")}</p>
    </div>
  );
}
