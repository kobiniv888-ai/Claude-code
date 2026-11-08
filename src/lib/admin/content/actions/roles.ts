"use server";

import { z } from "zod";
import type { UserRole } from "@/generated/prisma/enums";
import { fail, ok, type ActionResult } from "@/lib/action";
import { revokeSessions } from "@/lib/admin/server/user-moderation";
import { isStaffRole } from "@/lib/auth/permissions";
import { auditOrThrow } from "@/lib/audit";
import { db } from "@/lib/db";
import { roleAssignSchema } from "../schemas";
import { ContentActionError, runContentAction } from "../server/common";
import { searchUsersForRole, type RoleCandidate } from "../server/roles";

/**
 * Staff roles ("roles", ADMIN only). You cannot change your own role, and the last ADMIN
 * cannot lose the role. Anyone whose role changes is signed out so the new permissions apply
 * at once; new staff must turn on 2-step login before the admin panel opens for them.
 */

async function loadTarget(userId: string) {
  const user = await db.user.findUnique({
    where: { id: userId },
    select: { id: true, role: true, status: true, twoFactorEnabled: true, deletedAt: true },
  });
  if (!user || user.deletedAt) throw new ContentActionError("user_not_found", 404);
  return user;
}

async function applyRole(staffId: string, user: Awaited<ReturnType<typeof loadTarget>>, role: UserRole) {
  if (user.id === staffId) throw new ContentActionError("not_allowed_on_self", 403);
  if (user.role === role) throw new ContentActionError("role_unchanged");
  if (user.role === "ADMIN" && role !== "ADMIN") {
    const admins = await db.user.count({ where: { role: "ADMIN", deletedAt: null } });
    if (admins <= 1) throw new ContentActionError("last_admin");
  }
  // Promotions too (SECURITY_REPORT 3.5.b, 3.7.a): an old session never gains staff rights.
  // The change and its audit row commit together, or not at all (Q13).
  await db.$transaction(async (tx) => {
    await tx.user.update({ where: { id: user.id }, data: { role } });
    const sessionsRevoked = await revokeSessions(user.id, tx);
    await auditOrThrow(
      {
        actorId: staffId,
        action: "user.role_change",
        targetType: "User",
        targetId: user.id,
        details: { from: user.role, to: role, sessionsRevoked },
      },
      tx,
    );
  });
}

export async function assignStaffRole(input: unknown): Promise<ActionResult<{ needsTwoFactor: boolean }>> {
  return runContentAction(
    "roles",
    "role",
    async (staff) => {
      const parsed = roleAssignSchema.safeParse(input);
      if (!parsed.success) return fail("invalid_input");
      const user = await loadTarget(parsed.data.userId);
      if (user.status === "BANNED" || user.status === "DELETED" || user.status === "SUSPENDED") {
        throw new ContentActionError("account_blocked");
      }
      await applyRole(staff.id, user, parsed.data.role);
      return ok({ needsTwoFactor: !user.twoFactorEnabled });
    },
    { limit: { limit: 20, windowSeconds: 60 }, freshProof: "consume" },
  );
}

export async function removeStaffRole(input: unknown): Promise<ActionResult> {
  return runContentAction(
    "roles",
    "role",
    async (staff) => {
      const parsed = z.object({ userId: z.string().min(1).max(64) }).safeParse(input);
      if (!parsed.success) return fail("invalid_input");
      const user = await loadTarget(parsed.data.userId);
      if (!isStaffRole(user.role)) throw new ContentActionError("role_unchanged");
      await applyRole(staff.id, user, "USER");
      return ok();
    },
    { limit: { limit: 20, windowSeconds: 60 }, freshProof: "consume" },
  );
}

export async function findUsersForRole(input: unknown): Promise<ActionResult<RoleCandidate[]>> {
  return runContentAction(
    "roles",
    "role_search",
    async () => {
      const parsed = z.object({ query: z.string().trim().min(2).max(120) }).safeParse(input);
      if (!parsed.success) return fail("invalid_input");
      return ok(await searchUsersForRole(parsed.data.query));
    },
    { limit: 60, windowSeconds: 60 },
  );
}
