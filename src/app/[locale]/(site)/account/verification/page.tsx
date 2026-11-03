import type { ReactNode } from "react";
import type { Metadata } from "next";
import { getTranslations, setRequestLocale } from "next-intl/server";
import {
  BadgeCheckIcon,
  BuildingIcon,
  FileTextIcon,
  HomeIcon,
  LockKeyholeIcon,
  PlusIcon,
  ShieldCheckIcon,
  SmartphoneIcon,
  VideoIcon,
  type LucideIcon,
} from "lucide-react";
import { BadgeStateChip, sectionCard } from "@/components/account/overview";
import { BusinessForm, IdVerificationForm, OwnershipForm } from "@/components/account/verification-forms";
import { Ltr } from "@/components/common/ltr";
import { PageHeader } from "@/components/common/page-header";
import { Button } from "@/components/ui/button";
import { siteConfig } from "@/config/site";
import { Link } from "@/i18n/navigation";
import { getVerificationCenter, toSummaries, type VerificationRequestView } from "@/lib/account/queries";
import { badgeState, latestRequest, type BadgeState } from "@/lib/account/verification";
import { mayOfferPhoneCheck } from "@/lib/auth/phone-check-policy";
import { requireUser } from "@/lib/auth/session";
import { formatDate } from "@/lib/format";
import { pageMetadata } from "@/lib/seo";

type Props = { params: Promise<{ locale: string }> };

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: "account.meta" });
  return pageMetadata({ locale, path: "/account/verification", title: t("verification"), description: t("description"), noIndex: true });
}

function Section({
  id,
  icon: Icon,
  title,
  state,
  lead,
  children,
}: {
  id: string;
  icon: LucideIcon;
  title: string;
  state?: BadgeState | null;
  lead?: ReactNode;
  children?: ReactNode;
}) {
  return (
    <section id={id} aria-labelledby={`${id}-title`} className={`${sectionCard} scroll-mt-24`}>
      <div className="flex flex-wrap items-start gap-3">
        <span className="inline-flex size-11 shrink-0 items-center justify-center rounded-full bg-secondary text-primary">
          <Icon className="size-5" aria-hidden="true" />
        </span>
        <div className="grid min-w-0 flex-1 gap-1">
          <div className="flex flex-wrap items-center gap-2">
            <h2 id={`${id}-title`} className="text-lg font-semibold">
              {title}
            </h2>
            {state ? <BadgeStateChip state={state} /> : null}
          </div>
          {lead ? <div className="text-sm text-muted-foreground">{lead}</div> : null}
        </div>
      </div>
      {children ? <div className="mt-5 grid gap-4">{children}</div> : null}
    </section>
  );
}

