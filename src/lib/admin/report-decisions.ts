/**
 * Which decisions the report page offers (pure; the server actions in ./actions/reports.ts
 * enforce the same rules on their own).
 *
 * - Nothing on a decided report, and nothing on the staff member's own report (about them or sent
 *   by them; an ADMIN excepted, see server/common.ts isOwnItem).
 * - Warn / hide all / remove only when the host can be acted on (not banned or deleted, and a
 *   staff account only for an ADMIN).
 * - "Resolve" for listing and profile reports, and for a turned-away report that can't be closed
 *   with a host action (the host was already removed, deleted their account, or can't be managed
 *   by this staff member) or whose reporter was already named to the host: otherwise the only way
 *   to close a valid report would be "dismiss" ("no real problem").
 * - "Dismiss" never after the host was told who reported: the host did learn of the report.
 */
export type ReportDecisionInput = {
  kind: "GENERAL" | "TURNED_AWAY";
  open: boolean;
  own: boolean;
  /** The host can be warned, hidden or removed by this staff member. */
  hostActionable: boolean;
  /** Report.reporterRevealedAt is set. */
  revealed: boolean;
};

export type ReportDecisions = { hostActions: boolean; resolve: boolean; dismiss: boolean };

export function reportDecisions(input: ReportDecisionInput): ReportDecisions {
  if (!input.open || input.own) return { hostActions: false, resolve: false, dismiss: false };
  return {
    hostActions: input.hostActionable,
    resolve: input.kind === "GENERAL" || !input.hostActionable || input.revealed,
    dismiss: !input.revealed,
  };
}
