import { can, type Permission } from "@/lib/auth/permissions";

/**
 * Admin panel navigation (pure, client-safe). Each section is shown only to roles that have
 * its permission (see docs/CONVENTIONS.md "Roles and permissions"); every page checks the
 * permission again with requireStaff(<permission>). Labels: admin.nav.<key>.
 */

export const ADMIN_COUNT_KEYS = [
  "inReview",
  "openReports",
  /** Open turned-away reports (round 3, brief 8.2): the reports badge turns urgent. */
  "urgentReports",
  /** Open flags: host cancellations, no-shows and hosts with several reports (Admin → Flags). */
  "openFlags",
  "activeTickets",
  "urgentTickets",
  "pendingVerifications",
] as const;
export type AdminCountKey = (typeof ADMIN_COUNT_KEYS)[number];
export type AdminCounts = Record<AdminCountKey, number>;

export const ADMIN_NAV_GROUPS = ["operations", "content", "system"] as const;
export type AdminNavGroup = (typeof ADMIN_NAV_GROUPS)[number];

export type AdminNavKey =
  | "overview"
  | "moderation"
  | "reports"
  | "flags"
  | "bookings"
  | "users"
  | "verifications"
  | "badges"
  | "referencePrices"
  | "tickets"
  | "content"
  | "settings"
  | "roles"
  | "audit"
  | "outbox"
  | "maintenance";

export type AdminContentKey =
  | "home"
  | "featured"
  | "cities"
  | "places"
  | "articles"
  | "faq"
  | "translations"
  | "alerts"
  | "bannedWords";

export type AdminNavItem = {
  key: AdminNavKey;
  href: string;
  /** null = every staff member (the overview). */
  permission: Permission | null;
  group: AdminNavGroup;
  /** Number shown as a badge next to the label. */
  countKey?: AdminCountKey;
  children?: { key: AdminContentKey; href: string }[];
};

export const ADMIN_NAV: readonly AdminNavItem[] = [
  { key: "overview", href: "/admin", permission: null, group: "operations" },
  { key: "moderation", href: "/admin/moderation", permission: "moderation", group: "operations", countKey: "inReview" },
  // Turned-away, listing and review reports (round 3, brief 8.2); urgent while a turned-away one is open.
  { key: "reports", href: "/admin/reports", permission: "reports.view", group: "operations", countKey: "openReports" },
  // Host cancellations within 48 hours, no-shows and hosts with several reports (src/lib/admin/flags.ts).
  { key: "flags", href: "/admin/flags", permission: "moderation", group: "operations", countKey: "openFlags" },
  // Search and booking details (src/lib/admin/server/bookings.ts).
  { key: "bookings", href: "/admin/bookings", permission: "moderation", group: "operations" },
  { key: "users", href: "/admin/users", permission: "users.view", group: "operations" },
  {
    key: "verifications",
    href: "/admin/verifications",
    permission: "verifications",
    group: "operations",
    countKey: "pendingVerifications",
  },
  // "ביקרנו במקום" (round 3, brief 8.3).
  { key: "badges", href: "/admin/badges", permission: "moderation", group: "operations" },
  // Price ranges from public reports for the hosts' price guide (round 3, brief 5 and 9).
  { key: "referencePrices", href: "/admin/reference-prices", permission: "moderation", group: "operations" },
  { key: "tickets", href: "/admin/tickets", permission: "tickets", group: "operations", countKey: "activeTickets" },
  {
    key: "content",
    href: "/admin/content",
    permission: "content",
    group: "content",
    children: [
      { key: "home", href: "/admin/content/home" },
      { key: "featured", href: "/admin/content/featured" },
      { key: "cities", href: "/admin/content/cities" },
      { key: "places", href: "/admin/content/places" },
      { key: "articles", href: "/admin/content/articles" },
      { key: "faq", href: "/admin/content/faq" },
      { key: "translations", href: "/admin/content/translations" },
      { key: "alerts", href: "/admin/content/alerts" },
      { key: "bannedWords", href: "/admin/content/banned-words" },
    ],
  },
  { key: "settings", href: "/admin/settings", permission: "settings", group: "system" },
  { key: "roles", href: "/admin/roles", permission: "roles", group: "system" },
  { key: "audit", href: "/admin/audit", permission: "audit", group: "system" },
  { key: "outbox", href: "/admin/outbox", permission: "settings", group: "system" },
  // Full backup and the data clean-ups (ADMIN only; src/lib/admin/maintenance).
  { key: "maintenance", href: "/admin/maintenance", permission: "settings", group: "system" },
];

/** The sections a role may open, in menu order. */
export function adminNavFor(role: string | null | undefined): AdminNavItem[] {
  return ADMIN_NAV.filter((item) => item.permission === null || can(role, item.permission));
}

/** Sections grouped for the sidebar (empty groups are left out). */
export function groupAdminNav(items: readonly AdminNavItem[]): { group: AdminNavGroup; items: AdminNavItem[] }[] {
  return ADMIN_NAV_GROUPS.map((group) => ({ group, items: items.filter((i) => i.group === group) })).filter(
    (g) => g.items.length > 0,
  );
}

/** Is `href` the current section? "/admin" matches only itself; others match their sub-pages too. */
export function isAdminNavActive(pathname: string, href: string): boolean {
  const path = pathname.replace(/\/+$/, "") || "/";
  if (href === "/admin") return path === "/admin";
  return path === href || path.startsWith(`${href}/`);
}

/** The badge for a section: its count (0 = no badge) and whether it is urgent. */
export function navBadge(item: AdminNavItem, counts: AdminCounts | null): { count: number; urgent: boolean } {
  if (!item.countKey || !counts) return { count: 0, urgent: false };
  const count = counts[item.countKey] ?? 0;
  const urgent = item.key === "tickets" ? counts.urgentTickets > 0 : item.key === "reports" ? (counts.urgentReports ?? 0) > 0 : false;
  return { count, urgent };
}
