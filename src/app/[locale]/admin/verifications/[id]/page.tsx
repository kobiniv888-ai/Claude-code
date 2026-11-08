import { AlertTriangle, CheckCircle2, FileX2, Info, ShieldCheck } from "lucide-react";
import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { getTranslations, setRequestLocale } from "next-intl/server";
import { AccountMarkers, ListingStatusBadge, RoleBadge, UserStatusBadge, VerificationStatusBadge } from "@/components/admin/badges";
import { DocumentViewer } from "@/components/admin/document-viewer";
import { ListingThumb, PublicId, WhenText } from "@/components/admin/listing-bits";
import { AdminPageHeader, AdminSection, FactList } from "@/components/admin/page-header";
import { VerificationActions } from "@/components/admin/verification-actions";
import { StaffPhoneValue } from "@/components/admin/staff-phone";
import { Ltr } from "@/components/common/ltr";
import { documentChecksOn } from "@/config/verification";
import { Link } from "@/i18n/navigation";
import { cityName, coverUrl, realEmail } from "@/lib/admin/server/shared";
import { getVerificationDetail } from "@/lib/admin/server/verifications";
import { requireStaff } from "@/lib/auth/session";
import { formatDate, formatNumber, formatRelativeTime } from "@/lib/format";
import { cn } from "@/lib/utils";

export async function generateMetadata({ params }: PageProps<"/[locale]/admin/verifications/[id]">): Promise<Metadata> {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: "admin.verifications" });
  return { title: t("detailTitle"), robots: { index: false, follow: false } };
}

