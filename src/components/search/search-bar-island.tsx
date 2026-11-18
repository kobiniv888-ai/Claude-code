"use client";

import { deferredIsland, whenWideAndIdle } from "@/components/ds/deferred-island";
import type { SearchBarProps } from "./search-bar";

/**
 * The search page's full search bar (tablets and desktops only; phones use the top bar and the
 * search sheet). Rendered on the server as before, but its code (Radix popover and sheet, the
 * date picker trigger, the place field) is not part of the first load: it hydrates once the page
 * is idle on a screen ≥ 768px, when the pointer reaches it, or at the first tap anywhere (see
 * deferredIsland). Phones only download it after their first tap.
 */
export const SearchBarIsland = deferredIsland<SearchBarProps>(
  () => whenWideAndIdle("(min-width: 48rem)", "[data-search-bar]"),
  () => import("./search-bar").then((m) => m.SearchBar),
  { scope: "[data-search-bar]" },
);
