"use server";

import { z } from "zod";
import { ok, type ActionResult } from "@/lib/action";
import { auditOrThrow } from "@/lib/audit";
import { runStaffAction } from "@/lib/admin/server/common";
import { siteConfig } from "@/config/site";
import { resetSmsBudgetNow, resumeSmsCountryNow, smsControlState, type SmsControlState } from "./sms-guard";

/**
 * The founder's SMS controls (SECURITY_REPORT 3.2.c, 3.2.d): ADMIN only (the "settings"
 * permission), the staff session with 2-step login, a fresh authenticator code (spent by the
 * change), rate-limited, and AUDITED — the change stops when its audit row cannot be written. The
 * founder alerts for a paused country or a used-up budget link here (/admin/maintenance#sms).
 */

const countrySchema = z.object({ country: z.enum(siteConfig.phone.smsAllowedCountries as unknown as [string, ...string[]]) });

/** Ends a country's code-text pause now (Israel or Georgia). */
export async function resumeSmsCountryAction(input: unknown): Promise<ActionResult<SmsControlState>> {
  return runStaffAction(
    "settings",
    "sms.controls.resume",
    async (staff) => {
      const parsed = countrySchema.safeParse(input);
      if (!parsed.success) return { ok: false, error: "invalid_input" };
      // The audit row first: no row, no change (SECURITY_REPORT 12.6.d).
      await auditOrThrow({ actorId: staff.id, action: "sms.country_resumed", targetType: "SmsCountry", targetId: parsed.data.country });
      await resumeSmsCountryNow(parsed.data.country);
      return ok(await smsControlState());
    },
    { limit: { limit: 10, windowSeconds: 3600 }, freshProof: "consume" },
  );
}

/** Starts today's code-text budget again from 0. */
export async function resetSmsBudgetAction(): Promise<ActionResult<SmsControlState>> {
  return runStaffAction(
    "settings",
    "sms.controls.budget",
    async (staff) => {
      await auditOrThrow({ actorId: staff.id, action: "sms.budget_reset", targetType: "SmsBudget", targetId: "codes" });
      await resetSmsBudgetNow();
      return ok(await smsControlState());
    },
    { limit: { limit: 5, windowSeconds: 3600 }, freshProof: "consume" },
  );
}
