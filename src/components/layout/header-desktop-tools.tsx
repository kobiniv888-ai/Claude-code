"use client";

import { deferredIsland, whenWideAndIdle } from "@/components/ds/deferred-island";
import type { HeaderDesktopToolsProps } from "./header-desktop-tools-inner";

/**
 * The desktop header's tools (≥ 1024px: switchers, Saved, Messages, account menu, "Post a
 * listing"), rendered on the server as usual but hydrated later: their Radix dropdowns, tooltips
 * and icons are not part of the first load, and phones (where they are hidden) never download
 * them unless the window grows that wide. On desktop they load once the page is idle, or as soon
 * as the pointer reaches the header.
 */
export const HeaderDesktopTools = deferredIsland<HeaderDesktopToolsProps>(
  () => whenWideAndIdle("(min-width: 64rem)", "header"),
  () => import("./header-desktop-tools-inner").then((m) => m.HeaderDesktopTools),
  { scope: "header [data-desktop-tools]" },
);
