import "server-only";

/**
 * Support tickets (server entry). The admin support screens use:
 *
 *   const staff = await requireStaffForAction("tickets");
 *   await addStaffReply(ticket.id, staff.id, body, { internal: false, newStatus: "WAITING_FOR_USER" });
 *   await changeTicketStatus(ticket.id, staff.id, "RESOLVED");
 *   await assignTicket(ticket.id, staff.id, assigneeId);
 *   const ticket = await getTicketForStaff(number);   // includes internal notes
 *
 * Client components import the pure parts from "@/lib/tickets/constants", "./attachments",
 * "./schemas" and "./listing-ref", and the UI from "@/components/tickets".
 */

export * from "./server";
export * from "./constants";
export * from "./attachments";
export { parseListingRef } from "./listing-ref";
