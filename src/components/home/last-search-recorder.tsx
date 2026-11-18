"use client";

import { useEffect } from "react";
import type { LastSearchDraft } from "@/lib/home/last-search";
import { rememberLastSearch } from "@/lib/home/last-search-store";

/**
 * On the search page: remembers the search on screen as the visitor's last search, for the home
 * page's "המשך מאיפה שעצרתם" (on this device, only with cookie consent). Renders nothing.
 */
export function LastSearchRecorder({ draft }: { draft: LastSearchDraft }) {
  const key = JSON.stringify(draft);
  useEffect(() => {
    rememberLastSearch(JSON.parse(key) as LastSearchDraft);
  }, [key]);
  return null;
}
