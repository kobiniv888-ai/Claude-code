import { siteConfig } from "@/config/site";
import { BUSINESS_PROPERTY_TYPES } from "@/lib/listing/fields";
import { detectContactInfo, type ContactInfoFindings } from "@/lib/risk/contact-info";
import type { MistakeInput, MistakeIssue, MistakePhoto } from "./mistake-check";

/**
 * The mistake check's ERRORS alone (round 3, brief 6.1), pure and client-safe: no exact address for
 * a short stay or a hotel, fewer than 5 photos, contact details in the title, the description, a
 * hand-written translation or an offered room type's name. ./mistake-check.ts adds the warnings
 * and puts everything in the order of the wizard's steps; the server's publishing gate
 * (./mistake-gate-server.ts, used by every status change that puts a listing on the site) needs
 * only these, without the post form's modules.
 */

/** As the text writes it ("054-1234567"), so the host can find it; not the dialable form. */
export function contactParams(findings: ContactInfoFindings): Record<string, string> | null {
  if (findings.phones[0]) return { kind: "phone", value: findings.phoneTexts[0] ?? findings.phones[0] };
  // "ל-host@…" (a Hebrew prefix and a hyphen): the hyphen isn't part of the address shown.
  if (findings.emails[0]) return { kind: "email", value: findings.emails[0].replace(/^[-._]+/, "") };
  if (findings.urls[0]) return { kind: "link", value: findings.urls[0] };
  if (findings.handles[0]) return { kind: "handle", value: findings.handles[0] };
  return null;
}

/** The photos guests see: the main photos and those of the room types the hotel offers. */
export function visiblePhotos<P extends MistakePhoto>(photos: readonly P[], offeredRoomTypeIds: ReadonlySet<string>): P[] {
  return photos.filter((p) => !p.roomTypeId || offeredRoomTypeIds.has(p.roomTypeId));
}

/** Hotels, guesthouses and hostels (room types). */
function isBusiness(input: Pick<MistakeInput, "dealType" | "propertyType">): boolean {
  return input.dealType === "HOTEL_ROOM" || BUSINESS_PROPERTY_TYPES.includes(input.propertyType);
}

/** The errors that block publishing, in the order they are checked. */
export function mistakeErrors(input: MistakeInput): MistakeIssue[] {
  const isHotel = input.dealType === "HOTEL_ROOM";
  const out: MistakeIssue[] = [];
  if ((input.dealType === "SHORT_STAY" || isHotel) && !input.address?.trim()) {
    out.push({ code: "address_missing", severity: "error", field: "address", step: "location" });
  }
  const photoCount = input.photos.filter((p) => isHotel || !p.roomTypeId).length;
  const { minPhotos } = siteConfig.listings;
  if (photoCount < minPhotos) {
    out.push({ code: "photos_too_few", severity: "error", step: "photos", params: { count: photoCount, min: minPhotos } });
  }
  const titleContact = contactParams(detectContactInfo(input.title));
  if (titleContact) out.push({ code: "contact_in_title", severity: "error", field: "title", step: "text", params: titleContact });
  const descriptionContact = contactParams(detectContactInfo(input.description));
  if (descriptionContact) {
    out.push({ code: "contact_in_description", severity: "error", field: "description", step: "text", params: descriptionContact });
  }
  // Hand-written language versions are shown as written: the same rule applies to them.
  for (const translation of input.translations ?? []) {
    const found = contactParams(detectContactInfo(`${translation.title}\n${translation.description}`));
    if (found) {
      out.push({ code: "contact_in_translation", severity: "error", field: "translations", step: "publish", params: { locale: translation.locale, ...found } });
    }
  }
  if (isBusiness(input)) {
    for (const room of input.roomTypes ?? []) {
      const names = [...new Set([room.name, ...(room.names ?? [])].filter(Boolean))];
      const found = names.map((name) => contactParams(detectContactInfo(name))).find(Boolean);
      if (found) out.push({ code: "contact_in_room_name", severity: "error", field: "name", step: "rooms", params: { room: room.name, ...found } });
    }
  }
  return out;
}
