"use server";

import { z } from "zod";
import { fail, ok, type ActionResult } from "@/lib/action";
import { audit } from "@/lib/audit";
import { db } from "@/lib/db";
import { notificationEmailFor, sendEmail } from "@/lib/email";
import { restoreHiddenListing } from "@/lib/listing/lifecycle";
import { ADMIN_TEXT_LIMITS, USER_ACTION_REASONS } from "../reasons";
import { AdminActionError, runStaffAction } from "../server/common";
import { warnUser } from "../server/user-moderation";

/** Report handling (staff with the "reports" permission; SUPPORT only views). */

const reportId = z.string().min(1).max(64);
const optionalText = (max: number) =>
  z
    .string()
    .trim()
    .max(max)
    .optional()
    .transform((v) => v || null);

const closeSchema = z.object({ reportId, resolution: optionalText(ADMIN_TEXT_LIMITS.resolution) });
const resolveSchema = z.object({ reportId, resolution: z.string().trim().min(2).max(ADMIN_TEXT_LIMITS.resolution) });
const idOnly = z.object({ reportId });
const warnSchema = z.object({
  reportId,
  reason: z.enum(USER_ACTION_REASONS),
  note: optionalText(ADMIN_TEXT_LIMITS.note),
});

async function loadReport(id: string) {
  const report = await db.report.findUnique({
    where: { id },
    select: {
      id: true,
      status: true,
      targetType: true,
      targetUserId: true,
      listing: {
        select: {
          id: true,
          publicId: true,
          status: true,
          title: true,
          ownerId: true,
          owner: { select: { name: true, email: true, contactEmail: true, locale: true } },
        },
      },
    },
  });
  if (!report) throw new AdminActionError("report_not_found", 404);
  return report;
}

async function close(
  staffId: string,
  id: string,
  status: "RESOLVED" | "DISMISSED",
  resolution: string | null,
): Promise<ActionResult<{ status: string }>> {
  const report = await loadReport(id);
  if (report.status !== "OPEN") throw new AdminActionError("already_decided");
  const { count } = await db.report.updateMany({
    where: { id, status: "OPEN" },
    data: { status, resolution, handledById: staffId, handledAt: new Date() },
  });
  if (count !== 1) throw new AdminActionError("already_decided");
  await audit({
    actorId: staffId,
    action: status === "RESOLVED" ? "report.resolve" : "report.dismiss",
    targetType: "Report",
    targetId: id,
    details: { resolution, listingId: report.listing?.id ?? null, targetUserId: report.targetUserId },
  });
  return ok({ status });
}

export async function resolveReport(input: unknown): Promise<ActionResult<{ status: string }>> {
  return runStaffAction("reports", "report.resolve", async (staff) => {
    const parsed = resolveSchema.safeParse(input);
    if (!parsed.success) return fail("invalid_input", z.flattenError(parsed.error).fieldErrors);
    return close(staff.id, parsed.data.reportId, "RESOLVED", parsed.data.resolution);
  });
}

export async function dismissReport(input: unknown): Promise<ActionResult<{ status: string }>> {
  return runStaffAction("reports", "report.dismiss", async (staff) => {
    const parsed = closeSchema.safeParse(input);
    if (!parsed.success) return fail("invalid_input", z.flattenError(parsed.error).fieldErrors);
    return close(staff.id, parsed.data.reportId, "DISMISSED", parsed.data.resolution);
  });
}

/** Takes the reported listing off the site until a moderator restores it (LIVE → HIDDEN). */
export async function hideReportedListing(input: unknown): Promise<ActionResult<{ status: string }>> {
  return runStaffAction("reports", "listing.hide", async (staff) => {
    const parsed = idOnly.safeParse(input);
    if (!parsed.success) return fail("invalid_input");
    const report = await loadReport(parsed.data.reportId);
    const listing = report.listing;
    if (!listing) throw new AdminActionError("missing_listing", 400);
    if (listing.status === "HIDDEN") return ok({ status: "HIDDEN" });
    if (listing.status !== "LIVE") throw new AdminActionError("invalid_status");
    const { count } = await db.listing.updateMany({ where: { id: listing.id, status: "LIVE" }, data: { status: "HIDDEN" } });
    if (count !== 1) throw new AdminActionError("invalid_status");
    await audit({
      actorId: staff.id,
      action: "listing.hide",
      targetType: "Listing",
      targetId: listing.id,
      details: { publicId: listing.publicId, reportId: report.id },
    });
    const to = notificationEmailFor(listing.owner);
    if (to) {
      await sendEmail({
        to,
        template: "listing_hidden_reports",
        locale: listing.owner.locale,
        data: { ownerName: listing.owner.name, listingTitle: listing.title },
      });
    }
    return ok({ status: "HIDDEN" });
  });
}

/** Puts a hidden listing back online (the lifecycle audits "listing.restore"). */
export async function restoreReportedListing(input: unknown): Promise<ActionResult<{ status: string }>> {
  return runStaffAction("reports", "listing.restore", async (staff) => {
    const parsed = idOnly.safeParse(input);
    if (!parsed.success) return fail("invalid_input");
    const report = await loadReport(parsed.data.reportId);
    if (!report.listing) throw new AdminActionError("missing_listing", 400);
    const result = await restoreHiddenListing(report.listing.id, staff.id);
    return ok({ status: result.status });
  });
}

/** Warns the reported account (the reported user, or the reported listing's owner). */
export async function warnReportedUser(input: unknown): Promise<ActionResult> {
  return runStaffAction("reports", "user.warn", async (staff) => {
    const parsed = warnSchema.safeParse(input);
    if (!parsed.success) return fail("invalid_input", z.flattenError(parsed.error).fieldErrors);
    const report = await loadReport(parsed.data.reportId);
    const userId = report.targetUserId ?? report.listing?.ownerId;
    if (!userId) throw new AdminActionError("user_not_found", 404);
    await warnUser(staff, userId, parsed.data.reason, parsed.data.note, { reportId: report.id });
    return ok();
  });
}
