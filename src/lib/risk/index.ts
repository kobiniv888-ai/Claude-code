import "server-only";
import { siteConfig } from "@/config/site";
import type { Prisma } from "@/generated/prisma/client";
import { db } from "@/lib/db";
import { NotFoundError } from "@/lib/errors";
import { getSettings } from "@/lib/settings";
import { detectContactInfo, hasContactInfo, type ContactInfoFindings } from "./contact-info";
import { lookupPhoneLine } from "./phone-lookup";
import { baselinePrice, comparablePrice, referencePrice } from "./price";
import { scanText } from "./scan";

/**
 * Automatic scam checks on every new or edited listing (BRIEF §10). Read-only: the caller
 * (submitForPublication in @/lib/listing/lifecycle) stores the result on the listing.
 *
 *   const { score, reasons, requiresReview, blocked } = await assessListing(listing.id);
 *
 * | check                                                          | points        |
 * |----------------------------------------------------------------|---------------|
 * | same photo (dHash distance ≤ 6) in another account's listing   | +45           |
 * | same photo in another listing of the same owner                | +10           |
 * | price < lowPriceRatio × median of the area                     | +30           |
 * | scam phrases (built-in + admin "banned words")                 | +weight, ≤ 60 |
 * | a BLOCK phrase                                                 | blocked       |
 * | phone numbers / links / emails / @handles in title or text     | +15           |
 * | new account (< newAccountDays) posting > N listings in 24 h    | +25           |
 * | owner's device also used by other accounts                     | +20           |
 * | owner / contact phone is a virtual (VoIP) number               | +25           |
 * | first listing of the account                                   | review, 0     |
 * | owner's phone not verified                                     | blocked       |
 *
 * requiresReview = first listing OR score ≥ settings.reviewRiskThreshold. Score is capped at 100.
 *
 * Two more checks are pluggable and OFF by default — set them in `riskHooks` at startup
 * (e.g. from src/instrumentation.ts) once a provider is chosen:
 *
 * - riskHooks.reverseImageSearch — "the photos were found elsewhere online": send each photo's
 *   public URL (photoUrl(photo, "md") from @/lib/media) to a reverse-image service such as
 *   Google Cloud Vision WEB_DETECTION or TinEye, and return
 *   { code: "duplicate_photos_other_account", points: 45, detail: "found online: <domain>" }
 *   when full matches are on other sites (ignore our own domain).
 * - riskHooks.photoOcr — "phone numbers hidden in the photos": run OCR (Google Cloud Vision
 *   TEXT_DETECTION, AWS Textract…) on each photo, pass the text to detectContactInfo() and
 *   return { code: "contact_info_in_text", points: 15, detail: "in photo: …" } when it finds any.
 *
 * Hooks receive the listing's photos and text, must be fail-safe (errors are logged and
 * ignored) and should cache by photo id — they cost money per image.
 */

export const RISK_REASON_CODES = [
  "duplicate_photos_other_account",
  "duplicate_photos_same_account",
  "price_far_below_area",
  "scam_phrase",
  "blocked_phrase",
  "contact_info_in_text",
  "new_account_velocity",
  "shared_device",
  "voip_phone",
  "first_listing",
  "phone_not_verified",
] as const;
export type RiskReasonCode = (typeof RISK_REASON_CODES)[number];

export type RiskReason = { code: RiskReasonCode; points: number; detail?: string };

export type RiskAssessment = {
  score: number;
  reasons: RiskReason[];
  requiresReview: boolean;
  blocked: boolean;
};

export const RISK_POINTS = {
  duplicatePhotosOtherAccount: 45,
  duplicatePhotosSameAccount: 10,
  priceFarBelowArea: 30,
  scamPhrasesMax: 60,
  contactInfoInText: 15,
  newAccountVelocity: 25,
  sharedDevice: 20,
  voipPhone: 25,
} as const;

/** Photos at most this many bits apart (of 64) are "the same photo". */
export const DUPLICATE_PHOTO_MAX_DISTANCE = 6;

