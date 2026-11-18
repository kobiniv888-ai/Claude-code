/**
 * The "My account" navigation (pure, client-safe). Phase 2 sections appear only when their
 * feature flag in siteConfig.features is on.
 *
 * Tabs (brief 5.8): סקירה · הנסיעות שלי · הנכסים שלי · הזמנות לנכסים שלי (hosts only) · שמורים ·
 * אימות · הגדרות. The other pages keep their URLs but are not tabs: "Compare" is reached from
 * שמורים, support requests from the overview; on phones they join the tab strip while open or
 * while something waits there (see AccountShell).
 */
import { siteConfig } from "@/config/site";
import { HOST_BOOKINGS_PATH, TRIPS_PATH } from "@/lib/booking/constants";

export const ACCOUNT_NAV_KEYS = [
  "overview",
  "trips",
  "listings",
  "hostBookings",
  "favorites",
  "compare",
  "messages",
  "savedSearches",
  "reviews",
  "tickets",
  "verification",
  "settings",
] as const;
export type AccountNavKey = (typeof ACCOUNT_NAV_KEYS)[number];

/** The seven tabs, in order (hostBookings only for hosts). */
export const ACCOUNT_TAB_KEYS = [
  "overview",
  "trips",
  "listings",
  "hostBookings",
  "favorites",
  "verification",
  "settings",
] as const satisfies readonly AccountNavKey[];

export type AccountNavItem = {
  key: AccountNavKey;
  href: string;
  /** One of the seven tabs; false for the secondary links (compare, support…). */
  tab: boolean;
};

const HREFS: Record<AccountNavKey, string> = {
  overview: "/account",
  trips: TRIPS_PATH,
  listings: "/account/listings",
  hostBookings: HOST_BOOKINGS_PATH,
  favorites: "/account/favorites",
  compare: "/account/compare",
  messages: "/account/messages",
  // "התראות וחיפושים שמורים" (round 3, brief 7.4).
  savedSearches: "/account/alerts",
  reviews: "/account/reviews",
  tickets: "/account/tickets",
  verification: "/account/verification",
  settings: "/account/settings",
};

type FeatureFlags = { chat: boolean; savedSearchAlerts: boolean; reviews: boolean };

/** Which flag turns a Phase 2 section on. */
const FLAG_FOR: Partial<Record<AccountNavKey, keyof FeatureFlags>> = {
  messages: "chat",
  savedSearches: "savedSearchAlerts",
  // "ביקורות" (round 3, brief 8.1) is live for everyone; features.reviews now only gates the
  // later extras (the "Top rated" sort and reviews on the owner's profile).
};

/**
 * `host`: the user has a place guests can book, or bookings of their places — only hosts see
 * "הזמנות לנכסים שלי".
 */
export function accountNavItems(features: FeatureFlags = siteConfig.features, options: { host?: boolean } = {}): AccountNavItem[] {
  return ACCOUNT_NAV_KEYS.filter((key) => {
    if (key === "hostBookings") return options.host === true;
    const flag = FLAG_FOR[key];
    return !flag || features[flag];
  })
    .map((key) => ({ key, href: HREFS[key], tab: (ACCOUNT_TAB_KEYS as readonly string[]).includes(key) }))
    // Tabs first (in the brief's order), then the secondary links.
    .sort((a, b) => Number(b.tab) - Number(a.tab));
}

function normalize(pathname: string): string {
  const path = pathname.split(/[?#]/)[0].replace(/\/+$/, "");
  return path || "/";
}

/** The nav item a path belongs to (the longest matching prefix), or null outside /account. */
export function activeAccountNav(pathname: string, items: readonly AccountNavItem[] = accountNavItems()): AccountNavKey | null {
  const path = normalize(pathname);
  let best: AccountNavItem | null = null;
  for (const item of items) {
    const matches = item.href === "/account" ? path === "/account" : path === item.href || path.startsWith(`${item.href}/`);
    if (matches && (!best || item.href.length > best.href.length)) best = item;
  }
  return best?.key ?? null;
}

/** Pages under /account that bring their own full-width chrome (the listing editor). */
export function isFullWidthAccountPage(pathname: string): boolean {
  return /^\/account\/listings\/[^/]+\/edit(\/|$)/.test(normalize(pathname));
}
