import "server-only";
import { db } from "@/lib/db";
import { clearSettingsCache } from "@/lib/settings";

/**
 * Demo data (server-only). `npm run db:seed` adds demo users, listings, Jewish places and one
 * scam alert, all marked `isDemo` (alerts: a "Demo:" title prefix). Public pages show them only
 * while the admin setting "Show demo data" (demoDataVisible) is on; before launch an admin removes
 * them for good with removeDemoData() (Admin → Settings, or `npm run demo:remove -- --yes`).
 *
 * Real reference content created by the seed — cities, neighborhoods, FAQ, banned words, saved
 * replies and settings — is kept.
 */

/** Demo accounts use this e-mail domain (reserved, never deliverable). */
export const DEMO_EMAIL_DOMAIN = "demo.bayit.example";

/** Every demo scam alert's title starts with this, in every language. */
export const DEMO_TITLE_PREFIX = "Demo:";

/** The seeded example scam alert. */
export const DEMO_SCAM_ALERT_ID = "demo-scam-alert-deposit-before-viewing";

export type DemoDataCounts = { listings: number; users: number; places: number; alerts: number };

export function isDemoEmail(email: string | null | undefined): boolean {
  return typeof email === "string" && email.trim().toLowerCase().endsWith(`@${DEMO_EMAIL_DOMAIN}`);
}

/** True when any language of a { he, en, ru, ar, ka } title starts with "Demo:". */
export function isDemoAlertTitle(title: unknown): boolean {
  if (!title || typeof title !== "object") return false;
  return Object.values(title as Record<string, unknown>).some(
    (value) => typeof value === "string" && value.trimStart().startsWith(DEMO_TITLE_PREFIX),
  );
}

const demoListingWhere = { OR: [{ isDemo: true }, { owner: { isDemo: true } }] };

/** Ids of scam alerts that are demo content (the seeded one, or any "Demo:" title). */
async function demoAlertIds(client: Pick<typeof db, "scamAlert"> = db): Promise<string[]> {
  const alerts = await client.scamAlert.findMany({ select: { id: true, title: true } });
  return alerts.filter((a) => a.id === DEMO_SCAM_ALERT_ID || isDemoAlertTitle(a.title)).map((a) => a.id);
}

/** How much demo data there is (for the admin confirmation dialog). */
export async function countDemoData(): Promise<DemoDataCounts> {
  const [listings, users, places, alerts] = await Promise.all([
    db.listing.count({ where: demoListingWhere }),
    db.user.count({ where: { isDemo: true } }),
    db.jewishPlace.count({ where: { isDemo: true } }),
    demoAlertIds(),
  ]);
  return { listings, users, places, alerts: alerts.length };
}

/**
 * Permanently deletes every demo listing, user and Jewish place (their photos, translations,
 * stats, favorites, reports, verification requests… go with them by cascade), support tickets
 * opened by demo users or about demo listings, and the demo scam alert(s). Demo listing ids are
 * also removed from the featured-listings setting. Idempotent: a second call deletes nothing.
 *
 * The caller (admin action) checks the session and the "settings" permission and writes the
 * audit log.
 */
export async function removeDemoData(): Promise<DemoDataCounts> {
  const result = await db.$transaction(
    async (tx) => {
      const listingIds = (await tx.listing.findMany({ where: demoListingWhere, select: { id: true } })).map((l) => l.id);
      const alertIds = await demoAlertIds(tx);

      await tx.ticket.deleteMany({ where: { OR: [{ user: { isDemo: true } }, { listingId: { in: listingIds } }] } });
      const listings = await tx.listing.deleteMany({ where: { id: { in: listingIds } } });
      const places = await tx.jewishPlace.deleteMany({ where: { isDemo: true } });
      const alerts = await tx.scamAlert.deleteMany({ where: { id: { in: alertIds } } });
      const users = await tx.user.deleteMany({ where: { isDemo: true } });

      const featured = await tx.siteSetting.findUnique({ where: { key: "featuredListingIds" } });
      if (featured && Array.isArray(featured.value)) {
        const removed = new Set(listingIds);
        const kept = featured.value.filter((id) => typeof id === "string" && !removed.has(id));
        if (kept.length !== featured.value.length) {
          await tx.siteSetting.update({ where: { key: "featuredListingIds" }, data: { value: kept } });
        }
      }

      return { listings: listings.count, users: users.count, places: places.count, alerts: alerts.count };
    },
    { timeout: 60_000, maxWait: 10_000 },
  );
  clearSettingsCache();
  return result;
}
