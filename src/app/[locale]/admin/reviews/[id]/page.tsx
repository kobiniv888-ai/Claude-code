import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { getTranslations, setRequestLocale } from "next-intl/server";
import { ReportStatusBadge } from "@/components/admin/badges";
import { WhenText } from "@/components/admin/listing-bits";
import { AdminPageHeader, AdminSection } from "@/components/admin/page-header";
import type { AppLocale } from "@/config/site";
import { Link } from "@/i18n/navigation";
import { requireStaff } from "@/lib/auth/session";
import { isolate } from "@/lib/format";
import { getAdminReview, getReviewReports } from "@/lib/reviews/queries";
import { AdminReviewPanel } from "../../reports/_components/review-panel";

type Props = { params: Promise<{ locale: string; id: string }> };

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: "reviews.admin" });
  return { title: t("pageTitle"), robots: { index: false, follow: false } };
}

/**
 * /admin/reviews/[id] — one review for staff, reported or not (round 3 phase-5 hardening,
 * reviews-2): the same panel as a review report (the guest's words as written, the reply, hide
 * with a reason and a note or show again — never edit), and the reports about it. Linked from the
 * "ביקורות" tab's recent reviews, the booking and the user pages. SUPPORT sees it read-only.
 */
export default async function AdminReviewPage({ params }: Props) {
  const { locale, id } = await params;
  setRequestLocale(locale);
  const staff = await requireStaff("reports.view");
  const [review, reports, t, tAdmin, tFields] = await Promise.all([
    getAdminReview(id, locale as AppLocale),
    getReviewReports(id),
    getTranslations("reviews.admin"),
    getTranslations("admin.reports"),
    getTranslations("listingFields"),
  ]);
  if (!review) notFound();
  const reasonLabel = (reason: string) => (tFields.has(`reportReason.${reason}`) ? tFields(`reportReason.${reason}`) : reason);

  return (
    <>
      <AdminPageHeader back={{ href: "/admin/reports?tab=reviews", label: t("backToReports") }} title={t("pageTitle")} />
      <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_22rem]">
        <div className="flex min-w-0 flex-col gap-4">
          <AdminReviewPanel reviewId={id} staff={staff} locale={locale as AppLocale} />
        </div>
        <AdminSection title={t("reportsTitle")}>
          {reports.length === 0 ? (
            <p className="text-sm text-muted-foreground">{t("noReports")}</p>
          ) : (
            <ul className="flex flex-col gap-3 text-sm">
              {reports.map((report) => (
                <li key={report.id} className="grid gap-1">
                  <span className="flex flex-wrap items-center gap-2">
                    <ReportStatusBadge status={report.status} />
                    <Link href={`/admin/reports/${report.id}`} className="font-medium text-primary hover:underline">
                      {reasonLabel(report.reason)}
                    </Link>
                  </span>
                  <span className="text-xs text-muted-foreground">
                    {t(`part.${report.part}`)} · {tAdmin("reportedBy", { name: isolate(report.reporter?.name ?? "—") })} · <WhenText date={report.createdAt} />
                  </span>
                </li>
              ))}
            </ul>
          )}
        </AdminSection>
      </div>
    </>
  );
}
