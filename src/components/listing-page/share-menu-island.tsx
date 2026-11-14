"use client";

import { deferredIsland } from "@/components/ds/deferred-island";
import { afterLoadIdle } from "@/lib/idle";
import type { ShareMenuProps } from "./share-menu";

/**
 * The listing's share button, rendered on the server as before; its code (Radix dropdown menu,
 * brand icons) hydrates once the page is idle, or at the first tap (which is then replayed, so an
 * early tap still opens the menu or the phone's share sheet). Wrap it in an element with
 * `data-share-menu`.
 */
export const ShareMenu = deferredIsland<ShareMenuProps>(
  () => new Promise<void>((resolve) => void afterLoadIdle(resolve)),
  () => import("./share-menu").then((m) => m.ShareMenu),
  { scope: "[data-share-menu]" },
);
