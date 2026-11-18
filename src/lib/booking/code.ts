/**
 * Booking numbers: "BT-7K3Q9" (client-safe, pure). 5 characters from a 32-letter alphabet
 * without 0/O/1/I (about 33 million codes); the service retries on the rare collision.
 */
import { BOOKING_CODE_ALPHABET, BOOKING_CODE_LENGTH, BOOKING_CODE_PREFIX } from "./constants";

const CODE_PATTERN = new RegExp(`^${BOOKING_CODE_PREFIX}[${BOOKING_CODE_ALPHABET}]{${BOOKING_CODE_LENGTH}}$`);

/** Random bytes source (crypto.getRandomValues by default; tests pass their own). */
export type RandomBytes = (length: number) => Uint8Array;

const cryptoBytes: RandomBytes = (length) => globalThis.crypto.getRandomValues(new Uint8Array(length));

/** A new random code. The alphabet has 32 letters, so `byte % 32` is unbiased. */
export function generateBookingCode(random: RandomBytes = cryptoBytes): string {
  const bytes = random(BOOKING_CODE_LENGTH);
  let code = BOOKING_CODE_PREFIX;
  for (let i = 0; i < BOOKING_CODE_LENGTH; i++) code += BOOKING_CODE_ALPHABET[bytes[i] % BOOKING_CODE_ALPHABET.length];
  return code;
}

/**
 * A code typed by a person ("bt-7k3q9", "7K3Q9", "BT 7K3Q9"): trimmed, upper-cased, with the
 * "BT-" prefix. Null when it cannot be a booking code (0, O, 1 and I never appear in one).
 */
export function normalizeBookingCode(value: unknown): string | null {
  if (typeof value !== "string") return null;
  let code = value.trim().toUpperCase().replace(/\s+/g, "");
  if (code.length === BOOKING_CODE_LENGTH) code = `${BOOKING_CODE_PREFIX}${code}`;
  else if (!code.startsWith(BOOKING_CODE_PREFIX)) code = `${BOOKING_CODE_PREFIX}${code.replace(/^BT/, "")}`;
  return CODE_PATTERN.test(code) ? code : null;
}

export function isBookingCode(value: unknown): value is string {
  return typeof value === "string" && CODE_PATTERN.test(value);
}
