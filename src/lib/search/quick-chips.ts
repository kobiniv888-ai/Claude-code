/**
 * Round 2: the /search chip row has ONE Jewish chip, "כשר ושבת" (`?kosherShabbat=1`, see
 * SearchFilters.kosherShabbat). The four round-1 chips below stay as helpers (URLs unchanged).
 *
 * The Jewish quick chips in the sticky chip row of /search (pure): כשר · מתאים לשבת · ליד בית
 * כנסת · דובר עברית. Each is a one-tap shortcut for an existing filter, so the URLs stay the same
 * ("?kitchen=kosher", "?shabbatFriendly=1", "?synagogueMaxWalk=15", "?jewish=host_speaks_hebrew").
 *
 *   navigate(withFilters(filters, toggleQuickChip(filters, "kosher")));
 */
import type { SearchFilters, SynagogueWalk } from "@/lib/listing/search-params";

export const QUICK_CHIPS = ["kosher", "shabbat", "synagogue", "hebrew"] as const;
export type QuickChip = (typeof QUICK_CHIPS)[number];

/** "Near a synagogue" = within this many minutes' walk (a comfortable Shabbat walk). */
export const NEAR_SYNAGOGUE_MINUTES: SynagogueWalk = 15;

const HEBREW = "host_speaks_hebrew";
const HOTEL_KOSHER = ["kosher_meals", "kosher_breakfast"] as const;

/** Whether the chip is on. Any kosher-kitchen choice (or kosher meals at hotels) counts as "kosher". */
export function quickChipActive(filters: SearchFilters, chip: QuickChip): boolean {
  switch (chip) {
    case "kosher":
      return filters.deal === "hotels"
        ? filters.hotel.some((f) => (HOTEL_KOSHER as readonly string[]).includes(f))
        : filters.kitchen !== null;
    case "shabbat":
      return filters.shabbatFriendly;
    case "synagogue":
      return filters.synagogueMaxWalk !== null;
    case "hebrew":
      return filters.jewish.includes(HEBREW);
  }
}

/** The filter change that turns the chip on or off. */
export function toggleQuickChip(filters: SearchFilters, chip: QuickChip): Partial<SearchFilters> {
  const on = !quickChipActive(filters, chip);
  switch (chip) {
    case "kosher":
      if (filters.deal === "hotels") {
        const rest = filters.hotel.filter((f) => !(HOTEL_KOSHER as readonly string[]).includes(f));
        return { hotel: on ? [...rest, "kosher_meals"] : rest };
      }
      return { kitchen: on ? "kosher" : null };
    case "shabbat":
      return { shabbatFriendly: on };
    case "synagogue":
      return { synagogueMaxWalk: on ? NEAR_SYNAGOGUE_MINUTES : null };
    case "hebrew":
      return { jewish: on ? [...filters.jewish, HEBREW] : filters.jewish.filter((f) => f !== HEBREW) };
  }
}
