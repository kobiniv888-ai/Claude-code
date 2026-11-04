/**
 * Audit log presentation helpers (pure, client-safe).
 */

/** Where the target of an audit entry is shown in the admin panel (null = no page). */
export function auditTargetHref(targetType: string | null | undefined, targetId: string | null | undefined): string | null {
  if (!targetType || !targetId) return null;
  const id = encodeURIComponent(targetId);
  switch (targetType) {
    case "Listing":
      return `/admin/moderation/${id}`;
    case "User":
      return `/admin/users/${id}`;
    case "Report":
      return `/admin/reports/${id}`;
    case "VerificationRequest":
      return `/admin/verifications/${id}`;
    case "Ticket":
      return `/admin/tickets/${id}`;
    // Round 3, phase 3.
    case "Booking":
      return `/admin/bookings/${id}`;
    case "ReferencePrice":
      return `/admin/reference-prices/${id}`;
    case "EmailOutbox":
      return `/admin/outbox/${id}`;
    default:
      return null;
  }
}

/** "listing.request_changes" → "actions.listing_request_changes" (admin.audit.actions.*). */
export function auditActionKey(action: string): string {
  return `actions.${action.replace(/[^a-z0-9_]/gi, "_")}`;
}
