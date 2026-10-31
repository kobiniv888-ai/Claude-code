import "server-only";
import type { Prisma } from "@/generated/prisma/client";
import type { VerificationStatus, VerificationType } from "@/generated/prisma/enums";
import { db } from "@/lib/db";
import { compareCadastralCodes, parseVerificationDocuments } from "../documents";
import { ADMIN_PAGE_SIZE, coverPhotoSelect } from "./shared";

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

export async function getVerificationDetail(id: string) {
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
          phoneNumber: true,
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
          address: true,
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

  const history = await db.verificationRequest.findMany({
    where: { userId: request.user.id, id: { not: request.id } },
    orderBy: { createdAt: "desc" },
    take: 10,
    select: { id: true, type: true, status: true, createdAt: true, reviewedAt: true, reviewedBy: { select: { name: true } } },
  });

  return {
    request,
    documents: request.documentsDeletedAt ? [] : parseVerificationDocuments(request.documents),
    cadastral: compareCadastralCodes(request.cadastralCode, request.listing?.cadastralCode),
    /** The listing in an ownership request belongs to someone else (should never happen). */
    listingOwnerMismatch: !!request.listing && request.listing.ownerId !== request.user.id,
    history,
  };
}

export type VerificationDetail = NonNullable<Awaited<ReturnType<typeof getVerificationDetail>>>;
