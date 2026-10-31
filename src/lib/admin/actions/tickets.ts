"use server";

import { z } from "zod";
import { fail, ok, type ActionResult } from "@/lib/action";
import { TICKET_LIMITS, TICKET_STATUSES } from "@/lib/tickets/constants";
import { addStaffReply, assignTicket, changeTicketStatus } from "@/lib/tickets/server";
import { runStaffAction } from "../server/common";

/**
 * Support actions ("tickets"). The ticket helpers write the audit entries ("ticket.reply",
 * "ticket.note", "ticket.status", "ticket.assign") and email the user.
 */

const ticketId = z.string().min(1).max(64);

const replySchema = z.object({
  ticketId,
  body: z.string().trim().min(1).max(TICKET_LIMITS.messageMax),
  internal: z.boolean().default(false),
  newStatus: z.enum(TICKET_STATUSES).optional(),
});

export async function staffReplyAction(input: unknown): Promise<ActionResult<{ status: string }>> {
  return runStaffAction(
    "tickets",
    "ticket.reply",
    async (staff) => {
      const parsed = replySchema.safeParse(input);
      if (!parsed.success) return fail("invalid_input", z.flattenError(parsed.error).fieldErrors);
      const { body, internal, newStatus } = parsed.data;
      const result = await addStaffReply(parsed.data.ticketId, staff.id, body, { internal, newStatus });
      return ok({ status: result.status });
    },
    { limit: 60, windowSeconds: 60 },
  );
}

export async function setTicketStatusAction(input: unknown): Promise<ActionResult<{ status: string }>> {
  return runStaffAction("tickets", "ticket.status", async (staff) => {
    const parsed = z.object({ ticketId, status: z.enum(TICKET_STATUSES) }).safeParse(input);
    if (!parsed.success) return fail("invalid_input");
    const result = await changeTicketStatus(parsed.data.ticketId, staff.id, parsed.data.status);
    return ok({ status: result.status });
  });
}

/** `assigneeId`: a staff member's id, "me", or null to unassign. */
export async function assignTicketAction(input: unknown): Promise<ActionResult<{ assignedToId: string | null }>> {
  return runStaffAction("tickets", "ticket.assign", async (staff) => {
    const parsed = z.object({ ticketId, assigneeId: z.string().min(1).max(64).nullable() }).safeParse(input);
    if (!parsed.success) return fail("invalid_input");
    const assignee = parsed.data.assigneeId === "me" ? staff.id : parsed.data.assigneeId;
    const result = await assignTicket(parsed.data.ticketId, staff.id, assignee);
    return ok({ assignedToId: result.assignedToId });
  });
}
