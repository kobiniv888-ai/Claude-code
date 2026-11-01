/**
 * When the phone header hides and comes back (header-shell.tsx). Pure, unit-tested in
 * header-scroll.test.ts.
 */

/** Scrolled at least this far before the header may hide (it always shows near the top). */
export const HIDE_AFTER_PX = 96;
/** Ignore tiny scroll jitters (momentum, address-bar resizes). */
export const MIN_DELTA_PX = 6;

export type HeaderScrollInput = {
  /** window.scrollY now (negative overscroll counts as 0). */
  y: number;
  /** The scroll position the last decision was made at. */
  lastY: number;
  /** Phone or tablet layout (< 1024px): the only place the header hides. */
  compact: boolean;
  reducedMotion: boolean;
  /** A dialog, sheet or the menu has locked the page. */
  locked: boolean;
};

/**
 * Returns whether the header should be hidden (`null` = leave it as it is) and the position to
 * measure the next scroll from.
 */
export function headerScrollStep({ y, lastY, compact, reducedMotion, locked }: HeaderScrollInput): {
  hidden: boolean | null;
  lastY: number;
} {
  const top = Math.max(0, y);
  if (locked) return { hidden: null, lastY: top };
  if (!compact || reducedMotion || top < HIDE_AFTER_PX) return { hidden: false, lastY: top };
  const delta = top - lastY;
  if (Math.abs(delta) < MIN_DELTA_PX) return { hidden: null, lastY };
  return { hidden: delta > 0, lastY: top };
}
