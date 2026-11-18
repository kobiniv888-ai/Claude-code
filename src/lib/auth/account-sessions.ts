import "server-only";
import { db } from "@/lib/db";
import { staffActiveKey } from "./staff-session-rules";
import { freshProofKey } from "./fresh-proof-rules";

/**
 * Ending sessions on the server (SECURITY_REPORT 3.5.d, 3.5.e). The session rows go, and with them
 * the markers kept per session (staff idle marker, fresh-code marker), so a copied cookie stops
 * working at once.
 */

async function deleteSessionsWhere(where: { userId: string; id?: { not: string } | string }): Promise<number> {
  const sessions = await db.session.findMany({ where, select: { id: true } });
  if (sessions.length === 0) return 0;
  const ids = sessions.map((s) => s.id);
  const [, , deleted] = await db.$transaction([
    db.verification.deleteMany({ where: { identifier: { in: ids.map(staffActiveKey) } } }),
    db.verification.deleteMany({ where: { identifier: { in: ids.map(freshProofKey) } } }),
    db.session.deleteMany({ where: { id: { in: ids }, userId: where.userId } }),
  ]);
  return deleted.count;
}

/** Ends every session of the account except `keepSessionId` (after a phone, email or login-method change). */
export function endOtherSessions(userId: string, keepSessionId: string): Promise<number> {
  return deleteSessionsWhere({ userId, id: { not: keepSessionId } });
}

/** Ends every session of the account (role changes, "log out everywhere"). */
export function endAllSessions(userId: string): Promise<number> {
  return deleteSessionsWhere({ userId });
}

/** Ends exactly this session; the number of rows deleted (1, or 0 when it was already gone). */
export function endSession(userId: string, sessionId: string): Promise<number> {
  return deleteSessionsWhere({ userId, id: sessionId });
}
