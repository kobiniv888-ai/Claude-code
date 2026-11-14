/**
 * The encrypted fields for the end-to-end tests (SECURITY_REPORT 12.3.c): the exact address, the
 * exact pin and the guest's phone are stored ENCRYPTED (Listing.addressEnc / pinEnc,
 * Booking.guestPhoneEnc + guestPhoneLookup), so tests that set them up or read them back through
 * SQL use the very same code as the server (src/lib/field-crypto-core.ts) with the same keys
 * (FIELD_ENCRYPTION_KEY from .env; the test server runs as SITE_ENV=development). The plain
 * columns are never written (the database refuses them: Listing_no_plain_location,
 * Booking_no_plain_guest_phone).
 */
import "dotenv/config";
import {
  buildFieldKeyring,
  decodePin,
  encodePin,
  fieldLookup,
  fieldLookups,
  openField,
  sealField,
  type FieldKeyring,
  type Pin,
} from "../../../src/lib/field-crypto-core";

let ring: FieldKeyring | null = null;

function keys(): FieldKeyring {
  // The e2e server is a development site (playwright.config.ts): the same keyring rules.
  ring ??= buildFieldKeyring(process.env, { development: true });
  return ring;
}

export const sealAddress = (address: string) => sealField(keys(), "listing.address", address.trim());
export const sealPin = (pin: Pin) => sealField(keys(), "listing.pin", encodePin(pin));

/** The two columns a booking stores for the guest's phone. */
export function sealGuestPhone(phone: string): { guestPhoneEnc: string; guestPhoneLookup: string } {
  return { guestPhoneEnc: sealField(keys(), "booking.guestPhone", phone), guestPhoneLookup: fieldLookup(keys(), "booking.guestPhone", phone) };
}

export const guestPhoneLookups = (phone: string) => fieldLookups(keys(), "booking.guestPhone", phone);

export const openAddress = (stored: string | null) => (stored ? openField(keys(), "listing.address", stored) : null);
export const openPin = (stored: string | null): Pin | null => (stored ? decodePin(openField(keys(), "listing.pin", stored)) : null);
export const openGuestPhone = (stored: string | null) => (stored ? openField(keys(), "booking.guestPhone", stored) : null);
