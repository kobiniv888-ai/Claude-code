import "server-only";
import { z } from "zod";
import { siteConfig, type AppLocale } from "@/config/site";
import { Prisma, type Currency, type ListingStatus } from "@/generated/prisma/client";
import { isAppLocale } from "@/i18n/locale";
import { getMessages } from "@/i18n/messages";
import { audit } from "@/lib/audit";
import { hmacHash } from "@/lib/crypto";
import { getRates, toUsd, type Rates } from "@/lib/currency";
import { db } from "@/lib/db";
import { notificationEmailFor, sendEmail, type EmailData, type EmailTemplate } from "@/lib/email";
import { AppError, NotFoundError, ValidationError } from "@/lib/errors";
import { approximateLocation, type LatLng } from "@/lib/geo";
import { computeShabbatFriendly, MODERATION_REASONS, type ModerationReason } from "@/lib/listing/fields";
import { computeListingProximity } from "@/lib/nearby";
import { PLEDGE_CURRENT_VERSION } from "@/lib/pledge";
import { decideSubmitTarget, riskScoreNeedsReview, runReviewGate, type ReviewGate, type SubmitDecision } from "./review-rule";
import { isHostFlagged, isHostSanctioned } from "./host-flags-server";
import { notifyFounderListingInReview } from "@/lib/alerts/founder-admin";
import { notifyListingDecision } from "@/lib/alerts/listing-decision";
import { assessListing, type RiskAssessment, type RiskReason } from "@/lib/risk";
import { countAutoHideReports } from "@/lib/reports/auto-hide";
import { getSettings } from "@/lib/settings";
import { translateForLocale, translateListing, translateListingIfMissing, updateListingSearchText } from "@/lib/translate";

/**
 * The listing state machine (server-only). See docs/CONVENTIONS.md "Listing lifecycle".
 *
 *   DRAFT ─publish→ checks → LIVE | IN_REVIEW            (first listing of an account, or a
 *                                                          flagged host's new listing: IN_REVIEW)
 *   IN_REVIEW ─moderator→ LIVE | NEEDS_CHANGES | REJECTED
 *   NEEDS_CHANGES / REJECTED ─owner edits→ back to IN_REVIEW (only a person lets it go live)
 *   (the review rule: ./review-rule.ts; it fails CLOSED on a database error)
 *   LIVE ─owner→ PAUSED ⇄ LIVE, RENTED / SOLD, DELETED (soft)
 *   LIVE ─cron→ EXPIRED (warning email first) ─owner renews→ LIVE
 *   (unpause / renew / a live price change: checks again when the content changed since
 *    lastCheckedAt — high risk → IN_REVIEW)
 *   LIVE ─enough open reports→ HIDDEN ─moderator→ LIVE
 *
 * Every function checks the current status (and ownership for owner actions), changes it with a
 * conditional update (`WHERE status = <expected>`) so two clicks or two servers cannot both
 * apply it, and is idempotent: repeating an action that already happened changes nothing.
 * Callers (server actions) check the session, permissions, Shabbat mode and rate limits.
 * Staff actions are written to the audit log; owners get emails in THEIR language.
 */

// ─── Errors ───────────────────────────────────────────────────

/** The listing is not in a status where this action is possible (message: moderation.errors.invalid_status). */
export class ListingStatusError extends AppError {
  readonly currentStatus: ListingStatus;

  constructor(currentStatus: ListingStatus, action: string) {
    super("invalid_status", `Cannot ${action} a listing that is ${currentStatus}`, { status: 409 });
    this.currentStatus = currentStatus;
  }
}

export const PUBLICATION_REQUIREMENTS = ["phoneVerified", "location", "details", "photos", "price", "contact"] as const;
export type PublicationRequirement = (typeof PUBLICATION_REQUIREMENTS)[number];

/** Something required for publishing is missing (same keys as the wizard's requirement list). */
export class MissingRequirementsError extends AppError {
  readonly requirements: PublicationRequirement[];

  constructor(requirements: PublicationRequirement[]) {
    super("missing_requirements", `Missing: ${requirements.join(", ")}`, { status: 422 });
    this.requirements = requirements;
  }
}

// ─── Helpers ──────────────────────────────────────────────────

const DAY_MS = 24 * 3600 * 1000;

function addDays(from: Date, days: number): Date {
  return new Date(from.getTime() + days * DAY_MS);
}

function roundMoney(value: number): number {
  return Math.round(value * 100) / 100;
}

const OWNER_SELECT = {
  id: true,
  name: true,
  email: true,
  contactEmail: true,
  locale: true,
  notificationPrefs: true,
  phoneNumber: true,
  phoneNumberVerified: true,
} satisfies Prisma.UserSelect;
type Owner = Prisma.UserGetPayload<{ select: typeof OWNER_SELECT }>;

/** Owner-facing listing address for emails ("/listing/1234"; src/proxy.ts answers a 308 to the full slug). */
function publicListingPath(publicId: number): string {
  return `/listing/${publicId}`;
}
const MY_LISTINGS_PATH = "/account/listings";

/** Informational emails (live, in review, approved, about to expire) respect the owner's setting. */
function wantsListingEmails(prefs: Prisma.JsonValue | null): boolean {
  if (!prefs || typeof prefs !== "object" || Array.isArray(prefs)) return true;
  const email = (prefs as Record<string, unknown>).email;
  if (!email || typeof email !== "object" || Array.isArray(email)) return true;
  return (email as Record<string, unknown>).listing !== false;
}

async function notifyOwner<K extends EmailTemplate>(
  owner: Owner,
  template: K,
  data: EmailData[K],
  opts: { optional?: boolean } = {},
): Promise<void> {
  const to = notificationEmailFor(owner);
  if (!to) return; // Phone-only account without an email address.
  if (opts.optional && !wantsListingEmails(owner.notificationPrefs)) return;
  await sendEmail({ to, template, locale: owner.locale, data });
}

function ownerLocale(owner: Owner): AppLocale {
  return isAppLocale(owner.locale) ? owner.locale : siteConfig.i18n.fallbackLocale;
}

/** The moderation reason explained in the owner's language (messages/<locale>/moderation.json). */
async function reasonText(reason: string, locale: AppLocale): Promise<string> {
  const messages = (await getMessages(locale)) as { moderation?: { reasons?: Record<string, { label?: string; explanation?: string }> } };
  const entry = messages.moderation?.reasons?.[reason] ?? messages.moderation?.reasons?.other;
  return [entry?.label, entry?.explanation].filter(Boolean).join(" — ") || reason;
}

