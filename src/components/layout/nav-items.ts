import {
  CircleUserRound,
  HandCoins,
  Heart,
  Hotel,
  House,
  Info,
  KeyRound,
  LifeBuoy,
  Map,
  Plus,
  Search,
  Sunset,
  type LucideIcon,
} from "lucide-react";

/**
 * Site navigation: the main tabs, the mobile bottom bar and which item is active.
 * Pure — the matching rules are unit-tested in nav-items.test.ts.
 */

export type NavKey = "rent" | "buy" | "hotels" | "map" | "jewishLife" | "about" | "help";

export type NavItem = { key: NavKey; href: string; icon: LucideIcon };

export const NAV_ITEMS: readonly NavItem[] = [
  { key: "rent", href: "/search?deal=rent", icon: KeyRound },
  { key: "buy", href: "/search?deal=buy", icon: HandCoins },
  { key: "hotels", href: "/search?deal=hotels", icon: Hotel },
  { key: "map", href: "/search?view=map", icon: Map },
  { key: "jewishLife", href: "/jewish-life", icon: Sunset },
  { key: "about", href: "/about", icon: Info },
  { key: "help", href: "/help", icon: LifeBuoy },
];

export type BottomNavKey = "home" | "search" | "post" | "saved" | "profile";

export type BottomNavItem = { key: BottomNavKey; href: string; icon: LucideIcon };

export const BOTTOM_NAV_ITEMS: readonly BottomNavItem[] = [
  { key: "home", href: "/", icon: House },
  { key: "search", href: "/search", icon: Search },
  { key: "post", href: "/post", icon: Plus },
  { key: "saved", href: "/account/favorites", icon: Heart },
  { key: "profile", href: "/account", icon: CircleUserRound },
];

/** "/search/" → "/search", "" → "/". */
export function normalizePath(pathname: string): string {
  const path = pathname.split(/[?#]/)[0] || "/";
  const trimmed = path.length > 1 ? path.replace(/\/+$/, "") : path;
  return trimmed.startsWith("/") ? trimmed : `/${trimmed}`;
}

function under(pathname: string, base: string): boolean {
  return pathname === base || pathname.startsWith(`${base}/`);
}

const RENT_DEALS = new Set(["rent", "short-stay", "monthly"]);

/**
 * The main tab for a page (pathname without the locale), or null.
 * Search pages are matched by their filters: ?view=map → Map, ?deal=rent|short-stay|monthly → Rent,
 * ?deal=buy → Buy, ?deal=hotels → Hotels. The shortcut pages /rent, /buy and /hotels match too.
 */
export function activeNavKey(pathname: string, search: URLSearchParams | string = ""): NavKey | null {
  const path = normalizePath(pathname);
  const params = typeof search === "string" ? new URLSearchParams(search) : search;

  if (under(path, "/search")) {
    if (params.get("view") === "map") return "map";
    const deal = params.get("deal");
    if (deal && RENT_DEALS.has(deal)) return "rent";
    if (deal === "buy") return "buy";
    if (deal === "hotels") return "hotels";
    return null;
  }
  if (under(path, "/rent")) return "rent";
  if (under(path, "/buy")) return "buy";
  if (under(path, "/hotels")) return "hotels";
  if (under(path, "/map")) return "map";
  if (under(path, "/jewish-life")) return "jewishLife";
  if (under(path, "/about") || under(path, "/how-it-works")) return "about";
  if (under(path, "/help")) return "help";
  return null;
}

const ACCOUNT_PAGES = ["/account", "/login", "/verify-phone", "/two-factor"];

/** The bottom-bar item for a page (pathname without the locale), or null. */
export function activeBottomNavKey(pathname: string): BottomNavKey | null {
  const path = normalizePath(pathname);
  if (path === "/") return "home";
  if (under(path, "/search") || under(path, "/rent") || under(path, "/buy") || under(path, "/hotels")) return "search";
  if (under(path, "/post")) return "post";
  if (under(path, "/account/favorites") || under(path, "/account/compare")) return "saved";
  if (ACCOUNT_PAGES.some((base) => under(path, base))) return "profile";
  return null;
}

/** The bottom bar is not shown in the admin panel (it has its own navigation). */
export function isBottomNavHidden(pathname: string): boolean {
  return under(normalizePath(pathname), "/admin");
}

/** The same page in another language keeps its path and query: ("/search", "deal=buy") → "/search?deal=buy". */
export function pathWithQuery(pathname: string, search: URLSearchParams | string = ""): string {
  const query = (typeof search === "string" ? search : search.toString()).replace(/^\?/, "");
  const path = normalizePath(pathname);
  return query ? `${path}?${query}` : path;
}

/**
 * Where the bottom bar's sliding pill sits: the column of the active tab (0–4, in reading order),
 * hidden on the Post tab (it has its own raised button) and on pages without a tab.
 */
export function bottomNavIndicator(active: BottomNavKey | null): { index: number; visible: boolean } {
  const index = active ? BOTTOM_NAV_ITEMS.findIndex((item) => item.key === active) : -1;
  return { index: Math.max(index, 0), visible: index >= 0 && active !== "post" };
}
