import { can, type Permission } from "@/lib/auth/permissions";

/**
 * Admin home "דורש טיפול" (round 3, brief 9): one block with a count and a link per thing that
 * waits for staff. Pure and client-safe: the counts come from ./server/attention.ts (one cheap
 * query each), this decides which rows a role sees and in what order. Labels:
 * admin.overview.attention.rows.<key>.
 */

export const ATTENTION_KEYS = [
  "turnedAwayReports",
  "inReview",
  "otherReports",
  "flagCancellations",
  "flagHosts",
  "flagNoShows",
  /** Guests with 3 cancellations in 90 days or 2 no-shows in a year (founder's decision 7, review only). */
  "flagGuests",
  /** Stays of 14 nights or more (decision 7, review only). */
  "flagLongStays",
  "hostUnreachable",
  "failedEmails",
  "outboxWaiting",
] as const;
export type AttentionKey = (typeof ATTENTION_KEYS)[number];
export type AttentionCounts = Record<AttentionKey, number>;
/** The counts, and the ones that could not be loaded (they read 0 in `counts`). */
export type AttentionSnapshot = AttentionCounts & { failed: AttentionKey[] };

export type AttentionTone = "urgent" | "attention" | "info";

type RowSpec = { permission: Permission; href: string; tone: AttentionTone };

/** How far back the event rows (unreachable hosts, failed and waiting emails) look. */
export const ATTENTION_EVENT_DAYS = 7;

const ROWS: Record<AttentionKey, RowSpec> = {
  turnedAwayReports: { permission: "reports.view", href: "/admin/reports?tab=turnedAway", tone: "urgent" },
  inReview: { permission: "moderation", href: "/admin/moderation", tone: "attention" },
  otherReports: { permission: "reports.view", href: "/admin/reports?tab=listings", tone: "attention" },
  flagCancellations: { permission: "moderation", href: "/admin/flags", tone: "attention" },
  flagHosts: { permission: "moderation", href: "/admin/flags?view=hosts", tone: "attention" },
  flagNoShows: { permission: "moderation", href: "/admin/flags?view=noShows", tone: "info" },
  flagGuests: { permission: "moderation", href: "/admin/flags?view=guests", tone: "attention" },
  flagLongStays: { permission: "moderation", href: "/admin/flags?view=longStays", tone: "info" },
  hostUnreachable: { permission: "moderation", href: "/admin/bookings?view=unreachable", tone: "attention" },
  failedEmails: { permission: "settings", href: `/admin/outbox?status=FAILED&recent=${ATTENTION_EVENT_DAYS}`, tone: "attention" },
  outboxWaiting: { permission: "settings", href: `/admin/outbox?waiting=1&recent=${ATTENTION_EVENT_DAYS}`, tone: "info" },
};


export type AttentionRow = { key: AttentionKey; count: number; href: string; tone: AttentionTone };

/** The rows `role` may see that have something waiting, urgent first, in ATTENTION_KEYS order. */
export function attentionRows(counts: Partial<AttentionCounts> | null, role: string | null | undefined): AttentionRow[] {
  if (!counts) return [];
  const rank: Record<AttentionTone, number> = { urgent: 0, attention: 1, info: 2 };
  return ATTENTION_KEYS.flatMap((key): AttentionRow[] => {
    const spec = ROWS[key];
    const count = counts[key] ?? 0;
    if (count <= 0 || !can(role, spec.permission)) return [];
    return [{ key, count, href: spec.href, tone: spec.tone }];
  }).sort((a, b) => rank[a.tone] - rank[b.tone]);
}

/** Total of what needs a person (info rows such as the outbox are left out). */
export function attentionTotal(rows: readonly AttentionRow[]): number {
  return rows.filter((r) => r.tone !== "info").reduce((sum, r) => sum + r.count, 0);
}

/**
 * What the block shows: "unavailable" (nothing could be loaded), "partial" (some counts failed:
 * never "all clear", whatever loaded is still listed), "clear" (everything counted and nothing
 * waits) or "rows". Only failures of rows the role may see count.
 */
export function attentionState(counts: Partial<AttentionSnapshot> | null, role: string | null | undefined): "unavailable" | "partial" | "clear" | "rows" {
  if (!counts) return "unavailable";
  const failed = (counts.failed ?? []).filter((key) => can(role, ROWS[key].permission));
  if (failed.length) return "partial";
  return attentionRows(counts, role).length ? "rows" : "clear";
}
