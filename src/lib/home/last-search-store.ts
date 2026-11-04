/**
 * The device copy of the last search (localStorage "bayit:last-search", consent-gated by
 * createHistoryStore; in PRIVATE_STORAGE_KEYS, so logging out clears it).
 */
import { createHistoryStore, useHistoryStore } from "./history-store";
import { LAST_SEARCH_STORAGE_KEY, parseLastSearch, stampLastSearch, type LastSearch, type LastSearchDraft } from "./last-search";

export const lastSearchStore = createHistoryStore<LastSearch | null>({
  key: LAST_SEARCH_STORAGE_KEY,
  empty: null,
  parse: (value) => parseLastSearch(value, Date.now()),
  serialize: (value) => value,
  isEmpty: (value) => value === null,
});

/** Remembers the search on screen (with consent). */
export function rememberLastSearch(draft: LastSearchDraft): void {
  if (typeof window === "undefined") return;
  const stamped = stampLastSearch(draft, Date.now());
  if (stamped) lastSearchStore.write(stamped);
}

/** The last search, or null (on the server, before hydration, without consent, or when it is over). */
export function useLastSearch(): LastSearch | null {
  return useHistoryStore(lastSearchStore, null);
}
