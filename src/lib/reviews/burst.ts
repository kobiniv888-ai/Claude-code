/**
 * Review bursts (SECURITY_REPORT 14.5.b): a listing that gets many reviews in a short time is
 * worth a look by staff (friends' or bought stays reviewed together). Pure, unit-tested; the
 * check that counts and flags is ./burst-server.ts, run after each new review.
 *
 * Every review already needs a finished stay of its own booking (./rules.ts), so a burst is rare
 * on an honest listing: the flag never hides anything, it only puts a report in Admin → Reports.
 */

/** This many reviews of one listing… */
export const REVIEW_BURST_COUNT = 5;
/** …within this many hours is a burst. */
export const REVIEW_BURST_HOURS = 24;

/** True when `count` reviews in the last REVIEW_BURST_HOURS are a burst. */
export function isReviewBurst(count: number): boolean {
  return count >= REVIEW_BURST_COUNT;
}

/** The automatic report's note for staff (codes only). */
export function reviewBurstNote(count: number): string {
  return `auto · review_burst · count=${count} · hours=${REVIEW_BURST_HOURS}`;
}
