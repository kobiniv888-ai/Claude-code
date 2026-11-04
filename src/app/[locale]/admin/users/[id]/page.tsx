import { BadgeCheck, Flag, MonitorSmartphone, ShieldAlert } from "lucide-react";
import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { getTranslations, setRequestLocale } from "next-intl/server";
import { AdminNoteForm } from "@/components/admin/admin-note-form";
import {
  AccountMarkers,
  ListingStatusBadge,
  ReportStatusBadge,
  RiskChip,
  RoleBadge,
  UserStatusBadge,
  VerificationStatusBadge,
} from "@/components/admin/badges";
import { ListingThumb, PublicId, WhenText } from "@/components/admin/listing-bits";
import { AdminPageHeader, AdminSection, FactList } from "@/components/admin/page-header";
import { RoleChanger, UserActions } from "@/components/admin/user-actions";
import { Ltr } from "@/components/common/ltr";
import { PledgeAdminFact } from "@/components/pledge/pledge-admin-fact";
import { TicketStatusBadge } from "@/components/tickets";
import { siteConfig } from "@/config/site";
import { Link } from "@/i18n/navigation";
import { Pill, type PillTone } from "@/components/admin/content/pill";
import type { BookingStatus } from "@/generated/prisma/enums";
import { hostFlagSummary } from "@/lib/admin/server/flags";
import { coverUrl, realEmail } from "@/lib/admin/server/shared";
import { getUserBookings, getUserDetail, type UserBookingRow } from "@/lib/admin/server/users";
import { personName } from "@/lib/auth/first-name";
import { dateToDay } from "@/lib/booking/dates";
import { can } from "@/lib/auth/permissions";
import { requireStaff } from "@/lib/auth/session";
import { formatDate, formatDateRange, formatNumber, formatRelativeTime } from "@/lib/format";
import { FlagReviewButton } from "../../flags/_components/flag-review-button";

const BOOKING_TONE: Record<BookingStatus, PillTone> = {
  CONFIRMED: "success",
  COMPLETED: "muted",
  CANCELLED_BY_GUEST: "muted",
  CANCELLED_BY_HOST: "warning",
  NO_SHOW: "warning",
};

export async function generateMetadata({ params }: PageProps<"/[locale]/admin/users/[id]">): Promise<Metadata> {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: "admin.users" });
  return { title: t("detailTitle"), robots: { index: false, follow: false } };
}

