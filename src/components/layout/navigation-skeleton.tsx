"use client";

import { useEffect, useRef, useState, type ReactNode } from "react";
import { BookingReviewSkeleton } from "@/components/booking/booking-review-skeleton";
import { ListingPageSkeleton } from "@/components/listing-page/listing-page-skeleton";
import { usePathname } from "@/i18n/navigation";
import { skeletonKindOf, type SkeletonKind } from "@/lib/listing/skeleton-routes";

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
 * 15 s, or at back/forward, in case the navigation never happened.
 */
export function NavigationSkeleton({ loadingLabel, children }: { loadingLabel: string; children: ReactNode }) {
  const pathname = usePathname();
  const [pending, setPending] = useState<{ from: string; kind: SkeletonKind } | null>(null);
  // The new page is in: the address changed since the tap.
  if (pending !== null && pending.from !== pathname) setPending(null);

  const current = useRef(pathname);
  useEffect(() => {
    current.current = pathname;
  }, [pathname]);

  useEffect(() => {
    let timer: number | undefined;
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
      window.scrollTo({ top: 0 });
    };
    // Bubble phase on the document, registered after React's own listener: Link's handler has run.
    document.addEventListener("click", onClick);
    window.addEventListener("popstate", clear);
    return () => {
      window.clearTimeout(timer);
      document.removeEventListener("click", onClick);
      window.removeEventListener("popstate", clear);
    };
  }, []);

  return (
    <>
      <div className={pending ? "hidden" : "contents"}>{children}</div>
      {pending?.kind === "listing" ? <ListingPageSkeleton label={loadingLabel} /> : null}
      {pending?.kind === "booking" ? <BookingReviewSkeleton /> : null}
    </>
  );
}
