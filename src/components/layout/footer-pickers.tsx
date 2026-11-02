"use client";

import { deferredIsland, whenNearViewport } from "@/components/ds/deferred-island";

/**
 * The footer's language and currency pickers, rendered on the server as usual; their Radix
 * dropdown code loads when the footer comes near the screen (or gets keyboard focus), not with
 * the page.
 */
export const FooterPickers = deferredIsland<object>(
  () => whenNearViewport("[data-site-footer]"),
  () => import("./footer-pickers-inner").then((m) => m.FooterPickers),
  { scope: "[data-site-footer] [data-footer-pickers]" },
);
