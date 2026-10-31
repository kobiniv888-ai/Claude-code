import "server-only";
import type { Prisma } from "@/generated/prisma/client";
import type { UserRole, UserStatus } from "@/generated/prisma/enums";
import { db } from "@/lib/db";
import { parseUserSearch, type UserSearchTerms } from "../search";
import { ADMIN_PAGE_SIZE, coverPhotoSelect, sharedDeviceAccounts, staffNames } from "./shared";

/** The user search and the user page (server-only). */

export const USER_ROLES = ["USER", "ADMIN", "MODERATOR", "SUPPORT", "EDITOR"] as const satisfies readonly UserRole[];
export const USER_STATUSES = ["ACTIVE", "WARNED", "SUSPENDED", "BANNED", "DELETED"] as const satisfies readonly UserStatus[];
export const USER_VERIFIED_FILTERS = ["id", "business", "none"] as const;
export type UserVerifiedFilter = (typeof USER_VERIFIED_FILTERS)[number];

export type UserFilters = {
  q: string;
  role?: UserRole;
  status?: UserStatus;
  verified?: UserVerifiedFilter;
};

async function searchConditions(terms: UserSearchTerms): Promise<Prisma.UserWhereInput[]> {
  const or: Prisma.UserWhereInput[] = [];
  if (terms.text) {
    or.push(
      { name: { contains: terms.text, mode: "insensitive" } },
      { businessName: { contains: terms.text, mode: "insensitive" } },
      { email: { contains: terms.text, mode: "insensitive" } },
      { contactEmail: { contains: terms.text, mode: "insensitive" } },
    );
  }
  if (terms.email) or.push({ email: { equals: terms.email, mode: "insensitive" } });
  if (terms.phones.length) or.push({ phoneNumber: { in: terms.phones } });
  if (terms.phoneDigits) or.push({ phoneNumber: { contains: terms.phoneDigits } });
  if (terms.userId) or.push({ id: terms.userId });
  if (terms.listingPublicId) {
    const listing = await db.listing.findUnique({ where: { publicId: terms.listingPublicId }, select: { ownerId: true } });
    if (listing) or.push({ id: listing.ownerId });
  }
  return or;
}

export async function searchUsers(filters: UserFilters, page: number) {
  const terms = parseUserSearch(filters.q);
  const where: Prisma.UserWhereInput = {};
  const and: Prisma.UserWhereInput[] = [];
  if (filters.q.trim()) {
    const or = await searchConditions(terms);
    // Something was typed but nothing can match it.
    and.push(or.length ? { OR: or } : { id: "__none__" });
  }
  if (filters.role) and.push({ role: filters.role });
  if (filters.status) and.push({ status: filters.status });
  if (filters.verified === "id") and.push({ idVerifiedAt: { not: null } });
  if (filters.verified === "business") and.push({ businessVerifiedAt: { not: null } });
  if (filters.verified === "none") and.push({ idVerifiedAt: null, businessVerifiedAt: null });
  if (and.length) where.AND = and;

  const total = await db.user.count({ where });
  const pageCount = Math.max(1, Math.ceil(total / ADMIN_PAGE_SIZE));
  const current = Math.min(page, pageCount);
  const rows = await db.user.findMany({
    where,
    orderBy: { createdAt: "desc" },
    skip: (current - 1) * ADMIN_PAGE_SIZE,
    take: ADMIN_PAGE_SIZE,
    select: {
      id: true,
      name: true,
      email: true,
      phoneNumber: true,
      role: true,
      status: true,
      accountType: true,
      businessName: true,
      createdAt: true,
      lastSeenAt: true,
      idVerifiedAt: true,
      businessVerifiedAt: true,
      isDemo: true,
      _count: { select: { listings: true, reportsAgainst: true } },
    },
  });
  return { rows, total, page: current };
}

export type UserListRow = Awaited<ReturnType<typeof searchUsers>>["rows"][number];

export async function getUserDetail(id: string) {
  const user = await db.user.findUnique({
    where: { id },
    select: {
      id: true,
      name: true,
      email: true,
      contactEmail: true,
      emailVerified: true,
      image: true,
      phoneNumber: true,
      phoneNumberVerified: true,
      role: true,
      status: true,
      statusReason: true,
      suspendedUntil: true,
      accountType: true,
      businessName: true,
      bio: true,
      spokenLanguages: true,
      locale: true,
      keepsShabbat: true,
      twoFactorEnabled: true,
      idVerifiedAt: true,
      idVerifiedById: true,
      businessVerifiedAt: true,
      lastSeenAt: true,
      createdAt: true,
      deletedAt: true,
      isDemo: true,
    },
  });
  if (!user) return null;

  const [listings, reportsMade, reportsAgainst, tickets, devices, deviceCount, notes, verifications, sessions, staff] =
    await Promise.all([
      db.listing.findMany({
        where: { ownerId: id },
        orderBy: { updatedAt: "desc" },
        take: 50,
        select: {
          id: true,
          publicId: true,
          title: true,
          status: true,
          dealType: true,
          riskScore: true,
          reportCount: true,
          ownerVerifiedAt: true,
          publishedAt: true,
          updatedAt: true,
          photos: coverPhotoSelect,
        },
      }),
      db.report.findMany({
        where: { reporterId: id },
        orderBy: { createdAt: "desc" },
        take: 20,
        select: {
          id: true,
          targetType: true,
          reason: true,
          status: true,
          createdAt: true,
          listing: { select: { publicId: true, title: true } },
          targetUser: { select: { name: true } },
        },
      }),
      db.report.findMany({
        where: { OR: [{ targetUserId: id }, { listing: { ownerId: id } }] },
        orderBy: { createdAt: "desc" },
        take: 20,
        select: {
          id: true,
          targetType: true,
          reason: true,
          status: true,
          createdAt: true,
          listing: { select: { publicId: true, title: true } },
          reporter: { select: { name: true } },
        },
      }),
      db.ticket.findMany({
        where: { userId: id },
        orderBy: { lastMessageAt: "desc" },
        take: 20,
        select: { id: true, number: true, subject: true, status: true, priority: true, category: true, lastMessageAt: true },
      }),
      sharedDeviceAccounts(id),
      db.deviceLink.count({ where: { userId: id } }),
      db.adminNote.findMany({
        where: { subjectUserId: id },
        orderBy: { createdAt: "desc" },
        take: 50,
        select: { id: true, body: true, createdAt: true, author: { select: { id: true, name: true } } },
      }),
      db.verificationRequest.findMany({
        where: { userId: id },
        orderBy: { createdAt: "desc" },
        take: 20,
        select: {
          id: true,
          type: true,
          status: true,
          createdAt: true,
          reviewedAt: true,
          reviewedBy: { select: { name: true } },
          listing: { select: { publicId: true } },
        },
      }),
      db.session.count({ where: { userId: id, expiresAt: { gt: new Date() } } }),
      staffNames([user.idVerifiedById]),
    ]);

  // When and by whom the business was verified: the approving request (if any).
  const businessRequest = user.businessVerifiedAt
    ? verifications.find((v) => v.type === "BUSINESS" && v.status === "APPROVED")
    : undefined;

  return {
    user,
    listings,
    reportsMade,
    reportsAgainst,
    tickets,
    devices,
    deviceCount,
    notes,
    verifications,
    activeSessions: sessions,
    idVerifiedBy: user.idVerifiedById ? (staff.get(user.idVerifiedById) ?? null) : null,
    businessVerifiedBy: businessRequest?.reviewedBy?.name ?? null,
  };
}

export type UserDetail = NonNullable<Awaited<ReturnType<typeof getUserDetail>>>;
