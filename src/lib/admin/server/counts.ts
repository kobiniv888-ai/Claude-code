import "server-only";
import { cache } from "react";
import { db } from "@/lib/db";
import { ACTIVE_TICKET_STATUSES } from "@/lib/tickets/constants";
import type { AdminCounts } from "../nav";

/** Numbers for the navigation badges and the overview (one set of queries per request). */
export const getAdminCounts = cache(async (): Promise<AdminCounts> => {
  const [inReview, openReports, activeTickets, urgentTickets, pendingVerifications] = await Promise.all([
    db.listing.count({ where: { status: "IN_REVIEW" } }),
    db.report.count({ where: { status: "OPEN" } }),
    db.ticket.count({ where: { status: { in: [...ACTIVE_TICKET_STATUSES] } } }),
    db.ticket.count({ where: { status: { in: [...ACTIVE_TICKET_STATUSES] }, priority: "URGENT" } }),
    db.verificationRequest.count({ where: { status: "PENDING" } }),
  ]);
  return { inReview, openReports, activeTickets, urgentTickets, pendingVerifications };
});
