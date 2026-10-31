import "server-only";
import type { Prisma } from "@/generated/prisma/client";
import { db } from "@/lib/db";
import { getIpHash } from "@/lib/request";

/**
 * Writes one row to AuditLog. Every staff action calls this.
 * Never throws — a failed log write must not break the action itself (it is logged instead).
 *
 *   await audit({ actorId: staff.id, action: "listing.approve", targetType: "Listing", targetId: id });
 *
 * Actions are "<area>.<verb>", e.g. "listing.approve", "user.ban", "settings.update".
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

export async function audit({ actorId, action, targetType, targetId, details }: AuditEntry): Promise<void> {
  try {
    // Outside a request (scripts, some background work) there are no headers.
    const ipHash = await getIpHash().catch(() => null);
    await db.auditLog.create({
      data: {
        actorId: actorId ?? null,
        action: action.slice(0, 120),
        targetType: targetType ?? null,
        targetId: targetId ?? null,
        details: details ? toJson(details) : undefined,
        ipHash,
      },
    });
  } catch (error) {
    console.error(`[audit] failed to record "${action}":`, error);
  }
}