export type RiskHookContext = {
  listingId: string;
  ownerId: string;
  text: string;
  photos: { id: string; url: string; storageKey: string | null; phash: string | null }[];
};
export type RiskHook = (context: RiskHookContext) => Promise<RiskReason[]>;

/** Optional, paid checks — see the module comment. Both OFF (null) by default. */
export const riskHooks: { reverseImageSearch: RiskHook | null; photoOcr: RiskHook | null } = {
  reverseImageSearch: null,
  photoOcr: null,
};

const LISTING_SELECT = {
  id: true,
  ownerId: true,
  title: true,
  description: true,
  dealType: true,
  propertyType: true,
  pricePeriod: true,
  priceUsd: true,
  pricePerSqmUsd: true,
  cityId: true,
  city: { select: { slug: true } },
  isDemo: true,
  publishedAt: true,
  contactMethods: true,
  photos: { select: { id: true, url: true, storageKey: true, phash: true } },
  translations: { where: { editedByOwner: true }, select: { title: true, description: true } },
  owner: { select: { createdAt: true, phoneNumber: true, phoneNumberVerified: true } },
} satisfies Prisma.ListingSelect;

type ListingForRisk = Prisma.ListingGetPayload<{ select: typeof LISTING_SELECT }>;

type CheckResult = { reasons: RiskReason[]; blocked?: boolean; firstListing?: boolean };

// ─── Individual checks ────────────────────────────────────────

async function checkDuplicatePhotos(listing: ListingForRisk): Promise<CheckResult> {
  const hashes = [...new Set(listing.photos.map((p) => p.phash).filter((h): h is string => !!h && /^[0-9a-f]{16}$/.test(h)))];
  if (hashes.length === 0) return { reasons: [] };

  const rows = await db.$queryRaw<{ listingId: string; ownerId: string; publicId: number; matches: number }[]>`
    WITH candidates AS MATERIALIZED (
      SELECT p."listingId", p."phash"
      FROM "ListingPhoto" p
      WHERE p."listingId" <> ${listing.id} AND p."phash" ~ '^[0-9a-f]{16}$'
    )
    SELECT c."listingId", l."ownerId", l."publicId", COUNT(DISTINCT mine.h)::int AS matches
    FROM candidates c
    JOIN "Listing" l ON l."id" = c."listingId"
    JOIN unnest(${hashes}::text[]) AS mine(h)
      ON bit_count(('x' || c."phash")::bit(64) # ('x' || mine.h)::bit(64)) <= ${DUPLICATE_PHOTO_MAX_DISTANCE}
    GROUP BY c."listingId", l."ownerId", l."publicId"
    ORDER BY matches DESC
    LIMIT 20`;

  const reasons: RiskReason[] = [];
  const other = rows.filter((r) => r.ownerId !== listing.ownerId);
  const same = rows.filter((r) => r.ownerId === listing.ownerId);
  if (other.length > 0) {
    reasons.push({
      code: "duplicate_photos_other_account",
      points: RISK_POINTS.duplicatePhotosOtherAccount,
      detail: other.map((r) => `#${r.publicId} (${r.matches})`).join(", ").slice(0, 300),
    });
  }
  if (same.length > 0) {
    reasons.push({
      code: "duplicate_photos_same_account",
      points: RISK_POINTS.duplicatePhotosSameAccount,
      detail: same.map((r) => `#${r.publicId} (${r.matches})`).join(", ").slice(0, 300),
    });
  }
  return { reasons };
}

