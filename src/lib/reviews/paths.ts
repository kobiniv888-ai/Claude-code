/** Review pages (pure, client-safe; site paths without the locale prefix). */

/** "ביקורות" in the account: reviews of the host's places and the guest's own. */
export const REVIEWS_PATH = "/account/reviews";

/** The form for one booking ("BT-7K3Q9"); `rating` pre-selects the stars tapped on the trip page. */
export function writeReviewPath(bookingCode: string, rating?: number | null): string {
  const base = `${REVIEWS_PATH}/write/${encodeURIComponent(bookingCode)}`;
  return rating ? `${base}?rating=${rating}` : base;
}

/** One review in the account page (the host replies or reports there). */
export function accountReviewPath(reviewId: string): string {
  return `${REVIEWS_PATH}#review-${reviewId}`;
}

/** The anchor of the reviews section on a listing page. */
export const LISTING_REVIEWS_ANCHOR = "reviews";
