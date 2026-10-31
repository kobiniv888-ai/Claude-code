"use server";

/**
 * Reports and blocks (BRIEF section 10, "Protecting users"). Signed-in users only.
 *
 * - createReport: invisible CAPTCHA, one OPEN report per user per target, 5 a day; the
 *   reporting device is linked to the account, then a listing report goes through
 *   applyReport(), which hides the listing after enough reports from trusted, distinct
 *   accounts and devices.
 * - blockUser / unblockUser: a blocked pair cannot reveal each other's contact details.
 */
import { z } from "zod";
import { fail, ok, runAction, type ActionResult } from "@/lib/action";
import { linkDevice } from "@/lib/auth/hooks";
import { requireUserForAction } from "@/lib/auth/session";
import { db } from "@/lib/db";
import { applyReport } from "@/lib/listing/lifecycle";
import { assertRateLimit } from "@/lib/rate-limit";
import { assertTurnstile } from "@/lib/turnstile";
import { reportInputSchema } from "./schemas";

const DAY = 24 * 3600;
const userIdSchema = z.string().trim().min(1).max(64);

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

    const existing = await db.report.findFirst({
      where: { reporterId: user.id, status: "OPEN", targetType, ...(listingId ? { listingId } : { targetUserId }) },
      select: { id: true },
    });
    if (existing) return fail("already_reported");

    await assertRateLimit(`report:${user.id}`, { limit: 5, windowSeconds: DAY });
    await db.report.create({
      data: { targetType, listingId, targetUserId, reporterId: user.id, reason, details },
    });
    // Auto-hide counts reports per device (DeviceLink), so the device used now must be known.
    await linkDevice(user.id);
    if (listingId) await applyReport(listingId);
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
