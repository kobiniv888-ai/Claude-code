"use server";

/**
 * "My account" server actions. Every action checks the session (requireUserForAction), validates
 * its input with zod, is rate-limited per user and only touches the user's own rows.
 */
import { headers } from "next/headers";
import { getLocale, getTranslations } from "next-intl/server";
import { z } from "zod";
import { siteConfig } from "@/config/site";
import type { Prisma } from "@/generated/prisma/client";
import { isAppLocale } from "@/i18n/locale";
import { fail, ok, runAction, type ActionResult } from "@/lib/action";
import { audit } from "@/lib/audit";
import { requireUserForAction } from "@/lib/auth/session";
import { auth } from "@/lib/auth/server";
import { setDisplayCurrency } from "@/lib/currency/actions";
import { db } from "@/lib/db";
import { notificationEmailFor, sendEmail } from "@/lib/email";
import { ForbiddenError, NotFoundError } from "@/lib/errors";
import {
  ListingStatusError,
  markRented,
  markSold,
  pauseListing,
  renewListing,
  softDeleteListing,
  unpauseListing,
  type OwnerActionResult,
} from "@/lib/listing/lifecycle";
import { isOwnPrivateUpload } from "@/lib/media";
import { assertRateLimit, rateLimit } from "@/lib/rate-limit";
import { assertNotShabbatMode } from "@/lib/settings";
import { deletePublic } from "@/lib/storage";
import { deleteAccountData } from "./delete-account";
import { MUTATING_ACTIONS } from "./listing-status";
import { getAccountSettings } from "./queries";
import {
  confirmationMatches,
  contactEmailSchema,
  notificationsSchema,
  ownAvatarKey,
  preferencesSchema,
  profileSchema,
  remainingSignInMethods,
} from "./settings-schema";
import {
  businessVerificationSchema,
  idVerificationSchema,
  ownershipVerificationSchema,
  type UploadedFile,
} from "./verification";

const DAY_SECONDS = 86_400;

// ─── My listings ──────────────────────────────────────────────

const listingActionSchema = z.object({
  listingId: z.string().trim().min(1).max(64),
  action: z.enum(MUTATING_ACTIONS),
});

export type ListingActionData = { status: string; changed: boolean; expiresAt: string | null };

/** Pause / unpause / renew / mark rented or sold / bump / delete one of the user's own listings. */
export async function runListingAction(input: unknown): Promise<ActionResult<ListingActionData>> {
  return runAction<ListingActionData>(async () => {
    const user = await requireUserForAction();
    const parsed = listingActionSchema.safeParse(input);
    if (!parsed.success) return fail("invalid_input");
    const { listingId, action } = parsed.data;
    await assertRateLimit(`account:listing:${user.id}`, { limit: 30, windowSeconds: 60 });
    // Putting a listing (back) on the site waits for the end of Shabbat when Shabbat mode is on.
    if (action === "renew" || action === "unpause" || action === "bump") await assertNotShabbatMode();

    let result: OwnerActionResult;
    switch (action) {
      case "pause":
        result = await pauseListing(listingId, user.id);
        break;
      case "unpause":
        result = await unpauseListing(listingId, user.id);
        break;
      case "renew":
        result = await renewListing(listingId, user.id);
        break;
      case "markRented":
        result = await markRented(listingId, user.id);
        break;
      case "markSold":
        result = await markSold(listingId, user.id);
        break;
      case "delete":
        result = await softDeleteListing(listingId, user.id);
        break;
      case "bump":
        result = await bumpOwnListing(listingId, user.id);
        break;
    }
    return ok({ status: result.status, changed: result.changed, expiresAt: result.expiresAt?.toISOString() ?? null });
  });
}

/**
 * Bump to the top of "Recommended" (only when siteConfig.features.bump is on): once a day per
 * listing, LIVE listings only. Paid bumps go through the payment flow once payments exist.
 */
