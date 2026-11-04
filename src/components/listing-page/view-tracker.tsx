"use client";

import { useEffect, useRef } from "react";
import { addRecentlyViewed } from "@/hooks/use-recently-viewed";
import { trackListingView } from "@/lib/listing-page/actions";
import { mergeDeviceIntoAccount } from "@/lib/recently-viewed/client";

/**
 * After the page is shown: count the view (public listings only) and remember it in "Recently
 * viewed" (on this device with cookie consent, and in the account when signed in).
 */
export function ViewTracker({ listingId, publicId, isPublic }: { listingId: string; publicId: number; isPublic: boolean }) {
  const done = useRef<string | null>(null);
  useEffect(() => {
    if (done.current === listingId) return;
    done.current = listingId;
    if (!isPublic) return;
    addRecentlyViewed(publicId);
    void trackListingView(listingId)
      // Signed in: the view is in the account; merge what this device saw before signing in (once per tab).
      .then((result) => (result.ok && result.data.signedIn ? mergeDeviceIntoAccount() : null))
      .catch(() => undefined);
  }, [listingId, publicId, isPublic]);
  return null;
}
