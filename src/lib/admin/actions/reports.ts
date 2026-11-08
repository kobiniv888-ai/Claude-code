"use server";

import { z } from "zod";
import type { Prisma } from "@/generated/prisma/client";
import { fail, ok, type ActionResult } from "@/lib/action";
import { audit, auditOrThrow } from "@/lib/audit";
import { can } from "@/lib/auth/permissions";
import type { CurrentUser } from "@/lib/auth/session";
import { db } from "@/lib/db";
import { notificationEmailFor, sendEmail } from "@/lib/email";
import { restoreHiddenListing } from "@/lib/listing/lifecycle";
import { canRevealReporter, reporterNameForHost } from "@/lib/reports/turned-away";
import { ADMIN_TEXT_LIMITS, USER_ACTION_REASONS, type UserActionReason } from "../reasons";
import { AdminActionError, assertCanManage, assertNotOwnItem, localeOf, runStaffAction, userReasonText } from "../server/common";
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
 *                      (Report.reporterRevealedAt); turned-away reports only, ADMIN only
 *
 * Every decision needs a reason, writes "report.*" to the audit log (and the account action its
 * own "user.*" / "listing.*" entry), and is refused once someone else decided: the report is
 * claimed (a conditional update) before the account is touched or anyone is emailed. Staff other
 * than an ADMIN never decide a report about themselves or one they sent.
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
      reporterId: true,
      happenedOn: true,
      reporterRevealedAt: true,
      reporter: { select: { id: true, name: true, firstName: true, status: true } },
      booking: { select: { code: true } },
      // Review reports (round 3, brief 8.1): the review's guest and host, for the own-item rule.
      review: { select: { guestUserId: true, hostUserId: true } },
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

/** Staff other than an ADMIN never decide a report about themselves or one they sent. */
function assertNotOwnReport(staff: CurrentUser, report: LoadedReport) {
  assertNotOwnItem(staff, [report.targetUserId, report.listing?.ownerId, report.reporterId, report.review?.guestUserId, report.review?.hostUserId]);
}

function assertOpen(report: LoadedReport) {
  if (report.status !== "OPEN") throw new AdminActionError("already_decided");
}

async function isStillOpen(reportId: string): Promise<boolean> {
  const fresh = await db.report.findUnique({ where: { id: reportId }, select: { status: true } });
  return fresh?.status === "OPEN";
}

type Decision = {
  status: "RESOLVED" | "DISMISSED";
  actionTaken: "resolved" | "dismissed" | "warned" | "listings_hidden" | "host_removed";
  resolution: string | null;
};

/**
 * Claims an open report for one decision BEFORE anything else happens (the account action, the
 * emails): a conditional update, so of two staff members deciding at once exactly one goes on
 * and the other gets "already_decided". `guard` adds conditions (a dismissal: not revealed);
 * when only the guard failed the report is still open and the answer is "invalid_status".
 */
async function claimReport(staff: CurrentUser, report: LoadedReport, decision: Decision, guard: Prisma.ReportWhereInput = {}): Promise<void> {
  const { count } = await db.report.updateMany({
    where: { ...guard, id: report.id, status: "OPEN" },
    data: {
      status: decision.status,
      actionTaken: decision.actionTaken,
      resolution: decision.resolution,
      handledById: staff.id,
      handledAt: new Date(),
    },
  });
  if (count === 1) return;
  throw new AdminActionError((await isStillOpen(report.id)) ? "invalid_status" : "already_decided");
}

/** Puts a claimed report back to open (the account action after the claim failed). */
async function releaseClaim(staff: CurrentUser, report: LoadedReport, decision: Decision): Promise<void> {
  await db.report
    .updateMany({
      where: { id: report.id, handledById: staff.id, actionTaken: decision.actionTaken },
      data: { status: "OPEN", actionTaken: null, resolution: null, handledById: null, handledAt: null },
    })
    .catch((error) => console.error(`[admin] could not reopen report ${report.id}:`, error));
}

/** Claims the report, runs the account action, and reopens the report when the action throws. */
async function decide<T>(staff: CurrentUser, report: LoadedReport, decision: Decision, action: () => Promise<T>): Promise<T> {
  await claimReport(staff, report, decision);
  try {
    return await action();
  } catch (error) {
    await releaseClaim(staff, report, decision);
    throw error;
  }
}

/** The report's own audit entry for a decision that went through. */
async function auditDecision(staff: CurrentUser, report: LoadedReport, action: string, resolution: string | null, details: Record<string, unknown> = {}) {
  await audit({
    actorId: staff.id,
    action,
    targetType: "Report",
    targetId: report.id,
    details: {
      kind: report.kind,
      resolution,
      listingId: report.listing?.id ?? null,
      targetUserId: report.targetUserId,
      closed: true,
      ...details,
    },
  });
}

