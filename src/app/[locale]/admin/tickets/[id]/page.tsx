import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { getTranslations, setRequestLocale } from "next-intl/server";
import { ListingStatusBadge, RiskChip, UserStatusBadge } from "@/components/admin/badges";
import { AdminPrice, ListingThumb, PublicId, WhenText } from "@/components/admin/listing-bits";
import { AdminPageHeader, AdminSection, FactList } from "@/components/admin/page-header";
import { TicketControls, TicketReplyBox } from "@/components/admin/ticket-reply-box";
import { Ltr } from "@/components/common/ltr";
import { TicketCategoryLabel, TicketMessageList, TicketPriorityBadge, TicketStatusBadge } from "@/components/tickets";
import { siteConfig } from "@/config/site";
import { Link } from "@/i18n/navigation";
import { cityName, coverUrl, localizedTitle } from "@/lib/admin/server/shared";
import { savedRepliesFor, ticketContext, ticketStaffMembers } from "@/lib/admin/server/tickets";
import { can } from "@/lib/auth/permissions";
import { requireStaff } from "@/lib/auth/session";
import { formatDate, formatNumber, formatRelativeTime } from "@/lib/format";
import { getTicketForStaff } from "@/lib/tickets/server";

export async function generateMetadata({ params }: PageProps<"/[locale]/admin/tickets/[id]">): Promise<Metadata> {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: "admin.tickets" });
  return { title: t("detailTitle"), robots: { index: false, follow: false } };
}

