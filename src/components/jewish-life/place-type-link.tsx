"use client";

import type { ReactNode } from "react";
import { scrollBehavior } from "@/lib/motion";

/**
 * A link that filters the places map/list below by type, without reloading the page: it puts
 * `?type=…` in the URL (Next.js keeps useSearchParams in step with history.pushState, and
 * <PlacesExplorer> follows the URL) and scrolls to #places. Without JavaScript it is a normal link.
 */
export function PlaceTypeLink({
  typeParam,
  className,
  children,
  "aria-label": ariaLabel,
}: {
  /** The `type` query value, e.g. "kosher-restaurant,kosher-shop". */
  typeParam: string;
  className?: string;
  children: ReactNode;
  "aria-label"?: string;
}) {
  const href = `?type=${typeParam}#places`;
  return (
    <a
      href={href}
      aria-label={ariaLabel}
      className={className}
      onClick={(event) => {
        if (event.defaultPrevented || event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) {
          return;
        }
        event.preventDefault();
        const url = new URL(window.location.href);
        url.searchParams.set("type", typeParam);
        url.searchParams.delete("placeCity");
        url.hash = "places";
        window.history.pushState(null, "", url);
        document.getElementById("places")?.scrollIntoView({ behavior: scrollBehavior(), block: "start" });
      }}
    >
      {children}
    </a>
  );
}
