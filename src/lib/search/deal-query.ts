import type { DealFilter } from "@/lib/listing/search-params";

export type RawSearchParams = Record<string, string | string[] | undefined>;

/** The query of /search for a deal shortcut (/rent, /buy, /hotels), keeping every other parameter. */
export function dealRedirectQuery(deal: DealFilter, params: RawSearchParams): string {
  const query = new URLSearchParams();
  query.set("deal", deal);
  for (const [key, value] of Object.entries(params)) {
    if (key === "deal" || value === undefined) continue;
    for (const item of Array.isArray(value) ? value : [value]) query.append(key, item);
  }
  return query.toString();
}
