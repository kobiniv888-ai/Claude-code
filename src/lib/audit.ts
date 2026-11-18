import "server-only";
import type { Prisma } from "@/generated/prisma/client";
import { db } from "@/lib/db";
import { AppError } from "@/lib/errors";
import { getIpHash } from "@/lib/request";

/**
 * Writes one row to AuditLog. Every staff action calls this.
 *
 *   await audit({ actorId: staff.id, action: "listing.approve", targetType: "Listing", targetId: id });
 *
 * Actions are "<area>.<verb>", e.g. "listing.approve", "user.ban", "settings.update".
 *
 * Two ways (founder's decision Q13, SECURITY_REPORT 12.6.d):
 *
 * - `audit()` never throws: a failed log write is logged and the action goes on. For actions that
 *   change nothing for anyone else (notes, views, a dry run) or that already happened.
 * - `auditOrThrow(entry, tx)` for DESTRUCTIVE staff actions (ban, suspend, remove, delete, hide,
 *   reject, role changes, mark reviewed): pass the transaction client and write it in the same
 *   transaction as the change, so the change and its row are saved together or not at all. When the
 *   row cannot be written it throws AuditWriteError ("audit_failed"), the transaction rolls back
 *   and the action stops. Emails and other side effects go after the transaction.
 */
export type AuditEntry = {
  actorId: string | null;
  action: string;
  targetType?: string | null;
  targetId?: string | null;
  details?: Record<string, unknown> | null;
};

/** Makes `details` safe for a JSON column (Dates → ISO strings, drops undefined/functions). */
function toJson(details: Record<string, unknown>): Prisma.InputJsonValue {
  return JSON.parse(JSON.stringify(details)) as Prisma.InputJsonValue;
}

async function rowFor({ actorId, action, targetType, targetId, details }: AuditEntry): Promise<Prisma.AuditLogUncheckedCreateInput> {
  // Outside a request (scripts, some background work) there are no headers.
  const ipHash = await getIpHash().catch(() => null);
  return {
    actorId: actorId ?? null,
    action: action.slice(0, 120),
    targetType: targetType ?? null,
    targetId: targetId ?? null,
    details: details ? toJson(details) : undefined,
    ipHash,
  };
}

export async function audit(entry: AuditEntry): Promise<void> {
  try {
    await db.auditLog.create({ data: await rowFor(entry) });
  } catch (error) {
    console.error(`[audit] failed to record "${entry.action}":`, error);
  }
}

/** The audit row of a destructive action could not be written: the action was stopped. */
export class AuditWriteError extends AppError {
  constructor(action: string, cause?: unknown) {
    // 409 so the code reaches the staff member's screen ("audit_failed"), not a generic error.
    super("audit_failed", `Audit write failed for "${action}": the action was stopped`, { status: 409, cause });
  }
}

type AuditClient = Pick<Prisma.TransactionClient, "auditLog">;

/**
 * Writes the audit row of a destructive staff action, or throws AuditWriteError. Pass the
 * transaction client (`tx`) so the row and the change commit together; without it the row is
 * written on its own and the caller must not go on when it throws.
 */
export async function auditOrThrow(entry: AuditEntry, client: AuditClient = db): Promise<void> {
  try {
    await client.auditLog.create({ data: await rowFor(entry) });
  } catch (error) {
    console.error(`[audit] could not record "${entry.action}": the action is stopped`, error);
    throw new AuditWriteError(entry.action, error);
  }
}
