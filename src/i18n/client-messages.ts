import type { AbstractIntlMessages } from "next-intl";

/**
 * Which interface text the browser receives.
 *
 * A <NextIntlClientProvider> serializes its messages into the page twice over (HTML and the RSC
 * payload). All namespaces together are ~300 KB of Hebrew text; a public page's client components
 * read a small part of it. So the browser gets, per route:
 *
 * - SHELL_MESSAGES from the root layout: what the header, menus, bottom bar, cookie banner, login
 *   dialog, toasts and error boundaries read (every page has them).
 * - SITE_MESSAGES from the (site) layout: the listing card, the badges and the search bar's place
 *   field, which most public pages show (the home page needs nothing else).
 * - ROUTE_MESSAGES[segment] from that segment's layout (src/app/[locale]/(site)/<segment>/layout.tsx
 *   renders <RouteMessages route="<segment>">), merged on top in the browser by <MergeMessages>.
 *
 * `/admin`, `/account`, `/post` and `/dev` mount <NextIntlClientProvider> without `messages`,
 * which inherits the full set. Server components read the full set from i18n/request.ts and are
 * not affected.
 *
 * An entry is a namespace ("search") or a part of one ("search.bar"). When a client component on
 * a public page starts reading another namespace (or a part not listed), add it to the right list:
 * `npm test` checks every route against the `useTranslations(...)` calls of the client modules it
 * imports (src/i18n/client-messages.test.ts) and names what is missing.
 */

/** Root layout: the shell of every page. */
export const SHELL_MESSAGES = [
  "auth.codes",
  "auth.country",
  "auth.devHints",
  "auth.email",
  "auth.errors",
  "auth.login",
  "auth.menu",
  "auth.name",
  "auth.phone",
  "auth.twoFactor",
  "auth.welcome",
  "common",
  "cookies",
  "ds",
  "errors",
  "nav",
  "states",
] as const;

/** (site) layout: listing cards and the search bar's place field, on most public pages. */
export const SITE_MESSAGES = ["listingCard", "listingFields.facts", "search.bar", "search.dates"] as const;

/** Extra per route segment under (site) (those not listed need nothing beyond the two sets above). */
export const ROUTE_MESSAGES = {
  contact: [
    "contactPage.form",
    "tickets.category",
    "tickets.errors",
    "tickets.fieldErrors",
    "tickets.loadError",
    "tickets.shabbat",
  ],
  help: [
    "help",
    "tickets.category",
    "tickets.errors",
    "tickets.fieldErrors",
    "tickets.form",
    "tickets.loadError",
    "tickets.screenshots",
    "tickets.shabbat",
  ],
  "jewish-life": ["jewishLife.calendar", "jewishLife.error", "jewishLife.places", "maps"],
  listing: [
    "booking.guests",
    "booking.price",
    "booking.sheet",
    "contact",
    "listing.booking",
    "listing.calendar",
    "listing.description",
    "listing.gallery",
    "listing.map",
    "listing.share",
    "listing.translation",
    "map.community",
    "maps",
    "report",
  ],
  // The booking review page (/listing/<id>/book), on top of "listing": a nested segment.
  "listing/[id]/book": ["auth.verifyPhone", "booking"],
  owner: ["report"],
  search: [
    "listingFields",
    "map",
    "maps",
    "search.chips",
    "search.error",
    "search.filters",
    "search.fixes",
    "search.guests",
    "search.map",
    "search.results",
    "search.sheet",
    "search.sort",
    "search.toolbar",
    "search.top",
  ],
  "two-factor": ["auth.setup"],
  "verify-phone": ["auth.verifyPhone"],
} as const satisfies Record<string, readonly string[]>;

export type MessageRoute = keyof typeof ROUTE_MESSAGES;

type Messages = AbstractIntlMessages;

function isObject(value: unknown): value is Messages {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

/** Deep merge (b wins): `{ auth: { login } }` + `{ auth: { setup } }` → `{ auth: { login, setup } }`. */
export function mergeMessages(a: Messages, b: Messages): Messages {
  const out: Messages = { ...a };
  for (const [key, value] of Object.entries(b)) {
    const prev = out[key];
    out[key] = isObject(prev) && isObject(value) ? mergeMessages(prev, value) : value;
  }
  return out;
}

/** The parts of `messages` named by dotted paths ("search.bar", "common"), nested as in the source. */
export function pickMessages(messages: Messages, paths: readonly string[]): Messages {
  let out: Messages = {};
  for (const path of paths) {
    const keys = path.split(".");
    let value: unknown = messages;
    for (const key of keys) value = isObject(value) ? value[key] : undefined;
    if (value === undefined) continue;
    const branch = keys.reduceRight<unknown>((child, key) => ({ [key]: child }), value) as Messages;
    out = mergeMessages(out, branch);
  }
  return out;
}

/** `paths` minus those already covered by `covered` (an entry covers itself and everything under it). */
export function withoutCovered(paths: readonly string[], covered: readonly string[]): string[] {
  return paths.filter((path) => !covered.some((c) => path === c || path.startsWith(`${c}.`)));
}
