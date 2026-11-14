"use server";

import { z } from "zod";
import { documentChecksOn } from "@/config/verification";
import { fail, ok, type ActionResult } from "@/lib/action";
import { isStaffRole } from "@/lib/auth/permissions";
import { audit, auditOrThrow } from "@/lib/audit";
import { db } from "@/lib/db";
import { demoAllowed } from "@/lib/site-env";
import { ADMIN_TEXT_LIMITS, USER_ACTION_REASONS } from "../reasons";
import { AdminActionError, assertCanManage, runStaffAction } from "../server/common";
import { USER_ROLES } from "../server/users";
import { banUser, reactivateUser, revokeSessions, suspendUser, warnUser } from "../server/user-moderation";

/** Account actions on /admin/users/[id] ("users.manage"; role changes need "roles"). */

const userId = z.string().min(1).max(64);
const optionalText = (max: number) =>
  z
    .string()
    .trim()
    .max(max)
    .optional()
    .transform((v) => v || null);
const reasonSchema = z.object({
  userId,
  reason: z.enum(USER_ACTION_REASONS),
  note: optionalText(ADMIN_TEXT_LIMITS.note),
});
const MAX_SUSPENSION_DAYS = 3650;

async function loadUser(id: string) {
  const user = await db.user.findUnique({
    where: { id },
    select: { id: true, role: true, status: true, idVerifiedAt: true, twoFactorEnabled: true, isDemo: true },
  });
  if (!user) throw new AdminActionError("user_not_found", 404);
  return user;
}

export async function setIdVerified(input: unknown): Promise<ActionResult<{ verified: boolean }>> {
  return runStaffAction("users.manage", "user.verify_id", async (staff) => {
    // No document checks for now (founder's answer 5, round 3): old decisions are read-only.
    if (!documentChecksOn()) throw new AdminActionError("documents_paused", 409);
    const parsed = z.object({ userId, verified: z.boolean() }).safeParse(input);
    if (!parsed.success) return fail("invalid_input");
    const user = await loadUser(parsed.data.userId);
    assertCanManage(staff, user);
    const verified = parsed.data.verified;
    if (verified === !!user.idVerifiedAt) return ok({ verified });
    // Removing a verification is destructive (Q13): the change and its audit row commit together.
    await db.$transaction(async (tx) => {
      await tx.user.update({
        where: { id: user.id },
        data: verified ? { idVerifiedAt: new Date(), idVerifiedById: staff.id } : { idVerifiedAt: null, idVerifiedById: null },
      });
      await auditOrThrow(
        {
          actorId: staff.id,
          action: verified ? "user.verify_id" : "user.unverify_id",
          targetType: "User",
          targetId: user.id,
          details: verified ? { manual: true } : { previouslyVerifiedAt: user.idVerifiedAt },
        },
        tx,
      );
    });
    return ok({ verified });
  });
}

export async function warnUserAction(input: unknown): Promise<ActionResult> {
  return runStaffAction("users.manage", "user.warn", async (staff) => {
    const parsed = reasonSchema.safeParse(input);
    if (!parsed.success) return fail("invalid_input", z.flattenError(parsed.error).fieldErrors);
    await warnUser(staff, parsed.data.userId, parsed.data.reason, parsed.data.note);
    return ok();
  });
}

export async function suspendUserAction(input: unknown): Promise<ActionResult<{ sessionsRevoked: number }>> {
  return runStaffAction("users.manage", "user.suspend", async (staff) => {
    const parsed = reasonSchema
      .extend({ until: z.string().regex(/^\d{4}-\d{2}-\d{2}$/) })
      .safeParse(input);
    if (!parsed.success) return fail("invalid_input", z.flattenError(parsed.error).fieldErrors);
    // The suspension ends at the end of the chosen day (Georgia time is UTC+4).
    const until = new Date(`${parsed.data.until}T23:59:59.000+04:00`);
    const max = Date.now() + MAX_SUSPENSION_DAYS * 24 * 3600 * 1000;
    if (Number.isNaN(until.getTime()) || until.getTime() <= Date.now() || until.getTime() > max) {
      throw new AdminActionError("invalid_date", 400);
    }
    const result = await suspendUser(staff, parsed.data.userId, parsed.data.reason, parsed.data.note, until);
    return ok(result);
  }, { freshProof: "consume" });
}

