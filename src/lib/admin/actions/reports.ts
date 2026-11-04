"use server";

import { z } from "zod";
import { fail, ok, type ActionResult } from "@/lib/action";
import { audit } from "@/lib/audit";
import { can } from "@/lib/auth/permissions";
import type { CurrentUser } from "@/lib/auth/session";
import { db } from "@/lib/db";
import { notificationEmailFor, sendEmail } from "@/lib/email";
import { restoreHiddenListing } from "@/lib/listing/lifecycle";
import { reporterNameForHost } from "@/lib/reports/turned-away";
import { ADMIN_TEXT_LIMITS, USER_ACTION_REASONS, type UserActionReason } from "../reasons";
import { AdminActionError, assertCanManage, localeOf, runStaffAction, userReasonText } from "../server/common";
import { banUser, warnUser } from "../server/user-moderation";

/**
 * Report decisions (staff with the "reports" permission; SUPPORT only views). Round 3, brief 8.2:
 *
 *   dismiss            closes the report; nobody is emailed (the host never knew)
 *   resolve            closes it with a note (listing and profile reports, e.g. "fixed")
 *   warn host          warns the account (account_warning email with the reason) and closes it
 *   hide host listings takes every LIVE listing of the host off the site (HIDDEN) and closes it
 *   remove host        bans the host (signed out, listings paused, account_suspended email); also
 *                      needs "users.manage"
 *   reveal reporter    a separate, explicit step: tells the host the reporter's first name
 *                      (Report.reporterRevealedAt); turned-away reports only
 *
 * Every decision needs a reason, writes "report.*" to the audit log (and the account action its
 * own "user.*" / "listing.*" entry), and is refused once someone else decided.
 * Hide / restore THE reported listing stay for listing reports.
 */

const reportId = z.string().min(1).max(64);
const optionalText = (max: number) =>
  z
    .string()
    .trim()
    .max(max)
    .optional()
    .transform((v) => v || null);
const requiredText = (max: number) => z.string().trim().min(2).max(max);

const closeSchema = z.object({ reportId, resolution: requiredText(ADMIN_TEXT_LIMITS.resolution) });
const idOnly = z.object({ reportId });
const hostActionSchema = z.object({
  reportId,
  reason: z.enum(USER_ACTION_REASONS),
  note: optionalText(ADMIN_TEXT_LIMITS.note),
});
const revealSchema = z.object({ reportId, resolution: requiredText(ADMIN_TEXT_LIMITS.resolution) });
const noteSchema = z.object({ reportId, note: z.string().trim().max(ADMIN_TEXT_LIMITS.adminNote) });

