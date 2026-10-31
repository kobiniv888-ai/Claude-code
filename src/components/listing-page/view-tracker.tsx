"use client";

import { useEffect, useRef } from "react";
import { addRecentlyViewed } from "@/hooks/use-recently-viewed";
import { trackListingView } from "@/lib/listing-page/actions";

/** After the page is shown: count the view (public listings only) and remember it in "Recently viewed". */
export function ViewTracker({ listingId, publicId, isPublic }: { listingId: string; publicId: number; isPublic: boolean }) {
  const done = useRef<string | null>(null);
  useEffect(() => {
    if (done.current === listingId) return;
    done.current = listingId;
    if (!isPublic) return;
    addRecentlyViewed(publicId);
    void trackListingView(listingId).catch(() => undefined);
  }, [listingId, publicId, isPublic]);
  return null;
}
