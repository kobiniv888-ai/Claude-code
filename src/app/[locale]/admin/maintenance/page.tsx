import type { Metadata } from "next";
import { getTranslations, setRequestLocale } from "next-intl/server";
import { AdminPageHeader } from "@/components/admin/page-header";
import { backupGate, maintenanceHistory } from "@/lib/admin/maintenance/cleanups";
import { CLEANUP_NAMES } from "@/lib/admin/maintenance/plan";
import { requireStaff } from "@/lib/auth/session";
import { MaintenancePanel } from "./maintenance-panel";

type Props = { params: Promise<{ locale: string }> };

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: "admin.maintenance" });
  return { title: t("title"), robots: { index: false, follow: false } };
}

/**
 * /admin/maintenance (ADMIN only): the full backup and the four data clean-ups the founder approved
 * (round 3, answer 8), each with a dry run first. Built for a phone: one column, big buttons.
 */
export default async function MaintenancePage({ params }: Props) {
  const { locale } = await params;
  setRequestLocale(locale);
  await requireStaff("settings");
  const [t, gate, history] = await Promise.all([
    getTranslations("admin.maintenance"),
    backupGate(5).catch(() => ({ backups: [], fresh: false })),
    maintenanceHistory(),
  ]);
  return (
    <>
      <AdminPageHeader title={t("title")} description={t("description")} />
      <MaintenancePanel
        initialBackups={gate.backups}
        initialFresh={gate.fresh}
        names={[...CLEANUP_NAMES]}
        lastRuns={history.runs}
      />
    </>
  );
}
