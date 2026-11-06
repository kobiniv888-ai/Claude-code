"use server";

import { getLocale } from "next-intl/server";
import { z } from "zod";
import type { Prisma } from "@/generated/prisma/client";
import { locales, siteConfig, type AppLocale, type Localized } from "@/config/site";
import { isAppLocale } from "@/i18n/locale";
import { absoluteUrl } from "@/lib/site-url";
import { fail, ok, toActionError, type ActionResult } from "@/lib/action";
import { requireUserForAction, type CurrentUser } from "@/lib/auth/session";
import { getRates } from "@/lib/currency";
import { toUsd } from "@/lib/currency/convert";
import { db } from "@/lib/db";
import { NotFoundError } from "@/lib/errors";
import { removeListingPhotoFiles } from "@/lib/images";
import { computeShabbatFriendly } from "@/lib/listing/fields";
import { getListingMistakes } from "@/lib/listing/mistake-check-server";
import {
  holdLiveListingForReview,
  prepareListingDerivedFields,
  publicMapPoint,
  recheckLiveListingAfterEdit,
  recheckLiveListingAfterPriceChange,
  recordPriceChange,
  submitForPublication,
} from "@/lib/listing/lifecycle";
import { getCityById, getNeighborhoods } from "@/lib/places";
import { assertRateLimit } from "@/lib/rate-limit";
import { detectContactInfo, hasContactInfo } from "@/lib/risk/contact-info";
import { scanText } from "@/lib/risk/scan";
import { assertNotShabbatMode } from "@/lib/settings";
import { stripTitleEmoji } from "@/lib/text/emoji";
import { isTranslationEnabled, scheduleListingTranslation, translateListing } from "@/lib/translate";
import { assertTurnstile } from "@/lib/turnstile";
import { normalizeRanges } from "./availability";
import { getPledgeStatus, hasCurrentPledge } from "@/lib/pledge/server";
import { getHostCalendar, HOST_CALENDAR_MONTHS, type HostCalendarData } from "@/lib/booking/host-calendar";
import { missingRequirements } from "./requirements";
import { presentStepKeys } from "./patch";
import { buildStepUpdate, type StepUpdate, type StepUpdateDeps } from "./step-update";
import {
  availabilitySchema,
  photoAltSchema,
  photoIdsSchema,
  photoRoomSchema,
  roomTypeSchema,
  stepSaveSchemas,
  translationSchema,
  type ParsedStep,
} from "./schemas";
import {
  dayString,
  loadWizardAnswers,
  nonApplicableResets,
  parseContactMethods,
  publicPathFor,
  requireOwnedListing,
  toWizardPhoto,
  toWizardValues,
  verifyEditToken,
  type ListingRow,
} from "./server";
import { isBusinessListing, isSavableStep, stepsFor, type ListingKind, type SavableStepKey } from "./steps";
import type { DayRange, PublishOutcome, WizardRoomType, WizardSnapshot, WizardTranslation } from "./types";

/*
 * Server actions of the post-a-listing wizard. Every action: signed-in user with a verified
 * phone, ownership (where: { id, ownerId }), zod validation, a rate limit, and posting is
 * paused in Shabbat mode. Results are ActionResult; error codes have messages in
 * messages/<locale>/wizard.json (errors.*) or the shared "errors" namespace.
 */

const SAVE_LIMIT = { limit: 120, windowSeconds: 600 };
const CREATE_LIMIT = { limit: 10, windowSeconds: 3600 };
const PUBLISH_LIMIT = { limit: 20, windowSeconds: 3600 };
const TRANSLATE_LIMIT = { limit: 15, windowSeconds: 3600 };
/** Reads: every mount of the form and every opening of the calendar sheet. */
const LOAD_LIMIT = { limit: 300, windowSeconds: 600 };
const CALENDAR_LIMIT = { limit: 60, windowSeconds: 600 };

const listingIdSchema = z.string().trim().min(1).max(64);

async function ownerForMutation(rateKey: string, limit = SAVE_LIMIT): Promise<CurrentUser> {
  const user = await requireUserForAction({ phoneVerified: true });
  await assertRateLimit(`wizard:${rateKey}:${user.id}`, limit);
  await assertNotShabbatMode();
  return user;
}

function kindOf(listing: Pick<ListingRow, "dealType" | "propertyType">): ListingKind {
  return { dealType: listing.dealType, propertyType: listing.propertyType };
}

/*
 * No revalidatePath() here: every page that shows an owner's listing is rendered per request,
 * and revalidating from a wizard action re-renders the wizard page itself (the post route then
 * redirects a just-published listing to the edit route and the result screen is lost).
 */

