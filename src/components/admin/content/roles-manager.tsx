"use client";

import { KeyRound, Search, ShieldCheck, ShieldOff, UserMinus, UserPlus } from "lucide-react";
import { useTranslations } from "next-intl";
import { useState, type FormEvent } from "react";
import { toast } from "@/lib/toast";
import { Ltr } from "@/components/common/ltr";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { assignStaffRole, findUsersForRole, removeStaffRole } from "@/lib/admin/content/actions/roles";
import { STAFF_ROLE_CHOICES } from "@/lib/admin/content/schemas";
import { ConfirmButton } from "./bits";
import { Pill } from "./pill";
import { useContentAction } from "./use-content-action";

type StaffRole = (typeof STAFF_ROLE_CHOICES)[number];
export type StaffRow = {
  id: string;
  name: string;
  email: string | null;
  phone: string | null;
  role: string;
  status: string;
  twoFactorEnabled: boolean;
  lastSeenAt: string | null;
  /** "3 hours ago", formatted on the server (avoids a hydration mismatch). */
  lastSeenLabel?: string | null;
  isDemo: boolean;
};

function Contact({ row }: { row: StaffRow }) {
  return (
    <p className="flex flex-wrap gap-x-2 text-xs text-muted-foreground">
      {row.phone ? <Ltr>{row.phone}</Ltr> : null}
      {row.email ? <Ltr className="break-all">{row.email}</Ltr> : null}
    </p>
  );
}

