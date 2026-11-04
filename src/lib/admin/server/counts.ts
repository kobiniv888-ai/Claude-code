import "server-only";
import { cache } from "react";
import { documentChecksOn } from "@/config/verification";
import { db } from "@/lib/db";
import { ACTIVE_TICKET_STATUSES } from "@/lib/tickets/constants";
import type { AdminCounts } from "../nav";
import { getOpenFlagCounts } from "./flags";

/** Numbers for the navigation badges and the overview (one set of queries per request). */
export const getAdminCounts = cache(async (): Promise<AdminCounts> => {
  const [inReview, openReports, urgentReports, flags, activeTickets, urgentTickets, pendingVerifications] = await Promise.all([
    db.listing.count({ where: { status: "IN_REVIEW" } }),
    db.report.count({ where: { status: "OPEN" } }),
    db.report.count({ where: { status: "OPEN", kind: "TURNED_AWAY" } }),
    getOpenFlagCounts().catch(() => ({ cancellations: 0, noShows: 0, hosts: 0 })),
    db.ticket.count({ where: { status: { in: [...ACTIVE_TICKET_STATUSES] } } }),
    db.ticket.count({ where: { status: { in: [...ACTIVE_TICKET_STATUSES] }, priority: "URGENT" } }),
    // Nothing to decide while there are no document checks (src/config/verification.ts).
    documentChecksOn() ? db.verificationRequest.count({ where: { status: "PENDING" } }) : Promise.resolve(0),
  ]);
  return {
    inReview,
    openReports,
    urgentReports,
    openFlags: flags.cancellations + flags.noShows + flags.hosts,
    activeTickets,
    urgentTickets,
    pendingVerifications,
  };
});
