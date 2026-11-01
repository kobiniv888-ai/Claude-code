import { GAZETTEER, type GazetteerCity } from "@/config/places";
import type { Localized } from "@/config/site";
import { normalizeSearchText } from "@/lib/search-text";

/**
 * Instant "where?" suggestions from the static gazetteer (src/config/places.ts). Pure and
 * client-safe: no request, no spinner. Matches every name in all five languages and the aliases,
 * after normalizeSearchText (case, niqqud, final letters, geresh…):
 *   1. exact name, 2. name prefix ("טב" → טביליסי), 3. word prefix ("tbilisi" → Old Tbilisi),
 *   4. substring (3+ letters), 5. typos — Damerau-Levenshtein ≤ 1 for queries up to 5 letters,
 *      ≤ 2 for longer ones (3+ letters, and only when nothing matches as typed):
 *      "tbilsi" → Tbilisi, "batomi" → Batumi.
 * Cities rank above their neighborhoods on equal matches.
 */

export type PlaceMatch = {
  type: "city" | "neighborhood";
  /** City slug for a city; neighborhood slug for a neighborhood. */
  slug: string;
  citySlug: string;
  names: Localized;
  /** The neighborhood's city names (null for cities). */
  cityNames: Localized | null;
  lat: number;
  lng: number;
  score: number;
};

type IndexedPlace = Omit<PlaceMatch, "score"> & {
  /** Normalized names and aliases. */
  terms: string[];
  /** Words of all terms (for word-prefix and per-word typo matching). */
  words: string[];
  order: number;
};

const SCORE = { exact: 100, prefix: 90, wordPrefix: 80, substring: 60, typo: 40 } as const;
const CITY_BONUS = 5;
const MIN_SUBSTRING = 3;
const MIN_TYPO = 3;

function index(cities: readonly GazetteerCity[]): IndexedPlace[] {
  const places: IndexedPlace[] = [];
  let order = 0;
  const build = (names: Localized, aliases: string[], slug: string) => {
    const terms = [
      ...new Set([...Object.values(names), ...aliases, slug.replace(/-/g, " ")].map(normalizeSearchText)),
    ].filter(Boolean);
    const words = [...new Set(terms.flatMap((term) => term.split(" ")))].filter(Boolean);
    return { terms, words };
  };
  for (const city of cities) {
    places.push({
      type: "city",
      slug: city.slug,
      citySlug: city.slug,
      names: city.names,
      cityNames: null,
      lat: city.lat,
      lng: city.lng,
      order: order++,
      ...build(city.names, city.aliases, city.slug),
    });
    for (const hood of city.neighborhoods) {
      places.push({
        type: "neighborhood",
        slug: hood.slug,
        citySlug: city.slug,
        names: hood.names,
        cityNames: city.names,
        lat: hood.lat,
        lng: hood.lng,
        order: order++,
        // "center" alone is not a useful search word.
        ...build(hood.names, hood.aliases ?? [], hood.slug === "center" ? "" : hood.slug),
      });
    }
  }
  return places;
}

let defaultIndex: IndexedPlace[] | null = null;
const customIndexes = new WeakMap<readonly GazetteerCity[], IndexedPlace[]>();

function indexFor(cities: readonly GazetteerCity[]): IndexedPlace[] {
  if (cities === GAZETTEER) return (defaultIndex ??= index(GAZETTEER));
  let found = customIndexes.get(cities);
  if (!found) customIndexes.set(cities, (found = index(cities)));
  return found;
}

/**
 * Optimal string alignment distance (Damerau-Levenshtein with adjacent transpositions), stopping
 * early once every path exceeds `max`. Returns max + 1 when the strings are further apart.
 */
export function editDistance(a: string, b: string, max = Infinity): number {
  if (a === b) return 0;
  if (Math.abs(a.length - b.length) > max) return max + 1;
  const rows: number[][] = [Array.from({ length: b.length + 1 }, (_, j) => j)];
  for (let i = 1; i <= a.length; i++) {
    const row = [i];
    let best = i;
    for (let j = 1; j <= b.length; j++) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      let value = Math.min(rows[i - 1][j] + 1, row[j - 1] + 1, rows[i - 1][j - 1] + cost);
      if (i > 1 && j > 1 && a[i - 1] === b[j - 2] && a[i - 2] === b[j - 1]) {
        value = Math.min(value, rows[i - 2][j - 2] + 1);
      }
      row.push(value);
      if (value < best) best = value;
    }
    if (best > max) return max + 1;
    rows.push(row);
  }
  return rows[a.length][b.length];
}

