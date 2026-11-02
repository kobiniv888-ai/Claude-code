/**
 * One-tap fixes when nothing matches (pure): "Remove the 'Kosher' filter", "Wider area",
 * "Clear the dates". The server counts each candidate and offers the ones that bring results
 * (rankLoosenFixes in loosen-query.ts); the filters sheet and the no-results page show them.
 *
 *   loosenCandidates(filters) → [{ id: "remove:kitchen:kosher", fix: { kind: "remove", chip }, filters: … }, …]
 */
import {
  activeFilterChips,
  removeFilter,
  withFilters,
  type ChipKey,
  type FilterChip,
  type SearchFilters,
} from "@/lib/listing/search-params";

export type LoosenFix =
  /** Remove one filter chip (a list value removes only that value). */
  | { kind: "remove"; chip: FilterChip }
  /** Look in a wider area: drop the map area, then the neighborhood, then the city. */
  | { kind: "area"; scope: "mapArea" | "neighborhood" | "city" }
  /** Clear the check-in/check-out (or move-in) dates. */
  | { kind: "dates" };

export type LoosenCandidate = { id: string; fix: LoosenFix; filters: SearchFilters };

/** Chips that a "remove" fix never targets: the place and the dates have their own fixes. */
const OWN_FIX: readonly ChipKey[] = ["city", "neighborhood", "bounds", "dates"];

/** At most this many candidates are counted on the server. */
export const MAX_LOOSEN_CANDIDATES = 12;

/** Every way to loosen the search by one step, filters first, then dates, then the area. */
export function loosenCandidates(filters: SearchFilters): LoosenCandidate[] {
  const out: LoosenCandidate[] = [];
  for (const chip of activeFilterChips(filters)) {
    if (OWN_FIX.includes(chip.key)) continue;
    out.push({
      id: `remove:${chip.key}:${chip.value ?? ""}`,
      fix: { kind: "remove", chip },
      filters: removeFilter(filters, chip.key, chip.value),
    });
  }
  if (filters.checkIn) {
    out.push({ id: "dates", fix: { kind: "dates" }, filters: withFilters(filters, { checkIn: null, checkOut: null }) });
  }
  if (filters.bounds) {
    out.push({ id: "area:mapArea", fix: { kind: "area", scope: "mapArea" }, filters: withFilters(filters, { bounds: null }) });
  } else if (filters.city && filters.neighborhood) {
    out.push({
      id: "area:neighborhood",
      fix: { kind: "area", scope: "neighborhood" },
      filters: withFilters(filters, { neighborhood: null }),
    });
  } else if (filters.city) {
    out.push({ id: "area:city", fix: { kind: "area", scope: "city" }, filters: withFilters(filters, { city: null }) });
  }
  return out.slice(0, MAX_LOOSEN_CANDIDATES);
}

export type RankedLoosenFix = { id: string; fix: LoosenFix; count: number; filters: SearchFilters };

/** The fixes that bring results, most results first (ties keep the candidate order). */
export function rankLoosen(candidates: readonly LoosenCandidate[], counts: readonly number[], limit = 4): RankedLoosenFix[] {
  return candidates
    .map((candidate, index) => ({ ...candidate, count: counts[index] ?? 0, index }))
    .filter((c) => c.count > 0)
    .sort((a, b) => b.count - a.count || a.index - b.index)
    .slice(0, limit)
    .map(({ id, fix, count, filters }) => ({ id, fix, count, filters }));
}