export default async function VerificationDetailPage({ params }: PageProps<"/[locale]/admin/verifications/[id]">) {
  const { locale, id } = await params;
  setRequestLocale(locale);
  const staff = await requireStaff("verifications");
  const data = await getVerificationDetail(id, staff);
  if (!data) notFound();
  const { request, documents } = data;
  const { user, listing } = request;
  const [t, tAdmin] = await Promise.all([getTranslations("admin.verifications"), getTranslations("admin")]);
  const typeLabel = tAdmin(`verificationType.${request.type}`);
  const pending = request.status === "PENDING";
  const needsListing = request.type === "OWNERSHIP" || request.type === "PROPERTY";
  const canApprove = pending && user.id !== staff.id && (!needsListing || (!!listing && !data.listingOwnerMismatch));

  return (
    <>
      <AdminPageHeader
        back={{ href: "/admin/verifications", label: t("backToList") }}
        title={t("requestTitle", { type: typeLabel })}
        meta={
          <>
            <VerificationStatusBadge status={request.status} />
            <span>
              {t("sent")} <WhenText date={request.createdAt} />
            </span>
          </>
        }
      />

      {pending && !documentChecksOn() ? (
        // Founder's answer 5 (round 3): no document checks for now; the request stays as it was.
        <p className="mb-5 flex items-start gap-2 rounded-xl border border-primary/20 bg-secondary/60 p-3 text-sm">
          <Info aria-hidden className="mt-0.5 size-4 shrink-0 text-primary" />
          <span>
            <span className="block font-medium">{t("paused.title")}</span>
            <span className="block text-muted-foreground">{t("paused.body")}</span>
          </span>
        </p>
      ) : pending ? (
        <div className="mb-5 rounded-xl border bg-card p-3 shadow-xs">
          <VerificationActions requestId={request.id} typeLabel={typeLabel} name={user.name} canApprove={canApprove} />
          <p className="mt-2 flex items-start gap-1.5 text-xs text-muted-foreground">
            <ShieldCheck aria-hidden className="mt-0.5 size-3.5 shrink-0" />
            {t("deleteNotice")}
          </p>
          {user.id === staff.id ? <p className="mt-1 text-xs text-destructive">{t("ownRequest")}</p> : null}
        </div>
      ) : (
        <p className="mb-5 flex items-start gap-2 rounded-xl border bg-card p-3 text-sm">
          <CheckCircle2 aria-hidden className="mt-0.5 size-4 shrink-0 text-muted-foreground" />
          <span>
            {t("decided", {
              status: tAdmin(`verificationStatus.${request.status}`),
              name: request.reviewedBy?.name ?? "—",
              date: request.reviewedAt ? formatDate(request.reviewedAt, locale) : "—",
            })}
            {request.decisionReason ? (
              <span className="mt-1 block whitespace-pre-wrap text-muted-foreground" dir="auto">
                {request.decisionReason}
              </span>
            ) : null}
          </span>
        </p>
      )}

      <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_22rem]">
        <div className="flex min-w-0 flex-col gap-4">
          <AdminSection title={t("documentsTitle")}>
            {documents.length ? (
              <DocumentViewer requestId={request.id} documents={documents} />
            ) : (
              <div className="flex flex-col items-center gap-2 py-8 text-center text-sm text-muted-foreground">
                <FileX2 aria-hidden className="size-8" />
                <p>
                  {request.documentsDeletedAt
                    ? t("documentsDeletedOn", { date: formatDate(request.documentsDeletedAt, locale) })
                    : t("noDocuments")}
                </p>
              </div>
            )}
          </AdminSection>

          {request.userNote ? (
            <AdminSection title={t("userNote")}>
              <p className="text-sm whitespace-pre-wrap" dir="auto">
                {request.userNote}
              </p>
            </AdminSection>
          ) : null}

          {needsListing ? (
            <AdminSection title={t("listingTitle")}>
              {listing ? (
                <div className="flex flex-col gap-3">
                  <div className="flex gap-3">
                    <ListingThumb src={coverUrl(listing.photos, "md")} alt="" className="size-16" />
                    <div className="flex min-w-0 flex-col gap-1 text-sm">
                      <Link href={`/admin/moderation/${listing.id}`} className="font-medium text-primary hover:underline" dir="auto">
                        {listing.title}
                      </Link>
                      <p className="flex flex-wrap items-center gap-1.5 text-xs text-muted-foreground">
                        <PublicId id={listing.publicId} />
                        <ListingStatusBadge status={listing.status} className="h-5" />
                        {cityName(listing.city, locale) ? <span>{cityName(listing.city, locale)}</span> : null}
                      </p>
                      {listing.address ? (
                        <p className="text-xs text-muted-foreground" dir="auto">
                          {listing.address}
                        </p>
                      ) : null}
                    </div>
                  </div>
                  <div
                    className={cn(
                      "rounded-lg border p-3 text-sm",
                      data.cadastral === "match" && "border-success/40 bg-primary-tint",
                      data.cadastral === "mismatch" && "border-destructive/40 bg-destructive/5",
                    )}
                  >
                    <p className="mb-2 flex items-center gap-1.5 font-medium">
                      {data.cadastral === "mismatch" ? (
                        <AlertTriangle aria-hidden className="size-4 text-destructive" />
                      ) : data.cadastral === "match" ? (
                        <CheckCircle2 aria-hidden className="size-4 text-success" />
                      ) : (
                        <Info aria-hidden className="size-4 text-muted-foreground" />
                      )}
                      {t(`cadastral.${data.cadastral}`)}
                    </p>
                    <FactList
                      items={[
                        { label: t("cadastralRequest"), value: request.cadastralCode ? <Ltr className="font-mono">{request.cadastralCode}</Ltr> : "—" },
                        { label: t("cadastralListing"), value: listing.cadastralCode ? <Ltr className="font-mono">{listing.cadastralCode}</Ltr> : "—" },
                      ]}
                    />
                  </div>
                  <p className="flex items-start gap-1.5 rounded-lg bg-muted p-3 text-xs">
                    <Info aria-hidden className="mt-0.5 size-3.5 shrink-0" />
                    <span>
                      {t("nameHint")} <strong dir="auto">{user.name}</strong>
                      {user.businessName ? (
                        <>
                          {" / "}
                          <strong dir="auto">{user.businessName}</strong>
                        </>
                      ) : null}
                    </span>
                  </p>
                  {data.listingOwnerMismatch ? <p className="text-sm text-destructive">{t("ownerMismatch")}</p> : null}
                  {listing.ownerVerifiedAt ? (
                    <p className="text-xs text-muted-foreground">{t("alreadyOwnerVerified", { date: formatDate(listing.ownerVerifiedAt, locale) })}</p>
                  ) : null}
                </div>
              ) : (
                <p className="text-sm text-destructive">{t("listingMissing")}</p>
              )}
            </AdminSection>
          ) : null}
        </div>

        <aside className="flex min-w-0 flex-col gap-4">
          <AdminSection
            title={t("userTitle")}
            actions={
              <Link href={`/admin/users/${user.id}`} className="text-sm font-medium text-primary hover:underline">
                {t("openProfile")}
              </Link>
            }
          >
            <div className="flex flex-col gap-2 text-sm">
              <div className="flex flex-wrap items-center gap-1.5">
                <span className="font-medium" dir="auto">
                  {user.name}
                </span>
                <UserStatusBadge status={user.status} className="h-5" />
                <RoleBadge role={user.role} className="h-5" />
              </div>
              <AccountMarkers user={user} />
              <FactList
                className="sm:grid-cols-1"
                items={[
                  ...(user.businessName ? [{ label: t("businessName"), value: <span dir="auto">{user.businessName}</span> }] : []),
                  { label: tAdmin("common.joined"), value: `${formatDate(user.createdAt, locale)} · ${formatRelativeTime(user.createdAt, locale)}` },
                  { label: tAdmin("common.phone"), value: <StaffPhoneValue phone={data.userPhone} withheldNote={tAdmin("users.phoneLast2Only")} /> },
                  { label: tAdmin("common.email"), value: realEmail(user.email) ? <Ltr className="break-all">{realEmail(user.email)}</Ltr> : "—" },
                  {
                    label: t("stats"),
                    value: t("statsValue", {
                      listings: formatNumber(user._count.listings, locale),
                      reports: formatNumber(user._count.reportsAgainst, locale),
                    }),
                  },
                  { label: t("idStatus"), value: user.idVerifiedAt ? formatDate(user.idVerifiedAt, locale) : tAdmin("common.no") },
                ]}
              />
            </div>
          </AdminSection>

          <AdminSection title={t("historyTitle")}>
            {data.history.length === 0 ? (
              <p className="text-sm text-muted-foreground">{t("noHistory")}</p>
            ) : (
              <ul className="flex flex-col gap-2">
                {data.history.map((h) => (
                  <li key={h.id} className="flex flex-wrap items-center gap-1.5 text-sm">
                    <Link href={`/admin/verifications/${h.id}`} className="hover:underline">
                      {tAdmin(`verificationType.${h.type}`)}
                    </Link>
                    <VerificationStatusBadge status={h.status} className="h-5" />
                    <span className="text-xs text-muted-foreground">
                      <WhenText date={h.createdAt} />
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </AdminSection>
        </aside>
      </div>
    </>
  );
}
