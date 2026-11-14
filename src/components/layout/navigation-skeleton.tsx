"use client";

import { useEffect, useLayoutEffect, useRef, useState, type ReactNode } from "react";
import { usePathname } from "@/i18n/navigation";
import { skeletonKindOf, type SkeletonKind } from "@/lib/listing/skeleton-routes";
import { loadOnce } from "@/lib/load-once";

// The two skeletons are not part of every page's first load: they load once the page is idle
// (well before most taps) or at the first touch, and a tap that comes earlier shows them as soon
// as they arrive (the page stays in place meanwhile). Kept as plain components once loaded (not
// React.lazy): they render in the same frame as the tap, and a failed load only means no skeleton.
const skeletons = loadOnce(() =>
  Promise.all([import("@/components/listing-page/listing-page-skeleton"), import("@/components/booking/booking-review-skeleton")]).then(
    ([listing, booking]) => ({ Listing: listing.ListingPageSkeleton, Booking: booking.BookingReviewSkeleton }),
  ),
);

/**
 * The listing page's skeleton when a listing link is tapped on our site (a card, "Similar places",
 * a map pin's card…), and the booking review's when "Book" is tapped, shown in place of the page
 * content until the new page arrives.
 *
 * Why not a route `loading.tsx`: that also makes the first visit stream (the skeleton first, the
 * page in a second part that React shows at least 300 ms later), which made the listing page's
 * largest paint wait for all its scripts, and the booking review's footer jump when its content
 * was shorter than the skeleton (docs/integration/performance-seo.md). Without it a page arrives
 * in one response; this component brings the skeletons back for navigations only.
 *
 * It listens to clicks after React: a Next.js <Link> that starts a client-side navigation calls
 * preventDefault(), so a link opened in a new tab, a modified click or a full page load never
 * shows it. The skeleton goes away as soon as the address changes (the new page is in), or after
 * 15 s, or at back/forward, in case the navigation never happened. The page scrolls to the top only
 * when the skeleton is shown (a tap before the skeletons arrive leaves the old page where it was;
 * Next.js scrolls once the new page is in).
 */
export function NavigationSkeleton({ loadingLabel, children }: { loadingLabel: string; children: ReactNode }) {
  const pathname = usePathname();
  const [pending, setPending] = useState<{ from: string; kind: SkeletonKind } | null>(null);
  // The skeletons' code has arrived (until then a tapped page stays visible instead of a blank).
  const [ready, setReady] = useState(() => skeletons.get() !== null);
  // The new page is in: the address changed since the tap.
  if (pending !== null && pending.from !== pathname) setPending(null);

  const current = useRef(pathname);
  useEffect(() => {
    current.current = pathname;
  }, [pathname]);

  useEffect(() => {
    let alive = true;
    let timer: number | undefined;
    // Marks the skeletons ready only once they have really loaded; a failed load leaves the page
    // as it is (the next tap or idle moment tries again).
    const preload = () => {
      void skeletons.preload().then(
        () => {
          if (alive) setReady(true);
        },
        () => {},
      );
    };
    const clear = () => {
      window.clearTimeout(timer);
      setPending(null);
    };
    const onClick = (event: MouseEvent) => {
      if (!event.defaultPrevented || event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
      const target = event.target instanceof Element ? event.target.closest("a[href], button") : null;
      if (!(target instanceof HTMLAnchorElement) || (target.target && target.target !== "_self")) return;
      const url = new URL(target.href, window.location.href);
      const kind = skeletonKindOf(url.pathname);
      if (url.origin !== window.location.origin || url.pathname === window.location.pathname || !kind) return;
      window.clearTimeout(timer);
      timer = window.setTimeout(clear, 15_000);
      setPending({ from: current.current, kind });
      preload();
    };
    // Bubble phase on the document, registered after React's own listener: Link's handler has run.
    document.addEventListener("click", onClick);
    window.addEventListener("popstate", clear);
    // The skeletons' code: when idle after the page has loaded, or at the first touch.
    let cancelIdle = () => {};
    const whenIdle = () => {
      if (typeof window.requestIdleCallback === "function") {
        const id = window.requestIdleCallback(preload, { timeout: 4000 });
        cancelIdle = () => window.cancelIdleCallback(id);
      } else {
        const id = window.setTimeout(preload, 1500);
        cancelIdle = () => window.clearTimeout(id);
      }
    };
    if (document.readyState === "complete") whenIdle();
    else window.addEventListener("load", whenIdle, { once: true });
    document.addEventListener("pointerdown", preload, { once: true, passive: true, capture: true });
    return () => {
      alive = false;
      window.clearTimeout(timer);
      document.removeEventListener("click", onClick);
      window.removeEventListener("popstate", clear);
      window.removeEventListener("load", whenIdle);
      document.removeEventListener("pointerdown", preload, { capture: true });
      cancelIdle();
    };
  }, []);

  const loaded = ready ? skeletons.get() : null;
  const skeleton = pending !== null && loaded ? pending.kind : null;
  // Scroll when the skeleton replaces the page, before it is painted (not at the tap).
  useLayoutEffect(() => {
    if (skeleton) window.scrollTo({ top: 0 });
  }, [skeleton]);

  return (
    <>
      <div className={skeleton ? "hidden" : "contents"}>{children}</div>
      {skeleton && loaded ? skeleton === "listing" ? <loaded.Listing label={loadingLabel} /> : <loaded.Booking /> : null}
    </>
  );
}
