import { ScrollText } from "lucide-react";
import type { Metadata } from "next";
import { getTranslations, setRequestLocale } from "next-intl/server";
import { AuditList } from "@/components/admin/audit-list";
import { AdminFilterBar } from "@/components/admin/filter-bar";
import { AdminPageHeader, AdminSection } from "@/components/admin/page-header";
import { AdminPagination } from "@/components/admin/pagination";
import { EmptyState } from "@/components/common/states";
import { dateParam, pageParam, param } from "@/lib/admin/params";
import { AUDIT_PAGE_SIZE, auditTargetTypes, listAuditEntries } from "@/lib/admin/server/audit";
import { requireStaff } from "@/lib/auth/session";

export async function generateMetadata({ params }: PageProps<"/[locale]/admin/audit">): Promise<Metadata> {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: "admin.audit" });
  return { title: t("title"), robots: { index: false, follow: false } };
}

export default async function AuditPage({ params, searchParams }: PageProps<"/[locale]/admin/audit">) {
  const { locale } = await params;
  setRequestLocale(locale);
  await requireStaff("audit");
  const query = await searchParams;
  const targetTypes = await auditTargetTypes();
  const targetType = param(query, "targetType");
  const filters = {
    actor: param(query, "actor").slice(0, 120),
    action: param(query, "action").slice(0, 120),
    targetType: targetTypes.includes(targetType) ? targetType : undefined,
    targetId: param(query, "target").slice(0, 64),
    from: dateParam(query, "from"),
    to: dateParam(query, "to"),
  };
  const [t, tAdmin, result] = await Promise.all([
    getTranslations("admin.audit"),
    getTranslations("admin"),
    listAuditEntries(filters, pageParam(query)),
  ]);

  return (
    <>
      <AdminPageHeader title={t("title")} description={t("description")} />
      <AdminFilterBar
        fields={[
          { type: "search", name: "actor", label: t("filters.actor"), placeholder: t("filters.actorPlaceholder") },
          { type: "search", name: "action", label: t("filters.action"), placeholder: t("filters.actionPlaceholder") },
          {
            type: "select",
            name: "targetType",
            label: t("filters.targetType"),
            allLabel: tAdmin("filters.all"),
            options: targetTypes.map((type) => ({ value: type, label: t.has(`targets.${type}`) ? t(`targets.${type}`) : type })),
          },
          { type: "search", name: "target", label: t("filters.target"), placeholder: t("filters.targetPlaceholder") },
          { type: "date", name: "from", label: t("filters.from") },
          { type: "date", name: "to", label: t("filters.to") },
        ]}
      />
      {result.rows.length === 0 ? (
        <EmptyState bordered icon={ScrollText} title={t("emptyTitle")} description={t("emptyDescription")} />
      ) : (
        <AdminSection>
          <AuditList rows={result.rows} />
        </AdminSection>
      )}
      <AdminPagination pathname="/admin/audit" searchParams={query} page={result.page} pageSize={AUDIT_PAGE_SIZE} total={result.total} />
    </>
  );
}
