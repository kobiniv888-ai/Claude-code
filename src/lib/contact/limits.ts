/**
 * "Show contact" limits (client-safe, pure).
 *
 * At most CONTACT_REVEALS_PER_DAY different listings a day per account (founder's OK to Q14,
 * SECURITY_REPORT 4.6.e): a person comparing places stays far below it; collecting hosts' phone
 * numbers does not. Showing the same listing again the same day does not count again. Enforced in
 * revealContact (./actions.ts) on the server, failing closed when the limit store cannot be read.
 */
export const CONTACT_REVEALS_PER_DAY = 40;
