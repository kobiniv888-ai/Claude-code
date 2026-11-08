import "server-only";
import { db } from "@/lib/db";
import { withoutHiddenDemoAlerts } from "@/lib/demo";
import { getSettings } from "@/lib/settings";

/**
 * The public scam alerts (the /safety list and the site-wide banner), server-only. Only active
 * alerts that have started and not ended; the demo alert only while "Show demo data" is on.
 */

function currentWhere(now: Date) {
  return { active: true, startsAt: { lte: now }, OR: [{ endsAt: null }, { endsAt: { gt: now } }] };
}

/** Current alerts, newest first (at most 20 shown). */
export async function getActiveScamAlerts(now: Date = new Date()) {
  const [settings, alerts] = await Promise.all([
    getSettings(),
    db.scamAlert.findMany({
      where: currentWhere(now),
      orderBy: [{ startsAt: "desc" }, { createdAt: "desc" }],
      // More than shown, so hiding demo alerts still leaves 20.
      take: 30,
      select: { id: true, title: true, body: true, severity: true, startsAt: true, endsAt: true },
    }),
  ]);
  return withoutHiddenDemoAlerts(alerts, settings.demoDataVisible).slice(0, 20);
}

export type PublicScamAlert = Awaited<ReturnType<typeof getActiveScamAlerts>>[number];

/** The alert shown as the site-wide banner: the most serious, then the newest; null when none. */
export async function getBannerScamAlert(now: Date = new Date()) {
  const [settings, alerts] = await Promise.all([
    getSettings(),
    db.scamAlert.findMany({
      where: { ...currentWhere(now), showAsBanner: true },
      // Enum order is INFO < WARNING < CRITICAL: the most serious alert wins, then the newest.
      orderBy: [{ severity: "desc" }, { startsAt: "desc" }],
      // A few, so a hidden demo alert (or several "Demo:" ones) leaves the next real one.
      take: 10,
      select: { id: true, title: true, body: true, severity: true, updatedAt: true },
    }),
  ]);
  const [first] = withoutHiddenDemoAlerts(alerts, settings.demoDataVisible);
  return first ?? null;
}
