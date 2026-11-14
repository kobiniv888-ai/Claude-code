import { siteConfig } from "@/config/site";
import type { DealType } from "@/generated/prisma/enums";
import type { FieldErrors } from "@/lib/errors";
import { detectContactInfo, hasContactInfo } from "@/lib/risk/contact-info";
import type { SavableStepKey } from "./steps";

/**
 * The mistake check's errors (round 3, brief 6.1) applied to the auto-saves of a LIVE listing
 * (pure, unit-tested). A live listing shows each auto-saved edit at once, so an edit that would add
 * an error that blocks publishing is refused instead of saved: contact details in the title or
 * the description, no exact address for a short stay or a hotel, fewer photos than the minimum.
 * Drafts and listings off the site save anything; publish, unpause, renew and approval refuse
 * them later (src/lib/listing/mistake-check-server.ts).
 */

/** Deal types whose guests need the exact address (they get it after booking). */
const ADDRESS_REQUIRED: ReadonlySet<DealType> = new Set<DealType>(["SHORT_STAY", "HOTEL_ROOM"]);

const hasContact = (text: unknown) => typeof text === "string" && hasContactInfo(detectContactInfo(text));

/**
 * The field errors an auto-save of `step` would add to a live listing (`input`: the step's parsed
 * answers that are being saved; the rest comes from `listing`), or null when it adds none.
 */
export function liveEditFieldErrors(
  step: SavableStepKey,
  input: Record<string, unknown>,
  listing: { dealType: DealType; title: string; description: string },
): FieldErrors | null {
  if (step === "text") {
    const errors: FieldErrors = {};
    if (hasContact("title" in input ? input.title : listing.title)) errors.title = ["contactInText"];
    if (hasContact("description" in input ? input.description : listing.description)) errors.description = ["contactInText"];
    return Object.keys(errors).length > 0 ? errors : null;
  }
  if (step === "location" && "address" in input && ADDRESS_REQUIRED.has(listing.dealType)) {
    const address = typeof input.address === "string" ? input.address.trim() : "";
    if (!address) return { address: ["addressRequired"] };
  }
  return null;
}

/** True when a live listing would be left with fewer photos than guests must see. */
export function belowPhotoMinimum(photosLeft: number): boolean {
  return photosLeft < siteConfig.listings.minPhotos;
}
