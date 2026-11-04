import "server-only";
import type { Prisma } from "@/generated/prisma/client";
import type { ReportReason, ReportStatus } from "@/generated/prisma/enums";
import { isAppLocale } from "@/i18n/locale";
import { siteConfig } from "@/config/site";
import { dateToDay, tbilisiToday } from "@/lib/booking/dates";
import { db } from "@/lib/db";
import { REPORT_REASONS } from "@/lib/listing/fields";
import { countOpenReports } from "@/lib/reports/queries";
import { parseReportAttachments, screenshotsDeleteAt, TURNED_AWAY_REASONS } from "@/lib/reports/turned-away";
import { ADMIN_PAGE_SIZE, coverPhotoSelect, ownerBadgeSelect } from "./shared";

/**
 * Reports: the queue and the report page (server-only; brief 8.2 and 9).
 *
 * The queue has tabs: everything, turned-away reports (about a host; urgent), listing and
 * profile reports, and review reports (a host reports a guest's review, phase 5). Open reports
 * are a queue: urgent first, then oldest first. Handled ones: newest first.
 */

export const REPORT_STATUSES = ["OPEN", "RESOLVED", "DISMISSED"] as const satisfies readonly ReportStatus[];
export const REPORT_STATUS_FILTERS = [...REPORT_STATUSES, "all"] as const;
export type ReportStatusFilter = (typeof REPORT_STATUS_FILTERS)[number];

export const REPORT_TABS = ["all", "turnedAway", "listings", "reviews"] as const;
export type ReportTab = (typeof REPORT_TABS)[number];

/** Every reason the filter offers: the turned-away ones first, then the listing ones ("Other" once). */
export const REPORT_REASON_FILTERS = [
  ...TURNED_AWAY_REASONS.filter((r) => r !== "OTHER"),
  ...REPORT_REASONS,
] as const satisfies readonly ReportReason[];

export type ReportFilters = {
  tab: ReportTab;
  status: ReportStatusFilter;
  reason?: ReportReason;
};

export { REPORT_REASONS };

const listingPreviewSelect = (locale: string) =>
  ({
    id: true,
    publicId: true,
    title: true,
    status: true,
    reportCount: true,
    ownerId: true,
    photos: coverPhotoSelect,
    translations: {
      where: { locale: isAppLocale(locale) ? locale : siteConfig.i18n.fallbackLocale },
      select: { title: true },
      take: 1,
    },
    owner: { select: { id: true, name: true, businessName: true, status: true } },
  }) satisfies Prisma.ListingSelect;

function tabWhere(tab: ReportTab): Prisma.ReportWhereInput {
  switch (tab) {
    case "turnedAway":
      return { kind: "TURNED_AWAY" };
    case "listings":
      return { kind: "GENERAL", targetType: { in: ["LISTING", "USER", "MESSAGE"] } };
    case "reviews":
      return { targetType: "REVIEW" };
    default:
      return {};
  }
}

export function reportWhere(filters: ReportFilters): Prisma.ReportWhereInput {
  return {
    ...tabWhere(filters.tab),
    ...(filters.status !== "all" ? { status: filters.status } : {}),
    ...(filters.reason ? { reason: filters.reason } : {}),
  };
}

/** Open: urgent first, then the oldest (a queue). Otherwise the newest first. */
export function reportOrder(status: ReportStatusFilter): Prisma.ReportOrderByWithRelationInput[] {
  return status === "OPEN" ? [{ priority: "desc" }, { createdAt: "asc" }] : [{ createdAt: "desc" }];
}

export async function listReports(filters: ReportFilters, page: number, locale: string) {
  const where = reportWhere(filters);
  const [total, counts] = await Promise.all([db.report.count({ where }), countOpenReports()]);
  const pageCount = Math.max(1, Math.ceil(total / ADMIN_PAGE_SIZE));
  const current = Math.min(page, pageCount);
  const rows = await db.report.findMany({
    where,
    orderBy: reportOrder(filters.status),
    skip: (current - 1) * ADMIN_PAGE_SIZE,
    take: ADMIN_PAGE_SIZE,
    select: {
      id: true,
      kind: true,
      targetType: true,
      reason: true,
      details: true,
      status: true,
      priority: true,
      createdAt: true,
      handledAt: true,
      happenedOn: true,
      attachments: true,
      actionTaken: true,
      reviewId: true,
      reporter: { select: { id: true, name: true } },
      handledBy: { select: { name: true } },
      listing: { select: listingPreviewSelect(locale) },
      targetUser: { select: { id: true, name: true, businessName: true, status: true } },
      booking: { select: { code: true, status: true } },
    },
  });
  return {
    rows: rows.map(({ attachments, ...row }) => ({ ...row, screenshots: parseReportAttachments(attachments).length })),
    total,
    page: current,
    counts,
  };
}

