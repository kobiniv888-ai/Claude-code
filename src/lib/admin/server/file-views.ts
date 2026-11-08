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

/**
 * SECURITY_REPORT 12.6.d: opening a person's record in the admin panel (a user's page, a
 * booking's page with the guest's details) is written to the audit log too, once per staff member
 * and record every FILE_VIEW_DEDUPE_MINUTES. Never throws (best effort, like auditFileView): a
 * failed write is logged and the page still opens; changing anything is audited by the actions.
 */
export async function auditRecordView(input: {
  staffId: string;
  action: "user.view" | "booking.view";
  targetType: "User" | "Booking";
  targetId: string;
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
      },
      select: { id: true },
    });
    if (recent) return;
    await audit({ actorId: input.staffId, action: input.action, targetType: input.targetType, targetId: input.targetId });
  } catch (error) {
    console.error(`[audit] ${input.action} for ${input.targetId} could not be written:`, error);
  }
}
