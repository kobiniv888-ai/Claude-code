import { SearchX, Users } from "lucide-react";
import type { Metadata } from "next";
import { getTranslations, setRequestLocale } from "next-intl/server";
import { AccountMarkers, RoleBadge, UserStatusBadge } from "@/components/admin/badges";
import { AdminFilterBar } from "@/components/admin/filter-bar";
import { WhenText } from "@/components/admin/listing-bits";
import { AdminPageHeader } from "@/components/admin/page-header";
import { AdminPagination } from "@/components/admin/pagination";
import { Ltr } from "@/components/common/ltr";
import { EmptyState } from "@/components/common/states";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Link } from "@/i18n/navigation";
import { enumParam, pageParam, param } from "@/lib/admin/params";
import { ADMIN_PAGE_SIZE, realEmail } from "@/lib/admin/server/shared";
import { searchUsers, USER_ROLES, USER_STATUSES, USER_VERIFIED_FILTERS } from "@/lib/admin/server/users";
import { requireStaff } from "@/lib/auth/session";
import { formatNumber } from "@/lib/format";

export async function generateMetadata({ params }: PageProps<"/[locale]/admin/users">): Promise<Metadata> {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: "admin.users" });
  return { title: t("title"), robots: { index: false, follow: false } };
}

export default async function UsersPage({ params, searchParams }: PageProps<"/[locale]/admin/users">) {
  const { locale } = await params;
  setRequestLocale(locale);
  await requireStaff("users.view");
  const query = await searchParams;
  const filters = {
    q: param(query, "q").slice(0, 120),
    role: enumParam(query, "role", USER_ROLES),
    status: enumParam(query, "status", USER_STATUSES),
    verified: enumParam(query, "verified", USER_VERIFIED_FILTERS),
  };
  const [t, tAdmin, result] = await Promise.all([
    getTranslations("admin.users"),
    getTranslations("admin"),
    searchUsers(filters, pageParam(query)),
  ]);
  const n = (v: number) => formatNumber(v, locale);

  return (
    <>
      <AdminPageHeader title={t("title")} description={t("description")} />
      <AdminFilterBar
        fields={[
          { type: "search", name: "q", label: t("searchLabel"), placeholder: t("searchPlaceholder"), wide: true },
          {
            type: "select",
            name: "role",
            label: t("filters.role"),
            allLabel: tAdmin("filters.all"),
            options: USER_ROLES.map((r) => ({ value: r, label: tAdmin(`roles.${r}`) })),
          },
          {
            type: "select",
            name: "status",
            label: t("filters.status"),
            allLabel: tAdmin("filters.all"),
            options: USER_STATUSES.map((s) => ({ value: s, label: tAdmin(`userStatus.${s}`) })),
          },
          {
            type: "select",
            name: "verified",
            label: t("filters.verified"),
            allLabel: tAdmin("filters.all"),
            options: USER_VERIFIED_FILTERS.map((v) => ({ value: v, label: t(`verified.${v}`) })),
          },
        ]}
      />
      {result.rows.length === 0 ? (
        <EmptyState
          bordered
          icon={filters.q ? SearchX : Users}
          title={t("empty")}
          description={filters.q ? t("emptySearch") : t("emptyDescription")}
        />
      ) : (
        <>
          <ul className="divide-y overflow-hidden rounded-xl border bg-card shadow-xs md:hidden">
            {result.rows.map((u) => (
              <li key={u.id} className="relative flex flex-col gap-1 p-3">
                <div className="flex flex-wrap items-center gap-1.5">
                  <Link
                    href={`/admin/users/${u.id}`}
                    className="font-medium outline-none after:absolute after:inset-0 after:content-[''] hover:underline focus-visible:after:ring-3 focus-visible:after:ring-ring/50"
                    dir="auto"
                  >
                    {u.businessName || u.name}
                  </Link>
                  <UserStatusBadge status={u.status} className="h-5" />
                  <RoleBadge role={u.role} className="h-5" />
                </div>
                <AccountMarkers user={u} />
                <p className="text-xs text-muted-foreground">
                  {u.phoneNumber ? <Ltr>{u.phoneNumber}</Ltr> : null}
                  {u.phoneNumber && realEmail(u.email) ? " · " : null}
                  {realEmail(u.email) ? <Ltr className="break-all">{realEmail(u.email)}</Ltr> : null}
                </p>
                <p className="text-xs text-muted-foreground">
                  {t("rowStats", { listings: n(u._count.listings), reports: n(u._count.reportsAgainst) })} · <WhenText date={u.createdAt} />
                </p>
              </li>
            ))}
          </ul>
          <div className="hidden overflow-hidden rounded-xl border bg-card shadow-xs md:block">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>{t("columns.name")}</TableHead>
                  <TableHead>{t("columns.contact")}</TableHead>
                  <TableHead>{t("columns.status")}</TableHead>
                  <TableHead className="text-end">{t("columns.listings")}</TableHead>
                  <TableHead className="text-end">{t("columns.reports")}</TableHead>
                  <TableHead>{t("columns.joined")}</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {result.rows.map((u) => (
                  <TableRow key={u.id}>
                    <TableCell className="max-w-64">
                      <div className="flex flex-col gap-1">
                        <Link href={`/admin/users/${u.id}`} className="truncate font-medium text-primary hover:underline" dir="auto">
                          {u.businessName || u.name}
                        </Link>
                        <AccountMarkers user={u} />
                      </div>
                    </TableCell>
                    <TableCell className="text-xs">
                      {u.phoneNumber ? <Ltr className="block">{u.phoneNumber}</Ltr> : null}
                      {realEmail(u.email) ? <Ltr className="block max-w-56 truncate text-muted-foreground">{realEmail(u.email)}</Ltr> : null}
                    </TableCell>
                    <TableCell>
                      <div className="flex flex-wrap gap-1">
                        <UserStatusBadge status={u.status} />
                        <RoleBadge role={u.role} />
                      </div>
                    </TableCell>
                    <TableCell className="text-end tabular-nums">{n(u._count.listings)}</TableCell>
                    <TableCell className="text-end tabular-nums">{n(u._count.reportsAgainst)}</TableCell>
                    <TableCell className="text-xs text-muted-foreground">
                      <WhenText date={u.createdAt} relative={false} />
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        </>
      )}
      <AdminPagination pathname="/admin/users" searchParams={query} page={result.page} pageSize={ADMIN_PAGE_SIZE} total={result.total} />
    </>
  );
}
