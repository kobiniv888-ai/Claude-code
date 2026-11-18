import "server-only";
import type { AppLocale } from "@/config/site";
import type { Locale } from "@/generated/prisma/client";
import { db } from "@/lib/db";
import { localizedTitle } from "@/lib/listing/mappers";
import { listingPath } from "@/lib/listing/urls";
import { demoAllowed } from "@/lib/site-env";
import { isListingPublic } from "./access";

/**
 * The canonical path ("/listing/1234-slug-in-this-language", as the listing page builds it) of
 * a PUBLIC listing, for the proxy's real 308 redirect of bare links ("/listing/1234", used in
 * emails and shared by hand). The page itself streams behind loading.tsx, so its own redirect
 * can only be a client-side meta refresh.
 *
 * Null for anything that is not public: the page then answers as usual (a preview for the owner
 * and staff, "not found" for everyone else), so the redirect never reveals a hidden title.
 * Kept small on purpose (no auth or settings module): src/proxy.ts imports it on demand.
 */
export async function publicListingCanonicalPath(publicId: number, locale: AppLocale): Promise<string | null> {
  const [row, demoSetting] = await Promise.all([
    db.listing.findUnique({
      where: { publicId },
      select: {
        status: true,
        ownerId: true,
        isDemo: true,
        deletedAt: true,
        expiresAt: true,
        title: true,
        originalLocale: true,
        owner: { select: { status: true, deletedAt: true } },
        translations: { where: { locale: locale as Locale }, take: 1, select: { title: true, isAuto: true, isOriginal: true } },
      },
    }),
    // Same stored value getSettings() reads ("demo data" switch, on by default outside production).
    db.siteSetting.findUnique({ where: { key: "demoDataVisible" }, select: { value: true } }),
  ]);
  if (!row) return null;
  // Never on the real site (SITE_ENV=production), like getSettings() (src/lib/settings.ts).
  const demoVisible = demoAllowed() && (typeof demoSetting?.value === "boolean" ? demoSetting.value : true);
  if (!isListingPublic(row, { demoVisible })) return null;
  return listingPath(publicId, localizedTitle(row, locale).title);
}
