"use server";

import { randomBytes } from "node:crypto";
import sharp from "sharp";
import { z } from "zod";
import { fail, ok, type ActionResult } from "@/lib/action";
import { audit } from "@/lib/audit";
import { db } from "@/lib/db";
import { validateImage } from "@/lib/images";
import { buildSearchText } from "@/lib/search-text";
import { deletePublic, isValidStorageKey, publicUrl, putPublic } from "@/lib/storage";
import { cleanLocalized, parseAliases } from "../localized";
import { citySchema, neighborhoodSchema, slugSchema } from "../schemas";
import { ContentActionError, isUniqueViolation, parseInput, runContentAction } from "../server/common";

/** Cities and neighborhoods ("content"). */

const idInput = z.object({ id: z.string().min(1).max(64) });

/** The storage key of a city photo uploaded here ("cities/<slug>-<random>.webp"), or null for other URLs. */
function uploadedPhotoKey(url: string | null | undefined): string | null {
  if (!url) return null;
  const at = url.lastIndexOf("/cities/");
  if (at === -1) return null;
  const key = decodeURIComponent(url.slice(at + 1).split(/[?#]/)[0]);
  if (!/^cities\/[a-z0-9-]+\.webp$/.test(key) || !isValidStorageKey(key)) return null;
  return publicUrl(key) === url ? key : null;
}

/** Removes a replaced or orphaned uploaded photo (best effort). */
async function removeUploadedPhoto(url: string | null | undefined): Promise<void> {
  const key = uploadedPhotoKey(url);
  if (!key) return;
  await deletePublic(key).catch((error) => console.error("[admin/cities] could not delete an old photo:", error));
}

export async function saveCity(input: unknown): Promise<ActionResult<{ id: string }>> {
  return runContentAction("content", "city", async (staff) => {
    const raw = (input ?? {}) as { id?: unknown; values?: unknown };
    const cityId = typeof raw.id === "string" && raw.id ? raw.id : null;
    const parsed = parseInput(citySchema, raw.values);
    if (!parsed.ok) return parsed.result;
    const v = parsed.data;
    const names = cleanLocalized(v.names);
    const data = {
      slug: v.slug,
      names,
      searchText: buildSearchText(names, parseAliases(v.aliases)),
      lat: v.lat,
      lng: v.lng,
      timezone: v.timezone,
      airportCode: v.airportCode || null,
      airportLat: v.airportCode ? v.airportLat : null,
      airportLng: v.airportCode ? v.airportLng : null,
      isPopular: v.isPopular,
      sortOrder: v.sortOrder,
      active: v.active,
      photoUrl: v.photoUrl || null,
    };

    try {
      if (cityId) {
        const before = await db.city.findUnique({ where: { id: cityId }, select: { id: true, slug: true, active: true, photoUrl: true } });
        if (!before) throw new ContentActionError("item_not_found", 404);
        await db.city.update({ where: { id: cityId }, data });
        if (before.photoUrl !== data.photoUrl) await removeUploadedPhoto(before.photoUrl);
        await audit({
          actorId: staff.id,
          action: "city.update",
          targetType: "City",
          targetId: cityId,
          details: { slug: data.slug, previousSlug: before.slug !== data.slug ? before.slug : undefined, active: data.active },
        });
        return ok({ id: cityId });
      }
      const city = await db.city.create({ data, select: { id: true } });
      await audit({ actorId: staff.id, action: "city.create", targetType: "City", targetId: city.id, details: { slug: data.slug } });
      return ok({ id: city.id });
    } catch (error) {
      if (isUniqueViolation(error)) return fail("slug_taken", { slug: ["invalid"] });
      throw error;
    }
  });
}

/** A city can only be deleted when no listing uses it; otherwise switch it off. */
export async function deleteCity(input: unknown): Promise<ActionResult> {
  return runContentAction("content", "city", async (staff) => {
    const parsed = idInput.safeParse(input);
    if (!parsed.success) return fail("invalid_input");
    const city = await db.city.findUnique({
      where: { id: parsed.data.id },
      select: { id: true, slug: true, photoUrl: true, _count: { select: { listings: true } } },
    });
    if (!city) throw new ContentActionError("item_not_found", 404);
    if (city._count.listings > 0) throw new ContentActionError("city_in_use");
    await db.city.delete({ where: { id: city.id } });
    await removeUploadedPhoto(city.photoUrl);
    await audit({ actorId: staff.id, action: "city.delete", targetType: "City", targetId: city.id, details: { slug: city.slug } });
    return ok();
  });
}

export async function saveNeighborhood(input: unknown): Promise<ActionResult<{ id: string }>> {
  return runContentAction("content", "neighborhood", async (staff) => {
    const raw = (input ?? {}) as { id?: unknown; values?: unknown };
    const hoodId = typeof raw.id === "string" && raw.id ? raw.id : null;
    const parsed = parseInput(neighborhoodSchema, raw.values);
    if (!parsed.ok) return parsed.result;
    const v = parsed.data;
    const city = await db.city.findUnique({ where: { id: v.cityId }, select: { id: true } });
    if (!city) throw new ContentActionError("item_not_found", 404);
    const names = cleanLocalized(v.names);
    const data = {
      slug: v.slug,
      names,
      searchText: buildSearchText(names, parseAliases(v.aliases)),
      lat: v.lat,
      lng: v.lng,
      sortOrder: v.sortOrder,
      active: v.active,
    };
    try {
      if (hoodId) {
        const before = await db.neighborhood.findFirst({ where: { id: hoodId, cityId: city.id }, select: { id: true } });
        if (!before) throw new ContentActionError("item_not_found", 404);
        await db.neighborhood.update({ where: { id: hoodId }, data });
        await audit({ actorId: staff.id, action: "neighborhood.update", targetType: "Neighborhood", targetId: hoodId, details: { cityId: city.id, slug: data.slug } });
        return ok({ id: hoodId });
      }
      const hood = await db.neighborhood.create({ data: { ...data, cityId: city.id }, select: { id: true } });
      await audit({ actorId: staff.id, action: "neighborhood.create", targetType: "Neighborhood", targetId: hood.id, details: { cityId: city.id, slug: data.slug } });
      return ok({ id: hood.id });
    } catch (error) {
      if (isUniqueViolation(error)) return fail("slug_taken", { slug: ["invalid"] });
      throw error;
    }
  });
}

export async function deleteNeighborhood(input: unknown): Promise<ActionResult> {
  return runContentAction("content", "neighborhood", async (staff) => {
    const parsed = idInput.safeParse(input);
    if (!parsed.success) return fail("invalid_input");
    const hood = await db.neighborhood.findUnique({
      where: { id: parsed.data.id },
      select: { id: true, slug: true, cityId: true, _count: { select: { listings: true } } },
    });
    if (!hood) throw new ContentActionError("item_not_found", 404);
    if (hood._count.listings > 0) throw new ContentActionError("neighborhood_in_use");
    await db.neighborhood.delete({ where: { id: hood.id } });
    await audit({ actorId: staff.id, action: "neighborhood.delete", targetType: "Neighborhood", targetId: hood.id, details: { cityId: hood.cityId, slug: hood.slug } });
    return ok();
  });
}

const CITY_PHOTO_MAX_BYTES = 8 * 1024 * 1024;
const CITY_PHOTO_WIDTH = 1600;

/**
 * City cover photo: re-encoded to WebP (max 1600 px wide, metadata removed) and stored as a
 * public file "cities/<slug>-<random>.webp" (a new name each time, because public files are
 * cached for a year). Returns the URL; the editor saves it with the city.
 */
export async function uploadCityPhoto(formData: FormData): Promise<ActionResult<{ url: string }>> {
  return runContentAction(
    "content",
    "city_photo",
    async (staff) => {
      const file = formData.get("file");
      const slug = slugSchema.safeParse(formData.get("slug") ?? "");
      if (!(file instanceof File) || !slug.success) return fail("invalid_input");
      const buffer = Buffer.from(await file.arrayBuffer());
      await validateImage(buffer, { maxBytes: CITY_PHOTO_MAX_BYTES, minShortSide: 400 });
      const webp = await sharp(buffer, { limitInputPixels: 100_000_000 })
        .rotate()
        .resize({ width: CITY_PHOTO_WIDTH, height: CITY_PHOTO_WIDTH, fit: "inside", withoutEnlargement: true })
        .toColourspace("srgb")
        .webp({ quality: 80 })
        .toBuffer();
      const key = `cities/${slug.data}-${randomBytes(4).toString("hex")}.webp`;
      const { url } = await putPublic(key, webp, "image/webp");
      await audit({ actorId: staff.id, action: "city.photo_upload", targetType: "City", targetId: slug.data, details: { key, bytes: webp.length } });
      return ok({ url });
    },
    { limit: 20, windowSeconds: 60 },
  );
}
