import { getTranslations, setRequestLocale } from "next-intl/server";
import { RolesManager } from "@/components/admin/content/roles-manager";
import { AdminPageHeader } from "@/components/admin/page-header";
import { listStaff } from "@/lib/admin/content/server/roles";
import { adminContentMetadata } from "@/lib/admin/content/server/metadata";
import { requireStaff } from "@/lib/auth/session";
import { formatRelativeTime } from "@/lib/format";

export async function generateMetadata({ params }: PageProps<"/[locale]/admin/roles">) {
  return adminContentMetadata(params, "roles");
}

export default async function RolesPage({ params }: PageProps<"/[locale]/admin/roles">) {
  const { locale } = await params;
  setRequestLocale(locale);
  const me = await requireStaff("roles");
  const [t, staff] = await Promise.all([getTranslations("adminContent.roles"), listStaff()]);
  return (
    <>
      <AdminPageHeader title={t("title")} description={t("description")} />
      <div className="max-w-4xl">
        <RolesManager
          currentUserId={me.id}
          staff={staff.map((s) => ({
            ...s,
            lastSeenAt: s.lastSeenAt?.toISOString() ?? null,
            lastSeenLabel: s.lastSeenAt ? formatRelativeTime(s.lastSeenAt, locale) : null,
          }))}
        />
      </div>
    </>
  );
}
