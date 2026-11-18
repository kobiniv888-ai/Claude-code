/**
 * How Bayit checks hosts (founder's answer 5, round 3: option (b)). Pure, client-safe.
 *
 * No ID, ownership or business documents for now. Trust comes from the verified phone number and,
 * later, the "ביקרנו במקום" (we visited) badge. Until a paid ID service is added:
 * - the "ID verified", "Owner verified", "Property verified" and "Business verified" badges are
 *   hidden everywhere (cards, listing page, host card, owner page, account, comparison, filters);
 * - the verification page offers only the phone check and explains why;
 * - new document requests and uploads are refused on the server;
 * - the admin panel keeps the old decisions, read-only, and cannot approve new ones;
 * - stored ID and selfie files are deleted by the clean-up "verification-files" (Admin →
 *   Maintenance), after a full backup.
 *
 * The data (User.idVerifiedAt, Listing.ownerVerifiedAt, …) is kept, so turning `documentChecks`
 * back on with a paid service restores the badges without a migration.
 */
export const verificationConfig = {
  documentChecks: false,
} as const;

/** Are document checks (ID, ownership, business registration) offered and shown? */
export function documentChecksOn(): boolean {
  return verificationConfig.documentChecks;
}

/** Show a badge that came from a document check? Only while document checks are on. */
export function showsDocumentBadge(verifiedAt: Date | string | null | undefined): boolean {
  return documentChecksOn() && !!verifiedAt;
}
