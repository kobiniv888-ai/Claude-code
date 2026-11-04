/**
 * What the PUBLIC site may know about "ביקרנו במקום" (pure, client-safe): that Bayit visited the
 * place, and the month. Never the day, never the staff-only note or who entered the visit (they
 * are read in src/lib/admin/badges only; ./visited.test.ts checks it); public selects read
 * `visitedAt` only, through these helpers. Demo listings never show it, even if a row was edited
 * by hand.
 */

type VisitRow = { visitedAt: Date | null; isDemo: boolean };

/** The card tag and the search filter: a real listing with a visit. */
export function hasVisitedBadge(row: VisitRow): boolean {
  return !row.isDemo && row.visitedAt !== null;
}

/** "2026-11" for the listing page line ("ביקרנו במקום · נובמבר 2026"), or null. */
export function visitedMonth(row: VisitRow): string | null {
  if (!hasVisitedBadge(row) || !row.visitedAt || Number.isNaN(row.visitedAt.getTime())) return null;
  // @db.Date: midnight UTC of the visit day.
  return row.visitedAt.toISOString().slice(0, 7);
}

/** "2026-11" → the first day of that month, for formatDate(…, { month: "long", year: "numeric", timeZone: "UTC" }). */
export function visitedMonthDate(month: string): string {
  return `${month}-01`;
}