// ─── Create ───────────────────────────────────────────────────

/** Creates an empty DRAFT owned by the current user. The page then opens /post/<id>?step=1. */
export async function createDraft(): Promise<ActionResult<{ id: string }>> {
  try {
    const user = await ownerForMutation("create", CREATE_LIMIT);
    const locale = await getLocale();
    const openDrafts = await db.listing.count({ where: { ownerId: user.id, status: "DRAFT", deletedAt: null } });
    if (openDrafts >= 20) return fail("too_many_drafts");
    const listing = await db.listing.create({
      data: {
        ownerId: user.id,
        status: "DRAFT",
        wizardStep: 1,
        originalLocale: isAppLocale(locale) ? locale : siteConfig.i18n.primaryLocale,
        currency: user.currency && user.currency !== "GBP" && user.currency !== "AED" ? user.currency : "USD",
        noReplyOnShabbat: user.keepsShabbat,
      },
      select: { id: true },
    });
    return ok({ id: listing.id });
  } catch (error) {
    return toActionError(error);
  }
}

/** Soft-deletes one of the user's drafts (the "Continue your draft" cards). */
export async function deleteDraft(listingId: string): Promise<ActionResult> {
  try {
    const user = await requireUserForAction();
    await assertRateLimit(`wizard:save:${user.id}`, SAVE_LIMIT);
    const id = listingIdSchema.parse(listingId);
    const { count } = await db.listing.updateMany({
      where: { id, ownerId: user.id, status: "DRAFT" },
      data: { status: "DELETED", deletedAt: new Date() },
    });
    if (count === 0) throw new NotFoundError();
    return ok();
  } catch (error) {
    return toActionError(error);
  }
}

// ─── Save one step ────────────────────────────────────────────

/** Database lookups for buildStepUpdate (./step-update.ts, pure and unit-tested). */
const stepUpdateDeps: StepUpdateDeps = {
  getCity: (id) => getCityById(id),
  getNeighborhoodIds: async (cityId) => (await getNeighborhoods(cityId)).map((n) => n.id),
  getRates: () => getRates(),
  mapPoint: (point, listingId) => publicMapPoint(point, listingId),
  parseContactMethods,
};

/**
 * Auto-save (bug 2.2: patch saves). `data` holds only the answers the person changed since the
 * last save (see ./patch.ts); keys that are not sent are never written. They are validated with
 * the step's schema picked to those keys (types and limits — required fields are checked on Next in
 * the browser and on publish here). `data` may be empty: then only the step the owner is on is
 * remembered (`options.wizardStep`, drafts only).
 */
export async function updateDraft(
  listingId: string,
  step: string,
  data: unknown,
  options: { wizardStep?: number } = {},
): Promise<ActionResult<{ savedAt: string; updatedAt: string }>> {
  try {
    const user = await ownerForMutation("save");
    const id = listingIdSchema.parse(listingId);
    if (!isSavableStep(step)) return fail("invalid_input");
    if (data !== undefined && data !== null && (typeof data !== "object" || Array.isArray(data))) return fail("invalid_input");
    const keys = presentStepKeys(step, data);
    const mask = Object.fromEntries(keys.map((key) => [key, true])) as Record<string, true>;
    const schema = (stepSaveSchemas[step] as z.ZodObject<z.ZodRawShape>).pick(mask);
    const parsed = schema.safeParse(Object.fromEntries(keys.map((key) => [key, (data as Record<string, unknown>)[key]])));
    if (!parsed.success) return fail("invalid_input", z.flattenError(parsed.error).fieldErrors as Record<string, string[]>);

    const listing = await requireOwnedListing(id, user.id);
    const update = await buildStepUpdate(step, parsed.data as Partial<ParsedStep<typeof step>>, listing, user, stepUpdateDeps);
    if (update.fieldErrors) return fail("invalid_input", update.fieldErrors);

    const wizardStep = z.number().int().min(1).max(20).optional().safeParse(options.wizardStep);
    const now = new Date();
    const listingData: Prisma.ListingUpdateInput = {
      ...update.data,
      ...(wizardStep.success && wizardStep.data !== undefined && listing.status === "DRAFT" ? { wizardStep: wizardStep.data } : {}),
      ...(update.contentChanged ? { contentUpdatedAt: now } : {}),
    };
    if (Object.keys(listingData).length === 0 && !update.userUpdate) {
      return ok({ savedAt: now.toISOString(), updatedAt: listing.updatedAt.toISOString() });
    }

    const saved = await db.$transaction(async (tx) => {
      const row = await tx.listing.update({ where: { id: listing.id, ownerId: user.id }, data: listingData, select: { updatedAt: true } });
      if (update.textChanged) {
        // The original changed: machine translations are out of date (owner-edited ones stay).
        await tx.listingTranslation.deleteMany({ where: { listingId: listing.id, isAuto: true, editedByOwner: false } });
      }
      if (update.userUpdate) await tx.user.update({ where: { id: user.id }, data: update.userUpdate });
      return row;
    });

    if (update.textChanged && listing.status === "LIVE") {
      // Brief 2.4: an autosaved edit of a live listing is public at once, so its translations are
      // redone too (after the response, once the typing has settled).
      scheduleListingTranslation(listing.id, update.contentChanged ? now : null);
    }
    if (update.priceChange) {
      const { oldPrice, newPrice, currency } = update.priceChange;
      await recordPriceChange(listing.id, oldPrice, newPrice, currency);
    }
    if (listing.status === "LIVE" && (await needsImmediateRecheck(step, update, parsed.data, listing))) {
      // A live listing shows each auto-saved edit at once. New contact methods, or text with scam
      // phrases or hidden contact details, go through the automatic checks now (as "Save changes"
      // would), so they cannot stay public just because the owner never pressed that button.
      await recheckLiveListing(listing.id, user.id);
    } else if (listing.status === "LIVE" && update.priceChange) {
      // A new price is public at once too: the risk checks run again now (e.g. "far below the area").
      await recheckLivePrice(listing.id, user.id);
    }
    return ok({ savedAt: now.toISOString(), updatedAt: saved.updatedAt.toISOString() });
  } catch (error) {
    return toActionError(error);
  }
}

