import "server-only";
import { recordSecurityEvent } from "./events";

/**
 * A booking, trip, shared-list, ticket, review or report link that matched nothing for this visitor
 * (SECURITY_REPORT 4.7.a): the codes are references, not keys (every lookup is scoped to the
 * account), so a guess shows nothing; a BURST of such misses from one connection is what the founder's alerts watch
 * (src/lib/security/alerts-rules.ts "id_guessing"). The kind only: never the code that was tried.
 * Never throws (recordSecurityEvent), and hashes the visitor's IP itself.
 */
export type IdKind = "trip" | "host_booking" | "list" | "ticket" | "booking_ics" | "report" | "review";

export async function recordIdMiss(kind: IdKind, userId?: string | null): Promise<void> {
  await recordSecurityEvent({ type: "id_not_found", userId: userId ?? null, meta: { kind } });
}
