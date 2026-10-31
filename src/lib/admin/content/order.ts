/** Ordering helpers for the up / down buttons (pure). */

/** Moves the item at `index` by `delta` places; returns the same array when it cannot move. */
export function moveItem<T>(list: readonly T[], index: number, delta: number): T[] {
  const target = index + delta;
  if (index < 0 || index >= list.length || target < 0 || target >= list.length || delta === 0) return list as T[];
  const next = [...list];
  const [item] = next.splice(index, 1);
  next.splice(target, 0, item);
  return next;
}
