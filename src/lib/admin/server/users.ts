import "server-only";
import type { Prisma } from "@/generated/prisma/client";
import type { UserRole, UserStatus } from "@/generated/prisma/enums";
import { countsAsGuestCancellation } from "@/lib/booking/guest-flags";
import { dateToDay } from "@/lib/booking/dates";
import { db } from "@/lib/db";
import { taintObject } from "@/lib/security/taint";
import { canSeeGuestPhone, canSeeReporter, guestWithheldFor, staffPhone, type StaffViewer } from "../staff-visibility";
import { parseUserSearch, type UserSearchTerms } from "../search";
import { ADMIN_PAGE_SIZE, coverPhotoSelect, sharedDeviceAccounts, staffNames, turnedAwayBookingIds } from "./shared";

/** The user search and the user page (server-only). */

export const USER_ROLES = ["USER", "ADMIN", "MODERATOR", "SUPPORT", "EDITOR"] as const satisfies readonly UserRole[];
export const USER_STATUSES = ["ACTIVE", "WARNED", "SUSPENDED", "BANNED", "DELETED"] as const satisfies readonly UserStatus[];
export const USER_VERIFIED_FILTERS = ["id", "business", "none"] as const;
export type UserVerifiedFilter = (typeof USER_VERIFIED_FILTERS)[number];
/** "Hosts only" (round 3, brief 9): owns a listing that is not a draft. "guests": does not. */
export const USER_KIND_FILTERS = ["hosts", "guests"] as const;
export type UserKindFilter = (typeof USER_KIND_FILTERS)[number];

export type UserFilters = {
  q: string;
  role?: UserRole;
  status?: UserStatus;
  verified?: UserVerifiedFilter;
  kind?: UserKindFilter;
};

/** A host owns at least one listing past the draft stage (deleted ones count: they were hosts). */
export const HOST_WHERE: Prisma.UserWhereInput = { listings: { some: { status: { not: "DRAFT" } } } };

/**
 * `phones`: may the viewer search by phone number (ADMIN only, founder's decision Q12: an
 * account's verified phone is the guest phone of its bookings; a search result is an answer too).
 */
async function searchConditions(terms: UserSearchTerms, phones: boolean): Promise<Prisma.UserWhereInput[]> {
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
  if (phones && terms.phones.length) or.push({ phoneNumber: { in: terms.phones } });
  if (phones && terms.phoneDigits) or.push({ phoneNumber: { contains: terms.phoneDigits } });
  if (terms.userId) or.push({ id: terms.userId });
  if (terms.listingPublicId) {
    const listing = await db.listing.findUnique({ where: { publicId: terms.listingPublicId }, select: { ownerId: true } });
    if (listing) or.push({ id: listing.ownerId });
  }
  return or;
}

/**
 * The user list. Phone numbers (shown and searched) are ADMIN only (Q12, ../staff-visibility.ts);
 * other staff get the last 2 digits to match a person (founder's answer (c)), never the number.
 */
export async function searchUsers(filters: UserFilters, page: number, viewer: Pick<StaffViewer, "role">) {
  const showPhone = canSeeGuestPhone(viewer);
  const terms = parseUserSearch(filters.q);
  const where: Prisma.UserWhereInput = {};
  const and: Prisma.UserWhereInput[] = [];
  if (filters.q.trim()) {
    const or = await searchConditions(terms, showPhone);
    // Something was typed but nothing can match it.
    and.push(or.length ? { OR: or } : { id: "__none__" });
  }
  if (filters.role) and.push({ role: filters.role });
  if (filters.status) and.push({ status: filters.status });
  if (filters.verified === "id") and.push({ idVerifiedAt: { not: null } });
  if (filters.verified === "business") and.push({ businessVerifiedAt: { not: null } });
  if (filters.verified === "none") and.push({ idVerifiedAt: null, businessVerifiedAt: null });
  if (filters.kind === "hosts") and.push(HOST_WHERE);
  if (filters.kind === "guests") and.push({ NOT: HOST_WHERE });
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
      _count: { select: { listings: true, reportsAgainst: true, bookingsAsHost: true, bookingsAsGuest: true } },
    },
  });
  // Read with the row but never returned to other staff: they get "••• ••• ••45" only.
  return {
    rows: rows.map((raw) => {
      // The raw row (with the phone) only through this DTO (React taint, 5.k).
      taintObject("raw admin user list row", raw);
      const { phoneNumber, ...row } = raw;
      const phone = staffPhone(viewer, phoneNumber);
      return { ...row, phoneNumber: phone.phoneNumber, phoneMasked: phone.phoneMasked };
    }),
    total,
    page: current,
    phoneWithheld: !showPhone,
  };
}

export type UserListRow = Awaited<ReturnType<typeof searchUsers>>["rows"][number];

/**
 * A user's page. The phone number and who sent a report are ADMIN only (founder's decision Q12,
 * ../staff-visibility.ts):
 * for other staff the reports this user SENT are not read at all (`reportsMade` is null), and the
 * reports against them come without their senders' names.
 */
