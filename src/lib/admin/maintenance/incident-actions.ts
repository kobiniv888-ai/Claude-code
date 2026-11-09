"use server";

import { z } from "zod";
import { ok, fail, type ActionResult } from "@/lib/action";
import { runStaffAction } from "../server/common";
import { endEverySessionExcept, switchMaintenance } from "./incident";
import { canUseIncidentTools } from "./incident-rules";

/**
 * The incident tools of Admin → Maintenance (SECURITY_REPORT 12.5.c, 17.1 "contain"). ADMIN only
 * (the "settings" permission and canUseIncidentTools), each one after a FRESH authenticator code
 * (consumed: one code, one action), its audit row written with auditOrThrow in the same
 * transaction as the change (./incident.ts), and a security event for the founder's alerts.
 */

const modeInput = z.object({ on: z.boolean(), confirm: z.literal(true) }).strict();
const confirmInput = z.object({ confirm: z.literal(true) }).strict();

/** Maintenance mode on or off (the stored switch; MAINTENANCE_MODE at the hosting is separate). */
export async function setMaintenanceModeAction(input: unknown): Promise<ActionResult<{ on: boolean }>> {
  return runStaffAction(
    "settings",
    "maintenance.mode",
    async (staff) => {
      const parsed = modeInput.safeParse(input);
      if (!parsed.success) return fail("invalid_input");
      const value = await switchMaintenance(staff.id, parsed.data.on);
      return ok({ on: value.on });
    },
    { limit: { limit: 20, windowSeconds: 3600 }, freshProof: "consume", allow: (staff) => canUseIncidentTools(staff.role) },
  );
}

/**
 * "Sign everyone out": every session of every account (staff included) on every device ends,
 * except the caller's own. Remembered devices, calendar links and share links are not sessions and
 * stay (INCIDENT_PLAN.md says how to replace those).
 */
export async function endAllSessionsAction(input: unknown): Promise<ActionResult<{ sessions: number }>> {
  return runStaffAction(
    "settings",
    "sessions.end_all",
    async (staff) => {
      const parsed = confirmInput.safeParse(input);
      if (!parsed.success) return fail("invalid_input");
      return ok({ sessions: await endEverySessionExcept(staff.id, staff.sessionId) });
    },
    { limit: { limit: 5, windowSeconds: 3600 }, freshProof: "consume", allow: (staff) => canUseIncidentTools(staff.role) },
  );
}