/** The smallest typo distance between the query and a word or the start of a word. */
function typoDistance(query: string, word: string, max: number): number {
  let best = editDistance(query, word, max);
  // Still typing: compare with the word's start ("tbils" ~ "tbili…"), allowing one letter more or less.
  for (const length of [query.length - 1, query.length, query.length + 1]) {
    if (best === 0) break;
    if (length < MIN_TYPO || length >= word.length) continue;
    best = Math.min(best, editDistance(query, word.slice(0, length), max));
  }
  return best;
}

function scorePlace(place: IndexedPlace, query: string): number {
  let score = 0;
  for (const term of place.terms) {
    if (term === query) return SCORE.exact;
    if (term.startsWith(query)) score = Math.max(score, SCORE.prefix);
  }
  if (score) return score;
  if (place.words.some((word) => word.startsWith(query))) return SCORE.wordPrefix;
  if (query.length >= MIN_SUBSTRING && place.terms.some((term) => term.includes(query))) return SCORE.substring;
  if (query.length < MIN_TYPO) return 0;

  const max = query.length <= 5 ? 1 : 2;
  let best = max + 1;
  // Whole terms ("tbilsi" ~ "tbilisi") and single words ("old tbilsi" → "tbilsi" ~ "tbilisi").
  for (const candidate of [...place.terms, ...place.words]) {
    best = Math.min(best, typoDistance(query, candidate, max));
    if (best === 0) break;
  }
  if (best > max) {
    // A multi-word query with a typo in one word: every word must match a word of the place.
    const parts = query.split(" ");
    if (parts.length > 1) {
      const ok = parts.every((part) =>
        place.words.some((word) => word.startsWith(part) || (part.length >= MIN_TYPO && typoDistance(part, word, 1) <= 1)),
      );
      if (ok) return SCORE.typo;
    }
    return 0;
  }
  return SCORE.typo - best * 10;
}

/** Places matching a typed query, best first. Empty query → []. */
export function matchPlaces(
  query: string,
  { limit = 8, cities = GAZETTEER }: { limit?: number; cities?: readonly GazetteerCity[] } = {},
): PlaceMatch[] {
  const normalized = normalizeSearchText(query);
  if (!normalized) return [];
  const scored: { place: IndexedPlace; score: number }[] = [];
  for (const place of indexFor(cities)) {
    const score = scorePlace(place, normalized);
    if (score > 0) scored.push({ place, score: score + (place.type === "city" ? CITY_BONUS : 0) });
  }
  // Typo guesses only when nothing matches as typed ("bat" must not suggest Bakuriani).
  const exactish = scored.some(({ score }) => score >= SCORE.substring);
  const kept = exactish ? scored.filter(({ score }) => score >= SCORE.substring) : scored;
  kept.sort((a, b) => b.score - a.score || a.place.order - b.place.order);
  return kept.slice(0, limit).map(({ place, score }) => ({
    type: place.type,
    slug: place.slug,
    citySlug: place.citySlug,
    names: place.names,
    cityNames: place.cityNames,
    lat: place.lat,
    lng: place.lng,
    score,
  }));
}

/** The popular cities (for an empty "where?" field when the database list is not available). */
export function popularGazetteerCities(cities: readonly GazetteerCity[] = GAZETTEER): GazetteerCity[] {
  return cities.filter((city) => city.popular);
}

/** A city or neighborhood's coordinates and a sensible zoom box, or null when unknown. */
export function findGazetteerPlace(
  citySlug: string | null | undefined,
  neighborhoodSlug?: string | null,
  cities: readonly GazetteerCity[] = GAZETTEER,
): { lat: number; lng: number; type: "city" | "neighborhood" } | null {
  if (!citySlug) return null;
  const city = cities.find((c) => c.slug === citySlug);
  if (!city) return null;
  const hood = neighborhoodSlug ? city.neighborhoods.find((n) => n.slug === neighborhoodSlug) : undefined;
  return hood ? { lat: hood.lat, lng: hood.lng, type: "neighborhood" } : { lat: city.lat, lng: city.lng, type: "city" };
}
