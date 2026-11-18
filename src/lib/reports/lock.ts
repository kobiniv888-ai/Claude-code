import "server-only";
import type { Prisma } from "@/generated/prisma/client";

/**
 * Serialises one reporter's report submits: a second submit waits here until the first one's
 * transaction ends, then sees its report. There is no database constraint for "one open report
 * per target" (a report can be decided and a new one sent), so the check and the insert must not
 * interleave. FOR NO KEY UPDATE: it waits only for another lockReporter, not for rows elsewhere
 * that merely reference the user (their foreign-key checks take a key-share lock). Used by
 * createReport (./actions.ts) and createScamReport (./scam-actions.ts, S2 review TS-9).
 */
export async function lockReporter(tx: Prisma.TransactionClient, userId: string): Promise<void> {
  await tx.$queryRaw`SELECT "id" FROM "User" WHERE "id" = ${userId} FOR NO KEY UPDATE`;
}
