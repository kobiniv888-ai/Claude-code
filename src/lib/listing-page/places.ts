import "server-only";
import type { AppLocale } from "@/config/site";
import { pickLocalized } from "@/i18n/locale";
import { db } from "@/lib/db";
import type { PublicNearbyInfo } from "@/lib/geo/public-walk";

export type VerifiedPlace = { kind: "synagogue"; name: string; minutes: number };

/**
 * The nearest synagogue for the folded "Kosher and Shabbat" section, ONLY when it is a real,
 * checked place: active, not demo data, verified (JewishPlace.verifiedAt, brief 5.9) and of type
 * SYNAGOGUE. A demo listing's Listing.nearby may point to demo places, a place can be hidden or
 * un-verified after the listing was computed, and a row computed before 9 Nov 2026 may still name
 * a Chabad house as its nearest synagogue, so the entry is checked against the table: a Chabad
 * house is never shown as a listing's walk (founder's answer (2); the community map shows them).
 * Never throws: the section just leaves the line out.
 */
export async function verifiedNearestSynagogue(nearby: PublicNearbyInfo, locale: AppLocale): Promise<VerifiedPlace | null> {
  const candidate = nearby.synagogue;
  if (!candidate) return null;
  try {
    const real = await db.jewishPlace.findFirst({
      where: { id: candidate.id, type: "SYNAGOGUE", active: true, isDemo: false, verifiedAt: { not: null } },
      select: { id: true },
    });
    if (!real) return null;
    const name = pickLocalized(candidate.name, locale);
    return name ? { kind: "synagogue", name, minutes: candidate.minutes } : null;
  } catch (error) {
    console.error("[listing] synagogue check failed", error);
    return null;
  }
}
