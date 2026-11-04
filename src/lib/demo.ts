import "server-only";
import { db } from "@/lib/db";
import { isOwnPrivateUpload } from "@/lib/media";
import { isOwnReportUpload, parseReportAttachments } from "@/lib/reports/turned-away";
import { clearSettingsCache } from "@/lib/settings";
import { deletePrivate } from "@/lib/storage";

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

type FileKeysClient = Pick<typeof db, "report" | "ticketMessage">;

/**
 * The private files that lose their last reference when the demo rows go: screenshots of reports
 * about demo listings or demo hosts (a real guest may have reported one before launch; the
 * reports go by cascade) and attachments of the tickets deleted with them. Only keys in their
 * uploader's own folder (the same rule as deleting an account).
 */
export async function demoPrivateFileKeys(client: FileKeysClient, listingIds: string[]): Promise<string[]> {
  const [reports, messages] = await Promise.all([
    client.report.findMany({
      where: { OR: [{ listingId: { in: listingIds } }, { targetUser: { isDemo: true } }] },
      select: { reporterId: true, attachments: true },
    }),
    client.ticketMessage.findMany({
      where: { ticket: { OR: [{ user: { isDemo: true } }, { listingId: { in: listingIds } }] } },
      select: { authorId: true, attachments: true },
    }),
  ]);
  const reportKeys = reports.flatMap((r) =>
    r.reporterId ? parseReportAttachments(r.attachments).map((a) => a.key).filter((key) => isOwnReportUpload(key, r.reporterId as string)) : [],
  );
  const ticketKeys = messages.flatMap((m) => {
    if (!m.authorId || !Array.isArray(m.attachments)) return [];
    return m.attachments.flatMap((item) => {
      const key = item && typeof item === "object" ? (item as { key?: unknown }).key : null;
      return typeof key === "string" && isOwnPrivateUpload(key, m.authorId as string, "ticket") ? [key] : [];
    });
  });
  return [...new Set([...reportKeys, ...ticketKeys])];
}

/**
 * Permanently deletes every demo listing, user and Jewish place (their photos, translations,
 * stats, favorites, reports, verification requests… go with them by cascade), support tickets
 * opened by demo users or about demo listings, and the demo scam alert(s). Demo listing ids are
 * also removed from the featured-listings setting. Idempotent: a second call deletes nothing.
 * Private files only those rows pointed to (report screenshots, ticket attachments) are deleted
 * from storage after the database commit (demoPrivateFileKeys).
 *
 * The caller (admin action) checks the session and the "settings" permission and writes the
 * audit log.
 */
export async function removeDemoData(): Promise<DemoDataCounts> {
  const result = await db.$transaction(
    async (tx) => {
      const listingIds = (await tx.listing.findMany({ where: demoListingWhere, select: { id: true } })).map((l) => l.id);
      const alertIds = await demoAlertIds(tx);
      const fileKeys = await demoPrivateFileKeys(tx, listingIds);

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

      return { counts: { listings: listings.count, users: users.count, places: places.count, alerts: alerts.count }, fileKeys };
    },
    { timeout: 60_000, maxWait: 10_000 },
  );
  clearSettingsCache();
  // After the commit, so a storage hiccup never undoes the removal; failures are logged.
  const results = await Promise.allSettled(result.fileKeys.map((key) => deletePrivate(key)));
  for (const r of results) if (r.status === "rejected") console.error("[demo] could not delete a private file:", r.reason);
  return result.counts;
}
