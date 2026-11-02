import "server-only";
import type { AppLocale } from "@/config/site";
import { pickLocalized } from "@/i18n/locale";
import { db } from "@/lib/db";
import type { NearbyInfo } from "@/lib/nearby";

export type VerifiedPlace = { kind: "synagogue" | "chabad"; name: string; minutes: number };

/**
 * The nearest synagogue (or Chabad house) for the folded "Kosher and Shabbat" section, ONLY when
 * it is a real, checked place: active, not demo data, and verified (JewishPlace.verifiedAt, brief
 * 5.9). A demo listing's Listing.nearby may point to demo places, and a place can be hidden or
 * un-verified after the listing was computed, so the entry is checked against the table.
 * Never throws: the section just leaves the line out.
 */
export async function verifiedNearestSynagogue(nearby: NearbyInfo, locale: AppLocale): Promise<VerifiedPlace | null> {
  const candidates = (
    [
      nearby.synagogue && { kind: "synagogue" as const, place: nearby.synagogue },
      nearby.chabad && { kind: "chabad" as const, place: nearby.chabad },
    ].filter(Boolean) as { kind: VerifiedPlace["kind"]; place: NonNullable<NearbyInfo["synagogue"]> }[]
  ).sort((a, b) => a.place.minutes - b.place.minutes);
  if (candidates.length === 0) return null;
  try {
    const real = await db.jewishPlace.findMany({
      where: { id: { in: candidates.map((c) => c.place.id) }, active: true, isDemo: false, verifiedAt: { not: null } },
      select: { id: true },
    });
    const ok = new Set(real.map((p) => p.id));
    const found = candidates.find((c) => ok.has(c.place.id));
    if (!found) return null;
    const name = pickLocalized(found.place.name, locale);
    return name ? { kind: found.kind, name, minutes: found.place.minutes } : null;
  } catch (error) {
    console.error("[listing] synagogue check failed", error);
    return null;
  }
}
