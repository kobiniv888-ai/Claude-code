import "server-only";
import type { Prisma } from "@/generated/prisma/client";
import type { VerificationStatus, VerificationType } from "@/generated/prisma/enums";
import { db } from "@/lib/db";
import { openListingLocation } from "@/lib/field-crypto";
import { taintObject } from "@/lib/security/taint";
import { compareCadastralCodes, parseVerificationDocuments } from "../documents";
import type { StaffViewer } from "../staff-visibility";
import { accountPhoneFor, ADMIN_PAGE_SIZE, coverPhotoSelect } from "./shared";

/** The verification queue and the request page (server-only). */

export const VERIFICATION_TYPES = ["ID", "OWNERSHIP", "BUSINESS", "PROPERTY"] as const satisfies readonly VerificationType[];
export const VERIFICATION_STATUSES = [
  "PENDING",
  "NEEDS_MORE_INFO",
  "APPROVED",
  "REJECTED",
] as const satisfies readonly VerificationStatus[];
export const VERIFICATION_STATUS_FILTERS = [...VERIFICATION_STATUSES, "all"] as const;
export type VerificationStatusFilter = (typeof VERIFICATION_STATUS_FILTERS)[number];

export type VerificationFilters = { status: VerificationStatusFilter; type?: VerificationType };

export async function listVerifications(filters: VerificationFilters, page: number) {
  const where: Prisma.VerificationRequestWhereInput = {
    ...(filters.status !== "all" ? { status: filters.status } : {}),
    ...(filters.type ? { type: filters.type } : {}),
  };
  const total = await db.verificationRequest.count({ where });
  const pageCount = Math.max(1, Math.ceil(total / ADMIN_PAGE_SIZE));
  const current = Math.min(page, pageCount);
  const rows = await db.verificationRequest.findMany({
    where,
    // PENDING first (the enum's first value), oldest request first inside the queue.
    orderBy:
      filters.status === "PENDING" || filters.status === "all"
        ? [{ status: "asc" }, { createdAt: "asc" }]
        : [{ reviewedAt: { sort: "desc", nulls: "last" } }, { createdAt: "desc" }],
    skip: (current - 1) * ADMIN_PAGE_SIZE,
    take: ADMIN_PAGE_SIZE,
    select: {
      id: true,
      type: true,
      status: true,
      documents: true,
      documentsDeletedAt: true,
      createdAt: true,
      reviewedAt: true,
      user: { select: { id: true, name: true, accountType: true, businessName: true, createdAt: true, isDemo: true } },
      listing: { select: { id: true, publicId: true, title: true } },
      reviewedBy: { select: { name: true } },
    },
  });
  return {
    total,
    page: current,
    rows: rows.map((r) => ({ ...r, documentCount: parseVerificationDocuments(r.documents).length })),
  };
}

export type VerificationListRow = Awaited<ReturnType<typeof listVerifications>>["rows"][number];

/**
 * One verification request. The applicant's phone is ADMIN only (Q12, founder's answer (c)):
 * `userPhone` holds the number for an ADMIN and only its last 2 digits for other staff; the
 * request's own select never reads it.
 */
export async function getVerificationDetail(id: string, viewer: Pick<StaffViewer, "role">) {
  const request = await db.verificationRequest.findUnique({
    where: { id },
    select: {
      id: true,
      type: true,
      status: true,
      documents: true,
      cadastralCode: true,
      userNote: true,
      decisionReason: true,
      documentsDeletedAt: true,
      createdAt: true,
      updatedAt: true,
      reviewedAt: true,
      reviewedBy: { select: { id: true, name: true } },
      user: {
        select: {
          id: true,
          name: true,
          email: true,
          phoneNumberVerified: true,
          role: true,
          status: true,
          accountType: true,
          businessName: true,
          locale: true,
          createdAt: true,
          idVerifiedAt: true,
          businessVerifiedAt: true,
          isDemo: true,
          _count: { select: { listings: true, reportsAgainst: true } },
        },
      },
      listing: {
        select: {
          id: true,
          publicId: true,
          title: true,
          status: true,
          // Encrypted (12.3.c): decrypted below for the ownership check.
          addressEnc: true,
          cadastralCode: true,
          ownerId: true,
          ownerVerifiedAt: true,
          propertyVerifiedAt: true,
          city: { select: { names: true } },
          photos: coverPhotoSelect,
        },
      },
    },
  });
  if (!request) return null;
  // The raw row (documents, the account's contact values) only through the DTO below (React taint, 5.k).
  taintObject("raw verification request row", request);

  const [history, userPhone] = await Promise.all([
    db.verificationRequest.findMany({
      where: { userId: request.user.id, id: { not: request.id } },
      orderBy: { createdAt: "desc" },
      take: 10,
      select: { id: true, type: true, status: true, createdAt: true, reviewedAt: true, reviewedBy: { select: { name: true } } },
    }),
    accountPhoneFor(viewer, request.user.id),
  ]);

  // The listing's exact address, decrypted for the reviewer ("not available" when it cannot be).
  const listing = request.listing
    ? (({ addressEnc, ...rest }) => ({ ...rest, address: openListingLocation({ addressEnc }, "admin_verification").address }))(request.listing)
    : null;
  return {
    request: { ...request, listing },
    userPhone,
    documents: request.documentsDeletedAt ? [] : parseVerificationDocuments(request.documents),
    cadastral: compareCadastralCodes(request.cadastralCode, request.listing?.cadastralCode),
    /** The listing in an ownership request belongs to someone else (should never happen). */
    listingOwnerMismatch: !!request.listing && request.listing.ownerId !== request.user.id,
    history,
  };
}

export type VerificationDetail = NonNullable<Awaited<ReturnType<typeof getVerificationDetail>>>;