async function loadListing<S extends Prisma.ListingSelect>(listingId: string, select: S, ownerId?: string) {
  const listing = await db.listing.findFirst({ where: { id: listingId, ...(ownerId ? { ownerId } : {}) }, select });
  if (!listing) throw new NotFoundError("Listing not found");
  return listing;
}

/**
 * Conditional status change: only applies when the status is still `from` (and `guard` still
 * holds, e.g. the content a moderator looked at). True when it applied.
 */
async function transition(
  listingId: string,
  from: ListingStatus,
  data: Prisma.ListingUncheckedUpdateManyInput,
  ownerId?: string,
  guard: Prisma.ListingWhereInput = {},
): Promise<boolean> {
  const { count } = await db.listing.updateMany({
    where: { ...guard, id: listingId, status: from, ...(ownerId ? { ownerId } : {}) },
    data,
  });
  return count === 1;
}

async function liveData(
  listing: { publishedAt: Date | null },
  now: Date,
): Promise<Prisma.ListingUncheckedUpdateManyInput> {
  const { listingExpiryDays } = await getSettings();
  return {
    status: "LIVE",
    publishedAt: listing.publishedAt ?? now,
    bumpedAt: now,
    expiresAt: addDays(now, listingExpiryDays),
    expiryWarnedAt: null,
    moderationReason: null,
    moderationNote: null,
  };
}

// ─── Derived fields ───────────────────────────────────────────

/** USD prices for one listing and its room types (exported for the exchange-rate job and tests). */
export function computeUsdPrices(
  listing: { price: number | null; currency: Currency; dealType: string; sizeSqm: number | null },
  roomTypes: { price: number; currency: Currency }[],
  rates: Rates,
): { priceUsd: number | null; pricePerSqmUsd: number | null; roomTypePricesUsd: number[] } {
  const roomTypePricesUsd = roomTypes.map((room) => roundMoney(toUsd(room.price, room.currency, rates)));
  let priceUsd = listing.price !== null && listing.price > 0 ? roundMoney(toUsd(listing.price, listing.currency, rates)) : null;
  // Hotels and guesthouses: "from" the cheapest room.
  if (priceUsd === null && roomTypePricesUsd.length > 0) priceUsd = Math.min(...roomTypePricesUsd);
  const pricePerSqmUsd =
    listing.dealType === "SALE" && priceUsd !== null && listing.sizeSqm && listing.sizeSqm > 0
      ? roundMoney(priceUsd / listing.sizeSqm)
      : null;
  return { priceUsd, pricePerSqmUsd, roomTypePricesUsd };
}

/**
 * The public map point of a listing (approxLat/approxLng). The offset is derived from a server
 * secret (HASH_SALT), not from the listing id alone: the id is visible in the browser and the
 * offset formula ships in the map code, so an id-only seed would let anyone undo the offset
 * and find the exact address.
 */
export function publicMapPoint(point: LatLng, listingId: string): LatLng {
  return approximateLocation(point, hmacHash(`approx-location:${listingId}`));
}

/**
 * Recomputes everything derived from the owner's input: the public approximate map point
 * (stable per listing), USD prices for filters and sorting, the Shabbat-friendly badge and the
 * search text. Safe to call after every save.
 */
export async function prepareListingDerivedFields(listingId: string): Promise<void> {
  const listing = await loadListing(listingId, {
    id: true,
    lat: true,
    lng: true,
    price: true,
    currency: true,
    dealType: true,
    sizeSqm: true,
    shabbatFeatures: true,
    roomTypes: { select: { id: true, price: true, currency: true }, orderBy: { sortOrder: "asc" } },
  });
  const rates = await getRates();
  const prices = computeUsdPrices(
    { price: listing.price === null ? null : Number(listing.price), currency: listing.currency, dealType: listing.dealType, sizeSqm: listing.sizeSqm },
    listing.roomTypes.map((room) => ({ price: Number(room.price), currency: room.currency })),
    rates,
  );
  const approx =
    listing.lat !== null && listing.lng !== null ? publicMapPoint({ lat: listing.lat, lng: listing.lng }, listing.id) : null;

  await db.$transaction([
    ...listing.roomTypes.map((room, i) =>
      db.roomType.update({ where: { id: room.id }, data: { priceUsd: prices.roomTypePricesUsd[i] } }),
    ),
    db.listing.update({
      where: { id: listing.id },
      data: {
        approxLat: approx?.lat ?? null,
        approxLng: approx?.lng ?? null,
        priceUsd: prices.priceUsd,
        pricePerSqmUsd: prices.pricePerSqmUsd,
        isShabbatFriendly: computeShabbatFriendly(listing.shabbatFeatures),
      },
    }),
  ]);
  await updateListingSearchText(listing.id);
}

/** Daily job (after new exchange rates): refreshes the USD prices of every listing in SQL. */
export async function refreshUsdPrices(rates?: Rates): Promise<{ listings: number; roomTypes: number }> {
  const current = rates ?? (await getRates());
  let listings = 0;
  let roomTypes = 0;
  for (const [code, rate] of Object.entries(current)) {
    if (!(rate > 0)) continue;
    roomTypes += await db.$executeRaw`
      UPDATE "RoomType" SET "priceUsd" = ROUND("price" / ${rate}, 2)
      WHERE "currency" = ${code}::"Currency"`;
    listings += await db.$executeRaw`
      UPDATE "Listing" SET
        "priceUsd" = ROUND("price" / ${rate}, 2),
        "pricePerSqmUsd" = CASE WHEN "dealType" = 'SALE' AND "sizeSqm" > 0
          THEN ROUND("price" / ${rate} / "sizeSqm"::numeric, 2) ELSE NULL END
      WHERE "currency" = ${code}::"Currency" AND "price" IS NOT NULL AND "price" > 0 AND "status" <> 'DELETED'`;
  }
  // Hotels without their own price show "from" the cheapest room.
  listings += await db.$executeRaw`
    UPDATE "Listing" l SET "priceUsd" = r."minUsd"
    FROM (SELECT "listingId", MIN("priceUsd") AS "minUsd" FROM "RoomType" GROUP BY "listingId") r
    WHERE l."id" = r."listingId" AND (l."price" IS NULL OR l."price" <= 0) AND l."status" <> 'DELETED'`;
  return { listings, roomTypes };
}

// ─── Publishing ───────────────────────────────────────────────