/** True when an auto-saved edit of a live listing must be checked right away (see updateDraft). */
async function needsImmediateRecheck(step: SavableStepKey, update: StepUpdate, input: unknown, listing: ListingRow): Promise<boolean> {
  if (!update.contentChanged) return false;
  if (step === "contact") return true;
  if (step !== "text" || !update.textChanged) return false;
  const { title, description } = input as Partial<ParsedStep<"text">>;
  return textNeedsRecheck(`${title ?? listing.title}\n${description ?? listing.description}`);
}

/** Text with hidden contact details or scam phrases: a live listing must be checked again now. */
async function textNeedsRecheck(text: string): Promise<boolean> {
  if (hasContactInfo(detectContactInfo(text))) return true;
  return (await scanText(text)).hits.length > 0;
}

/**
 * Runs the automatic checks on a live listing right away (see updateDraft), without the
 * publishing requirements (a cleared price must not switch the check off). Never throws, and
 * FAILS CLOSED: when the checks can't run, the listing waits for a person.
 */
async function recheckLiveListing(listingId: string, ownerId: string): Promise<void> {
  try {
    await recheckLiveListingAfterEdit(listingId, ownerId);
  } catch (error) {
    console.error(`[wizard] re-check of live listing ${listingId} failed, it waits for review:`, error);
    await holdLiveListingForReview(listingId, ownerId);
  }
}

/** Re-runs the risk checks after a price change of a live listing (see updateDraft); never throws, fails closed. */
async function recheckLivePrice(listingId: string, ownerId: string): Promise<void> {
  try {
    await recheckLiveListingAfterPriceChange(listingId, ownerId);
  } catch (error) {
    console.error(`[wizard] price re-check of live listing ${listingId} failed, it waits for review:`, error);
    await holdLiveListingForReview(listingId, ownerId);
  }
}

/** Remembers the step the owner is on (for steps without their own data: photos, rooms, preview). */
export async function saveWizardStep(listingId: string, wizardStep: number): Promise<ActionResult> {
  try {
    const user = await requireUserForAction({ phoneVerified: true });
    await assertRateLimit(`wizard:save:${user.id}`, SAVE_LIMIT);
    const id = listingIdSchema.parse(listingId);
    const step = z.number().int().min(1).max(20).parse(wizardStep);
    await db.listing.updateMany({ where: { id, ownerId: user.id, status: "DRAFT" }, data: { wizardStep: step } });
    return ok();
  } catch (error) {
    return toActionError(error);
  }
}

/**
 * The saved answers of one of the user's listings, as the form edits them (bug 2.2). The form calls
 * this on every mount, after the browser restores the page from its cache, and when the tab comes
 * back into view; until it answers the step is read-only and Next is disabled.
 */
