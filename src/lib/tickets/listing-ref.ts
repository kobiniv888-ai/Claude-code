/**
 * "Link a listing" accepts what people actually paste: a listing number ("1234", "#1234",
 * "ID 1234", "מודעה 1234") or a listing address ("https://…/he/listing/1234-sunny-flat",
 * "/listing/1234"). Pure and client-safe — the server still checks that the listing exists.
 */

const MAX_PUBLIC_ID = 2_147_483_647;
/** A short word before the number is fine ("ID", "#", "No.", "מודעה", "объявление"). */
const MAX_PREFIX_LENGTH = 14;

function toPublicId(digits: string): number | null {
  if (!/^\d{1,10}$/.test(digits)) return null;
  const n = Number(digits);
  return n >= 1 && n <= MAX_PUBLIC_ID ? n : null;
}

/** The listing's public number from what the user typed or pasted, or null. */
export function parseListingRef(input: string | null | undefined): number | null {
  const value = (input ?? "").trim();
  if (!value || value.length > 500) return null;

  // An address (full URL or a path) — the number follows "/listing/".
  const path = /(?:^|\/)listing\/(\d{1,10})(?:[-/?#]|$)/i.exec(value);
  if (path) return toPublicId(path[1]);
  if (/^[a-z][a-z0-9+.-]*:\/\//i.test(value) || value.startsWith("/")) return null;

  // A number, perhaps with a short label around it.
  const runs = value.match(/\d+/g);
  if (!runs || runs.length !== 1) return null;
  const rest = value.replace(runs[0], "").replace(/[\s#:№.\-]+/g, "");
  if (rest.length > MAX_PREFIX_LENGTH) return null;
  return toPublicId(runs[0]);
}
