"use client";

import { useEffect, useMemo, useRef, useState, useSyncExternalStore } from "react";
import dynamic from "next/dynamic";
import { useLocale } from "next-intl";
import { Heart, Search } from "lucide-react";
import { Container } from "@/components/common/container";
import { Button } from "@/components/ds/button";
import { chipStyles } from "@/components/ds/chip";
import { Skeleton } from "@/components/ui/skeleton";
import { ListingCardSkeleton } from "@/components/listing/listing-card-skeleton";
import { useRecentlyViewedItems } from "@/hooks/use-recently-viewed";
import { Link } from "@/i18n/navigation";
import { lastSearchHref, lastSearchParts } from "@/lib/home/last-search";
import { useLastSearch } from "@/lib/home/last-search-store";
import { getListingCardsAction } from "@/lib/listing/card-actions";
import { FAVORITES_PATH } from "@/lib/listing/paths";
import type { ListingCardData } from "@/lib/listing/types";
import { clearRecentlyViewedAction, syncRecentlyViewedAction } from "@/lib/recently-viewed/actions";
import { mergeDeviceIntoAccount } from "@/lib/recently-viewed/client";
import { mergeViewed, RECENTLY_VIEWED_FETCH, RECENTLY_VIEWED_SHOW, viewedIds, type ViewedItem } from "@/lib/recently-viewed/core";
import { clearDeviceViews, recentlyViewedStore, setDeviceViews } from "@/lib/recently-viewed/device";
import { toast } from "@/lib/toast";
import { cn } from "@/lib/utils";
import { CAROUSEL_ALIGN } from "./home-section";
import { CONTINUE_TITLE_ID, RECENT_CARD_CLASS, RECENT_CARD_WIDTH, SHOW_IF_ANY, SHOW_IF_RECENT, SHOW_IF_SEARCH } from "./continue-layout";

export type ContinueLabels = {
  title: string;
  lastSearch: string;
  /** "שמורים · 3 מקומות" (only when there are saved places). */
  saved: string | null;
  recent: string;
  clear: string;
  clearLabel: string;
  cleared: string;
  undo: string;
  error: string;
  retry: string;
  loading: string;
  /** The home tabs' names ("חודשי"), for a last search that is not a short stay. */
  deals: Record<string, string>;
  /** "אורח אחד" … "16 אורחים" (index = count - 1). */
  guestCounts: string[];
};

// The client copy of the listing card loads only when there are places to show.
const ContinueRecentCards = dynamic(() => import("./continue-recent-cards").then((m) => m.ContinueRecentCards), {
  ssr: false,
  loading: () => <RecentSkeleton count={3} />,
});

const subscribeNothing = () => () => {};
/** False on the server and while hydrating, true after (and on client-side navigations). */
function useHydrated(): boolean {
  return useSyncExternalStore(
    subscribeNothing,
    () => true,
    () => false,
  );
}

function RecentSkeleton({ count, label }: { count: number; label?: string }) {
  return (
    <div role={label ? "status" : undefined}>
      {label ? <span className="sr-only">{label}</span> : null}
      <ul aria-hidden="true" className="flex gap-4 overflow-hidden px-gutter pb-2">
        {Array.from({ length: Math.max(1, Math.min(count, 4)) }, (_, i) => (
          <li key={i} className={cn("min-w-0 shrink-0", RECENT_CARD_WIDTH)}>
            <ListingCardSkeleton variant="compact" className={RECENT_CARD_CLASS} />
          </li>
        ))}
      </ul>
    </div>
  );
}

/**
 * The space the block will take, drawn before the page hydrates: hidden unless the inline hint
 * (this device has history) or the server (the signed-in account has history) says it is coming,
 * so a first visit reserves nothing and a returning visit does not shift.
 */
