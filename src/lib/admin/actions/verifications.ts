"use server";

import { z } from "zod";
import type { Prisma } from "@/generated/prisma/client";
import { fail, ok, type ActionResult } from "@/lib/action";
import { audit } from "@/lib/audit";
import { db } from "@/lib/db";
import { notificationEmailFor, sendEmail } from "@/lib/email";
import { deletePrivate } from "@/lib/storage";
import { parseVerificationDocuments } from "../documents";
import { ADMIN_TEXT_LIMITS, VERIFICATION_REASONS } from "../reasons";
import { AdminActionError, localeOf, runStaffAction, verificationReasonText } from "../server/common";

/**
 * Verification decisions ("verifications"). The documents are deleted from private storage
 * right after the decision — approved or not — and only "verified on [date] by [staff]" is kept.
 */

const requestId = z.string().min(1).max(64);

async function loadPending(id: string) {
  const request = await db.verificationRequest.findUnique({
    where: { id },
    select: {
      id: true,
      type: true,
      status: true,
      documents: true,
      listingId: true,
      user: { select: { id: true, name: true, email: true, contactEmail: true, locale: true, role: true } },
      listing: { select: { id: true, ownerId: true, publicId: true } },
    },
  });
  if (!request) throw new AdminActionError("request_not_found", 404);
  if (request.status !== "PENDING") throw new AdminActionError("already_decided");
  return request;
}

/**
 * Deletes every document file after the decision and forgets the keys. Files that could not be
 * deleted keep their entry (and documentsDeletedAt stays empty) so the cleanup cron retries them.
 * Returns how many files are left.
 */
async function clearDocuments(id: string, documents: unknown): Promise<number> {
  const files = parseVerificationDocuments(documents);
  const results = await Promise.allSettled(files.map((file) => deletePrivate(file.key)));
  const left = files.filter((_, i) => results[i].status === "rejected");
  for (const r of results) {
    if (r.status === "rejected") console.error("[admin] could not delete a verification document:", r.reason);
  }
  await db.verificationRequest.update({
    where: { id },
    data: {
      documents: left.map((f) => ({ ...f })) as Prisma.InputJsonValue,
      documentsDeletedAt: left.length === 0 ? new Date() : null,
    },
  });
  return left.length;
}

export async function approveVerification(input: unknown): Promise<ActionResult<{ status: string }>> {
  return runStaffAction("verifications", "verification.approve", async (staff) => {
    const parsed = z.object({ requestId }).safeParse(input);
    if (!parsed.success) return fail("invalid_input");
    const request = await loadPending(parsed.data.requestId);
    if (request.user.id === staff.id) throw new AdminActionError("not_allowed_on_self", 403);
    const needsListing = request.type === "OWNERSHIP" || request.type === "PROPERTY";
    if (needsListing && (!request.listing || request.listing.ownerId !== request.user.id)) {
      throw new AdminActionError("missing_listing", 400);
    }

    const now = new Date();
    await db.$transaction(async (tx) => {
      const { count } = await tx.verificationRequest.updateMany({
        where: { id: request.id, status: "PENDING" },
        data: { status: "APPROVED", reviewedById: staff.id, reviewedAt: now, decisionReason: null },
      });
      if (count !== 1) throw new AdminActionError("already_decided");
      if (request.type === "ID") {
        await tx.user.update({ where: { id: request.user.id }, data: { idVerifiedAt: now, idVerifiedById: staff.id } });
      } else if (request.type === "BUSINESS") {
        await tx.user.update({ where: { id: request.user.id }, data: { businessVerifiedAt: now } });
      } else if (request.listing) {
        await tx.listing.update({
          where: { id: request.listing.id },
          data: request.type === "OWNERSHIP" ? { ownerVerifiedAt: now } : { propertyVerifiedAt: now },
        });
      }
    });
    const failedDeletes = await clearDocuments(request.id, request.documents);

    await audit({
      actorId: staff.id,
      action: "verification.approve",
      targetType: "VerificationRequest",
      targetId: request.id,
      details: {
        type: request.type,
        userId: request.user.id,
        listingPublicId: request.listing?.publicId ?? null,
        documentsDeleted: failedDeletes === 0,
      },
    });
    const to = notificationEmailFor(request.user);
    if (to) {
      await sendEmail({
        to,
        template: "verification_approved",
        locale: localeOf(request.user.locale),
        data: { name: request.user.name, type: request.type },
      });
    }
    return ok({ status: "APPROVED" });
  });
}

export async function rejectVerification(input: unknown): Promise<ActionResult<{ status: string }>> {
  return runStaffAction("verifications", "verification.reject", async (staff) => {
    const parsed = z
      .object({
        requestId,
        outcome: z.enum(["REJECTED", "NEEDS_MORE_INFO"]),
        reason: z.enum(VERIFICATION_REASONS),
        note: z
          .string()
          .trim()
          .max(ADMIN_TEXT_LIMITS.note)
          .optional()
          .transform((v) => v || null),
      })
      .safeParse(input);
    if (!parsed.success) return fail("invalid_input", z.flattenError(parsed.error).fieldErrors);
    const { outcome, reason, note } = parsed.data;
    const request = await loadPending(parsed.data.requestId);
    if (request.user.id === staff.id) throw new AdminActionError("not_allowed_on_self", 403);

    const locale = localeOf(request.user.locale);
    const text = await verificationReasonText(reason, locale, note);
    const now = new Date();
    const { count } = await db.verificationRequest.updateMany({
      where: { id: request.id, status: "PENDING" },
      data: {
        status: outcome,
        reviewedById: staff.id,
        reviewedAt: now,
        // Shown to the user in the verification center, in their own language.
        decisionReason: text.note ? `${text.reasonText}\n\n${text.note}` : text.reasonText,
      },
    });
    if (count !== 1) throw new AdminActionError("already_decided");
    const failedDeletes = await clearDocuments(request.id, request.documents);

    await audit({
      actorId: staff.id,
      action: outcome === "REJECTED" ? "verification.reject" : "verification.need_more_info",
      targetType: "VerificationRequest",
      targetId: request.id,
      details: { type: request.type, userId: request.user.id, reason, note, documentsDeleted: failedDeletes === 0 },
    });
    const to = notificationEmailFor(request.user);
    if (to) {
      await sendEmail({
        to,
        template: "verification_rejected",
        locale,
        data: { name: request.user.name, type: request.type, reasonText: text.reasonText, note: text.note },
      });
    }
    return ok({ status: outcome });
  });
}