export default async function TicketDetailPage({ params }: PageProps<"/[locale]/admin/tickets/[id]">) {
  const { locale, id } = await params;
  setRequestLocale(locale);
  const staff = await requireStaff("tickets");
  const ticket = await getTicketForStaff(id, locale);
  if (!ticket) notFound();
  const [t, tAdmin, tFields, context, savedReplies, staffMembers] = await Promise.all([
    getTranslations("admin.tickets"),
    getTranslations("admin"),
    getTranslations("listingFields"),
    ticketContext(ticket, locale),
    savedRepliesFor(locale),
    ticketStaffMembers(),
  ]);
  const requesterName = ticket.user?.name ?? ticket.guestName ?? null;
  const { requester, listing } = context;
  const n = (v: number) => formatNumber(v, locale);
  const language = siteConfig.i18n.nativeNames[ticket.locale as keyof typeof siteConfig.i18n.nativeNames] ?? ticket.locale;

  return (
    <>
      <AdminPageHeader
        back={{ href: "/admin/tickets", label: t("backToList") }}
        title={
          <span className="flex flex-wrap items-baseline gap-2">
            <Ltr className="font-mono text-base text-muted-foreground">#{ticket.number}</Ltr>
            <span dir="auto">{ticket.subject}</span>
          </span>
        }
        meta={
          <>
            <TicketStatusBadge status={ticket.status} perspective="staff" />
            <TicketPriorityBadge priority={ticket.priority} />
            <TicketCategoryLabel category={ticket.category} />
            <span className="text-xs">
              {t("opened")} <WhenText date={ticket.createdAt} />
            </span>
          </>
        }
      />

      <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_20rem]">
        <div className="flex min-w-0 flex-col gap-4">
          <AdminSection title={t("conversation")} description={t("conversationHint")}>
            {ticket.messages.length ? (
              <TicketMessageList messages={ticket.messages} perspective="staff" requesterName={requesterName} />
            ) : (
              <p className="text-sm text-muted-foreground">{t("noMessages")}</p>
            )}
          </AdminSection>
          <TicketReplyBox ticketId={ticket.id} savedReplies={savedReplies} requesterName={requesterName} />
          {ticket.rating ? (
            <AdminSection title={t("rating")}>
              <p className="text-sm">{t("ratingValue", { rating: n(ticket.rating) })}</p>
              {ticket.ratingComment ? (
                <p className="mt-1 text-sm text-muted-foreground" dir="auto">
                  {ticket.ratingComment}
                </p>
              ) : null}
            </AdminSection>
          ) : null}
        </div>

        <aside className="flex min-w-0 flex-col gap-4">
          <AdminSection title={t("manage")}>
            <TicketControls
              ticketId={ticket.id}
              status={ticket.status}
              assignedToId={ticket.assignedTo?.id ?? null}
              staffId={staff.id}
              staffMembers={staffMembers}
            />
          </AdminSection>

          <AdminSection
            title={t("requester")}
            actions={
              requester && can(staff.role, "users.view") ? (
                <Link href={`/admin/users/${requester.id}`} className="text-sm font-medium text-primary hover:underline">
                  {t("openProfile")}
                </Link>
              ) : null
            }
          >
            {requester ? (
              <div className="flex flex-col gap-2 text-sm">
                <div className="flex flex-wrap items-center gap-1.5">
                  <span className="font-medium" dir="auto">
                    {requester.name}
                  </span>
                  <UserStatusBadge status={requester.status} className="h-5" />
                </div>
                <FactList
                  className="sm:grid-cols-1"
                  items={[
                    { label: tAdmin("common.phone"), value: requester.phoneNumber ? <Ltr>{requester.phoneNumber}</Ltr> : "—" },
                    { label: tAdmin("common.email"), value: requester.email ? <Ltr className="break-all">{requester.email}</Ltr> : "—" },
                    { label: tAdmin("common.language"), value: language },
                    { label: tAdmin("common.joined"), value: formatRelativeTime(requester.createdAt, locale) },
                    { label: tAdmin("common.idVerified"), value: requester.idVerifiedAt ? formatDate(requester.idVerifiedAt, locale) : tAdmin("common.no") },
                    {
                      label: t("requesterStats"),
                      value: t("requesterStatsValue", {
                        tickets: n(requester._count.tickets),
                        listings: n(requester._count.listings),
                        reports: n(requester._count.reportsAgainst),
                      }),
                    },
                  ]}
                />
              </div>
            ) : (
              <FactList
                className="sm:grid-cols-1"
                items={[
                  { label: tAdmin("common.name"), value: ticket.guestName ? <span dir="auto">{ticket.guestName}</span> : "—" },
                  { label: tAdmin("common.email"), value: ticket.guestEmail ? <Ltr className="break-all">{ticket.guestEmail}</Ltr> : "—" },
                  { label: tAdmin("common.language"), value: language },
                  { label: t("guestLabel"), value: t("guestHint") },
                ]}
              />
            )}
          </AdminSection>

          {listing ? (
            <AdminSection
              title={t("linkedListing")}
              actions={
                can(staff.role, "moderation") ? (
                  <Link href={`/admin/moderation/${listing.id}`} className="text-sm font-medium text-primary hover:underline">
                    {t("openReview")}
                  </Link>
                ) : null
              }
            >
              <div className="flex gap-3">
                <ListingThumb src={coverUrl(listing.photos)} alt="" className="size-14" />
                <div className="flex min-w-0 flex-col gap-1 text-sm">
                  <p className="font-medium" dir="auto">
                    {localizedTitle(listing, t("untitled"))}
                  </p>
                  <p className="flex flex-wrap items-center gap-1.5 text-xs text-muted-foreground">
                    <PublicId id={listing.publicId} />
                    <ListingStatusBadge status={listing.status} className="h-5" />
                    <RiskChip score={listing.riskScore} className="h-5" />
                  </p>
                  <p className="text-xs text-muted-foreground">
                    {tFields(`dealType.${listing.dealType}`)}
                    {cityName(listing.city, locale) ? ` · ${cityName(listing.city, locale)}` : ""}
                  </p>
                  <AdminPrice amount={listing.price} currency={listing.currency} period={listing.pricePeriod} className="text-xs" />
                  <p className="text-xs text-muted-foreground">
                    {t("listingOwner")}{" "}
                    {can(staff.role, "users.view") ? (
                      <Link href={`/admin/users/${listing.owner.id}`} className="text-primary hover:underline" dir="auto">
                        {listing.owner.name}
                      </Link>
                    ) : (
                      <span dir="auto">{listing.owner.name}</span>
                    )}
                    {" · "}
                    {t("listingReports", { count: listing.reportCount })}
                  </p>
                </div>
              </div>
            </AdminSection>
          ) : null}
        </aside>
      </div>
    </>
  );
}