function ReservedSpace({ title, chips, recent }: { title: string; chips: boolean; recent: boolean }) {
  return (
    <div aria-hidden="true" className={cn("hidden pt-6", chips || recent ? "block" : SHOW_IF_ANY)}>
      <Container>
        {/* The real title (it wraps like the block's own in every language), then placeholders. */}
        <p className="text-h2 text-foreground">{title}</p>
        <div className={cn("hidden py-1.5", chips ? "block" : SHOW_IF_SEARCH)}>
          <Skeleton className="mt-3 h-chip w-64 max-w-full rounded-full" />
        </div>
        <div className={cn("hidden", recent ? "block" : SHOW_IF_RECENT)}>
          <div className="mt-4 flex min-h-11 items-center">
            <Skeleton className="h-5 w-32" />
          </div>
        </div>
      </Container>
      <div className={cn("hidden", recent ? "block" : SHOW_IF_RECENT)}>
        <Container className={CAROUSEL_ALIGN}>
          <RecentSkeleton count={3} />
        </Container>
      </div>
    </div>
  );
}

type Loaded = { cards: Map<number, ListingCardData>; missing: Set<number>; failed: boolean };

/**
 * "המשך מאיפה שעצרתם" (round 3, brief 4), right under the search card for returning visitors:
 * the last search as one tap, the saved places (signed in), and "נצפו לאחרונה" (up to 10, with
 * "ניקוי" and an undo). Guests' history comes from this device (with cookie consent); a signed-in
 * visitor's recently viewed places come from the account (`account`), with this device's list
 * merged in once after signing in. Renders nothing without history.
 */