/** /account/verification — phone, ID, owner (per listing), business and (Phase 2) property badges. */
export default async function VerificationPage({ params }: Props) {
  const { locale } = await params;
  setRequestLocale(locale);
  const user = await requireUser({ next: "/account/verification" });
  const t = await getTranslations("account.verification");
  const center = await getVerificationCenter(user.id);
  const summaries = toSummaries(center.requests);
  const date = (iso: string) => formatDate(iso, locale, { dateStyle: "medium" });

  const reasonText = (request: VerificationRequestView | undefined) => {
    // Staff write the reason in the user's own language (reason + optional note).
    const reason = request?.decisionReason;
    if (!reason) return null;
    return (
      <span dir="auto" className="whitespace-pre-line">
        {reason}
      </span>
    );
  };
  const byId = new Map(center.requests.map((r) => [r.id, r]));

  /** Status block for a request: pending, or the reason it was turned down. */
  const requestStatus = (latestId: string | null) => {
    const request = latestId ? byId.get(latestId) : undefined;
    if (!request) return null;
    if (request.status === "PENDING") {
      return <p className="rounded-xl bg-surface-muted px-3 py-3 text-sm">{t("pendingSince", { date: date(request.createdAt) })}</p>;
    }
    if (request.status === "REJECTED" || request.status === "NEEDS_MORE_INFO") {
      return (
        <div className="rounded-xl border border-destructive/30 bg-destructive/5 px-3 py-3 text-sm">
          <p className="font-semibold">{t(request.status === "REJECTED" ? "rejectedOn" : "moreInfoOn", { date: date(request.reviewedAt ?? request.createdAt) })}</p>
          {reasonText(request) ? <p className="mt-1">{reasonText(request)}</p> : null}
          <p className="mt-1 text-muted-foreground">{t("tryAgain")}</p>
        </div>
      );
    }
    return null;
  };

  const idLatest = latestRequest(summaries, "ID");
  const idState = badgeState(!!center.idVerifiedAt, idLatest);
  const businessLatest = latestRequest(summaries, "BUSINESS");
  const businessState = badgeState(!!center.businessVerifiedAt, businessLatest);
  const nextHere = "/account/verification";

  return (
    <div className="grid gap-4 sm:gap-6">
      <PageHeader title={t("title")} description={t("lead", { siteName: siteConfig.localizedName[locale as keyof typeof siteConfig.localizedName] ?? siteConfig.name })} className="pb-0 sm:pb-0" />

      <aside className="flex gap-3 rounded-2xl border border-primary/20 bg-secondary/60 p-4 text-sm">
        <LockKeyholeIcon className="mt-0.5 size-5 shrink-0 text-primary" aria-hidden="true" />
        <div className="grid gap-1">
          <p className="font-semibold">{t("privacy.title")}</p>
          <ul className="grid list-disc gap-0.5 ps-5 text-muted-foreground">
            <li>{t("privacy.encrypted")}</li>
            <li>{t("privacy.staffOnly")}</li>
            <li>{t("privacy.deleted")}</li>
          </ul>
        </div>
      </aside>

      <Section
        id="phone"
        icon={SmartphoneIcon}
        title={t("phone.title")}
        state={center.phoneVerified ? "verified" : "notStarted"}
        lead={
          center.phoneVerified && center.phoneNumber ? (
            <>
              {t("phone.verified")} <Ltr className="font-medium text-foreground">{center.phoneNumber}</Ltr>
            </>
          ) : center.isHost ? (
            t("phone.lead")
          ) : (
            // A guest: the phone is checked in the booking review, never offered here (paid SMS).
            t("phone.guestLead")
          )
        }
      >
        {center.phoneVerified || !mayOfferPhoneCheck("account", { isHost: center.isHost }) ? null : (
          <div>
            <Button asChild className="h-11 rounded-xl px-5">
              <Link href={{ pathname: "/verify-phone", query: { next: nextHere } }}>
                <SmartphoneIcon aria-hidden="true" />
                {t("phone.cta")}
              </Link>
            </Button>
          </div>
        )}
      </Section>

      <Section
        id="id"
        icon={BadgeCheckIcon}
        title={t("id.title")}
        state={idState}
        lead={center.idVerifiedAt ? t("verifiedOn", { date: date(center.idVerifiedAt) }) : t("id.lead")}
      >
        {center.idVerifiedAt ? null : (
          <>
            {requestStatus(idLatest?.id ?? null)}
            {idState === "pending" ? null : <IdVerificationForm />}
          </>
        )}
      </Section>

      <Section id="owner" icon={HomeIcon} title={t("owner.title")} lead={t("owner.lead")}>
        <details className="rounded-xl bg-muted/50 px-3 py-2 text-sm">
          <summary className="flex min-h-10 cursor-pointer items-center gap-2 font-medium">
            <FileTextIcon className="size-4" aria-hidden="true" />
            {t("owner.whatIsTitle")}
          </summary>
          <div className="grid gap-2 pt-1 pb-2 text-muted-foreground">
            <p>{t("owner.whatIs1")}</p>
            <p>{t("owner.whatIs2")}</p>
            <p>{t("owner.whatIs3")}</p>
          </div>
        </details>
        {center.listings.length === 0 ? (
          <div className="flex flex-col items-start gap-3 rounded-xl border border-dashed p-4 text-sm">
            <p>{t("owner.noListings")}</p>
            <Button asChild variant="outline" className="h-10 rounded-xl px-4">
              <Link href="/post">
                <PlusIcon aria-hidden="true" />
                {t("owner.post")}
              </Link>
            </Button>
          </div>
        ) : (
          <ul className="grid gap-3">
            {center.listings.map((listing) => {
              const latest = latestRequest(summaries, "OWNERSHIP", listing.id);
              const state = badgeState(listing.ownerVerified, latest);
              return (
                <li key={listing.id} className="rounded-xl border bg-background p-3 sm:p-4">
                  <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
                    <p className="min-w-0 font-medium break-words sm:flex-1" dir="auto">
                      {listing.title || t("owner.untitled")}
                    </p>
                    <div className="flex shrink-0 items-center gap-2">
                      <span className="text-xs text-muted-foreground">
                        {t("owner.listingId")} <Ltr>{listing.publicId}</Ltr>
                      </span>
                      <BadgeStateChip state={state} />
                    </div>
                  </div>
                  {listing.ownerVerified || state === "pending" ? (
                    state === "pending" ? <div className="mt-3">{requestStatus(latest?.id ?? null)}</div> : null
                  ) : (
                    <details className="mt-3" open={state === "actionNeeded"}>
                      <summary className="inline-flex min-h-10 cursor-pointer items-center rounded-lg font-medium text-primary">
                        {t("owner.start")}
                      </summary>
                      <div className="mt-3 grid gap-4">
                        {requestStatus(latest?.id ?? null)}
                        <OwnershipForm listingId={listing.id} cadastralCode={listing.cadastralCode} />
                      </div>
                    </details>
                  )}
                </li>
              );
            })}
          </ul>
        )}
      </Section>

      <Section
        id="business"
        icon={BuildingIcon}
        title={t("business.title")}
        state={center.accountType === "BUSINESS" ? businessState : null}
        lead={
          center.businessVerifiedAt
            ? t("verifiedOn", { date: date(center.businessVerifiedAt) })
            : center.accountType === "BUSINESS"
              ? t("business.lead")
              : t("business.privateLead")
        }
      >
        {center.accountType !== "BUSINESS" ? (
          <div>
            <Button asChild variant="outline" className="h-10 rounded-xl px-4">
              <Link href="/account/settings#profile">{t("business.switch")}</Link>
            </Button>
          </div>
        ) : center.businessVerifiedAt ? null : (
          <>
            {requestStatus(businessLatest?.id ?? null)}
            {businessState === "pending" ? null : <BusinessForm />}
          </>
        )}
      </Section>

      <Section id="property" icon={VideoIcon} title={t("property.title")} lead={t("property.lead")}>
        <p className="inline-flex items-center gap-2 self-start rounded-full bg-muted px-3 py-1.5 text-sm font-medium text-muted-foreground">
          <ShieldCheckIcon className="size-4" aria-hidden="true" />
          {t("property.soon")}
        </p>
      </Section>
    </div>
  );
}
