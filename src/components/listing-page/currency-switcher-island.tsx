"use client";

import type { ComponentProps } from "react";
import { deferredIsland, whenWideAndIdle } from "@/components/ds/deferred-island";
import type { CurrencySwitcher } from "@/components/layout/currency-switcher";

/**
 * The currency menu in the listing's desktop contact box (≥ 1024px only), rendered on the server
 * as usual but hydrated later, like the header's desktop tools: its Radix dropdown menu is not
 * part of the listing page's first load, and phones (where the box is hidden) never download it.
 * On desktop it loads once the page is idle or the pointer reaches it; an earlier click is
 * replayed. Wrap it in an element with `data-box-currency`.
 */
export const BoxCurrencySwitcher = deferredIsland<ComponentProps<typeof CurrencySwitcher>>(
  () => whenWideAndIdle("(min-width: 64rem)", "[data-box-currency]"),
  () => import("@/components/layout/currency-switcher").then((m) => m.CurrencySwitcher),
  { scope: "[data-box-currency]" },
);