export async function loadWizardSnapshot(listingId: string): Promise<ActionResult<WizardSnapshot>> {
  try {
    const user = await requireUserForAction({ phoneVerified: true });
    await assertRateLimit(`wizard:load:${user.id}`, LOAD_LIMIT);
    const listing = await requireOwnedListing(listingIdSchema.parse(listingId), user.id);
    const [answers, pledge] = await Promise.all([loadWizardAnswers(listing, user.businessName), getPledgeStatus(user.id)]);
    return ok({
      ...answers,
      user: { phoneVerified: user.phoneNumberVerified, pledge },
      serverNow: new Date().toISOString(),
    });
  } catch (error) {
    return toActionError(error);
  }
}

/**
 * The place calendar inside the form (bug 2.10: a full-screen sheet instead of another page): the
 * same data as /account/listings/<id>/calendar, for the listing's owner only.
 */
export async function loadListingCalendar(listingId: string): Promise<ActionResult<HostCalendarData & { monthCount: number }>> {
  try {
    const user = await requireUserForAction();
    await assertRateLimit(`wizard:calendar:${user.id}`, CALENDAR_LIMIT);
    const locale = await getLocale();
    const data = await getHostCalendar(user.id, listingIdSchema.parse(listingId), isAppLocale(locale) ? locale : siteConfig.i18n.primaryLocale);
    if (!data || data.listing.dealType === "SALE") throw new NotFoundError();
    return ok({ ...data, monthCount: HOST_CALENDAR_MONTHS });
  } catch (error) {
    return toActionError(error);
  }
}

// ─── Photos ───────────────────────────────────────────────────

async function photosInScope(listingId: string, roomTypeId: string | null) {
  return db.listingPhoto.findMany({
    where: { listingId, roomTypeId },
    orderBy: [{ sortOrder: "asc" }, { createdAt: "asc" }],
    select: { id: true, isCover: true, storageKey: true, roomTypeId: true },
  });
}

/** Writes sortOrder 0…n in the given order; the first main photo is the cover. */
async function writePhotoOrder(listingId: string, ids: string[], mainPhotos: boolean) {
  await db.$transaction([
    db.listingPhoto.updateMany({
      where: { listingId, roomTypeId: { not: null }, isCover: true },
      data: { isCover: false },
    }),
    ...ids.map((photoId, index) =>
      db.listingPhoto.update({
        where: { id: photoId, listingId },
        // Room-type photos are never the listing cover (the upload may have marked one).
        data: { sortOrder: index, isCover: mainPhotos && index === 0 },
      }),
    ),
  ]);
}

async function touchContent(listing: ListingRow) {
  if (listing.status !== "DRAFT") {
    await db.listing.update({ where: { id: listing.id }, data: { contentUpdatedAt: new Date() } });
  }
}

/**
 * New order of the listing's photos (or of one room type's photos). `ids` must be exactly
 * the photos in that group. The first main photo is the cover.
 */
export async function reorderPhotos(
  listingId: string,
  ids: string[],
  roomTypeId: string | null = null,
): Promise<ActionResult> {
  try {
    const user = await ownerForMutation("save");
    const listing = await requireOwnedListing(listingIdSchema.parse(listingId), user.id);
    const order = photoIdsSchema.parse(ids);
    const scope = roomTypeId === null ? null : listingIdSchema.parse(roomTypeId);
    const photos = await photosInScope(listing.id, scope);
    const known = new Set(photos.map((p) => p.id));
    if (order.length !== photos.length || new Set(order).size !== order.length || order.some((p) => !known.has(p))) {
      return fail("photos_changed");
    }
    await writePhotoOrder(listing.id, order, scope === null);
    await touchContent(listing);
    return ok();
  } catch (error) {
    return toActionError(error);
  }
}

/** Makes a photo the cover (it moves to the first place). */
export async function setCoverPhoto(listingId: string, photoId: string): Promise<ActionResult> {
  try {
    const user = await ownerForMutation("save");
    const listing = await requireOwnedListing(listingIdSchema.parse(listingId), user.id);
    const id = listingIdSchema.parse(photoId);
    const photos = await photosInScope(listing.id, null);
    if (!photos.some((p) => p.id === id)) throw new NotFoundError();
    await writePhotoOrder(listing.id, [id, ...photos.filter((p) => p.id !== id).map((p) => p.id)], true);
    await touchContent(listing);
    return ok();
  } catch (error) {
    return toActionError(error);
  }
}

