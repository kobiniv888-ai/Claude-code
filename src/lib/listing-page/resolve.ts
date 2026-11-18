import "server-only";
import type { AppLocale } from "@/config/site";
import { getCurrentUser } from "@/lib/auth/session";
import { listingAccess } from "./access";
import { parseListingParam } from "@/lib/listing/urls";
import { getSettings } from "@/lib/settings";
import { getListingPage, toListingViewer } from "./load";

/**
 * Loads the listing for a /listing/<id> route segment and decides what this visitor may see
 * (shared by the listing page, its metadata and the booking step). null = not found for them.
 */
export async function resolveListing(locale: AppLocale, id: string) {
  const publicId = parseListingParam(id);
  if (!publicId) return null;
  const [loaded, session, settings] = await Promise.all([
    getListingPage(publicId, locale),
    getCurrentUser().catch(() => null),
    getSettings(),
  ]);
  if (!loaded) return null;
  // A session whose 2-step code is not entered yet counts as signed out (SECURITY_REPORT 4.2.a):
  // no name or phone of it reaches the booking step, no saved heart, no owner view.
  const user = session?.twoFactorVerified ? session : null;
  const access = listingAccess(loaded.access, toListingViewer(user), { demoVisible: settings.demoDataVisible });
  if (access === "none") return null;
  return { data: loaded.data, ownerId: loaded.ownerId, accessInput: loaded.access, user, settings, access };
}

export type ResolvedListing = NonNullable<Awaited<ReturnType<typeof resolveListing>>>;
