"use server";

/**
 * Reports and blocks (BRIEF section 10, "Protecting users"). Signed-in users only.
 *
 * - createReport: invisible CAPTCHA, one OPEN report per user per target, 5 a day; the
 *   reporting device is linked to the account, then a listing report goes through
 *   applyReport(), which hides the listing after enough reports from trusted, distinct
 *   accounts and devices.
 * - createTurnedAwayReport (round 3, brief 8.2): "Turned away?" — the host cancelled, refused or
 *   questioned the guest because of who they are. About the host, urgent, never hides anything by
 *   itself, never named to the host (see ./turned-away).
 * - blockUser / unblockUser: a blocked pair cannot reveal each other's contact details.
 *
 * Every report emails the founder (notifyFounderOfReport, after the response).
 */
import { after } from "next/server";
import { z } from "zod";
import { fail, ok, runAction, type ActionResult } from "@/lib/action";
import { linkDevice } from "@/lib/auth/hooks";
import { requireUserForAction } from "@/lib/auth/session";
import { tbilisiToday } from "@/lib/booking/dates";
import type { Prisma } from "@/generated/prisma/client";
import { db } from "@/lib/db";
import { applyReport } from "@/lib/listing/lifecycle";
import { assertRateLimit } from "@/lib/rate-limit";
import { assertTurnstile } from "@/lib/turnstile";
import { notifyFounderOfReport, sendReportConfirmation } from "./notify";
import { reportInputSchema } from "./schemas";
import { happenedOnProblem, turnedAwayInputSchema } from "./turned-away";
import { checkReportAttachments, resolveTurnedAwayTarget } from "./turned-away-server";

const DAY = 24 * 3600;
const userIdSchema = z.string().trim().min(1).max(64);

/**
 * Serialises one reporter's report submits: a second submit waits here until the first one's
 * transaction ends, then sees its report. There is no database constraint for "one open report
 * per target" (a report can be decided and a new one sent), so the check and the insert must not
 * interleave. FOR NO KEY UPDATE: it waits only for another lockReporter, not for rows elsewhere
 * that merely reference the user (their foreign-key checks take a key-share lock).
 */
async function lockReporter(tx: Prisma.TransactionClient, userId: string): Promise<void> {
  await tx.$queryRaw`SELECT "id" FROM "User" WHERE "id" = ${userId} FOR NO KEY UPDATE`;
}

export async function createReport(input: unknown): Promise<ActionResult> {
  return runAction(async () => {
    const user = await requireUserForAction();
    const parsed = reportInputSchema.safeParse(input);
    if (!parsed.success) return fail("invalid_input", z.flattenError(parsed.error).fieldErrors);
    const { targetType, targetId, reason, details, turnstileToken } = parsed.data;
    await assertTurnstile(turnstileToken, { expectedAction: "report" });

    let listingId: string | null = null;
    let targetUserId: string | null = null;
    if (targetType === "LISTING") {
      const listing = await db.listing.findFirst({
        where: { id: targetId, deletedAt: null, status: { notIn: ["DRAFT", "DELETED"] } },
        select: { id: true, ownerId: true },
      });
      if (!listing) return fail("not_found");
      if (listing.ownerId === user.id) return fail("own_target");
      listingId = listing.id;
    } else {
      const target = await db.user.findFirst({
        where: { id: targetId, deletedAt: null, status: { notIn: ["BANNED", "DELETED"] } },
        select: { id: true },
      });
      if (!target) return fail("not_found");
      if (target.id === user.id) return fail("own_target");
      targetUserId = target.id;
    }

    const openReport = { reporterId: user.id, status: "OPEN" as const, targetType, ...(listingId ? { listingId } : { targetUserId }) };
    // A repeat is answered before the rate limit, so it doesn't use up one of the five.
    if (await db.report.findFirst({ where: openReport, select: { id: true } })) return fail("already_reported");
    await assertRateLimit(`report:${user.id}`, { limit: 5, windowSeconds: DAY });

    const report = await db.$transaction(async (tx) => {
      // One reporter's submits run one at a time (see lockReporter), so "one OPEN report per
      // target" holds even for two at once: the second one sees the first one's report here.
      await lockReporter(tx, user.id);
      if (await tx.report.findFirst({ where: openReport, select: { id: true } })) return null;
      return tx.report.create({
        // SECURITY_REPORT 14.2.c: a scam report ("asked me to pay in advance") goes to the top of the queue.
        data: { targetType, listingId, targetUserId, reporterId: user.id, reason, details, priority: reason === "ASKED_MONEY_UPFRONT" ? "URGENT" : "NORMAL" },
        select: { id: true },
      });
    });
    if (!report) return fail("already_reported");
    // Auto-hide counts reports per device (DeviceLink), so the device used now must be known.
    await linkDevice(user.id);
    if (listingId) await applyReport(listingId);
    after(() => notifyFounderOfReport(report.id));
    return ok();
  });
}

