/**
 * The booking attempt key (client-safe; SECURITY_REPORT 4.5.c). The review page makes one per
 * stay and sends it with every "confirm" tap: the server (createBooking) answers a repeat of the
 * same key with the booking already made, so a double tap or a retry after a lost answer never
 * books twice. 18 random bytes from the browser's secure generator, base64url (24 characters).
 */
export function newAttemptKey(): string {
  const bytes = new Uint8Array(18);
  globalThis.crypto.getRandomValues(bytes);
  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}
