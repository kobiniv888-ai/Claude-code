/**
 * Numbered pagination (pure): which page numbers to show around the current one.
 *
 *   paginationItems(6, 20) → [1, "gap", 5, 6, 7, "gap", 20]
 *   paginationItems(2, 4)  → [1, 2, 3, 4]
 *
 * Always shows the first and last page; a gap that would hide a single page shows that page
 * instead (no "1 … 3").
 */
export type PaginationItem = number | "gap";

export function paginationItems(page: number, pageCount: number, siblings = 1): PaginationItem[] {
  const count = Math.max(1, Math.trunc(pageCount));
  const current = Math.min(Math.max(1, Math.trunc(page)), count);
  const around = Math.max(0, Math.trunc(siblings));
  // first + last + current + siblings on both sides + two gaps
  const slots = 2 * around + 5;
  if (count <= slots) return Array.from({ length: count }, (_, i) => i + 1);

  let start = Math.max(2, current - around);
  let end = Math.min(count - 1, current + around);
  // Keep the same number of items near the edges.
  if (current - around <= 3) {
    start = 2;
    end = Math.max(end, 2 + 2 * around + 1);
  }
  if (current + around >= count - 2) {
    end = count - 1;
    start = Math.min(start, count - 1 - (2 * around + 1));
  }

  const items: PaginationItem[] = [1];
  if (start > 2) items.push("gap");
  for (let p = start; p <= end; p++) items.push(p);
  if (end < count - 1) items.push("gap");
  items.push(count);
  return items;
}