/** Statuses from which the owner can (re)submit. */
const SUBMITTABLE: readonly ListingStatus[] = ["DRAFT", "NEEDS_CHANGES", "LIVE", "IN_REVIEW", "REJECTED"];

const SUBMIT_SELECT = {
  id: true,
  ownerId: true,
  status: true,
  dealType: true,
  publishedAt: true,
  rulesAcceptedAt: true,
  title: true,
  cityId: true,
  lat: true,
  lng: true,
  price: true,
  contactMethods: true,
  roomTypes: { select: { price: true } },
  owner: { select: { ...OWNER_SELECT, welcomePledgeVersion: true } },
} satisfies Prisma.ListingSelect;

/**
 * What blocks publishing — a server-side backstop for the wizard's own (more detailed) checks.
 * Hotels: photos of room types count towards the minimum.
 */
async function publicationGaps(listing: Prisma.ListingGetPayload<{ select: typeof SUBMIT_SELECT }>): Promise<PublicationRequirement[]> {
  const gaps: PublicationRequirement[] = [];
  const isHotel = listing.dealType === "HOTEL_ROOM";
  if (!listing.cityId || listing.lat === null || listing.lng === null) gaps.push("location");
  if (listing.title.trim().length === 0) gaps.push("details");
  const photos = await db.listingPhoto.count({
    where: { listingId: listing.id, ...(isHotel ? {} : { roomTypeId: null }) },
  });
  if (photos < siteConfig.listings.minPhotos) gaps.push("photos");
  const hasPrice = listing.price !== null && Number(listing.price) > 0;
  const hasRoomPrice = listing.roomTypes.some((room) => Number(room.price) > 0);
  if (!(hasPrice || (isHotel && hasRoomPrice))) gaps.push("price");
  if (!Array.isArray(listing.contactMethods) || listing.contactMethods.length === 0) gaps.push("contact");
  return gaps;
}

export type SubmitResult = { status: "LIVE" | "IN_REVIEW" | "BLOCKED"; reasons: RiskReason[] };

/**
 * Is this the account's first listing (no other listing of the owner was ever published, and this
 * one never was)? THROWS on a database error: the review gate then counts it as "yes".
 */
async function isFirstListing(listing: { id: string; ownerId: string; publishedAt: Date | null }): Promise<boolean> {
  if (listing.publishedAt) return false;
  const earlier = await db.listing.count({ where: { ownerId: listing.ownerId, id: { not: listing.id }, publishedAt: { not: null } } });
  return earlier === 0;
}

/** The review gate for a submission (first listing; a flagged host, only for a first publication). */
function reviewGateFor(listing: { id: string; ownerId: string; publishedAt: Date | null; status: ListingStatus }): Promise<ReviewGate> {
  return runReviewGate({
    isFirst: () => isFirstListing(listing),
    isFlagged: () => (listing.status === "DRAFT" ? isHostFlagged(listing.ownerId) : Promise.resolve(false)),
  });
}

/** The automatic-check result with the gate's first-listing reason added when the checks missed it. */
function withGateReasons(assessment: RiskAssessment, gate: ReviewGate): RiskAssessment {
  if (!gate.firstListing || assessment.reasons.some((r) => r.code === "first_listing")) return assessment;
  return { ...assessment, reasons: [...assessment.reasons, { code: "first_listing", points: 0 }], requiresReview: true };
}

/**
 * Publishes a listing, or re-checks it after an edit:
 * first publish (DRAFT), re-submission after "needs changes" or a rejection, and significant
 * edits of a LIVE or IN_REVIEW listing (text, photos, price, location).
 *
 * Requires accepted rules, a verified owner phone, the current welcome pledge and the publication
 * requirements (throws AppError "rules_not_accepted" / "phone_not_verified" / "pledge_required" /
 * MissingRequirementsError). The pledge version is snapshotted on the listing. Then it
 * refreshes the derived fields, translations and nearby places, runs the automatic checks and
 * stores riskScore / riskReasons:
 * - BLOCKED (a blocked phrase, unverified phone): not published; a LIVE listing goes to IN_REVIEW.
 * - IN_REVIEW: first listing of the account, a high risk score, a rejected listing, or one that
 *   is already waiting for a moderator.
 * - LIVE: first time → publishedAt; every time it becomes LIVE → bumpedAt and a new expiresAt.
 *   An edit of an already LIVE listing keeps its dates (editing is not a free "bump").
 * Emails "listing_live" / "listing_in_review" when the status changes.
 */
