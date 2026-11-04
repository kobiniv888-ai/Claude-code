"use server";

import { z } from "zod";
import { fail, ok, type ActionResult } from "@/lib/action";
import { audit } from "@/lib/audit";
import { db } from "@/lib/db";
import { deliverStoredEmail, isEmailDeliveryConfigured } from "@/lib/email";
import { resendBlock } from "../outbox";
import { AdminActionError, runStaffAction } from "../server/common";

/**
 * "Send again" for an email kept in the outbox (the "settings" permission, like the outbox itself).
 * Only once Resend is set up, only LOGGED emails that can really be delivered (../outbox.ts). The
 * row becomes SENT with Resend's id (bounce reports find it by that id). Audited.
 */
export async function resendOutboxEmailAction(input: unknown): Promise<ActionResult<{ sent: boolean }>> {
  return runStaffAction<{ sent: boolean }>(
    "settings",
    "email.resend",
    async (staff) => {
      const parsed = z.object({ id: z.string().trim().min(1).max(64) }).safeParse(input);
      if (!parsed.success) return fail("invalid_input");
      const row = await db.emailOutbox.findUnique({
        where: { id: parsed.data.id },
        select: { id: true, to: true, subject: true, html: true, text: true, template: true, status: true, provider: true },
      });
      if (!row) throw new AdminActionError("email_not_found", 404);
      const block = resendBlock(row, isEmailDeliveryConfigured());
      if (block === "not_configured") throw new AdminActionError("resend_not_configured", 409);
      if (block) throw new AdminActionError("cannot_resend", 409);
      // Never to a demo account or one deleted since (whatever address it had then).
      const to = row.to.trim();
      const recipient = await db.user.findFirst({
        where: { OR: [{ email: { equals: to, mode: "insensitive" } }, { contactEmail: { equals: to, mode: "insensitive" } }] },
        select: { isDemo: true, deletedAt: true, status: true },
      });
      if (recipient && (recipient.isDemo || recipient.deletedAt || recipient.status === "DELETED")) throw new AdminActionError("cannot_resend", 409);

      // Claim the row first, so two clicks cannot send it twice.
      const { count } = await db.emailOutbox.updateMany({ where: { id: row.id, status: "LOGGED" }, data: { status: "QUEUED", error: null } });
      if (count === 0) throw new AdminActionError("cannot_resend", 409);
      const sent = await deliverStoredEmail(row);
      await db.emailOutbox.update({
        where: { id: row.id },
        data: sent.ok
          ? { status: "SENT", provider: "resend", providerId: sent.providerId, sentAt: new Date(), error: null }
          : { status: "FAILED", provider: "resend", error: `resend again: ${sent.error}`.slice(0, 1000) },
      });
      await audit({
        actorId: staff.id,
        action: "email.resend",
        targetType: "EmailOutbox",
        targetId: row.id,
        details: { template: row.template, sent: sent.ok, error: sent.ok ? null : sent.error },
      });
      return ok({ sent: sent.ok });
    },
    { limit: 30, windowSeconds: 60 },
  );
}
