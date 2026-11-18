"use client";

import { useEffect, useRef } from "react";
import { addRecentlyViewed } from "@/hooks/use-recently-viewed";
import { trackListingView } from "@/lib/listing-page/actions";
import { mergeDeviceIntoAccount } from "@/lib/recently-viewed/client";

/** A page the browser prerenders (Speculation Rules) runs its effects before anyone opens it. */
function whenShown(run: () => void): () => void {
  const doc = document as Document & { prerendering?: boolean };
  if (!doc.prerendering && doc.visibilityState !== "hidden") {
    run();
    return () => undefined;
  }
  const check = () => {
    if (doc.prerendering || doc.visibilityState === "hidden") return;
    cleanup();
    run();
  };
  const cleanup = () => {
    document.removeEventListener("prerenderingchange", check);
    document.removeEventListener("visibilitychange", check);
  };
  document.addEventListener("prerenderingchange", check);
  document.addEventListener("visibilitychange", check);
  return cleanup;
}

/**
 * After the page is shown to someone (not while it is prerendered or in a hidden tab): count the
 * view (public listings only; the server decides who counts, src/lib/listing/stats-rules.ts) and
 * remember it in "Recently viewed" (on this device with cookie consent, and in the account when
 * signed in).
 */
export function ViewTracker({ listingId, publicId, isPublic }: { listingId: string; publicId: number; isPublic: boolean }) {
  const done = useRef<string | null>(null);
  useEffect(() => {
    if (done.current === listingId || !isPublic) return;
    return whenShown(() => {
      if (done.current === listingId) return;
      done.current = listingId;
      addRecentlyViewed(publicId);
      void trackListingView(listingId)
        // Signed in: the view is in the account; merge what this device saw before signing in (once per tab).
        .then((result) => (result.ok && result.data.signedIn ? mergeDeviceIntoAccount() : null))
        .catch(() => undefined);
    });
  }, [listingId, publicId, isPublic]);
  return null;
}