export type ReportListRow = Awaited<ReturnType<typeof listReports>>["rows"][number];

export async function getReportDetail(id: string, locale: string) {
  const report = await db.report.findUnique({
    where: { id },
    select: {
      id: true,
      kind: true,
      targetType: true,
      reason: true,
      details: true,
      status: true,
      priority: true,
      resolution: true,
      adminNote: true,
      actionTaken: true,
      reporterRevealedAt: true,
      happenedOn: true,
      attachments: true,
      attachmentsDeletedAt: true,
      createdAt: true,
      handledAt: true,
      messageId: true,
      reviewId: true,
      reporter: {
        select: {
          id: true,
          name: true,
          firstName: true,
          status: true,
          createdAt: true,
          _count: { select: { reportsMade: true } },
        },
      },
      handledBy: { select: { id: true, name: true } },
      booking: {
        select: {
          id: true,
          code: true,
          status: true,
          checkIn: true,
          checkOut: true,
          nights: true,
          adults: true,
          children: true,
          createdAt: true,
          cancelledAt: true,
          cancelReasonCode: true,
          cancelReason: true,
          cancelledById: true,
          hostUserId: true,
          flaggedForReview: true,
        },
      },
      listing: {
        select: {
          ...listingPreviewSelect(locale),
          dealType: true,
          price: true,
          currency: true,
          pricePeriod: true,
          moderationReason: true,
          city: { select: { names: true } },
          // Listing reports only (turned-away reports are about the host and never hide it).
          _count: { select: { reports: { where: { status: "OPEN", kind: "GENERAL" } } } },
        },
      },
      targetUser: {
        select: {
          ...ownerBadgeSelect,
          statusReason: true,
          suspendedUntil: true,
          _count: { select: { listings: true, reportsAgainst: true } },
        },
      },
    },
  });
  if (!report) return null;

  // The account the report is really about: the reported user (the host for turned-away
  // reports), or the listing's owner.
  const accountId = report.targetUser?.id ?? report.listing?.ownerId ?? null;
  const today = tbilisiToday();
  const [account, otherReports, timeline, liveListings, upcomingBookings] = await Promise.all([
    accountId && !report.targetUser
      ? db.user.findUnique({
          where: { id: accountId },
          select: {
            ...ownerBadgeSelect,
            statusReason: true,
            suspendedUntil: true,
            _count: { select: { listings: true, reportsAgainst: true } },
          },
        })
      : Promise.resolve(report.targetUser),
    db.report.findMany({
      where: {
        id: { not: report.id },
        OR: [
          ...(report.listing ? [{ listingId: report.listing.id }] : []),
          ...(accountId ? [{ targetUserId: accountId }, { listing: { ownerId: accountId } }] : []),
        ],
      },
      orderBy: { createdAt: "desc" },
      take: 20,
      select: {
        id: true,
        kind: true,
        targetType: true,
        reason: true,
        status: true,
        createdAt: true,
        reporter: { select: { name: true } },
      },
    }),
    db.auditLog.findMany({
      where: { targetType: "Report", targetId: report.id },
      orderBy: { createdAt: "asc" },
      take: 100,
      select: { id: true, action: true, createdAt: true, details: true, actor: { select: { name: true } } },
    }),
    accountId ? db.listing.count({ where: { ownerId: accountId, status: "LIVE" } }) : Promise.resolve(0),
    accountId
      ? db.booking.count({ where: { hostUserId: accountId, status: "CONFIRMED", checkOut: { gte: new Date(`${today}T00:00:00.000Z`) } } })
      : Promise.resolve(0),
  ]);

  const booking = report.booking
    ? {
        ...report.booking,
        checkIn: dateToDay(report.booking.checkIn),
        checkOut: dateToDay(report.booking.checkOut),
        /** Hours from the booking to the host's cancellation (the 48-hour flag rule). */
        hoursToCancel:
          report.booking.status === "CANCELLED_BY_HOST" && report.booking.cancelledAt
            ? Math.max(0, Math.round((report.booking.cancelledAt.getTime() - report.booking.createdAt.getTime()) / 3_600_000))
            : null,
      }
    : null;

  return {
    report: {
      ...report,
      booking,
      happenedOn: report.happenedOn ? dateToDay(report.happenedOn) : null,
      attachments: parseReportAttachments(report.attachments),
      screenshotsDeleteAt: screenshotsDeleteAt(report),
    },
    account,
    accountStats: { liveListings, upcomingBookings },
    otherReports,
    timeline,
  };
}

export type ReportDetail = NonNullable<Awaited<ReturnType<typeof getReportDetail>>>;