export async function submitForPublication(listingId: string, ownerId: string): Promise<SubmitResult> {
  const listing = await loadListing(listingId, SUBMIT_SELECT, ownerId);
  if (!SUBMITTABLE.includes(listing.status)) throw new ListingStatusError(listing.status, "submit");
  if (!listing.rulesAcceptedAt) throw new AppError("rules_not_accepted", "Listing rules not accepted", { status: 422 });
  if (!listing.owner.phoneNumber || listing.owner.phoneNumberVerified !== true) {
    throw new AppError("phone_not_verified", "A verified phone number is required", { status: 403 });
  }
  // Every host accepts the current wording of the Bayit welcome pledge before publishing.
  const pledgeVersion = listing.owner.welcomePledgeVersion;
  if (pledgeVersion === null || pledgeVersion < PLEDGE_CURRENT_VERSION) {
    throw new AppError("pledge_required", "The welcome pledge (current version) is not accepted", { status: 422 });
  }
  const gaps = await publicationGaps(listing);
  if (gaps.length > 0) throw new MissingRequirementsError(gaps);

  await prepareListingDerivedFields(listing.id);
  try {
    await translateListing(listing.id);
  } catch (error) {
    console.error(`[lifecycle] translation of ${listing.id} failed:`, error);
  }
  try {
    await computeListingProximity(listing.id);
  } catch (error) {
    console.error(`[lifecycle] nearby places of ${listing.id} failed:`, error);
  }

  // Taken before the checks run, so an edit saved meanwhile still counts as "changed since".
  const checkedAt = new Date();
  const [checked, gate, { reviewRiskThreshold }] = await Promise.all([assessListing(listing.id), reviewGateFor(listing), getSettings()]);
  const assessment = withGateReasons(checked, gate);
  const from = listing.status;
  // Once a person is asked to look (changes asked, rejected, waiting), only a person lets it go
  // live; a first listing and a flagged host's new listing always wait (./review-rule.ts). "risk"
  // is the score alone: the first-listing part of the checks' own verdict is the gate's reason.
  const decision: SubmitDecision = decideSubmitTarget({
    from,
    blocked: assessment.blocked,
    riskRequiresReview: riskScoreNeedsReview(checked.score, reviewRiskThreshold),
    gate: { ...gate, firstListing: gate.firstListing || checked.reasons.some((r) => r.code === "first_listing") },
  });
  const target: ListingStatus = decision.target;

  const now = new Date();
  let data: Prisma.ListingUncheckedUpdateManyInput = {
    ...riskData(assessment, checkedAt),
    // Snapshot of the pledge the owner had accepted when this version of the listing was submitted.
    welcomePledgeVersion: pledgeVersion,
    welcomePledgeAt: now,
  };
  if (target === "LIVE" && from !== "LIVE") data = { ...data, ...(await liveData(listing, now)) };
  else if (target !== from) data = { ...data, status: target };

  const applied = await transition(listing.id, from, data, ownerId);
  if (!applied) {
    // Someone (a moderator, a second tab) changed the status meanwhile — report what it is now.
    const fresh = await loadListing(listing.id, { status: true });
    return {
      status: assessment.blocked ? "BLOCKED" : fresh.status === "LIVE" ? "LIVE" : "IN_REVIEW",
      reasons: assessment.reasons,
    };
  }

  if (!assessment.blocked && target !== from) {
    if (target === "LIVE") {
      await notifyOwner(
        listing.owner,
        "listing_live",
        {
          ownerName: listing.owner.name,
          listingTitle: listing.title,
          listingUrl: publicListingPath((await loadListing(listing.id, { publicId: true })).publicId),
          expiresAt: data.expiresAt as Date,
        },
        { optional: true },
      );
    } else if (target === "IN_REVIEW") {
      await notifyOwner(listing.owner, "listing_in_review", { ownerName: listing.owner.name, listingTitle: listing.title }, { optional: true });
    }
  }
  // The founder hears about every listing that starts waiting (round 3, brief 9).
  if (target === "IN_REVIEW" && from !== "IN_REVIEW") await notifyFounderListingInReview(listing.id, decision.why);

  return {
    status: assessment.blocked ? "BLOCKED" : target === "LIVE" ? "LIVE" : "IN_REVIEW",
    reasons: assessment.reasons,
  };
}

// ─── Re-checks before going (back) online ─────────────────────

function riskData(assessment: RiskAssessment, checkedAt: Date): Prisma.ListingUncheckedUpdateManyInput {
  return {
    riskScore: assessment.score,
    riskReasons: assessment.reasons as unknown as Prisma.InputJsonValue,
    lastCheckedAt: checkedAt,
  };
}

/** A result that needs a person: a blocked phrase / unverified phone, or a high risk score. */
function needsPerson(assessment: RiskAssessment): boolean {
  return assessment.blocked || assessment.requiresReview;
}

/**
 * True when what the public sees may have changed since the automatic checks last ran: never
 * checked, an edit after lastCheckedAt (every wizard save of a published listing moves
 * contentUpdatedAt, translations and room types included), or a photo added after it.
 */
export async function contentChangedSinceCheck(listing: {
  id: string;
  lastCheckedAt: Date | null;
  contentUpdatedAt: Date;
}): Promise<boolean> {
  const since = listing.lastCheckedAt;
  if (!since) return true;
  if (listing.contentUpdatedAt > since) return true;
  return (await db.listingPhoto.count({ where: { listingId: listing.id, createdAt: { gt: since } } })) > 0;
}

/**
 * Runs the automatic checks when the content changed since they last ran (derived fields such
 * as the USD price are refreshed first). Null when nothing changed, so nothing ran.
 */
async function recheckIfChanged(listing: {
  id: string;
  lastCheckedAt: Date | null;
  contentUpdatedAt: Date;
}): Promise<{ assessment: RiskAssessment; data: Prisma.ListingUncheckedUpdateManyInput } | null> {
  if (!(await contentChangedSinceCheck(listing))) return null;
  await prepareListingDerivedFields(listing.id);
  const checkedAt = new Date();
  const assessment = await assessListing(listing.id);
  return { assessment, data: riskData(assessment, checkedAt) };
}

const RECHECK_SELECT = {
  id: true,
  status: true,
  title: true,
  lastCheckedAt: true,
  contentUpdatedAt: true,
  owner: { select: OWNER_SELECT },
} satisfies Prisma.ListingSelect;

export type PriceRecheckResult = { status: ListingStatus; rechecked: boolean; reasons: RiskReason[] };

/**
 * Call after the owner changed the price of a LIVE listing (the wizard's auto-save): when the
 * content changed since the last check, the automatic checks run again at once (a price far
 * below the area, together with anything else that changed). A high-risk result takes the
 * listing off the site (IN_REVIEW, "listing_in_review" email) until a moderator checks it.
 */
export async function recheckLiveListingAfterPriceChange(listingId: string, ownerId: string): Promise<PriceRecheckResult> {
  const listing = await loadListing(listingId, RECHECK_SELECT, ownerId);
  if (listing.status !== "LIVE") return { status: listing.status, rechecked: false, reasons: [] };
  const recheck = await recheckIfChanged(listing);
  if (!recheck) return { status: "LIVE", rechecked: false, reasons: [] };
  const { assessment } = recheck;
  const toReview = needsPerson(assessment);
  const applied = await transition(listing.id, "LIVE", { ...recheck.data, ...(toReview ? { status: "IN_REVIEW" } : {}) }, ownerId);
  if (!applied) {
    return { status: (await loadListing(listing.id, { status: true })).status, rechecked: true, reasons: assessment.reasons };
  }
  if (toReview) {
    await notifyOwner(listing.owner, "listing_in_review", { ownerName: listing.owner.name, listingTitle: listing.title }, { optional: true });
    await notifyFounderListingInReview(listing.id, [assessment.blocked ? "blocked" : "recheck"]);
  }
  return { status: toReview ? "IN_REVIEW" : "LIVE", rechecked: true, reasons: assessment.reasons };
}

/**
 * Call after an auto-saved edit of a LIVE listing that must be checked at once (new contact
 * methods, text with scam phrases or contact details: src/lib/wizard/actions.ts updateDraft).
 * Runs the automatic checks on what is public now WITHOUT the publishing requirements (a missing
 * price or a pledge raised since must not stop the check): a result that needs a person takes
 * the listing off the site (IN_REVIEW, "listing_in_review" email, the founder is told).
 */
