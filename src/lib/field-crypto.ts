import "server-only";
import { readSiteEnv } from "@/lib/site-env";
import { recordSecurityEvent } from "@/lib/security/events";
import { taintObject } from "@/lib/security/taint";
import {
  buildFieldKeyring,
  decodePin,
  encodePin,
  fieldLookup,
  fieldLookups,
  isFieldCryptoError,
  openField,
  sealField,
  type FieldCryptoReason,
  type FieldKeyring,
  type FieldPurpose,
  type Pin,
} from "./field-crypto-core";

/**
 * THE one module for the encrypted fields (SECURITY_REPORT 12.3.c, D7 (a)): the listing's exact
 * address (`Listing.addressEnc`), its exact pin (`Listing.pinEnc`) and the guest's phone on a
 * booking (`Booking.guestPhoneEnc`, with `Booking.guestPhoneLookup` for "bookings made with this
 * number"). Format, keys and rotation: ./field-crypto-core.ts and docs/security/field-encryption.md.
 *
 * Writing (seal*): throws when there is no usable key — a value is never stored in plain text
 * instead. The old plain columns (`Listing.address/lat/lng`, `Booking.guestPhone`; Prisma fields
 * `legacy*`) are never written again: scripts/encrypt-fields.ts empties them and a database CHECK
 * refuses new values (tests/unit/field-encryption-guard.test.ts).
 *
 * Reading (open*): FAIL CLOSED and never throws. A value that cannot be opened (wrong or missing
 * key, changed ciphertext) reads as missing — the whole location, never half of it — the result
 * says `failed`, and a `field_decrypt_failed` security event is written (once a minute per field,
 * reason and place). Pages show their "not available" state instead of crashing.
 *
 * Who may open what: only the code paths the founder allowed (Q12) — the owner's own post form,
 * the guest's trip page and calendar file inside the address window, the booking emails, the
 * host's booking page and admin views for staff allowed to see phones (ADMIN), the data export to
 * the person themselves, and the server-side computations at save time (walking times, nearby
 * places). Everything public uses the moved public point (approxLat/approxLng) and never opens a
 * pin. Decrypted values come back in objects tainted by reference (React taint): only a DTO built
 * from their fields may reach a page.
 */

let ring: FieldKeyring | null = null;
let warnedDevelopmentKey = false;

/** The keyring from the settings, built once per server (throws FieldCryptoError when unusable). */
export function fieldKeyring(): FieldKeyring {
  if (ring) return ring;
  const next = buildFieldKeyring(process.env, { development: readSiteEnv() === "development" });
  if (next.current.source === "development" && !warnedDevelopmentKey) {
    warnedDevelopmentKey = true;
    console.warn(
      "[field-crypto] FIELD_ENCRYPTION_KEY is not set — using a development key derived from BETTER_AUTH_SECRET. " +
        "Set FIELD_ENCRYPTION_KEY (openssl rand -base64 32) before going live (see .env.example).",
    );
  }
  ring = next;
  return ring;
}

/** Tests only: read the settings again on the next call. */
export function resetFieldKeyringForTests(): void {
  ring = null;
}

// ─── Writing ──────────────────────────────────────────────────

/** The sealed exact address (trimmed), or null for none. */
export function sealAddress(address: string | null | undefined): string | null {
  const text = typeof address === "string" ? address.trim() : "";
  return text ? sealField(fieldKeyring(), "listing.address", text) : null;
}

/** The sealed exact pin, or null for none. */
export function sealPin(pin: Pin | null | undefined): string | null {
  return pin ? sealField(fieldKeyring(), "listing.pin", encodePin(pin)) : null;
}

/** The guest's phone for a booking: sealed, plus its lookup value (the per-phone booking cap). */
export function sealGuestPhone(phone: string): { guestPhoneEnc: string; guestPhoneLookup: string } {
  const value = phone.trim();
  if (!value) throw new TypeError("sealGuestPhone: empty phone");
  const keys = fieldKeyring();
  return { guestPhoneEnc: sealField(keys, "booking.guestPhone", value), guestPhoneLookup: fieldLookup(keys, "booking.guestPhone", value) };
}

