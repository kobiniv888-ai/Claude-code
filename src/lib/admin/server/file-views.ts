import "server-only";
import { audit } from "@/lib/audit";
import { db } from "@/lib/db";

/**
 * Round 3, brief 9 "Audit log": opening a stored private file (a verification document, a report
 * screenshot) is an admin action, so it is written to the audit log. The same staff member opening
 * the same file again within FILE_VIEW_DEDUPE_MINUTES is one entry (a viewer re-requests the image
 * on every redraw). Never throws: a failed audit write must not hide the file from staff, and it is
 * logged on the server.
 */

export const FILE_VIEW_DEDUPE_MINUTES = 10;

export async function auditFileView(input: {
  staffId: string;
  action: "verification.document_view" | "report.attachment_view";
  targetType: "VerificationRequest" | "Report";
  targetId: string;
  index: number;
  details?: Record<string, unknown>;
  now?: Date;
}): Promise<void> {
  const now = input.now ?? new Date();
  try {
    const recent = await db.auditLog.findFirst({
      where: {
        actorId: input.staffId,
        action: input.action,
        targetType: input.targetType,
        targetId: input.targetId,
        createdAt: { gt: new Date(now.getTime() - FILE_VIEW_DEDUPE_MINUTES * 60_000) },
        details: { path: ["index"], equals: input.index },
      },
      select: { id: true },
    });
    if (recent) return;
    await audit({
      actorId: input.staffId,
      action: input.action,
      targetType: input.targetType,
      targetId: input.targetId,
      details: { ...input.details, index: input.index },
    });
  } catch (error) {
    console.error(`[audit] ${input.action} for ${input.targetId} could not be written:`, error);
  }
}