export async function recheckLiveListingAfterEdit(listingId: string, ownerId: string): Promise<PriceRecheckResult> {
  const listing = await loadListing(listingId, RECHECK_SELECT, ownerId);
  if (listing.status !== "LIVE") return { status: listing.status, rechecked: false, reasons: [] };
  await prepareListingDerivedFields(listing.id);
  const checkedAt = new Date();
  const assessment = await assessListing(listing.id);
  const toReview = needsPerson(assessment);
  const applied = await transition(listing.id, "LIVE", { ...riskData(assessment, checkedAt), ...(toReview ? { status: "IN_REVIEW" } : {}) }, ownerId);
  if (!applied) {
    return { status: (await loadListing(listing.id, { status: true })).status, rechecked: true, reasons: assessment.reasons };
  }
  if (toReview) {
    await notifyOwner(listing.owner, "listing_in_review", { ownerName: listing.owner.name, listingTitle: listing.title }, { optional: true });
    await notifyFounderListingInReview(listing.id, [assessment.blocked ? "blocked" : "recheck"]);
  }
  return { status: toReview ? "IN_REVIEW" : "LIVE", rechecked: true, reasons: assessment.reasons };
}

/**
 * The checks of a live listing's edit could not run (a database or service error): FAIL CLOSED,
 * the listing waits for a person (LIVE → IN_REVIEW) and the founder is told. Never throws.
 */
export async function holdLiveListingForReview(listingId: string, ownerId: string): Promise<boolean> {
  try {
    const applied = await transition(listingId, "LIVE", { status: "IN_REVIEW" }, ownerId);
    if (applied) await notifyFounderListingInReview(listingId, ["recheck"]);
    return applied;
  } catch (error) {
    console.error(`[lifecycle] could not hold live listing ${listingId} for review:`, error);
    return false;
  }
}

// ─── Moderation (staff) ───────────────────────────────────────

const moderationInput = z.object({
  reasonCode: z.enum(MODERATION_REASONS),
  note: z
    .string()
    .trim()
    .max(2000)
    .optional()
    .transform((v) => (v ? v : null)),
});

const MODERATION_SELECT = {
  id: true,
  publicId: true,
  ownerId: true,
  status: true,
  title: true,
  publishedAt: true,
  expiresAt: true,
  moderationReason: true,
  moderationNote: true,
  riskReasons: true,
  lastCheckedAt: true,
  contentUpdatedAt: true,
  owner: { select: OWNER_SELECT },
} satisfies Prisma.ListingSelect;
type ModerationListing = Prisma.ListingGetPayload<{ select: typeof MODERATION_SELECT }>;

export type ModerationResult = { status: ListingStatus; changed: boolean };

/** What the moderator's page showed: approving or restoring is refused when the content changed since. */
export type ModerationSeen = { contentUpdatedAt?: Date | null };

/** The listing changed since the moderator's page was opened, or its checks now say something new. */
export class ContentChangedError extends AppError {
  constructor() {
    super("content_changed", "The listing changed since it was looked at", { status: 409 });
  }
}

function assertSeenContent(listing: ModerationListing, seen: ModerationSeen) {
  if (seen.contentUpdatedAt && seen.contentUpdatedAt.getTime() !== listing.contentUpdatedAt.getTime()) throw new ContentChangedError();
}

function reasonCodes(reasons: unknown): string[] {
  return (Array.isArray(reasons) ? reasons.map((r) => String((r as { code?: unknown })?.code ?? "")) : []).sort();
}

/**
 * Checks results that are up to date before a moderator's decision puts a listing on the site:
 * when the content changed since the checks last ran (an auto-save while waiting or hidden), they
 * run again and are stored. The gate's "first listing" reason is kept (the checks only re-run).
 * Null when nothing changed.
 */
async function freshChecksForModeration(listing: ModerationListing) {
  const recheck = await recheckIfChanged(listing);
  if (!recheck) return null;
  const firstListing = reasonCodes(listing.riskReasons).includes("first_listing") && !recheck.assessment.reasons.some((r) => r.code === "first_listing");
  const assessment: RiskAssessment = firstListing
    ? { ...recheck.assessment, reasons: [...recheck.assessment.reasons, { code: "first_listing", points: 0 }] }
    : recheck.assessment;
  const data = { ...recheck.data, riskReasons: assessment.reasons as unknown as Prisma.InputJsonValue };
  // The moderator's page showed other results (or a blocked phrase is new): they look again first.
  const different = assessment.blocked || reasonCodes(assessment.reasons).join() !== reasonCodes(listing.riskReasons).join();
  return { assessment, data, different };
}

/**
 * A moderator approves a listing waiting for review (or one sent back earlier). It goes live as
 * the moderator saw it: refused (ContentChangedError, "content_changed") when the content changed
 * since their page was opened (`seen`), or when it changed since the automatic checks ran and the
 * checks, run again now and stored, found something new (the page then shows the fresh results).
 * An edit that lands between this check and the update makes the update not apply.
 */
export async function approveListing(listingId: string, staffId: string, seen: ModerationSeen = {}): Promise<ModerationResult> {
  const listing = await loadListing(listingId, MODERATION_SELECT);
  if (listing.status === "LIVE") return { status: "LIVE", changed: false };
  if (!(["IN_REVIEW", "NEEDS_CHANGES", "REJECTED"] as ListingStatus[]).includes(listing.status)) {
    throw new ListingStatusError(listing.status, "approve");
  }
  assertSeenContent(listing, seen);
  const fresh = await freshChecksForModeration(listing);
  const guard = { contentUpdatedAt: listing.contentUpdatedAt };
  if (fresh?.different) {
    await transition(listing.id, listing.status, fresh.data, undefined, guard);
    throw new ContentChangedError();
  }
  const now = new Date();
  const applied = await transition(
    listing.id,
    listing.status,
    { ...(fresh?.data ?? {}), ...(await liveData(listing, now)), reviewedAt: now, reviewedById: staffId },
    undefined,
    guard,
  );
  if (!applied) {
    const current = await loadListing(listing.id, { status: true, contentUpdatedAt: true });
    if (current.status === listing.status) throw new ContentChangedError();
    return { status: current.status, changed: false };
  }

  await audit({
    actorId: staffId,
    action: "listing.approve",
    targetType: "Listing",
    targetId: listing.id,
    details: { from: listing.status, publicId: listing.publicId },
  });
  // A listing sent while translation was off goes live in every language once a key is set.
  try {
    await translateListingIfMissing(listing.id);
  } catch (error) {
    console.error(`[lifecycle] translation of ${listing.id} on approval failed:`, error);
  }
  // Not optional (round 3, brief 9): the host always hears about the decision, by email or, when
  // email is not available, through their other alert channels (src/lib/alerts/listing-decision.ts).
  await notifyListingDecision({
    ownerId: listing.owner.id,
    kind: "approved",
    listingTitle: listing.title,
    path: publicListingPath(listing.publicId),
    email: {
      template: "listing_approved",
      data: { ownerName: listing.owner.name, listingTitle: listing.title, listingUrl: publicListingPath(listing.publicId) },
    },
  });
  return { status: "LIVE", changed: true };
}