/** Every lookup value of these spellings of a number, under every key (current and previous). */
export function guestPhoneLookups(phones: readonly string[]): string[] {
  const keys = fieldKeyring();
  const values = [...new Set(phones.map((phone) => phone.trim()).filter(Boolean))];
  return [...new Set(values.flatMap((phone) => fieldLookups(keys, "booking.guestPhone", phone)))];
}

// ─── Reading (fail closed) ────────────────────────────────────

const EVENT_EVERY_MS = 60_000;
const lastEvent = new Map<string, number>();

function reasonOf(error: unknown): FieldCryptoReason {
  return isFieldCryptoError(error) ? error.reason : "tampered";
}

/** Logs (no value, no id) and records a security event, at most once a minute per field, reason and place. */
function reportFailure(purpose: FieldPurpose, reason: FieldCryptoReason, where: string): void {
  const key = `${purpose}|${reason}|${where}`;
  const now = Date.now();
  if ((lastEvent.get(key) ?? 0) > now - EVENT_EVERY_MS) return;
  lastEvent.set(key, now);
  console.error(`[field-crypto] could not open ${purpose} (${reason}) in ${where}: shown as not available`);
  void recordSecurityEvent({ type: "field_decrypt_failed", ip: null, meta: { field: purpose, reason, where } });
}

/** Tests only: forget the once-a-minute memory. */
export function resetFieldEventsForTests(): void {
  lastEvent.clear();
}

type Opened<T> = { value: T | null; failed: boolean };

function open<T>(purpose: FieldPurpose, stored: string | null | undefined, where: string, decode: (text: string) => T): Opened<T> {
  if (stored === null || stored === undefined || stored === "") return { value: null, failed: false };
  try {
    return { value: decode(openField(fieldKeyring(), purpose, stored)), failed: false };
  } catch (error) {
    reportFailure(purpose, reasonOf(error), where);
    return { value: null, failed: true };
  }
}

/** The exact location of a listing, opened as ONE unit (decrypted: tainted by reference). */
export type OpenedLocation = {
  address: string | null;
  pin: Pin | null;
  /** A stored value could not be opened: both are null, show the "not available" state. */
  failed: boolean;
};

/**
 * Opens a listing's exact address and pin. `where` names the place for the security event
 * ("trip_page", "post_form"…). Pass only the columns the caller may open: a caller that needs only
 * the pin selects only `pinEnc`.
 */
export function openListingLocation(row: { addressEnc?: string | null; pinEnc?: string | null }, where: string): OpenedLocation {
  const address = open("listing.address", row.addressEnc, where, (text) => text);
  const pin = open("listing.pin", row.pinEnc, where, decodePin);
  const failed = address.failed || pin.failed;
  const location: OpenedLocation = failed ? { address: null, pin: null, failed } : { address: address.value, pin: pin.value, failed };
  taintObject("decrypted exact location", location);
  taintObject("decrypted exact pin", location.pin);
  return location;
}

/**
 * Only the exact pin (save-time computations: walking times, nearby places; the trip map). The pin
 * object is tainted by reference: a page gets only a copy of the numbers it needs.
 */
export function openPin(stored: string | null | undefined, where: string): Opened<Pin> {
  const opened = open("listing.pin", stored, where, decodePin);
  taintObject("decrypted exact pin", opened.value);
  return opened;
}

/**
 * The guest's phone on a booking (E.164), or null (none, erased, or not openable: `failed`).
 * A phone is a short string that legitimately reaches its host's and an ADMIN's own pages, so it is
 * not tainted by value (React taint would block those too): the rows it is read with are tainted by
 * reference, and only the callers allowed by Q12 call this.
 */
export function openGuestPhone(stored: string | null | undefined, where: string): Opened<string> {
  return open("booking.guestPhone", stored, where, (text) => text);
}

export type { Pin } from "./field-crypto-core";
