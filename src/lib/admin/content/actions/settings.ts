"use server";

import { z } from "zod";
import type { Prisma } from "@/generated/prisma/client";
import { fail, ok, type ActionResult } from "@/lib/action";
import { audit } from "@/lib/audit";
import { db } from "@/lib/db";
import { removeDemoData, type DemoDataCounts } from "@/lib/demo";
import { EMERGENCY_CONTACTS_SETTING_KEY } from "@/lib/jewish-life/emergency";
import { settingsPatchSchema, updateSettings } from "@/lib/settings";
import { cleanLocalized } from "../localized";
import { DELETE_DEMO_CONFIRMATION, emergencyContactsInputSchema, issuesToFieldErrors } from "../schemas";
import { ContentActionError, parseInput, runContentAction } from "../server/common";

/** Site settings ("settings", ADMIN only). */

/** Any subset of the runtime settings; validated by updateSettings (which also writes the audit log). */
export async function saveSettings(input: unknown): Promise<ActionResult> {
  return runContentAction("settings", "settings", async (staff) => {
    const parsed = settingsPatchSchema.safeParse(input);
    if (!parsed.success) return fail("invalid_input", issuesToFieldErrors(parsed.error));
    await updateSettings(parsed.data, staff.id);
    return ok();
  });
}

export async function saveEmergencyContacts(input: unknown): Promise<ActionResult<{ count: number }>> {
  return runContentAction("settings", "emergency_contacts", async (staff) => {
    const parsed = parseInput(emergencyContactsInputSchema, input);
    if (!parsed.ok) return parsed.result;
    const value = parsed.data.contacts.map((c) => ({
      label: cleanLocalized(c.label),
      ...(c.phone ? { phone: c.phone } : {}),
      ...(c.url ? { url: c.url } : {}),
    })) as Prisma.InputJsonValue;
    const before = await db.siteSetting.findUnique({ where: { key: EMERGENCY_CONTACTS_SETTING_KEY }, select: { value: true } });
    await db.siteSetting.upsert({
      where: { key: EMERGENCY_CONTACTS_SETTING_KEY },
      create: { key: EMERGENCY_CONTACTS_SETTING_KEY, value, updatedById: staff.id },
      update: { value, updatedById: staff.id },
    });
    await audit({
      actorId: staff.id,
      action: "settings.update",
      targetType: "SiteSetting",
      targetId: EMERGENCY_CONTACTS_SETTING_KEY,
      details: { changes: { [EMERGENCY_CONTACTS_SETTING_KEY]: { from: before?.value ?? null, to: value } } },
    });
    return ok({ count: parsed.data.contacts.length });
  });
}

/** Permanently deletes all demo data. The admin must type DELETE DEMO. */
export async function deleteAllDemoData(input: unknown): Promise<ActionResult<DemoDataCounts>> {
  return runContentAction(
    "settings",
    "demo_remove",
    async (staff) => {
      const parsed = z.object({ confirmation: z.string().max(40) }).safeParse(input);
      if (!parsed.success) return fail("invalid_input");
      if (parsed.data.confirmation.trim() !== DELETE_DEMO_CONFIRMATION) throw new ContentActionError("confirmation_mismatch", 422);
      const removed = await removeDemoData();
      await audit({ actorId: staff.id, action: "demo.remove", targetType: "SiteSetting", targetId: "demoData", details: { removed } });
      return ok(removed);
    },
    { limit: 3, windowSeconds: 600 },
  );
}
