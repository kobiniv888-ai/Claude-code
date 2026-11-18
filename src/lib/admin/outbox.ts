/**
 * Admin → Email outbox "send again" (round 3, brief 9): an email that was only kept in the outbox
 * (status LOGGED, because Resend was not set up yet) can be sent for real once it is. Pure and
 * client-safe; src/lib/admin/actions/outbox.ts applies it.
 *
 * Never sent again: emails that were already sent or failed, the demo accounts' emails (provider
 * "outbox": their addresses are made up), login codes (masked in the outbox and expired anyway),
 * addresses that cannot receive mail (phone-only placeholders, the founder-alert stand-in),
 * reserved demo and test domains (demo.bayit.example, example.com, *.test …: whatever sender
 * logged them, they would bounce and hurt the sender's reputation), and emails that were sent
 * with a Reply-To the outbox doesn't keep (contact_owner: the host's reply would miss the guest).
 * The action also refuses demo and deleted accounts (src/lib/admin/actions/outbox.ts).
 */

export type ResendBlock =
  | "not_configured"
  | "not_logged"
  | "outbox_only"
  | "login_code"
  | "expired"
  | "bad_address"
  | "demo_or_test"
  | "reply_to_lost";

/**
 * Emails only worth sending at the time they were made: the weekly host digest ("השבוע: …") would
 * arrive weeks late with old numbers, and without the unsubscribe switch being looked at again.
 */
const TIME_SENSITIVE_TEMPLATES = new Set(["weekly_host_stats"]);

const UNDELIVERABLE = /@(phone\.bayit\.invalid|outbox\.invalid)$|\.invalid$/i;
/** Reserved for documentation and tests (RFC 2606 / 6761), the demo domain included. */
const RESERVED = /\.(example|test|localhost|invalid)$|@(example\.(com|net|org)|localhost)$/i;
/** Templates sent with a Reply-To (src/lib/contact/actions.ts): the outbox keeps no Reply-To. */
const REPLY_TO_TEMPLATES = new Set(["contact_owner"]);
const EMAIL = /^[^\s@<>()[\]\\,;:"]+@[^\s@<>()[\]\\,;:"]+\.[^\s@<>()[\]\\,;:"]+$/;

export function resendBlock(
  row: { status: string; provider: string | null; template: string; to: string },
  resendConfigured: boolean,
): ResendBlock | null {
  if (!resendConfigured) return "not_configured";
  if (row.status !== "LOGGED") return "not_logged";
  if (row.provider === "outbox") return "outbox_only";
  if (row.template === "login_code") return "login_code";
  if (TIME_SENSITIVE_TEMPLATES.has(row.template)) return "expired";
  const to = row.to.trim();
  if (!EMAIL.test(to) || to.length > 254 || UNDELIVERABLE.test(to)) return "bad_address";
  if (RESERVED.test(to)) return "demo_or_test";
  if (REPLY_TO_TEMPLATES.has(row.template)) return "reply_to_lost";
  return null;
}

// ─── The outbox list and the admin home counts (one filter for both) ───────

/**
 * "Kept and not sent": LOGGED, never a demo account's "outbox" email, a login code or a weekly
 * digest (those are never sent again, see resendBlock: they would fill the row every week).
 */
export const OUTBOX_WAITING_WHERE = {
  status: "LOGGED" as const,
  provider: { not: "outbox" },
  template: { notIn: ["login_code", "weekly_host_stats"] },
};

export type OutboxListFilters = {
  status?: "QUEUED" | "SENT" | "FAILED" | "LOGGED";
  template?: string;
  to?: string;
  /** Only emails still waiting to be sent for real (OUTBOX_WAITING_WHERE). */
  waiting?: boolean;
  /** Only the last N days. */
  recentDays?: number;
};

/**
 * The outbox list's filter (src/lib/admin/content/server/queries.ts listOutbox). The admin home's
 * "failed" and "waiting" rows count with the same filter and link to the same list
 * (?status=FAILED&recent=7, ?waiting=1&recent=7), so the number and the list always agree.
 */
export function outboxListWhere(filters: OutboxListFilters, now: Date = new Date()) {
  return {
    ...(filters.waiting ? OUTBOX_WAITING_WHERE : {}),
    ...(filters.status && !filters.waiting ? { status: filters.status } : {}),
    ...(filters.template ? { template: filters.template } : {}),
    ...(filters.to ? { to: { contains: filters.to, mode: "insensitive" as const } } : {}),
    ...(filters.recentDays ? { createdAt: { gte: new Date(now.getTime() - filters.recentDays * 86_400_000) } } : {}),
  };
}
