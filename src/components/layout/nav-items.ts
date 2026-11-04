import {
  CalendarRange,
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

export type NavKey = "shortStay" | "monthly" | "buy" | "hotels" | "map" | "jewishLife" | "about" | "help";

export type NavItem = { key: NavKey; href: string; icon: LucideIcon };

/**
 * Every main destination. The four deal tabs carry the same names as the home page's search tabs
 * (round 3, section 3: "לטווח קצר, חודשי, קנייה, מלונות"; nav-messages.test.ts keeps them equal).
 */
export const NAV_ITEMS: readonly NavItem[] = [
  { key: "shortStay", href: "/search?deal=short-stay", icon: CalendarRange },
  { key: "monthly", href: "/search?deal=monthly", icon: KeyRound },
  { key: "buy", href: "/search?deal=buy", icon: HandCoins },
  { key: "hotels", href: "/search?deal=hotels", icon: Hotel },
  { key: "map", href: "/search?view=map", icon: Map },
  { key: "jewishLife", href: "/jewish-life", icon: Sunset },
  { key: "about", href: "/about", icon: Info },
  { key: "help", href: "/help", icon: LifeBuoy },
];

/** The deal tabs, in the home page's order (the phone menu's "Find a place" rows start with them). */
export const DEAL_NAV_KEYS = ["shortStay", "monthly", "buy", "hotels"] as const satisfies readonly NavKey[];

/**
 * The desktop tab row. "About" is left out: eight tabs did not fit one row at 1024 px in Georgian
 * (measured: 972 px of tabs in a 960 px row). About stays in the phone menu and the footer (round 3).
 */
export const DESKTOP_TAB_ITEMS: readonly NavItem[] = NAV_ITEMS.filter((item) => item.key !== "about");

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

/** The search page's ?deal= value for each deal tab. */
const DEAL_TABS: Readonly<Record<string, NavKey>> = {
  "short-stay": "shortStay",
  monthly: "monthly",
  buy: "buy",
  hotels: "hotels",
};

/**
 * The main tab for a page (pathname without the locale), or null.
 * Search pages are matched by their filters: ?view=map → Map, ?deal=short-stay → Short stay,
 * ?deal=monthly → Monthly, ?deal=buy → Buy, ?deal=hotels → Hotels. ?deal=rent (short stays and
 * monthly together, from old links and /rent) has no tab of its own. The shortcut pages /buy and
 * /hotels match too.
 */
export function activeNavKey(pathname: string, search: URLSearchParams | string = ""): NavKey | null {
  const path = normalizePath(pathname);
  const params = typeof search === "string" ? new URLSearchParams(search) : search;

  if (under(path, "/search")) {
    if (params.get("view") === "map") return "map";
    const deal = params.get("deal");
    return deal && Object.hasOwn(DEAL_TABS, deal) ? DEAL_TABS[deal] : null;
  }
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
