"use server";

import { z } from "zod";
import { fail, ok, type ActionResult } from "@/lib/action";
import { audit, auditOrThrow } from "@/lib/audit";
import { db } from "@/lib/db";
import { monthToDate, referenceFieldErrors, referencePriceSchema, sourceMonthProblem } from "../reference-prices";
import { AdminActionError, runStaffAction } from "../server/common";

/**
 * Admin → Reference prices ("moderation": ADMIN or MODERATOR). Add, edit, deactivate and turn
 * back on; never deleted (the phase-4 guide may have shown a row). Every change is audited with
 * the values it saved.
 */

const LIMIT = { limit: 60, windowSeconds: 60 };
const idSchema = z.string().trim().min(1).max(64);

export async function saveReferencePriceAction(input: unknown): Promise<ActionResult<{ id: string; created: boolean }>> {
  return runStaffAction<{ id: string; created: boolean }>(
    "moderation",
    "reference_price.save",
    async (staff) => {
      const raw = (input && typeof input === "object" ? input : {}) as Record<string, unknown>;
      const id = raw.id === undefined || raw.id === null || raw.id === "" ? null : idSchema.safeParse(raw.id);
      if (id && !id.success) return fail("invalid_input");
      const parsed = referencePriceSchema.safeParse(raw.values);
      if (!parsed.success) return fail("invalid_input", referenceFieldErrors(parsed.error));
      const value = parsed.data;
      const city = await db.city.findUnique({ where: { id: value.cityId }, select: { id: true, countryCode: true } });
      if (!city) return fail("invalid_input", { cityId: ["required"] });
      // The month in the city's own time zone.
      const monthProblem = sourceMonthProblem(value.sourceMonth, new Date(), city.countryCode);
      if (monthProblem) return fail("invalid_input", { sourceMonth: [monthProblem] });
      if (value.neighborhoodId) {
        const neighborhood = await db.neighborhood.findUnique({ where: { id: value.neighborhoodId }, select: { cityId: true } });
        if (!neighborhood || neighborhood.cityId !== city.id) return fail("invalid_input", { neighborhoodId: ["neighborhood_mismatch"] });
      }

      const data = {
        countryCode: city.countryCode,
        cityId: city.id,
        neighborhoodId: value.neighborhoodId,
        dealType: value.dealType,
        propertyType: value.propertyType,
        bedrooms: value.bedrooms,
        unit: value.unit,
        perSqm: value.perSqm,
        low: value.low,
        high: value.high,
        currency: value.currency,
        sourceName: value.sourceName,
        sourceUrl: value.sourceUrl,
        sourceMonth: monthToDate(value.sourceMonth),
        note: value.note,
      };
      const details = { ...value };

      if (id?.success) {
        const existing = await db.referencePrice.findUnique({ where: { id: id.data }, select: { id: true } });
        if (!existing) throw new AdminActionError("reference_price_not_found", 404);
        await db.referencePrice.update({ where: { id: existing.id }, data });
        await audit({ actorId: staff.id, action: "reference_price.update", targetType: "ReferencePrice", targetId: existing.id, details });
        return ok({ id: existing.id, created: false });
      }
      const created = await db.referencePrice.create({ data: { ...data, createdById: staff.id }, select: { id: true } });
      await audit({ actorId: staff.id, action: "reference_price.create", targetType: "ReferencePrice", targetId: created.id, details });
      return ok({ id: created.id, created: true });
    },
    LIMIT,
  );
}

export async function setReferencePriceActiveAction(input: unknown): Promise<ActionResult<{ active: boolean }>> {
  return runStaffAction<{ active: boolean }>(
    "moderation",
    "reference_price.active",
    async (staff) => {
      const parsed = z.object({ id: idSchema, active: z.boolean() }).safeParse(input);
      if (!parsed.success) return fail("invalid_input");
      const row = await db.referencePrice.findUnique({ where: { id: parsed.data.id }, select: { id: true, active: true } });
      if (!row) throw new AdminActionError("reference_price_not_found", 404);
      if (row.active === parsed.data.active) return ok({ active: row.active });
      // Q13: the change and its audit row commit together, or not at all.
      await db.$transaction(async (tx) => {
        await tx.referencePrice.update({ where: { id: row.id }, data: { active: parsed.data.active } });
        await auditOrThrow(
          {
            actorId: staff.id,
            action: parsed.data.active ? "reference_price.reactivate" : "reference_price.deactivate",
            targetType: "ReferencePrice",
            targetId: row.id,
          },
          tx,
        );
      });
      return ok({ active: parsed.data.active });
    },
    LIMIT,
  );
}
