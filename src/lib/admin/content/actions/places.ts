"use server";

import { z } from "zod";
import { Prisma } from "@/generated/prisma/client";
import { fail, ok, type ActionResult } from "@/lib/action";
import { audit } from "@/lib/audit";
import { db } from "@/lib/db";
import { recomputeProximityNear } from "@/lib/nearby";
import { cleanLocalized, cleanLocalizedOrNull } from "../localized";
import { placeSchema } from "../schemas";
import { ContentActionError, parseInput, runContentAction } from "../server/common";

/**
 * Jewish Life places ("content"). After every change the walking times of listings near the
 * old and the new position are recomputed (only verified, non-demo places count: a new or
 * cleared verification date adds or removes walking times on nearby real listings).
 */

/** Same calendar day (the form sends a date; keep who verified it unless the date changes). */
function sameDay(a: Date | null, b: Date | null): boolean {
  return a === b || (a !== null && b !== null && a.toISOString().slice(0, 10) === b.toISOString().slice(0, 10));
}

async function recompute(points: { lat: number; lng: number }[]): Promise<number> {
  let updated = 0;
  const seen = new Set<string>();
  for (const p of points) {
    const key = `${p.lat.toFixed(5)},${p.lng.toFixed(5)}`;
    if (seen.has(key)) continue;
    seen.add(key);
    try {
      updated += await recomputeProximityNear(p.lat, p.lng);
    } catch (error) {
      // The place is saved; walking times catch up on the next listing edit or recompute.
      console.error("[admin/places] could not recompute walking times:", error);
    }
  }
  return updated;
}

export async function savePlace(input: unknown): Promise<ActionResult<{ id: string; listingsUpdated: number }>> {
  return runContentAction("content", "place", async (staff) => {
    const raw = (input ?? {}) as { id?: unknown; values?: unknown };
    const placeId = typeof raw.id === "string" && raw.id ? raw.id : null;
    const parsed = parseInput(placeSchema, raw.values);
    if (!parsed.ok) return parsed.result;
    const v = parsed.data;
    if (v.cityId) {
      const city = await db.city.findUnique({ where: { id: v.cityId }, select: { id: true } });
      if (!city) return fail("invalid_input", { cityId: ["invalid"] });
    }
    const data = {
      type: v.type,
      names: cleanLocalized(v.names),
      description: cleanLocalizedOrNull(v.description) ?? undefined,
      address: cleanLocalizedOrNull(v.address) ?? undefined,
      hours: cleanLocalizedOrNull(v.hours) ?? undefined,
      cityId: v.cityId || null,
      lat: v.lat,
      lng: v.lng,
      phone: v.phone || null,
      website: v.website || null,
      active: v.active,
      isDemo: v.isDemo,
      verifiedAt: v.verifiedAt,
      source: v.source || null,
    };

    if (placeId) {
      const before = await db.jewishPlace.findUnique({
        where: { id: placeId },
        select: { id: true, lat: true, lng: true, active: true, verifiedAt: true, verifiedById: true },
      });
      if (!before) throw new ContentActionError("item_not_found", 404);
      const verifiedChanged = !sameDay(before.verifiedAt, data.verifiedAt);
      await db.jewishPlace.update({
        where: { id: placeId },
        data: {
          ...data,
          verifiedById: !data.verifiedAt ? null : verifiedChanged ? staff.id : before.verifiedById,
          // Cleared optional texts become database NULL.
          description: data.description ?? Prisma.DbNull,
          address: data.address ?? Prisma.DbNull,
          hours: data.hours ?? Prisma.DbNull,
        },
      });
      const listingsUpdated = await recompute([before, data]);
      await audit({
        actorId: staff.id,
        action: "place.update",
        targetType: "JewishPlace",
        targetId: placeId,
        details: {
          type: data.type,
          moved: before.lat !== data.lat || before.lng !== data.lng,
          active: data.active,
          isDemo: data.isDemo,
          verifiedAt: data.verifiedAt?.toISOString().slice(0, 10) ?? null,
          verifiedChanged,
          listingsUpdated,
        },
      });
      return ok({ id: placeId, listingsUpdated });
    }

    const place = await db.jewishPlace.create({
      data: { ...data, createdById: staff.id, verifiedById: data.verifiedAt ? staff.id : null },
      select: { id: true },
    });
    const listingsUpdated = await recompute([data]);
    await audit({
      actorId: staff.id,
      action: "place.create",
      targetType: "JewishPlace",
      targetId: place.id,
      details: { type: data.type, isDemo: data.isDemo, verifiedAt: data.verifiedAt?.toISOString().slice(0, 10) ?? null, listingsUpdated },
    });
    return ok({ id: place.id, listingsUpdated });
  });
}

export async function deletePlace(input: unknown): Promise<ActionResult<{ listingsUpdated: number }>> {
  return runContentAction("content", "place", async (staff) => {
    const parsed = z.object({ id: z.string().min(1).max(64) }).safeParse(input);
    if (!parsed.success) return fail("invalid_input");
    const place = await db.jewishPlace.findUnique({
      where: { id: parsed.data.id },
      select: { id: true, lat: true, lng: true, type: true, names: true, isDemo: true },
    });
    if (!place) throw new ContentActionError("item_not_found", 404);
    await db.jewishPlace.delete({ where: { id: place.id } });
    const listingsUpdated = await recompute([place]);
    await audit({
      actorId: staff.id,
      action: "place.delete",
      targetType: "JewishPlace",
      targetId: place.id,
      details: { type: place.type, names: place.names, isDemo: place.isDemo, listingsUpdated },
    });
    return ok({ listingsUpdated });
  });
}