/** Deletes a photo and its files. A new cover is picked when the cover is deleted. */
export async function deletePhoto(listingId: string, photoId: string): Promise<ActionResult> {
  try {
    const user = await ownerForMutation("save");
    const listing = await requireOwnedListing(listingIdSchema.parse(listingId), user.id);
    const photo = await db.listingPhoto.findFirst({
      where: { id: listingIdSchema.parse(photoId), listingId: listing.id },
      select: { id: true, storageKey: true, roomTypeId: true },
    });
    if (!photo) throw new NotFoundError();
    await db.listingPhoto.delete({ where: { id: photo.id } });
    await removeListingPhotoFiles(photo);
    const rest = await photosInScope(listing.id, photo.roomTypeId);
    if (rest.length > 0) await writePhotoOrder(listing.id, rest.map((p) => p.id), photo.roomTypeId === null);
    await touchContent(listing);
    return ok();
  } catch (error) {
    return toActionError(error);
  }
}

/** Optional photo description (alt text for screen readers). */
export async function updatePhotoAlt(listingId: string, photoId: string, alt: string): Promise<ActionResult> {
  try {
    const user = await ownerForMutation("save");
    const listing = await requireOwnedListing(listingIdSchema.parse(listingId), user.id);
    const text = photoAltSchema.parse(alt);
    const { count } = await db.listingPhoto.updateMany({
      where: { id: listingIdSchema.parse(photoId), listingId: listing.id },
      data: { alt: text || null },
    });
    if (count === 0) throw new NotFoundError();
    return ok();
  } catch (error) {
    return toActionError(error);
  }
}

/**
 * Optional room label of a photo (round 3, brief 6.1: bedroom, kitchen, bathroom…; null clears
 * it). The mistake check and the listing page's gallery (grouped by room) read it.
 */
export async function updatePhotoRoom(listingId: string, photoId: string, room: unknown): Promise<ActionResult> {
  try {
    const user = await ownerForMutation("save");
    const listing = await requireOwnedListing(listingIdSchema.parse(listingId), user.id);
    const parsed = photoRoomSchema.safeParse(room);
    if (!parsed.success) return fail("invalid_input");
    const { count } = await db.listingPhoto.updateMany({
      where: { id: listingIdSchema.parse(photoId), listingId: listing.id },
      data: { room: parsed.data },
    });
    if (count === 0) throw new NotFoundError();
    return ok();
  } catch (error) {
    return toActionError(error);
  }
}

// ─── Room types (hotels, guesthouses, hostels) ────────────────

function sameNameInEveryLanguage(name: string): Localized {
  return Object.fromEntries(locales.map((l) => [l, name])) as Localized;
}

/** Creates or updates a room type. The name is copied into all 5 languages until translated. */
export async function saveRoomType(listingId: string, input: unknown): Promise<ActionResult<{ roomType: WizardRoomType }>> {
  try {
    const user = await ownerForMutation("save");
    const listing = await requireOwnedListing(listingIdSchema.parse(listingId), user.id);
    if (!isBusinessListing(kindOf(listing))) return fail("not_a_business_listing");
    const parsed = roomTypeSchema.safeParse(input);
    if (!parsed.success) return fail("invalid_input", z.flattenError(parsed.error).fieldErrors);
    const v = parsed.data;
    const rates = await getRates();
    const priceUsd = Math.round(toUsd(v.price, v.currency, rates) * 100) / 100;
    const fields = {
      price: v.price,
      currency: v.currency,
      pricePeriod: v.pricePeriod,
      priceUsd,
      maxGuests: v.maxGuests,
      bedsSingle: v.bedsSingle,
      bedsDouble: v.bedsDouble,
      sizeSqm: v.sizeSqm,
      // Required since round 3, phase 4 ("כמה חדרים כאלה להציע בבית"): left empty means 1.
      quantity: v.quantity ?? 1,
    };

    let roomId: string;
    if (v.id) {
      const existing = await db.roomType.findFirst({ where: { id: v.id, listingId: listing.id } });
      if (!existing) throw new NotFoundError();
      const original = (existing.names as Partial<Localized> | null)?.[listing.originalLocale as AppLocale];
      await db.roomType.update({
        where: { id: existing.id },
        data: { ...fields, ...(original !== v.name ? { names: sameNameInEveryLanguage(v.name) } : {}) },
      });
      roomId = existing.id;
    } else {
      const count = await db.roomType.count({ where: { listingId: listing.id } });
      if (count >= 30) return fail("too_many_room_types");
      const created = await db.roomType.create({
        data: { ...fields, listingId: listing.id, names: sameNameInEveryLanguage(v.name), sortOrder: count },
      });
      roomId = created.id;
    }
    await touchContent(listing);

    const room = await db.roomType.findUniqueOrThrow({
      where: { id: roomId },
      include: { photos: { orderBy: [{ sortOrder: "asc" }, { createdAt: "asc" }] } },
    });
    return ok({
      roomType: {
        id: room.id,
        name: v.name,
        price: Number(room.price),
        currency: v.currency,
        pricePeriod: room.pricePeriod,
        maxGuests: room.maxGuests,
        bedsSingle: room.bedsSingle,
        bedsDouble: room.bedsDouble,
        sizeSqm: room.sizeSqm,
        quantity: room.quantity,
        photos: room.photos.map(toWizardPhoto),
      },
    });
  } catch (error) {
    return toActionError(error);
  }
}