async function loadReport(id: string) {
  const report = await db.report.findUnique({
    where: { id },
    select: {
      id: true,
      kind: true,
      status: true,
      reason: true,
      targetType: true,
      targetUserId: true,
      happenedOn: true,
      reporterRevealedAt: true,
      reporter: { select: { id: true, name: true, firstName: true } },
      booking: { select: { code: true } },
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

type LoadedReport = Awaited<ReturnType<typeof loadReport>>;

/** The account a report is about (the host for turned-away reports, else the listing's owner). */
function hostIdOf(report: LoadedReport): string {
  const id = report.targetUserId ?? report.listing?.ownerId;
  if (!id) throw new AdminActionError("user_not_found", 404);
  return id;
}

function assertOpen(report: LoadedReport) {
  if (report.status !== "OPEN") throw new AdminActionError("already_decided");
}

/** Closes an open report (only if nobody else did meanwhile) and writes the report's audit entry. */
async function closeReport(
  staff: CurrentUser,
  report: LoadedReport,
  decision: {
    status: "RESOLVED" | "DISMISSED";
    actionTaken: "resolved" | "dismissed" | "warned" | "listings_hidden" | "host_removed";
    resolution: string | null;
    audit: string;
    details?: Record<string, unknown>;
  },
): Promise<boolean> {
  const { count } = await db.report.updateMany({
    where: { id: report.id, status: "OPEN" },
    data: {
      status: decision.status,
      actionTaken: decision.actionTaken,
      resolution: decision.resolution,
      handledById: staff.id,
      handledAt: new Date(),
    },
  });
  await audit({
    actorId: staff.id,
    action: decision.audit,
    targetType: "Report",
    targetId: report.id,
    details: {
      kind: report.kind,
      resolution: decision.resolution,
      listingId: report.listing?.id ?? null,
      targetUserId: report.targetUserId,
      closed: count === 1,
      ...decision.details,
    },
  });
  return count === 1;
}

export async function resolveReport(input: unknown): Promise<ActionResult<{ status: string }>> {
  return runStaffAction("reports", "report.resolve", async (staff) => {
    const parsed = closeSchema.safeParse(input);
    if (!parsed.success) return fail("invalid_input", z.flattenError(parsed.error).fieldErrors);
    const report = await loadReport(parsed.data.reportId);
    assertOpen(report);
    const closed = await closeReport(staff, report, { status: "RESOLVED", actionTaken: "resolved", resolution: parsed.data.resolution, audit: "report.resolve" });
    if (!closed) throw new AdminActionError("already_decided");
    return ok({ status: "RESOLVED" });
  });
}

/** Dismiss: the report did not show a real problem. Nobody is emailed: the host never knew. */
export async function dismissReport(input: unknown): Promise<ActionResult<{ status: string }>> {
  return runStaffAction("reports", "report.dismiss", async (staff) => {
    const parsed = closeSchema.safeParse(input);
    if (!parsed.success) return fail("invalid_input", z.flattenError(parsed.error).fieldErrors);
    const report = await loadReport(parsed.data.reportId);
    assertOpen(report);
    const closed = await closeReport(staff, report, { status: "DISMISSED", actionTaken: "dismissed", resolution: parsed.data.resolution, audit: "report.dismiss" });
    if (!closed) throw new AdminActionError("already_decided");
    return ok({ status: "DISMISSED" });
  });
}

/** Warns the host (the reported user, or the reported listing's owner) and closes the report. */
export async function warnReportedUser(input: unknown): Promise<ActionResult> {
  return runStaffAction("reports", "user.warn", async (staff) => {
    const parsed = hostActionSchema.safeParse(input);
    if (!parsed.success) return fail("invalid_input", z.flattenError(parsed.error).fieldErrors);
    const report = await loadReport(parsed.data.reportId);
    assertOpen(report);
    const hostId = hostIdOf(report);
    await warnUser(staff, hostId, parsed.data.reason, parsed.data.note, { reportId: report.id });
    await closeReport(staff, report, {
      status: "RESOLVED",
      actionTaken: "warned",
      resolution: parsed.data.note,
      audit: "report.warn_host",
      details: { reason: parsed.data.reason, hostId },
    });
    return ok();
  });
}

/**
 * Takes every LIVE listing of the host off the site (HIDDEN, restored one by one from the
 * listing's review page), emails the host with the reason in their language, closes the report.
 * Bookings already made stay (the dialog says how many).
 */
export async function hideHostListings(input: unknown): Promise<ActionResult<{ hidden: number }>> {
  return runStaffAction("reports", "report.hide_host_listings", async (staff) => {
    const parsed = hostActionSchema.safeParse(input);
    if (!parsed.success) return fail("invalid_input", z.flattenError(parsed.error).fieldErrors);
    const report = await loadReport(parsed.data.reportId);
    assertOpen(report);
    const hostId = hostIdOf(report);
    const host = await db.user.findUnique({
      where: { id: hostId },
      select: { id: true, role: true, name: true, email: true, contactEmail: true, locale: true, status: true },
    });
    if (!host || host.status === "DELETED") throw new AdminActionError("user_not_found", 404);
    assertCanManage(staff, host);
    const live = await db.listing.findMany({ where: { ownerId: hostId, status: "LIVE" }, select: { id: true, publicId: true } });
    if (live.length === 0) throw new AdminActionError("invalid_status");
    const { count } = await db.listing.updateMany({ where: { id: { in: live.map((l) => l.id) }, status: "LIVE" }, data: { status: "HIDDEN" } });
    await audit({
      actorId: staff.id,
      action: "listing.hide_all",
      targetType: "User",
      targetId: hostId,
      details: { reportId: report.id, reason: parsed.data.reason, note: parsed.data.note, listings: live.map((l) => l.publicId), hidden: count },
    });
    await closeReport(staff, report, {
      status: "RESOLVED",
      actionTaken: "listings_hidden",
      resolution: parsed.data.note,
      audit: "report.hide_host_listings",
      details: { reason: parsed.data.reason, hostId, hidden: count },
    });
    await emailListingsHidden(host, parsed.data.reason, parsed.data.note, count);
    return ok({ hidden: count });
  });
}

async function emailListingsHidden(
  host: { name: string; email: string; contactEmail: string | null; locale: string | null },
  reason: UserActionReason,
  note: string | null,
  count: number,
) {
  const to = notificationEmailFor(host);
  if (!to) return;
  const locale = localeOf(host.locale);
  const text = await userReasonText(reason, locale, note);
  await sendEmail({
    to,
    locale,
    template: "report_host_listings_hidden",
    data: { name: host.name, count, reasonText: text.note ? `${text.reasonText}\n\n${text.note}` : text.reasonText },
  });
}

/** Removes the host: bans the account (signed out everywhere, listings paused, emailed) and closes the report. */
export async function removeReportedHost(input: unknown): Promise<ActionResult> {
  return runStaffAction("reports", "user.ban", async (staff) => {
    if (!can(staff.role, "users.manage")) return fail("forbidden");
    const parsed = hostActionSchema.safeParse(input);
    if (!parsed.success) return fail("invalid_input", z.flattenError(parsed.error).fieldErrors);
    const report = await loadReport(parsed.data.reportId);
    assertOpen(report);
    const hostId = hostIdOf(report);
    const result = await banUser(staff, hostId, parsed.data.reason, parsed.data.note);
    await closeReport(staff, report, {
      status: "RESOLVED",
      actionTaken: "host_removed",
      resolution: parsed.data.note,
      audit: "report.remove_host",
      details: { reason: parsed.data.reason, hostId, ...result },
    });
    return ok();
  });
}

/**
 * Tells the host who reported (first name only), as a separate decision with its own reason.
 * Turned-away reports only, once, never for a dismissed report (the host never heard of it).
 */
export async function revealReporter(input: unknown): Promise<ActionResult> {
  return runStaffAction("reports", "report.reveal_reporter", async (staff) => {
    const parsed = revealSchema.safeParse(input);
    if (!parsed.success) return fail("invalid_input", z.flattenError(parsed.error).fieldErrors);
    const report = await loadReport(parsed.data.reportId);
    if (report.kind !== "TURNED_AWAY" || report.status === "DISMISSED" || report.reporterRevealedAt) {
      throw new AdminActionError("invalid_status");
    }
    if (!report.reporter) throw new AdminActionError("user_not_found", 404);
    const hostId = hostIdOf(report);
    const host = await db.user.findUnique({
      where: { id: hostId },
      select: { id: true, role: true, name: true, email: true, contactEmail: true, locale: true, status: true },
    });
    if (!host || host.status === "DELETED") throw new AdminActionError("user_not_found", 404);
    assertCanManage(staff, host);
    const revealedAt = new Date();
    const { count } = await db.report.updateMany({ where: { id: report.id, reporterRevealedAt: null }, data: { reporterRevealedAt: revealedAt } });
    if (count !== 1) throw new AdminActionError("already_decided");
    await audit({
      actorId: staff.id,
      action: "report.reveal_reporter",
      targetType: "Report",
      targetId: report.id,
      details: { hostId, reporterId: report.reporter.id, resolution: parsed.data.resolution },
    });
    const reporterName = reporterNameForHost({ reporterRevealedAt: revealedAt, reporter: report.reporter });
    const to = notificationEmailFor(host);
    if (to && reporterName) {
      await sendEmail({
        to,
        locale: localeOf(host.locale),
        template: "report_reporter_revealed",
        data: {
          name: host.name,
          reporterName,
          bookingCode: report.booking?.code ?? null,
          listingTitle: report.listing?.title ?? null,
          happenedOn: report.happenedOn ? report.happenedOn.toISOString().slice(0, 10) : null,
          reason: report.reason,
          note: null,
        },
      });
    }
    return ok();
  });
}

/** Internal working notes on a report (staff only, never shown to the reporter or the host). */
export async function saveReportNote(input: unknown): Promise<ActionResult> {
  return runStaffAction("reports", "report.note", async (staff) => {
    const parsed = noteSchema.safeParse(input);
    if (!parsed.success) return fail("invalid_input", z.flattenError(parsed.error).fieldErrors);
    const report = await loadReport(parsed.data.reportId);
    const note = parsed.data.note || null;
    await db.report.update({ where: { id: report.id }, data: { adminNote: note } });
    await audit({ actorId: staff.id, action: "report.note", targetType: "Report", targetId: report.id, details: { length: note?.length ?? 0 } });
    return ok();
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
