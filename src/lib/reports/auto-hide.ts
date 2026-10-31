/**
 * Which open reports count towards hiding a listing automatically (pure, client-safe).
 *
 * A group of fresh fake accounts must not be able to take a competitor's listing offline, so a
 * report only counts when it comes from
 * - an active account that is either older than `newAccountDays` OR has a verified phone, and
 * - an account (and a device) not counted yet: one vote per account, and accounts that share a
 *   device (DeviceLink) count once. An account without any known device does not count.
 *
 * Every report still reaches the moderators' queue, and a moderator can restore a hidden listing.
 */

export type ReportVote = {
  reporterId: string | null;
  reporter: {
    createdAt: Date;
    phoneNumberVerified: boolean | null;
    status: string;
    deletedAt: Date | null;
    /** DeviceLink.deviceHash values of the reporting account. */
    devices: string[];
  } | null;
};

const ACTIVE_STATUSES = new Set(["ACTIVE", "WARNED"]);
const DAY_MS = 24 * 3600 * 1000;

/** True when this reporter's account may count at all (age or verified phone, still active). */
export function isTrustedReporter(reporter: NonNullable<ReportVote["reporter"]>, now: Date, newAccountDays: number): boolean {
  if (reporter.deletedAt || !ACTIVE_STATUSES.has(reporter.status)) return false;
  if (reporter.phoneNumberVerified === true) return true;
  return now.getTime() - reporter.createdAt.getTime() >= newAccountDays * DAY_MS;
}

/** How many reports count towards the auto-hide threshold. Pass reports oldest first. */
export function countAutoHideReports(reports: readonly ReportVote[], opts: { now: Date; newAccountDays: number }): number {
  const accounts = new Set<string>();
  const devices = new Set<string>();
  let count = 0;
  for (const report of reports) {
    const { reporterId, reporter } = report;
    if (!reporterId || !reporter || accounts.has(reporterId)) continue;
    if (!isTrustedReporter(reporter, opts.now, opts.newAccountDays)) continue;
    if (reporter.devices.length === 0 || reporter.devices.some((device) => devices.has(device))) continue;
    accounts.add(reporterId);
    for (const device of reporter.devices) devices.add(device);
    count++;
  }
  return count;
}
