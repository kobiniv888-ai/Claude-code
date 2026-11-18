/**
 * Risk-score presentation for the moderation queue (pure, client-safe).
 * Scores come from @/lib/risk (0–100); the review threshold is an admin setting.
 */

export type RiskLevel = "none" | "low" | "medium" | "high";

/** Scores at or above this are "high" whatever the review threshold is. */
export const HIGH_RISK_SCORE = 60;

export function riskLevel(score: number | null | undefined, reviewThreshold = 30): RiskLevel {
  if (score == null || !Number.isFinite(score)) return "none";
  if (score >= Math.max(HIGH_RISK_SCORE, reviewThreshold)) return "high";
  if (score >= reviewThreshold) return "medium";
  return "low";
}

/** Tailwind classes for the risk chip of each level (AA contrast in light and dark themes). */
export const RISK_LEVEL_STYLES: Record<RiskLevel, string> = {
  none: "bg-muted text-muted-foreground ring-border",
  low: "bg-primary-tint text-foreground ring-success/30",
  medium: "bg-surface-muted text-foreground ring-border-strong/40",
  high: "bg-destructive/10 text-destructive ring-destructive/30",
};
