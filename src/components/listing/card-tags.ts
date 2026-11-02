/**
 * What a listing card shows besides its title, place, facts and price (pure, client-safe).
 *
 * Round 2 rules (docs/redesign-2/BRIEF.md 5.3):
 * - On the photo: at most ONE tag. "דמו" (grey) always wins, because demo data must be labeled;
 *   then "מקודם" (a paid placement must be labeled too); then "חדש" (purple tint).
 *   No welcome badge (every host took the pledge), no "price dropped", no "verified" on photos.
 * - Under the price: at most TWO small grey text tags, from מטבח כשר · מתאים לשבת ·
 *   "X דק׳ לבית כנסת" (only when the nearest synagogue is a real, verified place) · דובר עברית.
 *   A tag the visitor filtered by comes first.
 */
import type { ListingCardBadges } from "@/lib/listing/types";
import type { SearchFilters } from "@/lib/listing/search-params";

export type CardPhotoTag = "demo" | "promoted" | "new";
export type CardTagKind = "kosherKitchen" | "shabbatFriendly" | "synagogue" | "hebrew";
export type CardTag = { kind: CardTagKind; minutes?: number };

export const CARD_TAG_ORDER: readonly CardTagKind[] = ["kosherKitchen", "shabbatFriendly", "synagogue", "hebrew"];
export const MAX_CARD_TAGS = 2;

type PhotoSource = Partial<Pick<ListingCardBadges, "demo" | "promoted" | "isNew">>;
type TagSource = Partial<
  Pick<ListingCardBadges, "kosherKitchen" | "shabbatFriendly" | "synagogueWalkMin" | "synagogueVerified" | "speaksHebrew">
>;

/** The one tag on the photo, or null. */
export function cardPhotoTag(badges: PhotoSource): CardPhotoTag | null {
  if (badges.demo) return "demo";
  if (badges.promoted) return "promoted";
  if (badges.isNew) return "new";
  return null;
}

/** The small text tags under the price: at most two, the visitor's filters first. */
export function cardTags(badges: TagSource, preferred: readonly CardTagKind[] = []): CardTag[] {
  const has: Record<CardTagKind, boolean> = {
    kosherKitchen: badges.kosherKitchen === true,
    shabbatFriendly: badges.shabbatFriendly === true,
    synagogue: badges.synagogueVerified === true && typeof badges.synagogueWalkMin === "number" && badges.synagogueWalkMin > 0,
    hebrew: badges.speaksHebrew === true,
  };
  const order = [...preferred.filter((kind) => CARD_TAG_ORDER.includes(kind)), ...CARD_TAG_ORDER];
  const picked: CardTag[] = [];
  for (const kind of order) {
    if (!has[kind] || picked.some((tag) => tag.kind === kind)) continue;
    picked.push(kind === "synagogue" ? { kind, minutes: badges.synagogueWalkMin ?? 0 } : { kind });
    if (picked.length === MAX_CARD_TAGS) break;
  }
  return picked;
}

/** The card tags a search filters by (they go first on every card of the results). */
export function preferredCardTags(
  filters: Pick<SearchFilters, "kitchen" | "shabbatFriendly" | "synagogueMaxWalk" | "jewish"> & { kosherShabbat?: boolean },
): CardTagKind[] {
  const kinds: CardTagKind[] = [];
  if (filters.kitchen !== null || filters.kosherShabbat) kinds.push("kosherKitchen");
  if (filters.shabbatFriendly || filters.kosherShabbat) kinds.push("shabbatFriendly");
  if (filters.synagogueMaxWalk !== null) kinds.push("synagogue");
  if (filters.jewish.includes("host_speaks_hebrew")) kinds.push("hebrew");
  return kinds;
}

/**
 * Nights of a stay for the "₪1,260 סה״כ" line: only when both dates are set and in order
 * (YYYY-MM-DD, checkOut exclusive). Null otherwise.
 */
export function stayNights(checkIn: string | null, checkOut: string | null): number | null {
  if (!checkIn || !checkOut) return null;
  const start = Date.parse(`${checkIn}T00:00:00Z`);
  const end = Date.parse(`${checkOut}T00:00:00Z`);
  if (!Number.isFinite(start) || !Number.isFinite(end)) return null;
  const nights = Math.round((end - start) / 86_400_000);
  return nights >= 1 && nights <= 366 ? nights : null;
}