async function sendBack(
  kind: "needs_changes" | "rejected",
  listingId: string,
  staffId: string,
  reasonCode: ModerationReason,
  note: string | null | undefined,
): Promise<ModerationResult> {
  const parsed = moderationInput.safeParse({ reasonCode, note: note ?? undefined });
  if (!parsed.success) throw new ValidationError(z.flattenError(parsed.error).fieldErrors);
  const input = parsed.data;

  const target: ListingStatus = kind === "needs_changes" ? "NEEDS_CHANGES" : "REJECTED";
  const allowed: ListingStatus[] =
    kind === "needs_changes"
      ? ["IN_REVIEW", "LIVE", "HIDDEN", "PAUSED"]
      : ["IN_REVIEW", "NEEDS_CHANGES", "LIVE", "HIDDEN", "PAUSED", "EXPIRED"];

  const listing = await loadListing(listingId, MODERATION_SELECT);
  if (listing.status === target && listing.moderationReason === input.reasonCode && listing.moderationNote === input.note) {
    return { status: target, changed: false };
  }
  if (listing.status !== target && !allowed.includes(listing.status)) {
    throw new ListingStatusError(listing.status, kind === "needs_changes" ? "request changes for" : "reject");
  }

  const now = new Date();
  const applied = await transition(listing.id, listing.status, {
    status: target,
    moderationReason: input.reasonCode,
    moderationNote: input.note,
    reviewedAt: now,
    reviewedById: staffId,
  });
  if (!applied) return { status: (await loadListing(listing.id, { status: true })).status, changed: false };

  await audit({
    actorId: staffId,
    action: kind === "needs_changes" ? "listing.request_changes" : "listing.reject",
    targetType: "Listing",
    targetId: listing.id,
    details: { from: listing.status, publicId: listing.publicId, reason: input.reasonCode, note: input.note },
  });

  const locale = ownerLocale(listing.owner);
  const [reason, translatedNote] = await Promise.all([
    reasonText(input.reasonCode, locale),
    input.note ? translateForLocale(input.note, locale) : Promise.resolve(null),
  ]);
  // By email, or through the host's other alert channels when email is not available.
  if (kind === "needs_changes") {
    await notifyListingDecision({
      ownerId: listing.owner.id,
      kind: "needs_changes",
      listingTitle: listing.title,
      path: MY_LISTINGS_PATH,
      email: {
        template: "listing_needs_changes",
        data: { ownerName: listing.owner.name, listingTitle: listing.title, listingUrl: MY_LISTINGS_PATH, reasonText: reason, note: translatedNote?.text ?? null },
      },
    });
  } else {
    await notifyListingDecision({
      ownerId: listing.owner.id,
      kind: "rejected",
      listingTitle: listing.title,
      path: MY_LISTINGS_PATH,
      email: {
        template: "listing_rejected",
        data: { ownerName: listing.owner.name, listingTitle: listing.title, reasonText: reason, note: translatedNote?.text ?? null },
      },
    });
  }
  return { status: target, changed: true };
}

/** A moderator asks the owner to fix something (the listing leaves the public site until then). */
export function requestChanges(
  listingId: string,
  staffId: string,
  reasonCode: ModerationReason,
  note?: string | null,
): Promise<ModerationResult> {
  return sendBack("needs_changes", listingId, staffId, reasonCode, note);
}

/** A moderator rejects a listing (scam, prohibited content…). */
export function rejectListing(
  listingId: string,
  staffId: string,
  reasonCode: ModerationReason,
  note?: string | null,
): Promise<ModerationResult> {
  return sendBack("rejected", listingId, staffId, reasonCode, note);
}

/**
 * A moderator puts a listing that was hidden after reports back online (or EXPIRED if its time ran
 * out). The host can edit a hidden listing: when it changed since the automatic checks ran, they run
 * again first, and a result that needs a person sends it to review (IN_REVIEW, the founder is told)
 * instead of the site. Refused when the content changed since the moderator's page was opened.
 */
export async function restoreHiddenListing(listingId: string, staffId: string, seen: ModerationSeen = {}): Promise<ModerationResult> {
  const listing = await loadListing(listingId, MODERATION_SELECT);
  if (listing.status === "LIVE") return { status: "LIVE", changed: false };
  if (listing.status !== "HIDDEN") throw new ListingStatusError(listing.status, "restore");
  assertSeenContent(listing, seen);
  const fresh = await freshChecksForModeration(listing);
  const toReview = !!fresh && needsPerson(fresh.assessment);
  const now = new Date();
  const target: ListingStatus = toReview ? "IN_REVIEW" : listing.expiresAt && listing.expiresAt <= now ? "EXPIRED" : "LIVE";
  const applied = await transition(
    listing.id,
    "HIDDEN",
    { ...(fresh?.data ?? {}), status: target, ...(toReview ? {} : { reviewedAt: now, reviewedById: staffId }) },
    undefined,
    { contentUpdatedAt: listing.contentUpdatedAt },
  );
  if (!applied) {
    const current = await loadListing(listing.id, { status: true });
    if (current.status === "HIDDEN") throw new ContentChangedError();
    return { status: current.status, changed: false };
  }
  await audit({
    actorId: staffId,
    action: "listing.restore",
    targetType: "Listing",
    targetId: listing.id,
    details: { publicId: listing.publicId, to: target, rechecked: !!fresh },
  });
  if (toReview) await notifyFounderListingInReview(listing.id, [fresh?.assessment.blocked ? "blocked" : "recheck"]);
  return { status: target, changed: true };
}

// ─── Reports ──────────────────────────────────────────────────

export type ApplyReportResult = { hidden: boolean; openReports: number; countedReports: number };

