"use client";

import { useEffect, useRef, useState } from "react";
import { useLocale, useTranslations } from "next-intl";
import { HistoryIcon } from "lucide-react";
import { ChevronEnd, ChevronStart } from "@/components/common/directional-icon";
import { Button } from "@/components/ui/button";
import { clearRecentlyViewed, removeRecentlyViewed, useRecentlyViewed } from "@/hooks/use-recently-viewed";
import { dirFor } from "@/i18n/locale";
import { getListingCardsAction } from "@/lib/listing/card-actions";
import type { ListingCardData } from "@/lib/listing/types";
import { cn } from "@/lib/utils";
import { ListingCard } from "./listing-card";
import { ListingCardSkeleton } from "./listing-card-skeleton";
import { scrollBehavior } from "@/lib/motion";

type Loaded = { cards: Map<number, ListingCardData>; missing: Set<number>; failed: boolean };

/**
 * The "Recently viewed" row itself: fetches the cards and renders them. Loaded by
 * <RecentlyViewed> (./recently-viewed) only when the visitor has viewed listings.
 */
export function RecentlyViewedRow({
  excludePublicId,
  title,
  className,
}: {
  /** Leave out the listing the visitor is looking at. */
  excludePublicId?: number;
  title?: string;
  className?: string;
}) {
  const t = useTranslations("listingCard.recentlyViewed");
  const locale = useLocale();
  const allIds = useRecentlyViewed();
  const ids = allIds.filter((id) => id !== excludePublicId);
  const [loaded, setLoaded] = useState<Loaded>({ cards: new Map(), missing: new Set(), failed: false });
  const scroller = useRef<HTMLUListElement>(null);
  // Only IDs we have not fetched yet (so adding, removing or clearing never refetches the rest).
  const pendingKey = ids.filter((id) => !loaded.cards.has(id) && !loaded.missing.has(id)).join(",");

  useEffect(() => {
    if (!pendingKey) return;
    let cancelled = false;
    const wanted = pendingKey.split(",").map(Number);
    getListingCardsAction(wanted)
      .then((result) => {
        if (cancelled) return;
        if (!result.ok) {
          setLoaded((s) => ({ ...s, failed: true }));
          return;
        }
        const found = new Set(result.data.map((card) => card.publicId));
        const gone = wanted.filter((id) => !found.has(id));
        setLoaded((s) => ({
          cards: new Map([...s.cards, ...result.data.map((card) => [card.publicId, card] as const)]),
          missing: new Set([...s.missing, ...gone]),
          failed: false,
        }));
        // Forget listings that are no longer public.
        gone.forEach(removeRecentlyViewed);
      })
      .catch(() => {
        if (!cancelled) setLoaded((s) => ({ ...s, failed: true }));
      });
    return () => {
      cancelled = true;
    };
  }, [pendingKey]);

  if (ids.length === 0) return null;
  const cards = ids.map((id) => loaded.cards.get(id)).filter((card): card is ListingCardData => !!card);
  const loading = pendingKey !== "" && !loaded.failed;
  if (!loading && cards.length === 0) return null;

  const scroll = (direction: 1 | -1) => {
    const el = scroller.current;
    if (!el) return;
    const sign = dirFor(locale) === "rtl" ? -1 : 1;
    el.scrollBy({ left: direction * sign * el.clientWidth * 0.85, behavior: scrollBehavior() });
  };

  return (
    <section aria-labelledby="recently-viewed-title" className={cn("flex flex-col gap-4", className)}>
      <div className="flex items-center justify-between gap-3">
        <h2 id="recently-viewed-title" className="flex items-center gap-2 text-xl font-semibold sm:text-2xl">
          <HistoryIcon className="size-5 text-primary" aria-hidden="true" />
          {title ?? t("title")}
        </h2>
        <div className="flex items-center gap-1">
          <Button variant="ghost" size="icon" className="hidden rounded-full sm:inline-flex" onClick={() => scroll(-1)} aria-label={t("scrollBack")}>
            <ChevronStart aria-hidden="true" />
          </Button>
          <Button variant="ghost" size="icon" className="hidden rounded-full sm:inline-flex" onClick={() => scroll(1)} aria-label={t("scrollForward")}>
            <ChevronEnd aria-hidden="true" />
          </Button>
          <Button variant="ghost" size="sm" className="rounded-full text-muted-foreground" onClick={clearRecentlyViewed}>
            {t("clear")}
          </Button>
        </div>
      </div>
      <ul
        ref={scroller}
        aria-busy={loading || undefined}
        className="-mx-4 flex snap-x snap-mandatory scroll-px-4 gap-4 overflow-x-auto px-4 pb-2 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
      >
        {loading && cards.length === 0
          ? Array.from({ length: Math.min(ids.length, 4) }, (_, i) => (
              <li key={i} className="w-[78%] max-w-72 shrink-0 snap-start sm:w-64">
                <ListingCardSkeleton />
              </li>
            ))
          : cards.map((card) => (
              <li key={card.id} className="w-[78%] max-w-72 shrink-0 snap-start sm:w-64">
                <ListingCard listing={card} />
              </li>
            ))}
      </ul>
    </section>
  );
}