export async function resolveReport(input: unknown): Promise<ActionResult<{ status: string }>> {
  return runStaffAction("reports", "report.resolve", async (staff) => {
    const parsed = closeSchema.safeParse(input);
    if (!parsed.success) return fail("invalid_input", z.flattenError(parsed.error).fieldErrors);
    const report = await loadReport(parsed.data.reportId);
    assertOpen(report);
    assertNotOwnReport(staff, report);
    await claimReport(staff, report, { status: "RESOLVED", actionTaken: "resolved", resolution: parsed.data.resolution });
    await auditDecision(staff, report, "report.resolve", parsed.data.resolution);
    return ok({ status: "RESOLVED" });
  });
}

/**
 * Dismiss: the report did not show a real problem. Nobody is emailed: the host never knew. A
 * report whose reporter was already named to the host can't be dismissed (the host did learn
 * of it): resolve it instead.
 */
export async function dismissReport(input: unknown): Promise<ActionResult<{ status: string }>> {
  return runStaffAction("reports", "report.dismiss", async (staff) => {
    const parsed = closeSchema.safeParse(input);
    if (!parsed.success) return fail("invalid_input", z.flattenError(parsed.error).fieldErrors);
    const report = await loadReport(parsed.data.reportId);
    assertOpen(report);
    assertNotOwnReport(staff, report);
    if (report.reporterRevealedAt) throw new AdminActionError("invalid_status");
    await claimReport(staff, report, { status: "DISMISSED", actionTaken: "dismissed", resolution: parsed.data.resolution }, { reporterRevealedAt: null });
    await auditDecision(staff, report, "report.dismiss", parsed.data.resolution);
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
    assertNotOwnReport(staff, report);
    const hostId = hostIdOf(report);
    const decision: Decision = { status: "RESOLVED", actionTaken: "warned", resolution: parsed.data.note };
    await decide(staff, report, decision, () => warnUser(staff, hostId, parsed.data.reason, parsed.data.note, { reportId: report.id }));
    await auditDecision(staff, report, "report.warn_host", parsed.data.note, { reason: parsed.data.reason, hostId });
    return ok();
  });
}

/**
 * Takes every LIVE listing of the host off the site (HIDDEN, restored one by one from the
 * listing's review page), emails the host with the reason in their language, closes the report.
 * Bookings already made stay (the dialog says how many). Until staff mark the host reviewed, the
 * host stays flagged: a paused, expired or new listing waits for review instead of going live
 * (src/lib/listing/host-flags-server.ts isHostSanctioned).
 */
export async function hideHostListings(input: unknown): Promise<ActionResult<{ hidden: number }>> {
  return runStaffAction("reports", "report.hide_host_listings", async (staff) => {
    const parsed = hostActionSchema.safeParse(input);
    if (!parsed.success) return fail("invalid_input", z.flattenError(parsed.error).fieldErrors);
    const report = await loadReport(parsed.data.reportId);
    assertOpen(report);
    assertNotOwnReport(staff, report);
    const hostId = hostIdOf(report);
    const host = await db.user.findUnique({
      where: { id: hostId },
      select: { id: true, role: true, name: true, email: true, contactEmail: true, locale: true, status: true },
    });
    if (!host || host.status === "DELETED") throw new AdminActionError("user_not_found", 404);
    assertCanManage(staff, host);
    const live = await db.listing.findMany({ where: { ownerId: hostId, status: "LIVE" }, select: { id: true, publicId: true } });
    // Nothing live (any more): someone else may have decided meanwhile.
    if (live.length === 0) throw new AdminActionError((await isStillOpen(report.id)) ? "invalid_status" : "already_decided");
    const decision: Decision = { status: "RESOLVED", actionTaken: "listings_hidden", resolution: parsed.data.note };
    // Q13: the listings and their audit row change together, or not at all (the claim is then
    // released by decide()).
    const count = await decide(staff, report, decision, () =>
      db.$transaction(async (tx) => {
        const { count: hidden } = await tx.listing.updateMany({ where: { id: { in: live.map((l) => l.id) }, status: "LIVE" }, data: { status: "HIDDEN" } });
        // The listings changed meanwhile (paused, already hidden): nothing to tell the host.
        if (hidden === 0) throw new AdminActionError("invalid_status");
        await auditOrThrow(
          {
            actorId: staff.id,
            action: "listing.hide_all",
            targetType: "User",
            targetId: hostId,
            details: { reportId: report.id, reason: parsed.data.reason, note: parsed.data.note, listings: live.map((l) => l.publicId), hidden },
          },
          tx,
        );
        return hidden;
      }),
    );
    await auditDecision(staff, report, "report.hide_host_listings", parsed.data.note, { reason: parsed.data.reason, hostId, hidden: count });
    await emailListingsHidden(host, parsed.data.reason, parsed.data.note, count);
    return ok({ hidden: count });
  }, { freshProof: "window" });
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
    assertNotOwnReport(staff, report);
    const hostId = hostIdOf(report);
    const decision: Decision = { status: "RESOLVED", actionTaken: "host_removed", resolution: parsed.data.note };
    const result = await decide(staff, report, decision, () => banUser(staff, hostId, parsed.data.reason, parsed.data.note));
    await auditDecision(staff, report, "report.remove_host", parsed.data.note, { reason: parsed.data.reason, hostId, ...result });
    return ok();
  }, { freshProof: "consume", allow: (staff) => can(staff.role, "users.manage") });
}

