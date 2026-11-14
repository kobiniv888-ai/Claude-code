"use server";

import { z } from "zod";
import { fail, ok, runAction, type ActionResult } from "@/lib/action";
import { db } from "@/lib/db";
import { assertRateLimit } from "@/lib/rate-limit";
import { safeDisplayName } from "./first-name";
import { firstNameSchema } from "./first-name-schema";
import { requireUserForAction } from "./session";

/**
 * The first-name step right after sign-up (and the same rule in the settings). An account whose
 * full name is empty, a phone or an email also gets the first name as its name, so host cards and
 * the header never show a number (bug 8.2).
 */
export async function saveFirstName(input: unknown): Promise<ActionResult<{ firstName: string }>> {
  return runAction(async () => {
    const user = await requireUserForAction();
    const parsed = firstNameSchema.safeParse(input);
    if (!parsed.success) return fail("invalid_input", z.flattenError(parsed.error).fieldErrors);
    await assertRateLimit(`auth:first-name:${user.id}`, { limit: 20, windowSeconds: 10 * 60 });
    const { firstName } = parsed.data;
    await db.user.update({
      where: { id: user.id },
      data: { firstName, ...(!safeDisplayName(user.name) && { name: firstName }) },
    });
    return ok({ firstName });
  });
}