export default async function UserDetailPage({ params }: PageProps<"/[locale]/admin/users/[id]">) {
  const { locale, id } = await params;
  setRequestLocale(locale);
  const staff = await requireStaff("users.view");
  const data = await getUserDetail(id);
  if (!data) notFound();
  const { user } = data;
  const canModerate = can(staff.role, "moderation");
  const [t, tAdmin, tFields, tb, bookings, flags] = await Promise.all([
    getTranslations("admin.users"),
    getTranslations("admin"),
    getTranslations("listingFields"),
    getTranslations("booking"),
    getUserBookings(user.id),
    hostFlagSummary(user.id),
  ]);
  const n = (v: number) => formatNumber(v, locale);
  const self = user.id === staff.id;
  const canManage = can(staff.role, "users.manage") && !self && (user.role === "USER" || staff.role === "ADMIN");
  const email = realEmail(user.email);
  const language = siteConfig.i18n.nativeNames[user.locale as keyof typeof siteConfig.i18n.nativeNames] ?? user.locale;

  return (
    <>
      <AdminPageHeader
        back={{ href: "/admin/users", label: t("backToList") }}
        title={<span dir="auto">{user.businessName || user.name}</span>}
        meta={
          <>
            <UserStatusBadge status={user.status} />
            <RoleBadge role={user.role} />
            <AccountMarkers user={user} />
            <span className="text-xs">
              {t("joinedOn", { date: formatDate(user.createdAt, locale), age: formatRelativeTime(user.createdAt, locale) })}
            </span>
          </>
        }
      />

      {canManage ? (
        <div id="actions" className="mb-5 scroll-mt-20 rounded-xl border bg-card p-3 shadow-xs">
          <UserActions userId={user.id} name={user.name} status={user.status} idVerified={!!user.idVerifiedAt} canManage />
          <p className="mt-2 text-xs text-muted-foreground">{t("blockHint")}</p>
        </div>
      ) : self ? (
        <p className="mb-5 rounded-xl border bg-card p-3 text-sm text-muted-foreground">{t("selfHint")}</p>
      ) : null}

      {user.status !== "ACTIVE" && user.statusReason ? (
        <p className="mb-5 flex items-start gap-2 rounded-xl border border-border-strong/50 bg-surface-muted p-3 text-sm">
          <ShieldAlert aria-hidden className="mt-0.5 size-4 shrink-0" />
          <span>
            {t("statusReason", {
              reason: tAdmin.has(`userReasons.${user.statusReason}.label`)
                ? tAdmin(`userReasons.${user.statusReason}.label`)
                : user.statusReason,
            })}
            {user.status === "SUSPENDED" && user.suspendedUntil ? (
              <> · {t("suspendedUntil", { date: formatDate(user.suspendedUntil, locale) })}</>
            ) : null}
          </span>
        </p>
      ) : null}

      <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_22rem]">
        <div className="flex min-w-0 flex-col gap-4">
          <AdminSection title={t("profileTitle")}>
            <FactList
              items={[
                { label: tAdmin("common.name"), value: <span dir="auto">{user.name}</span> },
                ...(user.businessName ? [{ label: t("businessName"), value: <span dir="auto">{user.businessName}</span> }] : []),
                {
                  label: tAdmin("common.phone"),
                  value: user.phoneNumber ? (
                    <span>
                      <Ltr>{user.phoneNumber}</Ltr>{" "}
                      <span className="text-xs text-muted-foreground">
                        {user.phoneNumberVerified ? t("phoneVerified") : t("phoneNotVerified")}
                      </span>
                    </span>
                  ) : (
                    "—"
                  ),
                },
                { label: tAdmin("common.email"), value: email ? <Ltr className="break-all">{email}</Ltr> : "—" },
                ...(user.contactEmail ? [{ label: t("contactEmail"), value: <Ltr className="break-all">{user.contactEmail}</Ltr> }] : []),
                { label: tAdmin("common.language"), value: language },
                { label: t("accountType"), value: tAdmin(`accountType.${user.accountType}`) },
                { label: t("lastSeen"), value: user.lastSeenAt ? formatRelativeTime(user.lastSeenAt, locale) : "—" },
                { label: t("twoFactor"), value: user.twoFactorEnabled ? tAdmin("common.yes") : tAdmin("common.no") },
                { label: t("sessions"), value: n(data.activeSessions) },
                {
                  label: t("userId"),
                  value: (
                    <Ltr className="font-mono text-xs break-all" translate="no">
                      {user.id}
                    </Ltr>
                  ),
                },
              ]}
            />
            {user.bio ? (
              <p className="mt-4 rounded-lg border bg-background p-3 text-sm whitespace-pre-wrap" dir="auto">
                {user.bio}
              </p>
            ) : null}
          </AdminSection>

          <AdminSection title={t("verificationTitle")}>
            <ul className="flex flex-col gap-2 text-sm">
              <li className="flex items-center gap-2">
                <BadgeCheck aria-hidden className={user.idVerifiedAt ? "size-4 text-success" : "size-4 text-muted-foreground"} />
                {user.idVerifiedAt
                  ? t("idVerifiedOn", { date: formatDate(user.idVerifiedAt, locale), name: data.idVerifiedBy ?? "—" })
                  : t("idNotVerified")}
              </li>
              <PledgeAdminFact userId={user.id} locale={locale} />
              {user.accountType === "BUSINESS" ? (
                <li className="flex items-center gap-2">
                  <BadgeCheck aria-hidden className={user.businessVerifiedAt ? "size-4 text-success" : "size-4 text-muted-foreground"} />
                  {user.businessVerifiedAt
                    ? t("businessVerifiedOn", { date: formatDate(user.businessVerifiedAt, locale), name: data.businessVerifiedBy ?? "—" })
                    : t("businessNotVerified")}
                </li>
              ) : null}
            </ul>
            {data.verifications.length ? (
              <ul className="mt-3 divide-y border-t pt-1">
                {data.verifications.map((v) => (
                  <li key={v.id} className="flex flex-wrap items-center gap-2 py-2 text-sm">
                    {can(staff.role, "verifications") ? (
                      <Link href={`/admin/verifications/${v.id}`} className="font-medium hover:underline">
                        {tAdmin(`verificationType.${v.type}`)}
                      </Link>
                    ) : (
                      <span className="font-medium">{tAdmin(`verificationType.${v.type}`)}</span>
                    )}
                    {v.listing ? <PublicId id={v.listing.publicId} /> : null}
                    <VerificationStatusBadge status={v.status} className="h-5" />
                    <span className="text-xs text-muted-foreground">
                      <WhenText date={v.createdAt} />
                      {v.reviewedBy ? <> · {v.reviewedBy.name}</> : null}
                    </span>
                  </li>
                ))}
              </ul>
            ) : null}
          </AdminSection>

          <AdminSection title={t("listingsTitle", { count: data.listings.length })}>
            {data.listings.length === 0 ? (
              <p className="text-sm text-muted-foreground">{t("noListings")}</p>
            ) : (
              <ul className="divide-y">
                {data.listings.map((l) => (
                  <li key={l.id} className="flex items-center gap-3 py-2 first:pt-0 last:pb-0">
                    <ListingThumb src={coverUrl(l.photos)} alt="" className="size-10" />
                    <div className="flex min-w-0 flex-1 flex-col gap-0.5">
                      {can(staff.role, "moderation") ? (
                        <Link href={`/admin/moderation/${l.id}`} className="truncate text-sm font-medium hover:underline" dir="auto">
                          {l.title || t("untitled")}
                        </Link>
                      ) : (
                        <span className="truncate text-sm font-medium" dir="auto">
                          {l.title || t("untitled")}
                        </span>
                      )}
                      <span className="flex flex-wrap items-center gap-1.5 text-xs text-muted-foreground">
                        <PublicId id={l.publicId} />
                        <span>{tFields(`dealType.${l.dealType}`)}</span>
                        {l.reportCount > 0 ? <span>· {t("reportCount", { count: l.reportCount })}</span> : null}
                        {l.ownerVerifiedAt ? <span>· {t("ownershipVerified")}</span> : null}
                      </span>
                    </div>
                    <div className="flex shrink-0 items-center gap-1.5">
                      <RiskChip score={l.riskScore} className="hidden sm:inline-flex" />
                      <ListingStatusBadge status={l.status} />
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </AdminSection>

          <AdminSection
            id="bookings"
            title={t("bookings.title")}
            description={t("bookings.summary", {
              host: n(bookings.hostTotal),
              guest: n(bookings.guestTotal),
            })}
          >
            <dl className="mb-4 grid grid-cols-2 gap-3 text-sm sm:grid-cols-4">
              {(
                [
                  ["hostCancelled", bookings.hostCancelled],
                  ["hostFlagged", bookings.hostFlagged],
                  ["guestCancelled", bookings.guestCancelled],
                  ["guestNoShows", bookings.guestNoShows],
                ] as const
              ).map(([key, value]) => (
                <div key={key} className="rounded-lg border bg-background p-2.5">
                  <dt className="text-xs text-muted-foreground">{t(`bookings.counts.${key}`)}</dt>
                  <dd className="mt-0.5 text-lg font-semibold tabular-nums">{n(value)}</dd>
                </div>
              ))}
            </dl>
            <div className="grid gap-4 xl:grid-cols-2">
              <div>
                <h3 className="mb-2 text-xs font-medium text-muted-foreground">{t("bookings.asHost", { count: bookings.hostTotal })}</h3>
                <BookingList rows={bookings.asHost} side="host" canOpen={canModerate} empty={t("bookings.none")} locale={locale} tb={(key) => tb(key)} flagLabel={t("bookings.flagged")} />
              </div>
              <div>
                <h3 className="mb-2 text-xs font-medium text-muted-foreground">{t("bookings.asGuest", { count: bookings.guestTotal })}</h3>
                <BookingList rows={bookings.asGuest} side="guest" canOpen={canModerate} empty={t("bookings.none")} locale={locale} tb={(key) => tb(key)} flagLabel={t("bookings.flagged")} />
              </div>
            </div>
          </AdminSection>

          <div id="reports" className="grid scroll-mt-20 gap-4 xl:grid-cols-2">
            <AdminSection title={t("reportsAgainst", { count: data.reportsAgainst.length })}>
              <ReportList rows={data.reportsAgainst.map((r) => ({ ...r, who: r.reporter?.name ?? null }))} empty={t("noReports")} />
            </AdminSection>
            <AdminSection title={t("reportsMade", { count: data.reportsMade.length })}>
              <ReportList rows={data.reportsMade.map((r) => ({ ...r, who: r.targetUser?.name ?? null }))} empty={t("noReports")} />
            </AdminSection>
          </div>

          <AdminSection title={t("ticketsTitle", { count: data.tickets.length })}>
            {data.tickets.length === 0 ? (
              <p className="text-sm text-muted-foreground">{t("noTickets")}</p>
            ) : (
              <ul className="divide-y">
                {data.tickets.map((tk) => (
                  <li key={tk.id} className="flex flex-wrap items-center gap-2 py-2 text-sm first:pt-0 last:pb-0">
                    <Ltr className="font-mono text-xs text-muted-foreground">#{tk.number}</Ltr>
                    {can(staff.role, "tickets") ? (
                      <Link href={`/admin/tickets/${tk.id}`} className="min-w-0 flex-1 truncate font-medium hover:underline" dir="auto">
                        {tk.subject}
                      </Link>
                    ) : (
                      <span className="min-w-0 flex-1 truncate" dir="auto">
                        {tk.subject}
                      </span>
                    )}
                    <TicketStatusBadge status={tk.status} perspective="staff" />
                  </li>
                ))}
              </ul>
            )}
          </AdminSection>
        </div>

        <aside className="flex min-w-0 flex-col gap-4">
          {flags && (flags.flagged || flags.countingReports > 0 || flags.openNoShows > 0 || flags.reviewedAt) ? (
            <AdminSection
              id="flags"
              title={
                <span className="inline-flex items-center gap-1.5">
                  <Flag aria-hidden className={flags.flagged ? "size-4 text-destructive" : "size-4 text-muted-foreground"} />
                  {t("flags.title")}
                </span>
              }
              className={flags.flagged ? "border-destructive/40" : undefined}
              actions={
                canModerate ? (
                  <Link href="/admin/flags?view=hosts" className="text-sm font-medium text-primary hover:underline">
                    {t("flags.open")}
                  </Link>
                ) : null
              }
            >
              <ul className="flex flex-col gap-1.5 text-sm">
                <li className="font-medium">{flags.flagged ? t("flags.flagged") : t("flags.notFlagged")}</li>
                <li>{t("flags.reports", { count: flags.countingReports })}</li>
                {flags.turnedAway > 0 ? <li className="text-destructive">{t("flags.turnedAway", { count: flags.turnedAway })}</li> : null}
                {flags.sanctioned ? <li className="text-destructive">{t("flags.sanctioned")}</li> : null}
                {flags.openCancellations > 0 ? <li>{t("flags.cancellations", { count: flags.openCancellations })}</li> : null}
                {flags.openNoShows > 0 ? <li>{t("flags.noShows", { count: flags.openNoShows })}</li> : null}
                {flags.reviewedAt ? (
                  <li className="text-xs text-muted-foreground">{t("flags.reviewedAt", { date: formatDate(flags.reviewedAt, locale) })}</li>
                ) : null}
              </ul>
              {flags.flagged ? <p className="mt-2 text-xs text-muted-foreground">{t("flags.reviewRule")}</p> : null}
              {canModerate && (flags.reportFlagOpen || flags.sanctioned) && !self ? (
                <div className="mt-3">
                  <FlagReviewButton
                    target={{ userId: user.id, seenLatest: flags.latestReportAt ? flags.latestReportAt.toISOString() : null }}
                    label={user.businessName || user.name}
                  />
                </div>
              ) : null}
            </AdminSection>
          ) : null}

          <AdminSection title={t("devicesTitle")}>
            <p className="flex items-center gap-2 text-sm">
              <MonitorSmartphone aria-hidden className="size-4 text-muted-foreground" />
              {t("devicesSummary", { devices: n(data.deviceCount), accounts: n(data.devices.length) })}
            </p>
            {data.devices.length ? (
              <ul className="mt-3 flex flex-col gap-2">
                {data.devices.map((d) => (
                  <li key={d.id} className="flex flex-wrap items-center gap-1.5 text-sm">
                    <Link href={`/admin/users/${d.id}`} className="font-medium text-primary hover:underline" dir="auto">
                      {d.name}
                    </Link>
                    <UserStatusBadge status={d.status} className="h-5" />
                    <span className="text-xs text-muted-foreground">
                      {t("lastSeenShort", { when: formatRelativeTime(d.lastSeenAt, locale) })}
                    </span>
                  </li>
                ))}
              </ul>
            ) : null}
          </AdminSection>

          {can(staff.role, "roles") && !self ? (
            <AdminSection title={t("role.title")}>
              <RoleChanger userId={user.id} role={user.role} twoFactorEnabled={user.twoFactorEnabled} />
            </AdminSection>
          ) : null}

          <AdminSection title={t("notes.title")} description={t("notes.description")}>
            <AdminNoteForm userId={user.id} />
            {data.notes.length ? (
              <ul className="mt-4 flex flex-col gap-2">
                {data.notes.map((note) => (
                  <li key={note.id} className="rounded-lg border border-border-strong/40 bg-surface-muted p-2.5 text-sm">
                    <p className="whitespace-pre-wrap" dir="auto">
                      {note.body}
                    </p>
                    <p className="mt-1 text-xs text-muted-foreground">
                      {note.author?.name ?? "—"} · <WhenText date={note.createdAt} />
                    </p>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="mt-3 text-xs text-muted-foreground">{t("notes.empty")}</p>
            )}
          </AdminSection>
        </aside>
      </div>
    </>
  );
}

function BookingList({
  rows,
  side,
  canOpen,
  empty,
  locale,
  tb,
  flagLabel,
}: {
  rows: UserBookingRow[];
  side: "host" | "guest";
  canOpen: boolean;
  empty: string;
  locale: string;
  tb: (key: string) => string;
  flagLabel: string;
}) {
  if (rows.length === 0) return <p className="text-sm text-muted-foreground">{empty}</p>;
  return (
    <ul className="divide-y rounded-lg border">
      {rows.map((b) => (
        <li key={b.id} className="flex flex-col gap-0.5 px-3 py-2 text-sm">
          <span className="flex flex-wrap items-center gap-1.5">
            {canOpen ? (
              <Link href={`/admin/bookings/${b.id}`} className="font-mono text-xs font-semibold hover:underline">
                <Ltr>{b.code}</Ltr>
              </Link>
            ) : (
              <Ltr className="font-mono text-xs font-semibold">{b.code}</Ltr>
            )}
            <Pill tone={BOOKING_TONE[b.status]} className="h-5">
              {tb(`status.${b.status}`)}
            </Pill>
            {b.flaggedForReview && !b.flagReviewedAt ? (
              <Pill tone="danger" icon={Flag} className="h-5">
                {flagLabel}
              </Pill>
            ) : null}
          </span>
          <span className="truncate text-xs text-muted-foreground" dir="auto">
            <PublicId id={b.listing.publicId} /> {b.listing.title}
          </span>
          <span className="text-xs text-muted-foreground">
            {formatDateRange(dateToDay(b.checkIn), dateToDay(b.checkOut), locale)}
            {" · "}
            <span dir="auto">{side === "host" ? b.guestName : (b.host.businessName || personName(b.host) || b.host.name)}</span>
          </span>
        </li>
      ))}
    </ul>
  );
}

async function ReportList({
  rows,
  empty,
}: {
  rows: {
    id: string;
    reason: string;
    kind?: "GENERAL" | "TURNED_AWAY";
    status: "OPEN" | "RESOLVED" | "DISMISSED";
    createdAt: Date;
    listing: { publicId: number; title: string } | null;
    who: string | null;
  }[];
  empty: string;
}) {
  const [tFields, t] = await Promise.all([getTranslations("listingFields"), getTranslations("admin.users")]);
  if (rows.length === 0) return <p className="text-sm text-muted-foreground">{empty}</p>;
  return (
    <ul className="divide-y">
      {rows.map((r) => (
        <li key={r.id} className="flex flex-col gap-0.5 py-2 text-sm first:pt-0 last:pb-0">
          <div className="flex flex-wrap items-center gap-1.5">
            <Link href={`/admin/reports/${r.id}`} className="font-medium hover:underline">
              {tFields.has(`reportReason.${r.reason}`) ? tFields(`reportReason.${r.reason}`) : r.reason}
            </Link>
            {r.kind === "TURNED_AWAY" ? <Pill tone="danger">{t("turnedAway")}</Pill> : null}
            <ReportStatusBadge status={r.status} className="h-5" />
          </div>
          <p className="text-xs text-muted-foreground">
            {r.listing ? (
              <>
                <PublicId id={r.listing.publicId} /> <span dir="auto">{r.listing.title}</span> ·{" "}
              </>
            ) : r.who ? (
              <>
                <span dir="auto">{r.who}</span> ·{" "}
              </>
            ) : null}
            <WhenText date={r.createdAt} />
          </p>
        </li>
      ))}
    </ul>
  );
}