/**
 * Tells the host who reported (first name only), as a separate decision with its own reason.
 * The founder's decision (PLAN.md answer 10): ADMIN only (canRevealReporter). Turned-away reports
 * only, once, never for a dismissed report (the host never heard of it), never for a guest who
 * deleted their account, and only when the host can be told (a real email address): otherwise
 * nothing is recorded, so it can be tried again.
 */
export async function revealReporter(input: unknown): Promise<ActionResult> {
  return runStaffAction("reports", "report.reveal_reporter", async (staff) => {
    if (!canRevealReporter(staff.role)) return fail("forbidden");
    const parsed = revealSchema.safeParse(input);
    if (!parsed.success) return fail("invalid_input", z.flattenError(parsed.error).fieldErrors);
    const report = await loadReport(parsed.data.reportId);
    if (report.kind !== "TURNED_AWAY" || report.status === "DISMISSED" || report.reporterRevealedAt) {
      throw new AdminActionError("invalid_status");
    }
    if (!report.reporter) throw new AdminActionError("user_not_found", 404);
    assertNotOwnReport(staff, report);
    const revealedAt = new Date();
    const reporterName = reporterNameForHost({ reporterRevealedAt: revealedAt, reporter: report.reporter });
    if (report.reporter.status === "DELETED" || !reporterName) throw new AdminActionError("invalid_status");
    const hostId = hostIdOf(report);
    const host = await db.user.findUnique({
      where: { id: hostId },
      select: { id: true, role: true, name: true, email: true, contactEmail: true, locale: true, status: true },
    });
    if (!host || host.status === "DELETED") throw new AdminActionError("user_not_found", 404);
    assertCanManage(staff, host);
    const to = notificationEmailFor(host);
    if (!to) throw new AdminActionError("no_channel");
    // The write itself enforces "never after a dismissal": a dismissal that lands meanwhile wins.
    // Telling the host cannot be undone (Q13): the marker and its audit row commit together, and
    // the email goes only after that.
    const reporterId = report.reporter.id;
    await db.$transaction(async (tx) => {
      const { count } = await tx.report.updateMany({
        where: { id: report.id, kind: "TURNED_AWAY", reporterRevealedAt: null, status: { not: "DISMISSED" } },
        data: { reporterRevealedAt: revealedAt },
      });
      if (count !== 1) throw new AdminActionError("invalid_status");
      await auditOrThrow(
        {
          actorId: staff.id,
          action: "report.reveal_reporter",
          targetType: "Report",
          targetId: report.id,
          details: { hostId, reporterId, resolution: parsed.data.resolution },
        },
        tx,
      );
    });
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
    return ok();
  }, { freshProof: "consume", allow: (staff) => canRevealReporter(staff.role) });
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
    // Q13: the listing and its audit row change together, or not at all.
    await db.$transaction(async (tx) => {
      const { count } = await tx.listing.updateMany({ where: { id: listing.id, status: "LIVE" }, data: { status: "HIDDEN" } });
      if (count !== 1) throw new AdminActionError("invalid_status");
      await auditOrThrow(
        {
          actorId: staff.id,
          action: "listing.hide",
          targetType: "Listing",
          targetId: listing.id,
          details: { publicId: listing.publicId, reportId: report.id },
        },
        tx,
      );
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
  }, { freshProof: "window" });
}

/** Puts a hidden listing back online (the lifecycle audits "listing.restore"). */
export async function restoreReportedListing(input: unknown): Promise<ActionResult<{ status: string }>> {
  return runStaffAction("reports", "listing.restore", async (staff) => {
    const parsed = idOnly.safeParse(input);
    if (!parsed.success) return fail("invalid_input");
    const report = await loadReport(parsed.data.reportId);
    if (!report.listing) throw new AdminActionError("missing_listing", 400);
    assertNotOwnItem(staff, [report.listing.ownerId]);
    const result = await restoreHiddenListing(report.listing.id, staff.id);
    return ok({ status: result.status });
  });
}
