"use client";

import dynamic from "next/dynamic";
import { useRecentlyViewed } from "@/hooks/use-recently-viewed";

// The row brings the client copy of the listing card (with its icons and badges): load it only
// for visitors who have viewed listings, not with every home and listing page.
const RecentlyViewedRow = dynamic(() => import("./recently-viewed-row").then((m) => m.RecentlyViewedRow), {
  ssr: false,
});

/**
 * "Recently viewed" row (home page, listing page). Reads the IDs from localStorage, fetches the
 * cards, and renders nothing when there is nothing to show.
 */
export function RecentlyViewed(props: {
  /** Leave out the listing the visitor is looking at. */
  excludePublicId?: number;
  title?: string;
  className?: string;
}) {
  const ids = useRecentlyViewed();
  if (!ids.some((id) => id !== props.excludePublicId)) return null;
  return <RecentlyViewedRow {...props} />;
}
