"use server";

import { z } from "zod";
import { ok, fail, toActionError, type ActionResult } from "@/lib/action";
import { requireUserForAction } from "@/lib/auth/session";
import { db } from "@/lib/db";
import { assertRateLimit } from "@/lib/rate-limit";
import { getSettings } from "@/lib/settings";
import { PLEDGE_CURRENT_VERSION, pledgeStatus, type PledgeStatus } from "./pledge";

const acceptSchema = z.object({
  /** The version whose text the host read (must be the current one). */
  version: z.number().int().min(1).max(1000),
  accepted: z.literal(true),
});

/**
 * The signed-in user accepts the welcome pledge they were shown. Records the version and the
 * time on the user (a user's own action — not audited). Fails with "pledge_outdated" when the
 * text changed meanwhile (the page reloads and shows the new wording).
 */
export async function acceptPledge(input: { version: number; accepted: boolean }): Promise<ActionResult<PledgeStatus>> {
  try {
    const user = await requireUserForAction();
    const parsed = acceptSchema.safeParse(input);
    if (!parsed.success) return fail("invalid_input", z.flattenError(parsed.error).fieldErrors);
    await assertRateLimit(`pledge:${user.id}`, { limit: 10, windowSeconds: 3600 });
    if (parsed.data.version !== PLEDGE_CURRENT_VERSION) return fail("pledge_outdated");

    const row = await db.user.update({
      where: { id: user.id },
      data: { welcomePledgeVersion: PLEDGE_CURRENT_VERSION, welcomePledgeAcceptedAt: new Date() },
      select: { welcomePledgeVersion: true, welcomePledgeAcceptedAt: true },
    });
    return ok(pledgeStatus(row, await getSettings()));
  } catch (error) {
    return toActionError(error);
  }
}