/**
 * "Turned away?" (brief 8.2). Signed in; Turnstile; one open report per guest, host and booking;
 * shares the 5-a-day report limit. From a booking the guest must be its guest; from a listing any
 * published listing that is not the guest's own. Screenshots must be the guest's own "report"
 * uploads. The report goes to the queue as URGENT, the founder gets an email and the guest a
 * confirmation. It does NOT count towards hiding a listing automatically (applyReport is not called).
 */
export async function createTurnedAwayReport(input: unknown): Promise<ActionResult> {
  return runAction(async () => {
    const user = await requireUserForAction();
    const parsed = turnedAwayInputSchema.safeParse(input);
    if (!parsed.success) return fail("invalid_input", z.flattenError(parsed.error).fieldErrors);
    const data = parsed.data;
    const dateProblem = happenedOnProblem(data.happenedOn, tbilisiToday());
    if (dateProblem) return fail(dateProblem, { happenedOn: [dateProblem] });
    await assertTurnstile(data.turnstileToken, { expectedAction: "report" });

    const resolved = await resolveTurnedAwayTarget(user.id, data);
    if (!resolved.ok) return fail(resolved.error);
    const { target } = resolved;

    const openReport = { reporterId: user.id, kind: "TURNED_AWAY" as const, status: "OPEN" as const, targetUserId: target.hostId, bookingId: target.bookingId };
    // A repeat is answered before the rate limit, so it doesn't use up one of the five.
    if (await db.report.findFirst({ where: openReport, select: { id: true } })) return fail("already_reported");
    await assertRateLimit(`report:${user.id}`, { limit: 5, windowSeconds: DAY });

    type Created = { report: { id: string } } | { error: "already_reported" | "attachment_invalid" };
    const created = await db.$transaction(async (tx): Promise<Created> => {
      // One at a time per guest: "one open report per guest, host and booking" and "a screenshot
      // goes on one report" are checked and written as one step (two tabs, or a script, can't
      // both pass the checks; the second one sees the first one's report here).
      await lockReporter(tx, user.id);
      if (await tx.report.findFirst({ where: openReport, select: { id: true } })) return { error: "already_reported" as const };
      const attachments = await checkReportAttachments(user.id, data.attachments, tx);
      if (!attachments) return { error: "attachment_invalid" as const };

      const row = await tx.report.create({
        data: {
          kind: "TURNED_AWAY",
          targetType: "USER",
          targetUserId: target.hostId,
          listingId: target.listingId,
          bookingId: target.bookingId,
          reporterId: user.id,
          reason: data.reason,
          details: data.details,
          happenedOn: new Date(`${data.happenedOn}T00:00:00.000Z`),
          attachments: attachments.length ? attachments : undefined,
          priority: "URGENT",
        },
        select: { id: true },
      });
      return { report: row };
    });
    if ("error" in created) return fail(created.error);
    const { report } = created;
    await linkDevice(user.id);
    after(() => Promise.all([notifyFounderOfReport(report.id), sendReportConfirmation(report.id)]));
    return ok();
  });
}

export async function blockUser(userId: string): Promise<ActionResult<{ blocked: boolean }>> {
  return runAction<{ blocked: boolean }>(async () => {
    const user = await requireUserForAction();
    const id = userIdSchema.safeParse(userId);
    if (!id.success) return fail("invalid_input");
    if (id.data === user.id) return fail("own_target");
    await assertRateLimit(`block:${user.id}`, { limit: 30, windowSeconds: DAY });
    const target = await db.user.findFirst({ where: { id: id.data, deletedAt: null }, select: { id: true } });
    if (!target) return fail("not_found");
    await db.userBlock.createMany({ data: [{ blockerId: user.id, blockedId: target.id }], skipDuplicates: true });
    return ok({ blocked: true });
  });
}

export async function unblockUser(userId: string): Promise<ActionResult<{ blocked: boolean }>> {
  return runAction<{ blocked: boolean }>(async () => {
    const user = await requireUserForAction();
    const id = userIdSchema.safeParse(userId);
    if (!id.success) return fail("invalid_input");
    await assertRateLimit(`block:${user.id}`, { limit: 30, windowSeconds: DAY });
    await db.userBlock.deleteMany({ where: { blockerId: user.id, blockedId: id.data } });
    return ok({ blocked: false });
  });
}