async function checkPrice(listing: ListingForRisk): Promise<CheckResult> {
  const toNumber = (v: Prisma.Decimal | null) => (v === null ? null : Number(v));
  const value = comparablePrice({
    dealType: listing.dealType,
    pricePeriod: listing.pricePeriod,
    priceUsd: toNumber(listing.priceUsd),
    pricePerSqmUsd: toNumber(listing.pricePerSqmUsd),
  });
  if (value === null || !listing.cityId) return { reasons: [] };

  const rows = await db.listing.findMany({
    where: {
      id: { not: listing.id },
      status: "LIVE",
      cityId: listing.cityId,
      dealType: listing.dealType,
      isDemo: listing.isDemo,
    },
    select: { propertyType: true, pricePeriod: true, priceUsd: true, pricePerSqmUsd: true },
    orderBy: { publishedAt: "desc" },
    take: 1000,
  });
  const samples = rows
    .map((row) => ({
      propertyType: row.propertyType,
      value: comparablePrice({
        dealType: listing.dealType,
        pricePeriod: row.pricePeriod,
        priceUsd: toNumber(row.priceUsd),
        pricePerSqmUsd: toNumber(row.pricePerSqmUsd),
      }),
    }))
    .filter((s): s is { propertyType: typeof s.propertyType; value: number } => s.value !== null);

  const reference = referencePrice(
    samples,
    listing.propertyType,
    baselinePrice(listing.city?.slug, listing.dealType, listing.propertyType),
  );
  if (value >= reference.value * siteConfig.safety.lowPriceRatio) return { reasons: [] };
  return {
    reasons: [
      {
        code: "price_far_below_area",
        points: RISK_POINTS.priceFarBelowArea,
        detail: `${Math.round(value)} USD vs ${Math.round(reference.value)} USD (${reference.source}${reference.samples ? `, ${reference.samples}` : ""})`,
      },
    ],
  };
}

function listingText(listing: ListingForRisk): string {
  return [listing.title, listing.description, ...listing.translations.flatMap((t) => [t.title, t.description])]
    .filter(Boolean)
    .join("\n");
}

async function checkPhrases(listing: ListingForRisk): Promise<CheckResult> {
  const { hits } = await scanText(listingText(listing));
  const reasons: RiskReason[] = [];
  const flags = hits.filter((h) => h.action === "FLAG");
  const blocks = hits.filter((h) => h.action === "BLOCK");
  if (flags.length > 0) {
    const points = Math.min(
      RISK_POINTS.scamPhrasesMax,
      flags.reduce((sum, h) => sum + h.weight, 0),
    );
    reasons.push({ code: "scam_phrase", points, detail: flags.map((h) => `"${h.phrase}"`).join(", ").slice(0, 300) });
  }
  if (blocks.length > 0) {
    reasons.push({
      code: "blocked_phrase",
      points: Math.min(RISK_POINTS.scamPhrasesMax, blocks.reduce((sum, h) => sum + h.weight, 0)),
      detail: blocks.map((h) => `"${h.phrase}"`).join(", ").slice(0, 300),
    });
  }
  return { reasons, blocked: blocks.length > 0 };
}

function describeContactInfo(found: ContactInfoFindings): string {
  const mask = (value: string) => (value.length > 6 ? `${value.slice(0, 4)}…${value.slice(-2)}` : value);
  return [
    ...found.phones.map((p) => `phone ${mask(p)}`),
    ...found.urls.map((u) => `link ${u.slice(0, 40)}`),
    ...found.emails.map((e) => `email ${e.slice(0, 40)}`),
    ...found.handles.map((h) => `handle ${h}`),
  ]
    .join(", ")
    .slice(0, 300);
}

async function checkContactInfo(listing: ListingForRisk): Promise<CheckResult> {
  const found = detectContactInfo(listingText(listing));
  if (!hasContactInfo(found)) return { reasons: [] };
  return { reasons: [{ code: "contact_info_in_text", points: RISK_POINTS.contactInfoInText, detail: describeContactInfo(found) }] };
}

