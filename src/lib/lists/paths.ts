/**
 * Paths of the saved lists (pure, client-safe).
 * - /account/favorites — the signed-in user's lists (`?list=<id>`)
 * - /saved             — a signed-out visitor's lists on this device (signed in → /account/favorites)
 * - /lists/<token>     — a shared list, view only, for anyone with the link
 */
import { locales } from "@/config/site";

export const ACCOUNT_LISTS_PATH = "/account/favorites";
export const DEVICE_LISTS_PATH = "/saved";

export function sharedListPath(token: string): string {
  return `/lists/${token}`;
}

export function accountListPath(listId: string | null): string {
  return listId ? `${ACCOUNT_LISTS_PATH}?list=${encodeURIComponent(listId)}` : ACCOUNT_LISTS_PATH;
}

const LOCALE_PREFIX = new RegExp(`^/(?:${locales.join("|")})(?=/|$)`);

/** "/he/account/favorites?list=x" → true: the page a signed-out visitor should see as /saved. */
export function isAccountListsPath(pathname: string | null | undefined): boolean {
  if (!pathname) return false;
  const path = (pathname.split(/[?#]/)[0] ?? "").replace(LOCALE_PREFIX, "").replace(/\/+$/, "") || "/";
  return path === ACCOUNT_LISTS_PATH;
}