/**
 * Call after a Report on a listing was created: counts it, and when the OPEN reports that count
 * (countAutoHideReports: one per trusted account — older than newAccountDays or phone-verified —
 * and per device) reach settings.reportsToAutoHide, a LIVE listing is HIDDEN until a moderator
 * checks it (the owner is emailed). Every report still reaches the moderators. Resolve or dismiss
 * the reports before restoring, or the next report hides it again.
 */
export async function applyReport(listingId: string, now: Date = new Date()): Promise<ApplyReportResult> {
  const listing = await db.listing.update({
    where: { id: listingId },
    data: { reportCount: { increment: 1 } },
    select: { id: true, publicId: true, status: true, title: true, owner: { select: OWNER_SELECT } },
  });
  const [reports, settings] = await Promise.all([
    db.report.findMany({
      // Listing reports only: turned-away reports (about the host, round 3) never hide anything
      // by themselves.
      where: { listingId, status: "OPEN", kind: "GENERAL", targetType: "LISTING" },
      orderBy: { createdAt: "asc" },
      select: {
        reporterId: true,
        reporter: {
          select: {
            createdAt: true,
            phoneNumberVerified: true,
            status: true,
            deletedAt: true,
            devices: { select: { deviceHash: true } },
          },
        },
      },
    }),
    getSettings(),
  ]);
  const openReports = reports.length;
  const countedReports = countAutoHideReports(
    reports.map((r) => ({
      reporterId: r.reporterId,
      reporter: r.reporter && { ...r.reporter, devices: r.reporter.devices.map((d) => d.deviceHash) },
    })),
    { now, newAccountDays: siteConfig.safety.newAccountDays },
  );
  const result = { hidden: false, openReports, countedReports };
  if (listing.status !== "LIVE" || countedReports < settings.reportsToAutoHide) return result;

  const applied = await transition(listing.id, "LIVE", { status: "HIDDEN" });
  if (!applied) return result;
  await audit({
    actorId: null,
    action: "listing.auto_hide",
    targetType: "Listing",
    targetId: listing.id,
    details: { publicId: listing.publicId, openReports, countedReports, threshold: settings.reportsToAutoHide },
  });
  await notifyOwner(listing.owner, "listing_hidden_reports", { ownerName: listing.owner.name, listingTitle: listing.title });
  return { ...result, hidden: true };
}

// ─── Owner actions ────────────────────────────────────────────

export type OwnerActionResult = { status: ListingStatus; changed: boolean; expiresAt: Date | null };

const OWNER_ACTION_SELECT = {
  ...RECHECK_SELECT,
  ownerId: true,
  dealType: true,
  expiresAt: true,
  publishedAt: true,
} satisfies Prisma.ListingSelect;

/**
 * Is the owner under a report sanction ("hide all their listings" / "remove the host", not yet
 * marked reviewed)? FAILS CLOSED: an error counts as yes.
 */
async function ownerSanctioned(ownerId: string): Promise<boolean> {
  try {
    return await isHostSanctioned(ownerId);
  } catch (error) {
    console.error(`[lifecycle] sanction check for ${ownerId} failed, the listing waits:`, error);
    return true;
  }
}

/**
 * Loads the owner's listing, plans the change and applies it conditionally. A change that puts
 * a listing (back) on the site — unpause, renew — first runs the automatic checks again when
 * the content changed since they last ran: a high-risk result goes to IN_REVIEW instead
 * (with the "listing_in_review" email), so editing while paused cannot skip the checks. A host
 * whose listings staff hid after a report (or who was removed and let back) waits for a person
 * too, until staff mark the host reviewed (host-flags-server.ts isHostSanctioned).
 */
async function ownerAction(
  listingId: string,
  ownerId: string,
  action: string,
  plan: (listing: Prisma.ListingGetPayload<{ select: typeof OWNER_ACTION_SELECT }>, now: Date) =>
    | { noop: true }
    | { data: Prisma.ListingUncheckedUpdateManyInput },
): Promise<OwnerActionResult> {
  const listing = await loadListing(listingId, OWNER_ACTION_SELECT, ownerId);
  const now = new Date();
  const step = plan(listing, now);
  if ("noop" in step) return { status: listing.status, changed: false, expiresAt: listing.expiresAt };
  let data = step.data;
  let toReview = false;
  let why: string[] = ["recheck"];
  if (data.status === "LIVE" && listing.status !== "LIVE") {
    const [recheck, sanctioned] = await Promise.all([recheckIfChanged(listing), ownerSanctioned(listing.ownerId)]);
    toReview = sanctioned || (!!recheck && needsPerson(recheck.assessment));
    if (sanctioned) why = ["flagged_host"];
    // In review it keeps its old dates; approval gives it a fresh expiry (see approveListing).
    if (toReview) data = { ...(recheck?.data ?? {}), status: "IN_REVIEW" };
    else if (recheck) data = { ...data, ...recheck.data };
  }
  const applied = await transition(listing.id, listing.status, data, ownerId);
  const fresh = await loadListing(listing.id, { status: true, expiresAt: true });
  if (!applied) return { status: fresh.status, changed: false, expiresAt: fresh.expiresAt };
  if (action === "delete") await audit({ actorId: ownerId, action: "listing.delete", targetType: "Listing", targetId: listing.id });
  if (toReview) {
    await notifyOwner(listing.owner, "listing_in_review", { ownerName: listing.owner.name, listingTitle: listing.title }, { optional: true });
    await notifyFounderListingInReview(listing.id, why);
  }
  return { status: fresh.status, changed: true, expiresAt: fresh.expiresAt };
}

/** LIVE → PAUSED (hidden from the site, keeps its expiry date). */
export function pauseListing(listingId: string, ownerId: string): Promise<OwnerActionResult> {
  return ownerAction(listingId, ownerId, "pause", (listing) => {
    if (listing.status === "PAUSED") return { noop: true };
    if (listing.status !== "LIVE") throw new ListingStatusError(listing.status, "pause");
    return { data: { status: "PAUSED" } };
  });
}

/** PAUSED → LIVE, or EXPIRED when its time ran out while paused (then the owner renews). */
export function unpauseListing(listingId: string, ownerId: string): Promise<OwnerActionResult> {
  return ownerAction(listingId, ownerId, "unpause", (listing, now) => {
    if (listing.status === "LIVE") return { noop: true };
    if (listing.status !== "PAUSED") throw new ListingStatusError(listing.status, "unpause");
    const expired = listing.expiresAt !== null && listing.expiresAt <= now;
    return { data: { status: expired ? "EXPIRED" : "LIVE" } };
  });
}