function RoleSelect({ value, onChange, disabled, label }: { value: StaffRole; onChange: (v: StaffRole) => void; disabled?: boolean; label: string }) {
  const t = useTranslations("adminContent.roles");
  return (
    <Select value={value} onValueChange={(v) => onChange(v as StaffRole)} disabled={disabled}>
      <SelectTrigger className="w-40" aria-label={label}>
        <SelectValue />
      </SelectTrigger>
      <SelectContent>
        {STAFF_ROLE_CHOICES.map((r) => (
          <SelectItem key={r} value={r}>
            {t(`roleNames.${r}`)}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}

export function RolesManager({ staff, currentUserId }: { staff: StaffRow[]; currentUserId: string }) {
  const t = useTranslations("adminContent.roles");
  const { run, pending } = useContentAction();
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<StaffRow[] | null>(null);
  const [newRole, setNewRole] = useState<StaffRole>("EDITOR");
  const admins = staff.filter((s) => s.role === "ADMIN").length;

  const assigned = (d: { needsTwoFactor: boolean }) => {
    if (d.needsTwoFactor) toast.warning(t("needsTwoFactor"), { duration: 8000 });
  };

  const search = async (event: FormEvent) => {
    event.preventDefault();
    if (query.trim().length < 2) return;
    await run(
      () => findUsersForRole({ query }),
      {
        refresh: false,
        onSuccess: (rows) =>
          setResults(rows.map((r) => ({ ...r, lastSeenAt: r.lastSeenAt ? new Date(r.lastSeenAt).toISOString() : null }))),
      },
    );
  };

  return (
    <div className="flex flex-col gap-5">
      <p className="flex items-start gap-2 rounded-xl border border-warning/40 bg-warning-soft p-3 text-sm">
        <KeyRound aria-hidden className="mt-0.5 size-4 shrink-0 text-warning" />
        {t("twoFactorWarning")}
      </p>

      <section aria-labelledby="roles-staff" className="rounded-xl border bg-card shadow-xs">
        <h2 id="roles-staff" className="border-b px-4 py-3 text-sm font-semibold">
          {t("staffTitle", { count: staff.length })}
        </h2>
        <ul className="divide-y">
          {staff.map((s) => {
            const self = s.id === currentUserId;
            const lastAdmin = s.role === "ADMIN" && admins <= 1;
            const locked = self || lastAdmin;
            return (
              <li key={s.id} className="flex flex-col gap-3 p-3 sm:flex-row sm:flex-wrap sm:items-center sm:px-4">
                <div className="min-w-0 sm:flex-1">
                  <p className="flex flex-wrap items-center gap-2 font-medium">
                    <span dir="auto">{s.name}</span>
                    {self ? <Pill tone="primary">{t("you")}</Pill> : null}
                    {s.isDemo ? <Pill tone="demo">{t("demo")}</Pill> : null}
                  </p>
                  <Contact row={s} />
                  <div className="mt-1 flex flex-wrap items-center gap-1.5 text-xs text-muted-foreground">
                    {s.twoFactorEnabled ? (
                      <Pill tone="success" icon={ShieldCheck}>
                        {t("twoFactorOn")}
                      </Pill>
                    ) : (
                      <Pill tone="warning" icon={ShieldOff}>
                        {t("twoFactorOff")}
                      </Pill>
                    )}
                    <span>{s.lastSeenLabel ? t("lastSeen", { time: s.lastSeenLabel }) : t("neverSeen")}</span>
                  </div>
                </div>
                <div className="flex flex-wrap items-center gap-2">
                  <RoleSelect
                    value={s.role as StaffRole}
                    disabled={locked || pending}
                    label={t("roleFor", { name: s.name })}
                    onChange={(role) => run(() => assignStaffRole({ userId: s.id, role }), { success: t("changed"), onSuccess: assigned })}
                  />
                  <ConfirmButton
                    label={t("remove")}
                    icon={UserMinus}
                    variant="outline"
                    size="sm"
                    disabled={locked}
                    title={t("removeTitle", { name: s.name })}
                    description={t("removeDescription")}
                    onConfirm={() => run(() => removeStaffRole({ userId: s.id }), { success: t("removed") })}
                  />
                </div>
                {locked ? <p className="text-xs text-muted-foreground sm:basis-full">{self ? t("selfLocked") : t("lastAdminLocked")}</p> : null}
              </li>
            );
          })}
        </ul>
      </section>

      <section aria-labelledby="roles-add" className="rounded-xl border bg-card p-4 shadow-xs">
        <h2 id="roles-add" className="flex items-center gap-1.5 text-sm font-semibold">
          <UserPlus aria-hidden className="size-4 text-muted-foreground" />
          {t("addTitle")}
        </h2>
        <p className="mt-0.5 text-xs text-muted-foreground">{t("addDescription")}</p>
        <form onSubmit={search} className="mt-3 flex flex-col gap-3 sm:flex-row sm:items-end">
          <div className="flex min-w-0 flex-1 flex-col gap-1.5">
            <Label htmlFor="roles-query">{t("searchLabel")}</Label>
            <Input id="roles-query" type="search" value={query} maxLength={120} placeholder={t("searchPlaceholder")} onChange={(e) => setQuery(e.target.value)} />
          </div>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="roles-new-role">{t("newRole")}</Label>
            <Select value={newRole} onValueChange={(v) => setNewRole(v as StaffRole)}>
              <SelectTrigger id="roles-new-role" className="w-full sm:w-44">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {STAFF_ROLE_CHOICES.map((r) => (
                  <SelectItem key={r} value={r}>
                    {t(`roleNames.${r}`)}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <Button type="submit" variant="outline" disabled={pending || query.trim().length < 2}>
            <Search aria-hidden />
            {t("search")}
          </Button>
        </form>
        <p className="mt-2 text-xs text-muted-foreground">{t(`roleHints.${newRole}`)}</p>

        {results !== null ? (
          <div className="mt-4" aria-live="polite">
            {results.length === 0 ? (
              <p className="rounded-lg border border-dashed p-4 text-center text-sm text-muted-foreground">{t("noResults")}</p>
            ) : (
              <ul className="divide-y rounded-lg border">
                {results.map((u) => {
                  const isStaff = u.role !== "USER";
                  const blocked = u.status === "BANNED" || u.status === "SUSPENDED" || u.status === "DELETED";
                  return (
                    <li key={u.id} className="flex flex-col gap-3 p-3 sm:flex-row sm:items-center">
                      <div className="min-w-0 sm:flex-1">
                        <p className="flex flex-wrap items-center gap-2 font-medium">
                          <span dir="auto">{u.name}</span>
                          {isStaff ? <Pill tone="primary">{t(`roleNames.${u.role as StaffRole}`)}</Pill> : null}
                          {blocked ? <Pill tone="danger">{t("blocked")}</Pill> : null}
                        </p>
                        <Contact row={u} />
                      </div>
                      <Button
                        type="button"
                        size="sm"
                        disabled={pending || blocked || u.id === currentUserId || u.role === newRole}
                        onClick={() =>
                          run(() => assignStaffRole({ userId: u.id, role: newRole }), {
                            success: t("assigned", { name: u.name, role: t(`roleNames.${newRole}`) }),
                            onSuccess: (d) => {
                              assigned(d);
                              setResults((list) => list?.map((x) => (x.id === u.id ? { ...x, role: newRole } : x)) ?? null);
                            },
                          })
                        }
                      >
                        <UserPlus aria-hidden />
                        {t("makeRole", { role: t(`roleNames.${newRole}`) })}
                      </Button>
                    </li>
                  );
                })}
              </ul>
            )}
          </div>
        ) : null}
      </section>
    </div>
  );
}
