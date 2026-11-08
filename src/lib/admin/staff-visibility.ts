import { can } from "@/lib/auth/permissions";

/**
 * What a staff member may see about other people (founder's decision Q12, SECURITY_REPORT
 * 4.3.a/d; pure). Two things are ADMIN only:
 *
 * - who sent a report (`reports.reporter`): the reporter's name and account, the reports a user
 *   sent (their user page), and the sender of every other report on a report page;
 * - the guest's phone on a booking (`bookings.guest_phone`), and searching bookings by it.
 *
 * Moderators and support keep everything else. The admin queries read these values only for a
 * viewer who may see them (src/lib/admin/server/reports.ts, bookings.ts, users.ts), so they never
 * reach the page, its data or the browser for anyone else; hiding them in the page is not the rule.
 */

export type StaffViewer = { id: string; role: string };

export function canSeeReporter(viewer: Pick<StaffViewer, "role">): boolean {
  return can(viewer.role, "reports.reporter");
}

export function canSeeGuestPhone(viewer: Pick<StaffViewer, "role">): boolean {
  return can(viewer.role, "bookings.guest_phone");
}
