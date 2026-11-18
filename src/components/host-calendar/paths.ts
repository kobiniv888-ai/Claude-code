/** The host's calendar page of a listing (block dates, see bookings, iCal import/export). Pure, client-safe. */
export function hostCalendarPath(listingId: string): string {
  return `/account/listings/${encodeURIComponent(listingId)}/calendar`;
}