async function checkVelocity(listing: ListingForRisk): Promise<CheckResult> {
  const { newAccountDays, newAccountMaxListingsPerDay } = siteConfig.safety;
  const accountAgeMs = Date.now() - listing.owner.createdAt.getTime();
  if (accountAgeMs >= newAccountDays * 24 * 3600 * 1000) return { reasons: [] };
  const recent = await db.listing.count({
    where: { ownerId: listing.ownerId, createdAt: { gte: new Date(Date.now() - 24 * 3600 * 1000) } },
  });
  if (recent <= newAccountMaxListingsPerDay) return { reasons: [] };
  return {
    reasons: [{ code: "new_account_velocity", points: RISK_POINTS.newAccountVelocity, detail: `${recent} listings in 24 h` }],
  };
}

async function checkSharedDevice(listing: ListingForRisk): Promise<CheckResult> {
  const devices = await db.deviceLink.findMany({ where: { userId: listing.ownerId }, select: { deviceHash: true } });
  if (devices.length === 0) return { reasons: [] };
  const others = await db.deviceLink.findMany({
    where: { deviceHash: { in: devices.map((d) => d.deviceHash) }, userId: { not: listing.ownerId } },
    select: { userId: true },
    distinct: ["userId"],
    take: 50,
  });
  if (others.length === 0) return { reasons: [] };
  return {
    reasons: [{ code: "shared_device", points: RISK_POINTS.sharedDevice, detail: `${others.length} other account(s)` }],
  };
}

const PHONE_CHANNELS = new Set(["WHATSAPP", "VIBER", "PHONE", "SMS", "TELEGRAM"]);

function contactPhones(listing: ListingForRisk): string[] {
  const phones = new Set<string>();
  if (listing.owner.phoneNumber) phones.add(listing.owner.phoneNumber);
  if (Array.isArray(listing.contactMethods)) {
    for (const method of listing.contactMethods) {
      if (!method || typeof method !== "object") continue;
      const { channel, value } = method as { channel?: unknown; value?: unknown };
      if (typeof channel === "string" && PHONE_CHANNELS.has(channel) && typeof value === "string" && /^\+[1-9]\d{6,14}$/.test(value)) {
        phones.add(value);
      }
    }
  }
  return [...phones].slice(0, 3);
}

async function checkVoip(listing: ListingForRisk): Promise<CheckResult> {
  for (const phone of contactPhones(listing)) {
    const info = await lookupPhoneLine(phone);
    if (info?.isVoip) {
      return {
        reasons: [{ code: "voip_phone", points: RISK_POINTS.voipPhone, detail: `…${phone.slice(-4)} ${info.carrier ?? ""}`.trim() }],
      };
    }
  }
  return { reasons: [] };
}

async function checkFirstListing(listing: ListingForRisk): Promise<CheckResult> {
  if (listing.publishedAt) return { reasons: [] };
  const earlier = await db.listing.count({
    where: { ownerId: listing.ownerId, id: { not: listing.id }, publishedAt: { not: null } },
  });
  if (earlier > 0) return { reasons: [] };
  return { reasons: [{ code: "first_listing", points: 0 }], firstListing: true };
}

function checkPhoneVerified(listing: ListingForRisk): CheckResult {
  if (listing.owner.phoneNumber && listing.owner.phoneNumberVerified === true) return { reasons: [] };
  return { reasons: [{ code: "phone_not_verified", points: 0 }], blocked: true };
}

async function runHooks(listing: ListingForRisk): Promise<CheckResult> {
  const hooks = [riskHooks.reverseImageSearch, riskHooks.photoOcr].filter((h): h is RiskHook => !!h);
  if (hooks.length === 0) return { reasons: [] };
  const context: RiskHookContext = {
    listingId: listing.id,
    ownerId: listing.ownerId,
    text: listingText(listing),
    photos: listing.photos,
  };
  const results = await Promise.allSettled(hooks.map((hook) => hook(context)));
  const reasons: RiskReason[] = [];
  for (const result of results) {
    if (result.status === "fulfilled") reasons.push(...result.value.filter((r) => RISK_REASON_CODES.includes(r.code)));
    else console.error("[risk] hook failed:", result.reason);
  }
  return { reasons };
}