/** Deletes a room type and its photos (files included). */
export async function deleteRoomType(listingId: string, roomTypeId: string): Promise<ActionResult> {
  try {
    const user = await ownerForMutation("save");
    const listing = await requireOwnedListing(listingIdSchema.parse(listingId), user.id);
    const room = await db.roomType.findFirst({
      where: { id: listingIdSchema.parse(roomTypeId), listingId: listing.id },
      include: { photos: { select: { id: true, storageKey: true } } },
    });
    if (!room) throw new NotFoundError();
    await db.$transaction([
      db.listingPhoto.deleteMany({ where: { roomTypeId: room.id, listingId: listing.id } }),
      db.roomType.delete({ where: { id: room.id } }),
    ]);
    await Promise.all(room.photos.map((photo) => removeListingPhotoFiles(photo)));
    await touchContent(listing);
    return ok();
  } catch (error) {
    return toActionError(error);
  }
}

// ─── Availability ─────────────────────────────────────────────

const DAY_MS = 24 * 3600 * 1000;

function parseDay(day: string): Date {
  return new Date(`${day}T00:00:00Z`);
}

/** Replaces the owner's blocked days (inclusive ranges) with `blocks`. iCal imports are untouched. */
export async function setAvailability(listingId: string, blocks: unknown): Promise<ActionResult<{ blocked: DayRange[] }>> {
  try {
    const user = await ownerForMutation("save");
    const listing = await requireOwnedListing(listingIdSchema.parse(listingId), user.id);
    const parsed = availabilitySchema.safeParse(blocks);
    if (!parsed.success) return fail("invalid_input");
    const ranges = normalizeRanges(parsed.data, dayString(new Date()));
    const today = parseDay(dayString(new Date()));
    await db.$transaction([
      // Past blocks are history; only today and later are replaced.
      db.availabilityBlock.deleteMany({ where: { listingId: listing.id, source: "OWNER", endDate: { gt: today } } }),
      db.availabilityBlock.createMany({
        data: ranges.map((r) => ({
          listingId: listing.id,
          source: "OWNER" as const,
          startDate: parseDay(r.start),
          endDate: new Date(parseDay(r.end).getTime() + DAY_MS),
        })),
      }),
    ]);
    return ok({ blocked: ranges });
  } catch (error) {
    return toActionError(error);
  }
}

// ─── Translations ─────────────────────────────────────────────

async function readTranslations(listingId: string): Promise<WizardTranslation[]> {
  const rows = await db.listingTranslation.findMany({ where: { listingId } });
  return rows
    .filter((t) => isAppLocale(t.locale))
    .map((t) => ({
      locale: t.locale as AppLocale,
      title: t.title,
      description: t.description,
      isAuto: t.isAuto,
      editedByOwner: t.editedByOwner,
      updatedAt: t.updatedAt.toISOString(),
    }));
}

/** The owner writes or edits one language version by hand. */
export async function saveTranslations(
  listingId: string,
  locale: string,
  input: { title: string; description: string },
): Promise<ActionResult<{ translation: WizardTranslation }>> {
  try {
    const user = await ownerForMutation("save");
    const listing = await requireOwnedListing(listingIdSchema.parse(listingId), user.id);
    // Brief 2.4: titles are saved without emoji, in every language (descriptions keep theirs).
    const title = typeof input?.title === "string" ? stripTitleEmoji(input.title) : input?.title;
    const parsed = translationSchema.safeParse({ locale, ...input, title });
    if (!parsed.success) return fail("invalid_input", z.flattenError(parsed.error).fieldErrors);
    const v = parsed.data;
    if (v.locale === listing.originalLocale) return fail("edit_original_in_details");
    const row = await db.listingTranslation.upsert({
      where: { listingId_locale: { listingId: listing.id, locale: v.locale } },
      create: {
        listingId: listing.id,
        locale: v.locale,
        title: v.title,
        description: v.description,
        isOriginal: false,
        isAuto: false,
        editedByOwner: true,
      },
      update: { title: v.title, description: v.description, isOriginal: false, isAuto: false, editedByOwner: true },
    });
    await touchContent(listing);
    // A hand-written translation of a live listing is public at once, like an edit of the original.
    if (listing.status === "LIVE" && (await textNeedsRecheck(`${v.title}\n${v.description}`))) {
      await recheckLiveListing(listing.id, user.id);
    }
    return ok({
      translation: {
        locale: v.locale,
        title: row.title,
        description: row.description,
        isAuto: row.isAuto,
        editedByOwner: row.editedByOwner,
        updatedAt: row.updatedAt.toISOString(),
      },
    });
  } catch (error) {
    return toActionError(error);
  }
}

