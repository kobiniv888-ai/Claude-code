import { EyeOffIcon, History } from "lucide-react";
import { getTranslations } from "next-intl/server";
import { WhenText } from "@/components/admin/listing-bits";
import { AdminSection, FactList } from "@/components/admin/page-header";
import { Ltr } from "@/components/common/ltr";
import { Stars } from "@/components/reviews/stars";
import type { AppLocale } from "@/config/site";
import { siteConfig } from "@/config/site";
import { Link } from "@/i18n/navigation";
import { auditActionKey } from "@/lib/admin/audit-labels";
import { isOwnItem } from "@/lib/admin/server/common";
import { can } from "@/lib/auth/permissions";
import type { CurrentUser } from "@/lib/auth/session";
import { formatDate, isolate } from "@/lib/format";
import { getAdminReview } from "@/lib/reviews/queries";
import { reviewMonthDate, QUICK_RATING_KEYS } from "@/lib/reviews/rules";
import { ReviewModerationForm } from "./review-moderation-form";

/**
 * The review a report is about (Admin → Reports → "ביקורות", brief 8.1): the guest's words as
 * written (staff read the original), the stars, the host's reply, who wrote it about which place
 * and booking, and the decision — hide with a reason and a note, or show again. Staff never edit a
 * review. Read-only for SUPPORT and for staff who wrote the review or host the place (an ADMIN
 * excepted, as everywhere in the panel).
 */