export async function banUserAction(input: unknown): Promise<ActionResult<{ sessionsRevoked: number; listingsPaused: number }>> {
  return runStaffAction("users.manage", "user.ban", async (staff) => {
    const parsed = reasonSchema.safeParse(input);
    if (!parsed.success) return fail("invalid_input", z.flattenError(parsed.error).fieldErrors);
    return ok(await banUser(staff, parsed.data.userId, parsed.data.reason, parsed.data.note));
  }, { freshProof: "consume" });
}

export async function reactivateUserAction(input: unknown): Promise<ActionResult> {
  return runStaffAction("users.manage", "user.reactivate", async (staff) => {
    const parsed = z.object({ userId, note: optionalText(ADMIN_TEXT_LIMITS.note) }).safeParse(input);
    if (!parsed.success) return fail("invalid_input");
    await reactivateUser(staff, parsed.data.userId, parsed.data.note);
    return ok();
  });
}

/**
 * ADMIN only ("roles"). You cannot change your own role. New staff must turn on 2-step login
 * before they can open the admin panel — the result says so (`needsTwoFactor`).
 * Demoted staff are signed out so their old permissions end right away.
 */
export async function changeRole(input: unknown): Promise<ActionResult<{ needsTwoFactor: boolean }>> {
  return runStaffAction("roles", "user.role_change", async (staff) => {
    const parsed = z.object({ userId, role: z.enum(USER_ROLES) }).safeParse(input);
    if (!parsed.success) return fail("invalid_input");
    const user = await loadUser(parsed.data.userId);
    if (user.id === staff.id) throw new AdminActionError("not_allowed_on_self", 403);
    if (user.status === "BANNED" || user.status === "DELETED") throw new AdminActionError("account_blocked");
    const role = parsed.data.role;
    if (user.role === role) throw new AdminActionError("role_unchanged");
    // Demo accounts are never staff on the real site (SECURITY_REPORT 3.4.c, decision 1).
    if (user.isDemo && isStaffRole(role) && !demoAllowed()) throw new AdminActionError("demo_staff_refused", 403);
    // Every role change ends the account's sessions, promotions too (SECURITY_REPORT 3.5.b, 3.7.a):
    // an old session never gains staff rights; the new staff member signs in again with 2-step login.
    // The change and its audit row commit together, or not at all (Q13).
    await db.$transaction(async (tx) => {
      await tx.user.update({ where: { id: user.id }, data: { role } });
      const sessionsRevoked = await revokeSessions(user.id, tx);
      await auditOrThrow(
        {
          actorId: staff.id,
          action: "user.role_change",
          targetType: "User",
          targetId: user.id,
          details: { from: user.role, to: role, sessionsRevoked },
        },
        tx,
      );
    });
    return ok({ needsTwoFactor: isStaffRole(role) && !user.twoFactorEnabled });
  }, { freshProof: "consume" });
}

/** Internal staff note about an account (never shown to the user). Support may add notes too. */
export async function addAdminNote(input: unknown): Promise<ActionResult<{ id: string }>> {
  return runStaffAction(
    "users.view",
    "user.note",
    async (staff) => {
      const parsed = z.object({ userId, body: z.string().trim().min(2).max(ADMIN_TEXT_LIMITS.adminNote) }).safeParse(input);
      if (!parsed.success) return fail("invalid_input", z.flattenError(parsed.error).fieldErrors);
      const user = await loadUser(parsed.data.userId);
      const note = await db.adminNote.create({
        data: { subjectUserId: user.id, authorId: staff.id, body: parsed.data.body },
        select: { id: true },
      });
      await audit({ actorId: staff.id, action: "user.note", targetType: "User", targetId: user.id, details: { noteId: note.id } });
      return ok({ id: note.id });
    },
    { limit: 30, windowSeconds: 60 },
  );
}