/** Machine-translates the title and description into the other languages (owner edits are kept). */
export async function generateTranslations(
  listingId: string,
  options: { force?: boolean } = {},
): Promise<ActionResult<{ translations: WizardTranslation[] }>> {
  try {
    const user = await ownerForMutation("translate", TRANSLATE_LIMIT);
    const listing = await requireOwnedListing(listingIdSchema.parse(listingId), user.id);
    if (!isTranslationEnabled()) return fail("translation_disabled");
    if (!listing.title.trim() || !listing.description.trim()) return fail("translation_needs_text");
    await translateListing(listing.id, { force: options.force === true });
    return ok({ translations: await readTranslations(listing.id) });
  } catch (error) {
    return toActionError(error);
  }
}

/** Removes the owner's own version of one language (falls back to auto-translation / original). */
export async function deleteTranslation(listingId: string, locale: string): Promise<ActionResult> {
  try {
    const user = await ownerForMutation("save");
    const listing = await requireOwnedListing(listingIdSchema.parse(listingId), user.id);
    const target = z.enum(locales).parse(locale);
    await db.listingTranslation.deleteMany({ where: { listingId: listing.id, locale: target, isOriginal: false } });
    await touchContent(listing);
    return ok();
  } catch (error) {
    return toActionError(error);
  }
}

// ─── Publish ──────────────────────────────────────────────────

async function checkRequirements(listing: ListingRow, user: CurrentUser): Promise<ActionResult<never> | null> {
  const [photoCount, roomPhotoCount, pricedRoomTypes, pledgeAccepted] = await Promise.all([
    db.listingPhoto.count({ where: { listingId: listing.id, roomTypeId: null } }),
    db.listingPhoto.count({ where: { listingId: listing.id, roomTypeId: { not: null } } }),
    db.roomType.count({ where: { listingId: listing.id, price: { gt: 0 } } }),
    hasCurrentPledge(user.id),
  ]);
  const missing = missingRequirements({
    values: toWizardValues(listing, user.businessName),
    photoCount,
    roomPhotoCount,
    pricedRoomTypes,
    phoneVerified: user.phoneNumberVerified,
    pledgeAccepted,
  });
  if (missing.length === 0) return null;
  return fail("missing_requirements", { requirements: missing.map((m) => m.key) });
}

/**
 * The mistake check's errors (round 3, brief 6.1: no exact address for a short stay or hotel,
 * fewer than 5 photos, contact details in the title or description) stop publishing on the
 * server, whatever the browser shows. Its warnings never do.
 */
async function mistakeRefusal(listingId: string): Promise<ActionResult<never> | null> {
  const { errors } = await getListingMistakes(listingId);
  if (errors.length === 0) return null;
  return fail("listing_mistakes", { mistakes: errors.map((e) => e.code) });
}

/**
 * Clears fields that do not apply and upgrades the account to "Business" for hotels.
 * (submitForPublication then computes derived fields, translations and nearby places.)
 */
async function finalizeListing(listing: ListingRow, user: CurrentUser, extra: Prisma.ListingUpdateInput = {}) {
  const kind = kindOf(listing);
  await db.listing.update({
    where: { id: listing.id, ownerId: user.id },
    data: {
      ...nonApplicableResets(kind),
      isShabbatFriendly: computeShabbatFriendly(listing.shabbatFeatures),
      ...extra,
    },
  });
  if (isBusinessListing(kind) && user.accountType !== "BUSINESS") {
    await db.user.update({ where: { id: user.id }, data: { accountType: "BUSINESS" } });
  }
}

/** Derived fields + translations for an edit that does not go through the checks again. */
async function refreshWithoutResubmit(listingId: string) {
  await prepareListingDerivedFields(listingId);
  try {
    await translateListing(listingId);
  } catch (error) {
    // The listing shows in its original language until translations are ready.
    console.error("[wizard] translation failed:", error);
  }
}

