"use client";

import { createContext, useContext, useMemo, useState, type ReactNode } from "react";
import { HOME_DEFAULT_DEAL } from "@/lib/home/recommended";
import type { SearchBarDeal } from "@/lib/search/search-bar";

type HomeTab = { deal: SearchBarDeal; setDeal: (deal: SearchBarDeal) => void };

const HomeTabContext = createContext<HomeTab | null>(null);

/**
 * The home page's selected tab (לטווח קצר / חודשי / קנייה / מלונות), shared by the search card
 * and "מקומות מומלצים" (round 3, brief 3 and 4): switching the tab switches the row. Starts on
 * short stays on every visit, like the search card.
 */
export function HomeTabProvider({ children }: { children: ReactNode }) {
  const [deal, setDeal] = useState<SearchBarDeal>(HOME_DEFAULT_DEAL);
  const value = useMemo(() => ({ deal, setDeal }), [deal]);
  return <HomeTabContext value={value}>{children}</HomeTabContext>;
}

/** The selected tab, or null outside the home page. */
export function useHomeTab(): HomeTab | null {
  return useContext(HomeTabContext);
}