async function bumpOwnListing(listingId: string, ownerId: string): Promise<OwnerActionResult> {
  if (!siteConfig.features.bump) throw new ForbiddenError("Bump is not available");
  const listing = await db.listing.findFirst({
    where: { id: listingId, ownerId, deletedAt: null },
    select: { id: true, status: true, expiresAt: true },
  });
  if (!listing) throw new NotFoundError("Listing not found");
  if (listing.status !== "LIVE") throw new ListingStatusError(listing.status, "bump");
  const limit = await rateLimit(`account:bump:${listing.id}`, { limit: 1, windowSeconds: DAY_SECONDS });
  if (!limit.ok) return { status: listing.status, changed: false, expiresAt: listing.expiresAt };
  await db.listing.updateMany({ where: { id: listing.id, ownerId, status: "LIVE" }, data: { bumpedAt: new Date() } });
  return { status: listing.status, changed: true, expiresAt: listing.expiresAt };
}

// ─── Verification ─────────────────────────────────────────────

type DocumentEntry = { key: string; kind: string; mime: string; bytes: number; name: string | null };

function documentEntry(file: UploadedFile, kind: string): DocumentEntry {
  return { key: file.key, kind, mime: file.mime, bytes: file.bytes, name: file.name?.trim() || null };
}

/** Every key must be the user's own verification upload, and each file may be used once. */
function ownsAll(userId: string, docs: DocumentEntry[]): boolean {
  const keys = docs.map((d) => d.key);
  return new Set(keys).size === keys.length && keys.every((key) => isOwnPrivateUpload(key, userId, "verification"));
}

async function hasPending(userId: string, type: "ID" | "OWNERSHIP" | "BUSINESS", listingId?: string): Promise<boolean> {
  const count = await db.verificationRequest.count({
    where: { userId, type, status: "PENDING", ...(listingId ? { listingId } : {}) },
  });
  return count > 0;
}

const VERIFICATION_LIMIT = { limit: 10, windowSeconds: 3600 };

/** "ID verified": ID front (+ back) and a selfie. One pending request at a time. */
export async function submitIdVerification(input: unknown): Promise<ActionResult<{ id: string }>> {
  return runAction<{ id: string }>(async () => {
    const user = await requireUserForAction();
    const parsed = idVerificationSchema.safeParse(input);
    if (!parsed.success) return fail("invalid_input", z.flattenError(parsed.error).fieldErrors);
    await assertRateLimit(`account:verification:${user.id}`, VERIFICATION_LIMIT);
    const { front, back, selfie, note } = parsed.data;
    const documents = [
      documentEntry(front, "ID_FRONT"),
      ...(back ? [documentEntry(back, "ID_BACK")] : []),
      documentEntry(selfie, "SELFIE"),
    ];
    if (!ownsAll(user.id, documents)) return fail("forbidden");
    if (user.idVerifiedAt) return fail("already_verified");
    if (await hasPending(user.id, "ID")) return fail("pending_exists");

    const created = await db.verificationRequest.create({
      data: { userId: user.id, type: "ID", documents: documents as Prisma.InputJsonValue, userNote: note },
      select: { id: true },
    });
    return ok({ id: created.id });
  });
}

/** "Owner verified" for one listing: the NAPR extract + the cadastral code. */
export async function submitOwnershipVerification(input: unknown): Promise<ActionResult<{ id: string }>> {
  return runAction<{ id: string }>(async () => {
    const user = await requireUserForAction();
    const parsed = ownershipVerificationSchema.safeParse(input);
    if (!parsed.success) return fail("invalid_input", z.flattenError(parsed.error).fieldErrors);
    await assertRateLimit(`account:verification:${user.id}`, VERIFICATION_LIMIT);
    const { listingId, extract, cadastralCode, note } = parsed.data;
    const documents = [documentEntry(extract, "NAPR_EXTRACT")];
    if (!ownsAll(user.id, documents)) return fail("forbidden");

    const listing = await db.listing.findFirst({
      where: { id: listingId, ownerId: user.id, deletedAt: null, status: { notIn: ["DRAFT", "DELETED"] } },
      select: { id: true, ownerVerifiedAt: true },
    });
    if (!listing) return fail("not_found");
    if (listing.ownerVerifiedAt) return fail("already_verified");
    if (await hasPending(user.id, "OWNERSHIP", listing.id)) return fail("pending_exists");

    const created = await db.verificationRequest.create({
      data: {
        userId: user.id,
        type: "OWNERSHIP",
        listingId: listing.id,
        cadastralCode,
        documents: documents as Prisma.InputJsonValue,
        userNote: note,
      },
      select: { id: true },
    });
    return ok({ id: created.id });
  });
}