const CLOSABLE: readonly ListingStatus[] = ["LIVE", "PAUSED", "EXPIRED"];

/** Rentals: the place is taken (LIVE / PAUSED / EXPIRED → RENTED). */
export function markRented(listingId: string, ownerId: string): Promise<OwnerActionResult> {
  return ownerAction(listingId, ownerId, "rented", (listing) => {
    if (listing.status === "RENTED") return { noop: true };
    if (listing.dealType === "SALE") throw new AppError("wrong_deal_type", "Use markSold for sales", { status: 409 });
    if (!CLOSABLE.includes(listing.status)) throw new ListingStatusError(listing.status, "mark as rented");
    return { data: { status: "RENTED" } };
  });
}

/** Sales: the property is sold (LIVE / PAUSED / EXPIRED → SOLD). */
export function markSold(listingId: string, ownerId: string): Promise<OwnerActionResult> {
  return ownerAction(listingId, ownerId, "sold", (listing) => {
    if (listing.status === "SOLD") return { noop: true };
    if (listing.dealType !== "SALE") throw new AppError("wrong_deal_type", "Only sales can be marked as sold", { status: 409 });
    if (!CLOSABLE.includes(listing.status)) throw new ListingStatusError(listing.status, "mark as sold");
    return { data: { status: "SOLD" } };
  });
}

/**
 * Renew: EXPIRED (or RENTED / SOLD — "available again") → LIVE for another listingExpiryDays,
 * moved up in "Recommended" (bumpedAt). A LIVE listing can be renewed in its last
 * expiryWarningDays days (the "about to expire" email links here); earlier it is a no-op,
 * so renewing is not a free daily bump.
 */
export async function renewListing(listingId: string, ownerId: string): Promise<OwnerActionResult> {
  const { listingExpiryDays } = await getSettings();
  return ownerAction(listingId, ownerId, "renew", (listing, now) => {
    const renewable: ListingStatus[] = ["EXPIRED", "RENTED", "SOLD", "LIVE"];
    if (!renewable.includes(listing.status)) throw new ListingStatusError(listing.status, "renew");
    if (listing.status === "LIVE") {
      const windowStart = listing.expiresAt ? addDays(listing.expiresAt, -siteConfig.listings.expiryWarningDays) : null;
      if (windowStart && now < windowStart) return { noop: true };
    }
    return {
      data: {
        status: "LIVE",
        expiresAt: addDays(now, listingExpiryDays),
        bumpedAt: now,
        renewedAt: now,
        expiryWarnedAt: null,
        publishedAt: listing.publishedAt ?? now,
      },
    };
  });
}

/** Soft delete: status DELETED + deletedAt. Photos stay in storage for moderation history. */
export function softDeleteListing(listingId: string, ownerId: string): Promise<OwnerActionResult> {
  return ownerAction(listingId, ownerId, "delete", (listing, now) => {
    if (listing.status === "DELETED") return { noop: true };
    return { data: { status: "DELETED", deletedAt: now } };
  });
}

// ─── Prices ───────────────────────────────────────────────────

/**
 * Call after the owner changed the price of a published listing (both amounts in `currency`).
 * Writes a PriceChange row. A lower price sets previousPrice / priceDroppedAt (the
 * "Price dropped" label); going back up to the old price or higher removes the label.
 */
export async function recordPriceChange(
  listingId: string,
  oldPrice: number | Prisma.Decimal,
  newPrice: number | Prisma.Decimal,
  currency: Currency,
): Promise<void> {
  const before = Number(oldPrice);
  const after = Number(newPrice);
  if (!Number.isFinite(before) || !Number.isFinite(after) || before <= 0 || after <= 0 || before === after) return;
  const listing = await loadListing(listingId, { id: true, previousPrice: true });
  const drop = after < before;
  const backUp = !drop && listing.previousPrice !== null && after >= Number(listing.previousPrice);
  await db.$transaction([
    db.priceChange.create({ data: { listingId, oldPrice: before, newPrice: after, currency } }),
    ...(drop
      ? [db.listing.update({ where: { id: listingId }, data: { previousPrice: before, priceDroppedAt: new Date() } })]
      : backUp
        ? [db.listing.update({ where: { id: listingId }, data: { previousPrice: null, priceDroppedAt: null } })]
        : []),
  ]);
}

// ─── Expiry (cron) ────────────────────────────────────────────

const EXPIRY_BATCH = 500;

/**
 * Hourly job: emails "about to expire" expiryWarningDays before expiresAt (once, expiryWarnedAt),
 * then turns LIVE listings past expiresAt into EXPIRED with a "listing_expired" email.
 */
export async function expireDueListings(now: Date = new Date()): Promise<{ warned: number; expired: number }> {
  const warnBefore = addDays(now, siteConfig.listings.expiryWarningDays);
  const select = { id: true, title: true, expiresAt: true, owner: { select: OWNER_SELECT } } satisfies Prisma.ListingSelect;

  let warned = 0;
  const expiring = await db.listing.findMany({
    where: { status: "LIVE", expiryWarnedAt: null, expiresAt: { gt: now, lte: warnBefore } },
    select,
    orderBy: { expiresAt: "asc" },
    take: EXPIRY_BATCH,
  });
  for (const listing of expiring) {
    const { count } = await db.listing.updateMany({
      where: { id: listing.id, status: "LIVE", expiryWarnedAt: null },
      data: { expiryWarnedAt: now },
    });
    if (count !== 1) continue;
    warned++;
    await notifyOwner(
      listing.owner,
      "listing_expiring",
      { ownerName: listing.owner.name, listingTitle: listing.title, renewUrl: MY_LISTINGS_PATH, expiresAt: listing.expiresAt! },
      { optional: true },
    );
  }

  let expired = 0;
  const due = await db.listing.findMany({
    where: { status: "LIVE", expiresAt: { lte: now } },
    select,
    orderBy: { expiresAt: "asc" },
    take: EXPIRY_BATCH,
  });
  for (const listing of due) {
    const { count } = await db.listing.updateMany({
      where: { id: listing.id, status: "LIVE", expiresAt: { lte: now } },
      data: { status: "EXPIRED" },
    });
    if (count !== 1) continue;
    expired++;
    await notifyOwner(listing.owner, "listing_expired", {
      ownerName: listing.owner.name,
      listingTitle: listing.title,
      renewUrl: MY_LISTINGS_PATH,
    });
  }
  return { warned, expired };
}