export function ContinueBlock({
  labels,
  account: initialAccount,
  savedCount,
  cityNames,
}: {
  labels: ContinueLabels;
  /** The account's recently viewed places, newest first; null when signed out. */
  account: ViewedItem[] | null;
  savedCount: number;
  cityNames: Record<string, string>;
}) {
  const locale = useLocale();
  const hydrated = useHydrated();
  const device = useRecentlyViewedItems();
  const search = useLastSearch();
  const [account, setAccount] = useState<readonly ViewedItem[] | null>(initialAccount);
  const heading = useRef<HTMLHeadingElement>(null);

  // Signed in: what this device saw before signing in goes into the account (once per tab). Until
  // the answer arrives, both lists show together, so nothing jumps.
  const signedIn = initialAccount !== null;
  useEffect(() => {
    if (!signedIn) return;
    let alive = true;
    void mergeDeviceIntoAccount().then((merged) => {
      if (alive && merged) setAccount(merged);
    });
    return () => {
      alive = false;
    };
  }, [signedIn]);

  const items = useMemo(
    () => (account ? mergeViewed([account, device], Number.POSITIVE_INFINITY, RECENTLY_VIEWED_FETCH) : device),
    [account, device],
  );
  const ids = useMemo(() => viewedIds(items, RECENTLY_VIEWED_FETCH), [items]);

  const [loaded, setLoaded] = useState<Loaded>({ cards: new Map(), missing: new Set(), failed: false });
  // Only IDs not fetched yet, so clearing or reordering never refetches the rest.
  const pendingKey = ids.filter((id) => !loaded.cards.has(id) && !loaded.missing.has(id)).join(",");
  useEffect(() => {
    if (!pendingKey || loaded.failed) return;
    let cancelled = false;
    const wanted = pendingKey.split(",").map(Number);
    getListingCardsAction(wanted)
      .then((result) => {
        if (cancelled) return;
        if (!result.ok) return setLoaded((s) => ({ ...s, failed: true }));
        const found = new Set(result.data.map((card) => card.publicId));
        setLoaded((s) => ({
          cards: new Map([...s.cards, ...result.data.map((card) => [card.publicId, card] as const)]),
          // Deleted, hidden or paused listings are skipped (they stay in the list, never shown).
          missing: new Set([...s.missing, ...wanted.filter((id) => !found.has(id))]),
          failed: false,
        }));
      })
      .catch(() => {
        if (!cancelled) setLoaded((s) => ({ ...s, failed: true }));
      });
    return () => {
      cancelled = true;
    };
  }, [pendingKey, loaded.failed]);

  if (!hydrated) return <ReservedSpace title={labels.title} chips={savedCount > 0} recent={(initialAccount?.length ?? 0) > 0} />;

  const cards = ids
    .map((id) => loaded.cards.get(id))
    .filter((card): card is ListingCardData => !!card)
    .slice(0, RECENTLY_VIEWED_SHOW);
  const loading = pendingKey !== "" && !loaded.failed;
  const showRecent = cards.length > 0 || (ids.length > 0 && (loading || loaded.failed));
  const showSaved = savedCount > 0 && !!labels.saved;
  if (!search && !showSaved && !showRecent) return null;

  const parts = search
    ? lastSearchParts(search, {
        locale,
        cityName: search.city ? (cityNames[search.city] ?? null) : null,
        dealLabel: search.deal ? (labels.deals[search.deal] ?? null) : null,
        guestsLabel: (count) => labels.guestCounts[count - 1] ?? String(count),
      })
    : [];
  const summary = parts.join(" · ");

  const clear = () => {
    const previousDevice = recentlyViewedStore.read();
    const previousAccount = account;
    clearDeviceViews();
    let cleared: Promise<unknown> = Promise.resolve();
    if (previousAccount) {
      setAccount([]);
      cleared = clearRecentlyViewedAction().catch(() => undefined);
    }
    heading.current?.focus();
    toast(labels.cleared, {
      action: {
        label: labels.undo,
        onClick: () => {
          setDeviceViews(previousDevice);
          if (!previousAccount) return;
          setAccount(previousAccount);
          const both = mergeViewed([previousAccount, previousDevice], Date.now());
          void cleared
            .then(() => syncRecentlyViewedAction(both.map(({ id, at }) => ({ id, at }))))
            .then((result) => {
              if (result.ok) setAccount(result.data);
            })
            .catch(() => undefined);
        },
      },
    });
  };

  return (
    <section aria-labelledby={CONTINUE_TITLE_ID} className="pt-6">
      <Container>
        <h2 ref={heading} id={CONTINUE_TITLE_ID} tabIndex={-1} className="text-h2 text-foreground outline-none">
          {labels.title}
        </h2>
        {search || showSaved ? (
          <ul className="-mx-4 mt-3 flex gap-2 overflow-x-auto overscroll-x-contain px-4 py-1.5 scrollbar-none sm:mx-0 sm:flex-wrap sm:px-0">
            {search ? (
              <li className="min-w-0 max-w-[85%] shrink-0 sm:max-w-md">
                <Link href={lastSearchHref(search)} title={summary} className={cn(chipStyles(), "max-w-full [&_svg]:text-primary")}>
                  <Search aria-hidden="true" />
                  <span className="sr-only">{labels.lastSearch}: </span>
                  {/* Each part isolated: a place typed in another script keeps the order of the line. */}
                  <span className="truncate">
                    {parts.map((part, index) => (
                      <span key={index}>
                        {index > 0 ? " · " : null}
                        <bdi>{part}</bdi>
                      </span>
                    ))}
                  </span>
                </Link>
              </li>
            ) : null}
            {showSaved ? (
              <li className="shrink-0">
                <Link href={FAVORITES_PATH} className={cn(chipStyles(), "[&_svg]:text-primary")}>
                  <Heart aria-hidden="true" />
                  {labels.saved}
                </Link>
              </li>
            ) : null}
          </ul>
        ) : null}
        {showRecent ? (
          <div className="mt-4 flex min-h-11 items-center justify-between gap-3">
            <h3 className="text-h3 text-foreground">{labels.recent}</h3>
            <Button variant="ghost" size="sm" className="-me-2 rounded-full text-muted-foreground" onClick={clear} aria-label={labels.clearLabel}>
              {labels.clear}
            </Button>
          </div>
        ) : null}
      </Container>
      {showRecent ? (
        cards.length > 0 ? (
          <Container className={CAROUSEL_ALIGN}>
            <ContinueRecentCards label={labels.recent} cards={cards} />
          </Container>
        ) : loaded.failed ? (
          <Container>
            <div role="alert" className="flex flex-wrap items-center justify-between gap-3 rounded-card border border-border bg-card p-4">
              <p className="text-small text-foreground">{labels.error}</p>
              <Button variant="secondary" size="sm" onClick={() => setLoaded((s) => ({ ...s, failed: false }))}>
                {labels.retry}
              </Button>
            </div>
          </Container>
        ) : (
          <Container className={CAROUSEL_ALIGN}>
            <RecentSkeleton count={ids.length} label={labels.loading} />
          </Container>
        )
      ) : null}
    </section>
  );
}
