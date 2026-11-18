"use client";

import { useRef, useState, useEffect, type ReactNode } from "react";
import dynamic from "next/dynamic";
import { Container } from "@/components/common/container";
import { Button } from "@/components/ds/button";
import { EmptyState } from "@/components/ds/empty-state";
import { SectionHeader } from "@/components/ds/section-header";
import { SparklesIcon } from "@/components/ds/sprite-icons";
import { ListingCardSkeleton } from "@/components/listing/listing-card-skeleton";
import { getHomeRecommendedAction } from "@/lib/home/actions";
import type { ListingCardData } from "@/lib/listing/types";
import type { SearchBarDeal } from "@/lib/search/search-bar";
import { cn } from "@/lib/utils";
import { CAROUSEL_ALIGN } from "./home-section";
import { useHomeTab } from "./home-tab";
import { RECOMMENDED_CARD_WIDTH, RECOMMENDED_TITLE_ID } from "./recommended-layout";

export type RecommendedLabels = {
  title: string;
  all: string;
  /** Per tab: "עוד אין כאן מלונות". */
  empty: Record<SearchBarDeal, string>;
  emptyText: string;
  emptyAction: string;
  error: string;
  retry: string;
  loading: string;
};

function RowSkeleton({ label }: { label: string }) {
  return (
    <div role="status" aria-live="polite">
      <span className="sr-only">{label}</span>
      <ul aria-hidden="true" className="flex gap-4 overflow-hidden px-gutter pb-2">
        {Array.from({ length: 4 }, (_, i) => (
          <li key={i} className={cn("min-w-0 shrink-0", RECOMMENDED_CARD_WIDTH)}>
            <ListingCardSkeleton />
          </li>
        ))}
      </ul>
    </div>
  );
}

// The client copy of the listing card loads at the first tab switch, not with the home page.
const RecommendedCards = dynamic(() => import("./recommended-cards").then((m) => m.RecommendedCards), {
  ssr: false,
});

/** The empty row of one tab: what is missing, and an invitation to list a place. */
export function RecommendedEmpty({ title, text, action }: { title: string; text: string; action: string }) {
  return (
    <EmptyState icon={SparklesIcon} title={title} description={text} action={{ label: action, href: "/post" }} headingLevel={3} compact />
  );
}

/**
 * "מקומות מומלצים" follows the home tab (round 3, brief 3 and 4): at most 6 cards of the selected
 * tab's type, and "הכל ←" opens the search for that type. The first tab's row comes from the
 * server (`initial`, no extra request and no layout shift); another tab's row loads when the
 * visitor switches to it (a skeleton meanwhile, then cards, a per-tab empty state or an error with
 * "try again") and is kept for switching back.
 */
export function RecommendedSwitch({
  initialDeal,
  initialEmpty,
  initial,
  labels,
  hrefs,
}: {
  initialDeal: SearchBarDeal;
  initialEmpty: boolean;
  initial: ReactNode;
  labels: RecommendedLabels;
  hrefs: Record<SearchBarDeal, string>;
}) {
  const deal = useHomeTab()?.deal ?? initialDeal;
  const isInitial = deal === initialDeal;
  const [loaded, setLoaded] = useState<Partial<Record<SearchBarDeal, ListingCardData[]>>>({});
  const [failed, setFailed] = useState<ReadonlySet<SearchBarDeal>>(() => new Set());
  const inFlight = useRef(new Set<SearchBarDeal>());
  const wanted = !isInitial && !loaded[deal] && !failed.has(deal) ? deal : null;

  useEffect(() => {
    if (!wanted || inFlight.current.has(wanted)) return;
    inFlight.current.add(wanted);
    const fail = () => setFailed((prev) => new Set(prev).add(wanted));
    getHomeRecommendedAction(wanted)
      .then((result) => (result.ok ? setLoaded((prev) => ({ ...prev, [wanted]: result.data })) : fail()))
      .catch(fail)
      .finally(() => inFlight.current.delete(wanted));
  }, [wanted]);

  const cards = isInitial ? null : loaded[deal];
  const empty = isInitial ? initialEmpty : cards?.length === 0;
  const retry = () =>
    setFailed((prev) => {
      const next = new Set(prev);
      next.delete(deal);
      return next;
    });

  let row: ReactNode = null;
  if (!isInitial) {
    if (failed.has(deal)) {
      row = (
        <Container>
          <div role="alert" className="flex flex-wrap items-center justify-between gap-3 rounded-card border border-border bg-card p-4">
            <p className="text-small text-foreground">{labels.error}</p>
            <Button variant="secondary" size="sm" onClick={retry}>
              {labels.retry}
            </Button>
          </div>
        </Container>
      );
    } else if (!cards) {
      row = (
        <Container className={CAROUSEL_ALIGN}>
          <RowSkeleton label={labels.loading} />
        </Container>
      );
    } else if (cards.length === 0) {
      row = (
        <Container>
          <RecommendedEmpty title={labels.empty[deal]} text={labels.emptyText} action={labels.emptyAction} />
        </Container>
      );
    } else {
      row = (
        <Container className={CAROUSEL_ALIGN}>
          <RecommendedCards label={labels.title} listings={cards} />
        </Container>
      );
    }
  }

  return (
    <section aria-labelledby={RECOMMENDED_TITLE_ID} aria-busy={wanted !== null || undefined}>
      <Container>
        <SectionHeader
          id={RECOMMENDED_TITLE_ID}
          title={labels.title}
          href={empty ? undefined : hrefs[deal]}
          linkLabel={labels.all}
          className={cn("mb-3", empty && "min-h-11")}
        />
      </Container>
      {/* Kept mounted while another tab shows, so switching back is instant and keeps its scroll. */}
      <div hidden={!isInitial}>{initial}</div>
      {row}
    </section>
  );
}
