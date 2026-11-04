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
 *
 * Round 3 (brief 8.3): "ביקרנו במקום" (Bayit visited the place, set by the admin) is one of the two
 * tags and always comes FIRST: it is the strongest trust signal while the ID badges are hidden.
 *
 * Round 3 (brief section 3): every card that isn't a short stay names its type on the price line —
 * "למכירה", "חודשי" or "מלון" (guesthouses share HOTEL_ROOM) — so a sale price never reads like a
 * nightly one. It is not one of the two tags.
 */
import type { DealType } from "@/generated/prisma/enums";
import type { ListingCardBadges } from "@/lib/listing/types";
import type { SearchFilters } from "@/lib/listing/search-params";

export type CardPhotoTag = "demo" | "promoted" | "new";
export type CardTagKind = "visited" | "kosherKitchen" | "shabbatFriendly" | "synagogue" | "hebrew";
export type CardTag = { kind: CardTagKind; minutes?: number };

export const CARD_TAG_ORDER: readonly CardTagKind[] = ["visited", "kosherKitchen", "shabbatFriendly", "synagogue", "hebrew"];
export const MAX_CARD_TAGS = 2;

type PhotoSource = Partial<Pick<ListingCardBadges, "demo" | "promoted" | "isNew">>;
type TagSource = Partial<
  Pick<ListingCardBadges, "visited" | "kosherKitchen" | "shabbatFriendly" | "synagogueWalkMin" | "synagogueVerified" | "speaksHebrew">
>;

export type CardDealLabel = Exclude<DealType, "SHORT_STAY">;

/** The deal type named on the card's price line: every type except short stays, which are the default. */
export function cardDealLabel(dealType: DealType): CardDealLabel | null {
  return dealType === "SHORT_STAY" ? null : dealType;
}

/** The one tag on the photo, or null. */
export function cardPhotoTag(badges: PhotoSource): CardPhotoTag | null {
  if (badges.demo) return "demo";
  if (badges.promoted) return "promoted";
  if (badges.isNew) return "new";
  return null;
}

/** The small text tags under the price: at most two; "visited" first, then the visitor's filters. */
export function cardTags(badges: TagSource, preferred: readonly CardTagKind[] = []): CardTag[] {
  const has: Record<CardTagKind, boolean> = {
    visited: badges.visited === true,
    kosherKitchen: badges.kosherKitchen === true,
    shabbatFriendly: badges.shabbatFriendly === true,
    synagogue: badges.synagogueVerified === true && typeof badges.synagogueWalkMin === "number" && badges.synagogueWalkMin > 0,
    hebrew: badges.speaksHebrew === true,
  };
  const order: CardTagKind[] = ["visited", ...preferred.filter((kind) => CARD_TAG_ORDER.includes(kind)), ...CARD_TAG_ORDER];
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
  filters: Pick<SearchFilters, "kitchen" | "shabbatFriendly" | "synagogueMaxWalk" | "jewish"> & { kosherShabbat?: boolean; visited?: boolean },
): CardTagKind[] {
  const kinds: CardTagKind[] = [];
  if (filters.visited) kinds.push("visited");
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