export async function AdminReviewPanel({ reviewId, reportId, staff, locale }: { reviewId: string | null; reportId: string; staff: CurrentUser; locale: AppLocale }) {
  const [t, tAdmin, data] = await Promise.all([
    getTranslations({ locale, namespace: "reviews" }),
    getTranslations({ locale, namespace: "admin" }),
    reviewId ? getAdminReview(reviewId, locale) : Promise.resolve(null),
  ]);
  if (!data) {
    return (
      <AdminSection title={t("admin.title")}>
        <p className="text-sm text-muted-foreground">{t("admin.gone")}</p>
      </AdminSection>
    );
  }
  const canAct = can(staff.role, "reports");
  const own = isOwnItem(staff, [data.guest.id, data.host.id]);
  const month = (m: string) => formatDate(reviewMonthDate(m), locale, { month: "long", year: "numeric", timeZone: "UTC" });
  const quick = QUICK_RATING_KEYS.filter((key) => data.view.quick.some((q) => q.key === key));

  return (
    <>
      <AdminSection
        title={t("admin.title")}
        actions={
          data.listing.status === "LIVE" && !data.hidden ? (
            <Link href={`${data.listing.path}#reviews`} target="_blank" rel="noopener" className="text-sm font-medium text-primary hover:underline">
              {t("admin.viewOnSite")}
            </Link>
          ) : null
        }
      >
        <div className="grid gap-4">
          {data.hidden ? (
            <p className="flex items-start gap-2 rounded-lg bg-destructive/10 p-3 text-sm text-destructive">
              <EyeOffIcon aria-hidden className="mt-0.5 size-4 shrink-0" />
              <span>
                {t("admin.hiddenBy", { name: isolate(data.hiddenBy ?? "—"), date: data.hiddenAt ? formatDate(data.hiddenAt, locale) : "—" })}
                {data.hiddenReason ? (
                  <>
                    {" "}
                    · {t(`admin.reasons.${data.hiddenReason.code}`)}
                    {data.hiddenReason.note ? (
                      <span className="mt-1 block whitespace-pre-wrap text-foreground" dir="auto">
                        {data.hiddenReason.note}
                      </span>
                    ) : null}
                  </>
                ) : null}
              </span>
            </p>
          ) : null}
          <div className="flex flex-wrap items-center gap-3">
            <Stars value={data.view.rating} label={t("stars.label", { count: data.view.rating })} />
            <span className="text-sm text-muted-foreground">
              {t("admin.written", { month: month(data.view.month), language: siteConfig.i18n.nativeNames[data.language] })}
            </span>
          </div>
          <p className="rounded-lg border bg-background p-3 text-sm whitespace-pre-wrap" dir="auto" lang={data.language}>
            {data.originalText}
          </p>
          {quick.length ? (
            <p className="flex flex-wrap gap-x-4 gap-y-1 text-xs text-muted-foreground">
              {data.view.quick.map((q) => (
                <span key={q.key}>
                  {t(`quick.${q.key}`)}: <span className="font-medium text-foreground">{q.value}</span>
                </span>
              ))}
            </p>
          ) : null}
          {data.originalReply ? (
            <div className="grid gap-1">
              <h3 className="text-xs text-muted-foreground">{t("item.reply")}</h3>
              <p className="rounded-lg border bg-background p-3 text-sm whitespace-pre-wrap" dir="auto">
                {data.originalReply}
              </p>
            </div>
          ) : (
            <p className="text-xs text-muted-foreground">{t("admin.noReply")}</p>
          )}
          <FactList
            items={[
              {
                label: t("admin.guest"),
                value: (
                  <Link href={`/admin/users/${data.guest.id}`} dir="auto" className="text-primary hover:underline">
                    {data.guest.name}
                  </Link>
                ),
              },
              {
                label: t("admin.host"),
                value: (
                  <Link href={`/admin/users/${data.host.id}`} dir="auto" className="text-primary hover:underline">
                    {data.host.businessName || data.host.name}
                  </Link>
                ),
              },
              {
                label: t("admin.listing"),
                value: (
                  <span className="inline-flex flex-wrap items-center gap-1.5">
                    <Ltr className="text-xs text-muted-foreground">ID {data.listing.publicId}</Ltr>
                    <span dir="auto">{data.listing.title}</span>
                  </span>
                ),
              },
              {
                label: t("admin.booking"),
                value: can(staff.role, "moderation") ? (
                  <Link href={`/admin/bookings/${data.booking.id}`} className="text-primary hover:underline">
                    <Ltr>{data.booking.code}</Ltr>
                  </Link>
                ) : (
                  <Ltr>{data.booking.code}</Ltr>
                ),
              },
              { label: t("admin.stay"), value: `${formatDate(data.booking.checkIn, locale)} – ${formatDate(data.booking.checkOut, locale)}` },
              { label: t("admin.shownAs"), value: <bdi dir="auto">{`${data.view.author ?? t("item.guest")} · ${month(data.view.month)}`}</bdi> },
            ]}
          />
        </div>
      </AdminSection>

      <AdminSection title={data.hidden ? t("admin.showTitle") : t("admin.hideTitle")} description={t("admin.never")}>
        {!canAct ? (
          <p className="text-sm text-muted-foreground">{tAdmin("reports.readOnly")}</p>
        ) : own ? (
          <p className="text-sm text-muted-foreground">{t("admin.own")}</p>
        ) : (
          <ReviewModerationForm reviewId={reviewId!} reportId={reportId} hidden={data.hidden} />
        )}
      </AdminSection>

      {data.timeline.length > 0 ? (
        <AdminSection
          title={
            <span className="inline-flex items-center gap-2">
              <History aria-hidden className="size-4 text-muted-foreground" />
              {t("admin.timeline")}
            </span>
          }
        >
          <ol className="flex flex-col gap-2 text-sm">
            {data.timeline.map((entry) => (
              <li key={entry.id} className="flex flex-wrap gap-x-2">
                <span className="font-medium">{tAdmin.has(`audit.${auditActionKey(entry.action)}`) ? tAdmin(`audit.${auditActionKey(entry.action)}`) : entry.action}</span>
                <span className="text-xs text-muted-foreground">
                  {entry.actor?.name ?? tAdmin("audit.system")} · <WhenText date={entry.createdAt} />
                </span>
              </li>
            ))}
          </ol>
        </AdminSection>
      ) : null}
    </>
  );
}
