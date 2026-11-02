"use client";

import { deferredIsland, whenNearViewport } from "@/components/ds/deferred-island";
import type { FoldedSectionProps } from "./folded-section";

/**
 * The listing's "Kosher and Shabbat" folded section, rendered on the server as before (closed);
 * its code (the Radix accordion) hydrates when the section comes near the screen, or at the first
 * tap, which is then replayed (so an early tap still opens it). Rendered inside `#kosher`.
 */
export const KosherFoldedSection = deferredIsland<FoldedSectionProps>(
  () => whenNearViewport("#kosher"),
  () => import("./folded-section").then((m) => m.FoldedSection),
  { scope: "#kosher" },
);

/** The sale listing's "Price history" fold in the price section (`#price`), deferred the same way. */
export const PriceHistoryFoldedSection = deferredIsland<FoldedSectionProps>(
  () => whenNearViewport("#price"),
  () => import("./folded-section").then((m) => m.FoldedSection),
  { scope: "#price" },
);