/** A failing check (network, database hiccup) must never stop publishing — it is logged instead. */
async function safely(name: string, check: () => Promise<CheckResult> | CheckResult): Promise<CheckResult> {
  try {
    return await check();
  } catch (error) {
    console.error(`[risk] check "${name}" failed:`, error);
    return { reasons: [] };
  }
}

// ─── Assessment ───────────────────────────────────────────────

/** Combines check results into the final assessment (exported for tests). */
export function combineRiskResults(results: CheckResult[], reviewThreshold: number): RiskAssessment {
  const reasons = results.flatMap((r) => r.reasons);
  // The same code from two sources (e.g. a hook) counts once, with the higher points.
  const byCode = new Map<RiskReasonCode, RiskReason>();
  for (const reason of reasons) {
    const existing = byCode.get(reason.code);
    if (!existing || reason.points > existing.points) byCode.set(reason.code, reason);
  }
  const unique = [...byCode.values()].sort((a, b) => b.points - a.points);
  const score = Math.min(100, unique.reduce((sum, r) => sum + r.points, 0));
  const firstListing = results.some((r) => r.firstListing);
  return {
    score,
    reasons: unique,
    requiresReview: firstListing || score >= reviewThreshold,
    blocked: results.some((r) => r.blocked),
  };
}

/**
 * True when `phash` matches a photo of another account's listing (the same test as the
 * duplicate-photo check). Used when a photo is added to a listing that is already live.
 */
export async function isPhotoOfOtherAccount(phash: string, listingId: string, ownerId: string): Promise<boolean> {
  if (!/^[0-9a-f]{16}$/.test(phash)) return false;
  const rows = await db.$queryRaw<{ found: boolean }[]>`
    SELECT EXISTS (
      SELECT 1
      FROM "ListingPhoto" p
      JOIN "Listing" l ON l."id" = p."listingId"
      WHERE p."listingId" <> ${listingId} AND l."ownerId" <> ${ownerId} AND p."phash" ~ '^[0-9a-f]{16}$'
        AND bit_count(('x' || p."phash")::bit(64) # ('x' || ${phash})::bit(64)) <= ${DUPLICATE_PHOTO_MAX_DISTANCE}
    ) AS found`;
  return rows[0]?.found === true;
}

export async function assessListing(listingId: string): Promise<RiskAssessment> {
  const listing = await db.listing.findUnique({ where: { id: listingId }, select: LISTING_SELECT });
  if (!listing) throw new NotFoundError("Listing not found");
  const settings = await getSettings();

  const results = await Promise.all([
    safely("phone_verified", () => checkPhoneVerified(listing)),
    safely("first_listing", () => checkFirstListing(listing)),
    safely("duplicate_photos", () => checkDuplicatePhotos(listing)),
    safely("price", () => checkPrice(listing)),
    safely("phrases", () => checkPhrases(listing)),
    safely("contact_info", () => checkContactInfo(listing)),
    safely("velocity", () => checkVelocity(listing)),
    safely("shared_device", () => checkSharedDevice(listing)),
    safely("voip", () => checkVoip(listing)),
    safely("hooks", () => runHooks(listing)),
  ]);
  return combineRiskResults(results, settings.reviewRiskThreshold);
}

/** Reads Listing.riskReasons (JSON) safely — for the moderation queue. */
export function parseRiskReasons(value: unknown): RiskReason[] {
  if (!Array.isArray(value)) return [];
  return value.flatMap((item) => {
    if (!item || typeof item !== "object") return [];
    const { code, points, detail } = item as Record<string, unknown>;
    if (typeof code !== "string" || !(RISK_REASON_CODES as readonly string[]).includes(code)) return [];
    return [
      {
        code: code as RiskReasonCode,
        points: typeof points === "number" && Number.isFinite(points) ? points : 0,
        ...(typeof detail === "string" ? { detail } : {}),
      },
    ];
  });
}

export { detectContactInfo, hasContactInfo, type ContactInfoFindings } from "./contact-info";
export { scanText, clearBannedWordsCache, type ScanHit } from "./scan";
