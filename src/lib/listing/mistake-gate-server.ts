import "server-only";
import type { CurrencyCode } from "@/config/site";
import type { Prisma } from "@/generated/prisma/client";
import { isAppLocale, pickLocalized } from "@/i18n/locale";
import { db } from "@/lib/db";
import { AppError, NotFoundError } from "@/lib/errors";
import { openListingLocation } from "@/lib/field-crypto";
import type { MistakeIssue } from "./mistake-check";
import { mistakeErrors, visiblePhotos } from "./mistake-errors";

/**
 * The server's publishing gate (round 3, brief 6.1): the mistake check's errors, read from the
 * database, for every status change that puts a listing on the site or in front of a moderator
 * (src/lib/listing/lifecycle.ts: publish, unpause, renew, approve, restore). Errors only, so no
 * price guide and none of the post form's modules. The host's panel and the admin box use
 * ./mistake-check-server.ts (the same errors, plus the warnings).
 */

const GATE_SELECT = {
  dealType: true,
  propertyType: true,
  originalLocale: true,
  title: true,
  description: true,
  // Encrypted (12.3.c); one that cannot be decrypted counts as missing (publishing stays blocked).
  addressEnc: true,
  currency: true,
  photos: { select: { room: true, roomTypeId: true } },
  translations: { where: { editedByOwner: true }, select: { locale: true, title: true, description: true } },
  roomTypes: { where: { active: true }, select: { id: true, names: true } },
} satisfies Prisma.ListingSelect;

type GateClient = Pick<typeof db, "listing">;

/** Every string value of a localized JSON name ({ he, en, … }). */
export function localizedValues(value: Prisma.JsonValue): string[] {
  if (!value || typeof value !== "object" || Array.isArray(value)) return [];
  return Object.values(value).filter((v): v is string => typeof v === "string" && v.trim() !== "");
}

/** The errors that block publishing, as the listing is saved now (`client`: a transaction's, to check under its lock). */
export async function publishingErrors(listingId: string, client: GateClient = db): Promise<MistakeIssue[]> {
  const row = await client.listing.findUnique({ where: { id: listingId }, select: GATE_SELECT });
  if (!row) throw new NotFoundError();
  const locale = isAppLocale(row.originalLocale) ? row.originalLocale : "he";
  return mistakeErrors({
    dealType: row.dealType,
    propertyType: row.propertyType,
    originalLocale: locale,
    title: row.title,
    description: row.description,
    address: openListingLocation({ addressEnc: row.addressEnc }, "publish_gate").address,
    lat: null,
    lng: null,
    city: null,
    currency: row.currency as CurrencyCode,
    maxGuests: null,
    bedsSingle: null,
    bedsDouble: null,
    bedsSofa: null,
    bathrooms: null,
    checkInFrom: null,
    checkOutUntil: null,
    checkInFlexible: true,
    checkOutFlexible: true,
    photos: visiblePhotos(row.photos, new Set(row.roomTypes.map((room) => room.id))),
    translations: row.translations.filter((t) => t.locale !== row.originalLocale),
    roomTypes: row.roomTypes.map((room) => ({
      id: room.id,
      name: pickLocalized(room.names, locale) || "",
      names: localizedValues(room.names),
      maxGuests: null,
      bedsSingle: null,
      bedsDouble: null,
    })),
  });
}

/** The listing has errors that block publishing (codes in `mistakes`); the host fixes them in the form. */
export class ListingMistakesError extends AppError {
  readonly mistakes: string[];

  constructor(mistakes: string[], code = "listing_mistakes") {
    super(code, `The listing has errors that block publishing: ${mistakes.join(", ")}`, { status: 422 });
    this.mistakes = mistakes;
  }
}

/**
 * Throws ListingMistakesError while the listing has errors that block publishing. FAILS CLOSED:
 * when the check itself can't run, it throws too (the listing stays where it is).
 * `code`: "listing_mistakes" for the owner, "listing_has_mistakes" for staff.
 */
export async function assertNoListingMistakes(
  listingId: string,
  options: { client?: GateClient; code?: "listing_mistakes" | "listing_has_mistakes" } = {},
): Promise<void> {
  let errors: MistakeIssue[];
  try {
    errors = await publishingErrors(listingId, options.client);
  } catch (error) {
    if (error instanceof NotFoundError) throw error;
    console.error(`[mistake-check] check of ${listingId} failed, the listing stays where it is:`, error);
    throw new ListingMistakesError(["check_failed"], options.code);
  }
  if (errors.length > 0) throw new ListingMistakesError(errors.map((e) => e.code), options.code);
}
