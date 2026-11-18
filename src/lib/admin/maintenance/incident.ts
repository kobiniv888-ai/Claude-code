import "server-only";
import { auditOrThrow } from "@/lib/audit";
import { staffActiveKey } from "@/lib/auth/staff-session-rules";
import { db } from "@/lib/db";
import { MAINTENANCE_OFF, MAINTENANCE_SETTING_KEY, type StoredMaintenance } from "@/lib/maintenance/mode";
import { rememberMaintenance, saveMaintenance } from "@/lib/maintenance/state";
import { recordSecurityEvent } from "@/lib/security/events";

/**
 * The incident tools' work (SECURITY_REPORT 12.5.c, 17.1), called by ./incident-actions.ts after
 * its checks (ADMIN, fresh authenticator code, rate limit). Each change and its audit row are one
 * transaction (auditOrThrow: no row, no change); a security event follows for the founder's alerts.
 */

/** Maintenance mode on or off (the stored switch). */
export async function switchMaintenance(actorId: string, on: boolean, now: Date = new Date()): Promise<StoredMaintenance> {
  const value: StoredMaintenance = on ? { on: true, since: now.toISOString(), by: actorId } : MAINTENANCE_OFF;
  await db.$transaction(async (tx) => {
    await auditOrThrow(
      { actorId, action: on ? "maintenance.mode_on" : "maintenance.mode_off", targetType: "SiteSetting", targetId: MAINTENANCE_SETTING_KEY, details: { on } },
      tx,
    );
    await saveMaintenance(tx, value, actorId);
  });
  rememberMaintenance(value);
  await recordSecurityEvent({ type: "maintenance_mode_changed", userId: actorId, meta: { on } });
  return value;
}

/**
 * Deletes EVERY session (guests, hosts and staff, every device) except `keepSessionId`, and the
 * staff idle markers that went with them. Returns how many sessions ended.
 */
export async function endEverySessionExcept(actorId: string, keepSessionId: string): Promise<number> {
  const sessions = await db.$transaction(async (tx) => {
    const others = await tx.session.count({ where: { id: { not: keepSessionId } } });
    await auditOrThrow({ actorId, action: "sessions.end_all", targetType: "Session", targetId: null, details: { sessions: others } }, tx);
    const deleted = await tx.session.deleteMany({ where: { id: { not: keepSessionId } } });
    await tx.verification.deleteMany({
      where: { identifier: { startsWith: staffActiveKey("") }, NOT: { identifier: staffActiveKey(keepSessionId) } },
    });
    return deleted.count;
  });
  await recordSecurityEvent({ type: "all_sessions_ended", userId: actorId, meta: { sessions } });
  return sessions;
}