export async function getUserDetail(id: string, viewer: StaffViewer) {
  const showReporter = canSeeReporter(viewer);
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
      welcomePledgeVersion: true,
      hostFlagReviewedAt: true,
    },
  });
  if (!user) return null;
  // The raw row (email, phone, contact address) only through the DTO below (React taint, 5.k).
  taintObject("raw admin user row", user);

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
      !showReporter
        ? Promise.resolve(null)
        : db.report.findMany({
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
          kind: true,
          listing: { select: { publicId: true, title: true } },
          reporterId: true,
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

  const senderIds = [...new Set(reportsAgainst.map((r) => r.reporterId).filter((v): v is string => !!v))];
  const senders =
    showReporter && senderIds.length
      ? new Map((await db.user.findMany({ where: { id: { in: senderIds } }, select: { id: true, name: true } })).map((u) => [u.id, u]))
      : new Map<string, { id: string; name: string }>();

  const phone = staffPhone(viewer, user.phoneNumber);
  return {
    user: { ...user, phoneNumber: phone.phoneNumber },
    /** The phone number is ADMIN only (Q12): other staff get its last 2 digits ("••• ••• ••45", (c)). */
    phoneWithheld: phone.phoneWithheld,
    phoneMasked: phone.phoneMasked,
    listings,
    /** Null unless the viewer may see who sent reports (ADMIN). */
    reportsMade,
    reportsAgainst: reportsAgainst.map(({ reporterId, ...r }) => ({ ...r, reporter: reporterId ? (senders.get(reporterId) ?? null) : null })),
    reporterWithheld: !showReporter,
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

// ─── Bookings on the user page (round 3) ─────────────────────

const USER_BOOKINGS_SHOWN = 10;

const userBookingSelect = {
  id: true,
  code: true,
  status: true,
  checkIn: true,
  checkOut: true,
  createdAt: true,
  cancelledAt: true,
  flaggedForReview: true,
  flagReviewedAt: true,
  guestName: true,
  listing: { select: { publicId: true, title: true } },
  host: { select: { name: true, firstName: true, businessName: true } },
} satisfies Prisma.BookingSelect;

export type UserBookingRow = Prisma.BookingGetPayload<{ select: typeof userBookingSelect }>;

/** The most guest cancellations read to count them (the user page shows a number, not a list). */
const GUEST_CANCELLATIONS_READ = 500;

/**
 * A booking row on the user page. A booking with a turned-away report would name who sent it (its
 * guest): on the host's page its guest is left out (`guestWithheld`), on the guest's page the whole
 * row is (`withheld`).
 */
export type UserBookingListRow =
  | (UserBookingRow & { withheld: false; guestWithheld: boolean })
  | { id: string; withheld: true };

/**
 * The user's bookings as a guest and as a host (latest first), with the cancellation counts the
 * user page shows: cancelled by this host, cancelled by this guest, host cancellations flagged
 * (within 48 hours) and no-shows (the host said this guest did not come).
 *
 * Guest cancellations are counted with the guest-flag rule (countsAsGuestCancellation, founder's
 * decision 7): "my flight was cancelled" and travel-disruption cancellations never count here either.
 *
 * A booking with a turned-away report was reported by its guest: for staff who may not see who sent
 * a report (Q12) the host's rows leave that guest out and the guest's rows leave the booking out.
 */
export async function getUserBookings(id: string, viewer?: Pick<StaffViewer, "role">) {
  const [asGuest, asHost, guestTotal, hostTotal, hostCancelled, hostFlagged, guestCancellations, guestNoShows] = await Promise.all([
    db.booking.findMany({ where: { guestUserId: id }, orderBy: { createdAt: "desc" }, take: USER_BOOKINGS_SHOWN, select: userBookingSelect }),
    db.booking.findMany({ where: { hostUserId: id }, orderBy: { createdAt: "desc" }, take: USER_BOOKINGS_SHOWN, select: userBookingSelect }),
    db.booking.count({ where: { guestUserId: id } }),
    db.booking.count({ where: { hostUserId: id } }),
    db.booking.count({ where: { hostUserId: id, status: "CANCELLED_BY_HOST" } }),
    db.booking.count({ where: { hostUserId: id, flaggedForReview: true } }),
    db.booking.findMany({
      where: { guestUserId: id, status: "CANCELLED_BY_GUEST" },
      orderBy: { cancelledAt: "desc" },
      take: GUEST_CANCELLATIONS_READ,
      select: { listingId: true, status: true, checkIn: true, checkOut: true, cancelledAt: true, cancelReasonCode: true },
    }),
    db.booking.count({ where: { guestUserId: id, status: "NO_SHOW" } }),
  ]);
  const guestCancelled = guestCancellations.filter((b) =>
    countsAsGuestCancellation({ ...b, checkIn: dateToDay(b.checkIn), checkOut: dateToDay(b.checkOut) }),
  ).length;
  const reported = viewer && !guestWithheldFor(viewer, true) ? new Set<string>() : await turnedAwayBookingIds([...asGuest, ...asHost].map((b) => b.id));
  const asHostRows: UserBookingListRow[] = asHost.map((row) =>
    reported.has(row.id) ? { ...row, guestName: "", guestWithheld: true, withheld: false } : { ...row, guestWithheld: false, withheld: false },
  );
  const asGuestRows: UserBookingListRow[] = asGuest.map((row) =>
    reported.has(row.id) ? { id: row.id, withheld: true } : { ...row, guestWithheld: false, withheld: false },
  );
  return { asGuest: asGuestRows, asHost: asHostRows, guestTotal, hostTotal, hostCancelled, hostFlagged, guestCancelled, guestNoShows };
}

export type UserBookings = Awaited<ReturnType<typeof getUserBookings>>;
