import "server-only";
import { cache } from "react";
import { documentChecksOn } from "@/config/verification";
import { db } from "@/lib/db";
import { ACTIVE_TICKET_STATUSES } from "@/lib/tickets/constants";
import type { AdminCounts } from "../nav";
import { getOpenFlagCounts } from "./flags";
import { getOpenGuestFlagCounts } from "./guest-flags";

/** Numbers for the navigation badges and the overview (one set of queries per request). */
export const getAdminCounts = cache(async (): Promise<AdminCounts> => {
  const [inReview, openReports, urgentReports, flags, guestFlags, activeTickets, urgentTickets, pendingVerifications] = await Promise.all([
    db.listing.count({ where: { status: "IN_REVIEW" } }),
    db.report.count({ where: { status: "OPEN" } }),
    db.report.count({ where: { status: "OPEN", kind: "TURNED_AWAY" } }),
    getOpenFlagCounts().catch(() => ({ cancellations: 0, noShows: 0, hosts: 0 })),
    // Long stays and guests with repeated cancellations / no-shows wait for a look (decision 7).
    getOpenGuestFlagCounts().catch(() => ({ longStays: 0, guests: 0 })),
    db.ticket.count({ where: { status: { in: [...ACTIVE_TICKET_STATUSES] } } }),
    db.ticket.count({ where: { status: { in: [...ACTIVE_TICKET_STATUSES] }, priority: "URGENT" } }),
    // Nothing to decide while there are no document checks (src/config/verification.ts).
    documentChecksOn() ? db.verificationRequest.count({ where: { status: "PENDING" } }) : Promise.resolve(0),
  ]);
  return {
    inReview,
    openReports,
    urgentReports,
    // No-shows are "for information" (the admin home doesn't count them either).
    openFlags: flags.cancellations + flags.hosts + guestFlags.longStays + guestFlags.guests,
    activeTickets,
    urgentTickets,
    pendingVerifications,
  };
});