/** Business registration (hotels, guesthouses, agencies) — business accounts only. */
export async function submitBusinessVerification(input: unknown): Promise<ActionResult<{ id: string }>> {
  return runAction<{ id: string }>(async () => {
    const user = await requireUserForAction();
    const parsed = businessVerificationSchema.safeParse(input);
    if (!parsed.success) return fail("invalid_input", z.flattenError(parsed.error).fieldErrors);
    await assertRateLimit(`account:verification:${user.id}`, VERIFICATION_LIMIT);
    const documents = [documentEntry(parsed.data.registration, "BUSINESS_REGISTRATION")];
    if (!ownsAll(user.id, documents)) return fail("forbidden");

    const row = await db.user.findUniqueOrThrow({ where: { id: user.id }, select: { accountType: true, businessVerifiedAt: true } });
    if (row.accountType !== "BUSINESS") return fail("not_business");
    if (row.businessVerifiedAt) return fail("already_verified");
    if (await hasPending(user.id, "BUSINESS")) return fail("pending_exists");

    const created = await db.verificationRequest.create({
      data: { userId: user.id, type: "BUSINESS", documents: documents as Prisma.InputJsonValue, userNote: parsed.data.note },
      select: { id: true },
    });
    return ok({ id: created.id });
  });
}

// ─── Settings ─────────────────────────────────────────────────

const SETTINGS_LIMIT = { limit: 30, windowSeconds: 600 };

export async function updateProfile(input: unknown): Promise<ActionResult> {
  return runAction(async () => {
    const user = await requireUserForAction();
    const parsed = profileSchema.safeParse(input);
    if (!parsed.success) return fail("invalid_input", z.flattenError(parsed.error).fieldErrors);
    await assertRateLimit(`account:settings:${user.id}`, SETTINGS_LIMIT);
    const data = parsed.data;
    await db.user.update({
      where: { id: user.id },
      data: {
        name: data.name,
        firstName: data.firstName,
        bio: data.bio,
        spokenLanguages: data.spokenLanguages,
        keepsShabbat: data.keepsShabbat,
        accountType: data.accountType,
        businessName: data.accountType === "BUSINESS" ? data.businessName : null,
      },
    });
    return ok();
  });
}

export async function removeAvatar(): Promise<ActionResult> {
  return runAction(async () => {
    const user = await requireUserForAction();
    await assertRateLimit(`account:settings:${user.id}`, SETTINGS_LIMIT);
    const key = ownAvatarKey(user.image, user.id);
    await db.user.update({ where: { id: user.id }, data: { image: null } });
    if (key) await deletePublic(key).catch((error) => console.error("[account] could not delete an avatar:", error));
    return ok();
  });
}

export async function updateContactEmail(input: unknown): Promise<ActionResult<{ contactEmail: string | null }>> {
  return runAction<{ contactEmail: string | null }>(async () => {
    const user = await requireUserForAction();
    const parsed = contactEmailSchema.safeParse(input);
    if (!parsed.success) return fail("invalid_input", { contactEmail: ["invalid_email"] });
    await assertRateLimit(`account:contact-email:${user.id}`, { limit: 10, windowSeconds: 3600 });
    await db.user.update({ where: { id: user.id }, data: { contactEmail: parsed.data.contactEmail } });
    return ok({ contactEmail: parsed.data.contactEmail });
  });
}