function outcome(
  listing: ListingRow,
  result: { status: PublishOutcome["status"]; reasons?: readonly unknown[] | null },
): PublishOutcome {
  const reasons = (result.reasons ?? [])
    .map((r) => (typeof r === "string" ? r : r && typeof r === "object" && "code" in r ? String((r as { code: unknown }).code) : ""))
    .filter(Boolean);
  const publicPath = result.status === "BLOCKED" ? null : publicPathFor({ ...listing, status: "LIVE" });
  return {
    status: result.status,
    reasons,
    publicId: listing.publicId,
    publicPath,
    publicUrl: publicPath ? absoluteUrl(publicPath) : null,
  };
}

const turnstileTokenSchema = z.string().max(2048).nullish();

/**
 * The owner accepts the listing rules and publishes a draft (behind the invisible CAPTCHA,
 * action "publish"). The automatic checks decide: LIVE, IN_REVIEW (a person checks it — always
 * for an account's first listing) or BLOCKED.
 */
export async function acceptRulesAndPublish(
  listingId: string,
  input: { rulesAccepted: boolean; turnstileToken?: string | null },
): Promise<ActionResult<PublishOutcome>> {
  try {
    const user = await ownerForMutation("publish", PUBLISH_LIMIT);
    const listing = await requireOwnedListing(listingIdSchema.parse(listingId), user.id);
    if (input?.rulesAccepted !== true) return fail("rules_not_accepted", { rulesAccepted: ["required"] });
    if (listing.status !== "DRAFT") return fail("already_published");
    const missing = await checkRequirements(listing, user);
    if (missing) return missing;
    const mistakes = await mistakeRefusal(listing.id);
    if (mistakes) return mistakes;
    await assertTurnstile(turnstileTokenSchema.parse(input?.turnstileToken), { expectedAction: "publish" });

    await finalizeListing(listing, user, { rulesAcceptedAt: new Date(), wizardStep: stepsFor(kindOf(listing)).length });
    const result = await submitForPublication(listing.id, user.id);
    const fresh = await requireOwnedListing(listing.id, user.id);
    return ok(outcome(fresh, result));
  } catch (error) {
    return toActionError(error);
  }
}

/** Statuses where an edit goes back through the automatic checks. */
const RESUBMIT_STATUSES = new Set(["LIVE", "IN_REVIEW", "NEEDS_CHANGES", "REJECTED"]);

/**
 * Edit mode ("Save changes"): everything is already auto-saved; if anything the public sees
 * changed since the editor was opened, the listing goes through the automatic checks again.
 */
export async function saveChanges(
  listingId: string,
  editToken: string | null,
): Promise<ActionResult<{ resubmitted: boolean; outcome: PublishOutcome | null }>> {
  try {
    const user = await ownerForMutation("publish", PUBLISH_LIMIT);
    const listing = await requireOwnedListing(listingIdSchema.parse(listingId), user.id);
    if (listing.status === "DRAFT") return fail("not_published_yet");
    const missing = await checkRequirements(listing, user);
    if (missing) return missing;

    // A forged or expired token counts as "changed", so the checks always run when in doubt.
    const openedAt = verifyEditToken(listing.id, editToken);
    const newPhotos = openedAt
      ? await db.listingPhoto.count({ where: { listingId: listing.id, createdAt: { gt: openedAt } } })
      : 0;
    const changed = !openedAt || listing.contentUpdatedAt > openedAt || newPhotos > 0;

    if (changed && RESUBMIT_STATUSES.has(listing.status)) {
      // Saving would publish the listing again: the mistake check's errors stop it.
      const mistakes = await mistakeRefusal(listing.id);
      if (mistakes) {
        // The edits of a live listing are on the site already (auto-save): the refusal must not
        // skip the automatic checks that "Save changes" runs on them (fails closed, see above).
        if (listing.status === "LIVE") await recheckLiveListing(listing.id, user.id);
        return mistakes;
      }
    }

    await finalizeListing(listing, user, listing.rulesAcceptedAt ? {} : { rulesAcceptedAt: new Date() });
    let result: PublishOutcome | null = null;
    if (changed && RESUBMIT_STATUSES.has(listing.status)) {
      const submitted = await submitForPublication(listing.id, user.id);
      result = outcome(await requireOwnedListing(listing.id, user.id), submitted);
    } else if (changed) {
      // Paused, expired, rented… listings keep their status; their data is refreshed.
      await refreshWithoutResubmit(listing.id);
    }
    return ok({ resubmitted: result !== null, outcome: result });
  } catch (error) {
    return toActionError(error);
  }
}
