import type { ListingCardBadges } from "@/lib/listing/types";

/** Which badges a listing shows, and in what order (pure; used by BadgeRow and the card). */
export type BayitBadgeKind =
  | "welcomes"
  | "verified"
  | "hebrew"
  | "kosherKitchen"
  | "kosherMeals"
  | "shabbatFriendly"
  | "synagogueWalk"
  | "keepsShabbat"
  | "business"
  | "demo"
  | "new"
  | "priceDropped"
  | "promoted";

export type BadgeItem = { kind: BayitBadgeKind; minutes?: number };

/** Feature badges of a listing in display order (the most useful first). */
const FEATURE_ORDER = [
  "welcomes",
  "verified",
  "synagogueWalk",
  "kosherKitchen",
  "kosherMeals",
  "shabbatFriendly",
  "keepsShabbat",
  "hebrew",
] as const satisfies readonly BayitBadgeKind[];

type BadgeSource = Partial<
  Pick<
    ListingCardBadges,
    | "welcomes"
    | "verified"
    | "speaksHebrew"
    | "kosherKitchen"
    | "kosherMeals"
    | "shabbatFriendly"
    | "synagogueWalkMin"
    | "keepsShabbat"
    | "business"
    | "demo"
    | "isNew"
    | "priceDropped"
    | "promoted"
  >
>;

/** The feature badges that apply to a listing, in display order. */
export function listingBadgeItems(badges: BadgeSource, { exclude = [] }: { exclude?: readonly BayitBadgeKind[] } = {}): BadgeItem[] {
  const has: Record<(typeof FEATURE_ORDER)[number], boolean> = {
    welcomes: badges.welcomes ?? false,
    verified: badges.verified ?? false,
    synagogueWalk: badges.synagogueWalkMin != null,
    kosherKitchen: badges.kosherKitchen ?? false,
    kosherMeals: badges.kosherMeals ?? false,
    shabbatFriendly: badges.shabbatFriendly ?? false,
    keepsShabbat: badges.keepsShabbat ?? false,
    hebrew: badges.speaksHebrew ?? false,
  };
  return FEATURE_ORDER.filter((kind) => has[kind] && !exclude.includes(kind)).map((kind) =>
    kind === "synagogueWalk" ? { kind, minutes: badges.synagogueWalkMin ?? 0 } : { kind },
  );
}

/**
 * Tags over a card photo (at most `max`, default 2). "Demo" and "Promoted" are always shown
 * (honesty); then "Welcomes Israelis", "New", "Price dropped".
 */
export function listingPhotoTags(badges: BadgeSource, max = 2): BadgeItem[] {
  const required: BayitBadgeKind[] = [];
  if (badges.demo) required.push("demo");
  if (badges.promoted) required.push("promoted");
  const optional: BayitBadgeKind[] = [];
  if (badges.welcomes) optional.push("welcomes");
  if (badges.isNew) optional.push("new");
  if (badges.priceDropped) optional.push("priceDropped");
  const room = Math.max(0, max - required.length);
  // Welcomes first, then the required status tags, then the rest.
  const picked = [...optional.slice(0, room), ...required];
  const ordered = picked.sort((a, b) => (a === "welcomes" ? -1 : b === "welcomes" ? 1 : 0));
  return ordered.map((kind) => ({ kind }));
}