/** Language (User.locale — emails too), display currency (account + cookie) and Hebrew dates. */
export async function updatePreferences(input: unknown): Promise<ActionResult<{ locale: string }>> {
  return runAction<{ locale: string }>(async () => {
    const user = await requireUserForAction();
    const parsed = preferencesSchema.safeParse(input);
    if (!parsed.success) return fail("invalid_input", z.flattenError(parsed.error).fieldErrors);
    await assertRateLimit(`account:settings:${user.id}`, SETTINGS_LIMIT);
    const { locale, currency, showHebrewDates } = parsed.data;
    await db.user.update({
      where: { id: user.id },
      data: { locale, currency: currency as Prisma.UserUpdateInput["currency"], showHebrewDates },
    });
    const cookie = await setDisplayCurrency(currency);
    if (!cookie.ok) console.warn("[account] display currency cookie not set:", cookie.error);
    return ok({ locale });
  });
}

export async function updateNotifications(input: unknown): Promise<ActionResult> {
  return runAction(async () => {
    const user = await requireUserForAction();
    const parsed = notificationsSchema.safeParse(input);
    if (!parsed.success) return fail("invalid_input");
    await assertRateLimit(`account:settings:${user.id}`, SETTINGS_LIMIT);
    const prefs = {
      email: parsed.data.email,
      whatsapp: siteConfig.features.whatsappNotifications ? parsed.data.whatsapp : false,
    };
    await db.user.update({ where: { id: user.id }, data: { notificationPrefs: prefs } });
    return ok();
  });
}

const providerSchema = z.enum(["google", "apple"]);

/** Disconnects Google / Apple — never the last way left to sign in. */
export async function unlinkSocialAccount(provider: unknown): Promise<ActionResult> {
  return runAction(async () => {
    const user = await requireUserForAction();
    const parsed = providerSchema.safeParse(provider);
    if (!parsed.success) return fail("invalid_input");
    await assertRateLimit(`account:unlink:${user.id}`, { limit: 10, windowSeconds: 3600 });
    const settings = await getAccountSettings(user.id);
    if (!settings.linked.includes(parsed.data)) return fail("not_found");
    if (remainingSignInMethods(settings, parsed.data) < 1) return fail("last_sign_in_method");
    await db.account.deleteMany({ where: { userId: user.id, providerId: parsed.data } });
    return ok();
  });
}

/** The confirmation word in every language (any of them is accepted). */
async function confirmationWords(): Promise<string[]> {
  const current = await getLocale();
  const wanted = [...new Set([isAppLocale(current) ? current : "en", "en"])];
  const words = await Promise.all(
    wanted.map(async (locale) => (await getTranslations({ locale, namespace: "account.settings.delete" }))("confirmWord")),
  );
  return words;
}

const deleteSchema = z.object({ confirmation: z.string().max(100) });

/**
 * Deletes the account: emails "account_deleted" to the real address first, signs out, then
 * soft-deletes every listing, removes favorites, sessions, social accounts, device links and
 * private documents, and anonymizes the user row (see deleteAccountData).
 */
export async function deleteMyAccount(input: unknown): Promise<ActionResult> {
  return runAction(async () => {
    const user = await requireUserForAction();
    const parsed = deleteSchema.safeParse(input);
    if (!parsed.success) return fail("invalid_input");
    await assertRateLimit(`account:delete:${user.id}`, { limit: 5, windowSeconds: 3600 });
    if (!confirmationMatches(parsed.data.confirmation, await confirmationWords())) return fail("confirmation_mismatch");
    if (user.isStaff) return fail("staff_account");

    const row = await db.user.findUniqueOrThrow({
      where: { id: user.id },
      select: { name: true, email: true, contactEmail: true, locale: true },
    });
    const to = notificationEmailFor(row);
    if (to) await sendEmail({ to, template: "account_deleted", locale: row.locale, data: { name: row.name } });

    try {
      await auth.api.signOut({ headers: await headers() });
    } catch (error) {
      console.warn("[account] sign-out before deletion failed:", error);
    }
    await deleteAccountData(user.id);
    await audit({ actorId: user.id, action: "account.delete", targetType: "User", targetId: user.id });
    return ok();
  });
}
