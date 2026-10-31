import "server-only";
import type { Prisma } from "@/generated/prisma/client";
import type { ReportReason, ReportStatus, ReportTarget } from "@/generated/prisma/enums";
import { isAppLocale } from "@/i18n/locale";
import { siteConfig } from "@/config/site";
import { db } from "@/lib/db";
import { REPORT_REASONS } from "@/lib/listing/fields";
import { ADMIN_PAGE_SIZE, coverPhotoSelect, ownerBadgeSelect } from "./shared";

/** Reports from visitors: the list and the report page (server-only). */

export const REPORT_STATUSES = ["OPEN", "RESOLVED", "DISMISSED"] as const satisfies readonly ReportStatus[];
export const REPORT_TARGETS = ["LISTING", "USER"] as const satisfies readonly ReportTarget[];
export const REPORT_STATUS_FILTERS = [...REPORT_STATUSES, "all"] as const;
export type ReportStatusFilter = (typeof REPORT_STATUS_FILTERS)[number];

export type ReportFilters = {
  status: ReportStatusFilter;
  targetType?: (typeof REPORT_TARGETS)[number];
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
    owner: { select: { id: true, name: true, status: true } },
  }) satisfies Prisma.ListingSelect;

function reportWhere(filters: ReportFilters): Prisma.ReportWhereInput {
  return {
    ...(filters.status !== "all" ? { status: filters.status } : {}),
    ...(filters.targetType ? { targetType: filters.targetType } : {}),
    ...(filters.reason ? { reason: filters.reason } : {}),
  };
}

export async function listReports(filters: ReportFilters, page: number, locale: string) {
  const where = reportWhere(filters);
  const total = await db.report.count({ where });
  const pageCount = Math.max(1, Math.ceil(total / ADMIN_PAGE_SIZE));
  const current = Math.min(page, pageCount);
  const rows = await db.report.findMany({
    where,
    // Open reports: oldest first (a queue). Handled ones: newest first.
    orderBy: filters.status === "OPEN" ? [{ createdAt: "asc" }] : [{ createdAt: "desc" }],
    skip: (current - 1) * ADMIN_PAGE_SIZE,
    take: ADMIN_PAGE_SIZE,
    select: {
      id: true,
      targetType: true,
      reason: true,
      details: true,
      status: true,
      createdAt: true,
      handledAt: true,
      reporter: { select: { id: true, name: true } },
      handledBy: { select: { name: true } },
      listing: { select: listingPreviewSelect(locale) },
      targetUser: { select: { id: true, name: true, status: true } },
    },
  });
  return { rows, total, page: current };
}

export type ReportListRow = Awaited<ReturnType<typeof listReports>>["rows"][number];

export async function getReportDetail(id: string, locale: string) {
  const report = await db.report.findUnique({
    where: { id },
    select: {
      id: true,
      targetType: true,
      reason: true,
      details: true,
      status: true,
      resolution: true,
      createdAt: true,
      handledAt: true,
      messageId: true,
      reporter: {
        select: {
          id: true,
          name: true,
          status: true,
          createdAt: true,
          _count: { select: { reportsMade: true } },
        },
      },
      handledBy: { select: { id: true, name: true } },
      listing: {
        select: {
          ...listingPreviewSelect(locale),
          dealType: true,
          price: true,
          currency: true,
          pricePeriod: true,
          moderationReason: true,
          city: { select: { names: true } },
          _count: { select: { reports: { where: { status: "OPEN" } } } },
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

  // The account the report is really about: the reported user, or the listing's owner.
  const accountId = report.targetUser?.id ?? report.listing?.ownerId ?? null;
  const [account, otherReports] = await Promise.all([
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
          ...(accountId ? [{ targetUserId: accountId }] : []),
        ],
      },
      orderBy: { createdAt: "desc" },
      take: 20,
      select: {
        id: true,
        targetType: true,
        reason: true,
        status: true,
        createdAt: true,
        reporter: { select: { name: true } },
      },
    }),
  ]);

  return { report, account, otherReports };
}

export type ReportDetail = NonNullable<Awaited<ReturnType<typeof getReportDetail>>>;
