import "server-only";
import { headers } from "next/headers";
import { redirect } from "@/i18n/navigation";
import { getCurrentUser } from "@/lib/auth/session";
import { DEVICE_LISTS_PATH, isAccountListsPath } from "./paths";

/**
 * A signed-out visitor who opens "שמורים" (/account/favorites, from the bottom bar, the menu, an
 * old link) sees the lists saved on this device at /saved instead of the login page. Called by the
 * account layout and by the saved page itself (they render in parallel). Any other path, or a
 * signed-in user: returns.
 */
export async function redirectSignedOutFromSaved(locale: string, pathname?: string): Promise<void> {
  const path = pathname ?? (await headers()).get("x-pathname");
  if (!isAccountListsPath(path)) return;
  if (await getCurrentUser()) return;
  redirect({ href: DEVICE_LISTS_PATH, locale });
}
