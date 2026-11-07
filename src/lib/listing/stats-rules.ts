/**
 * Who counts in a listing's stats, and the anonymous daily visitor ID (round 3, brief 6.2).
 * Pure (no server imports), so every rule is unit-tested; src/lib/listing/stats.ts applies them.
 *
 * - Each visitor counts ONCE per day per listing (and per contact method for contact taps).
 * - Never counted: the listing's host, any staff account, bots (user agent) and prefetch /
 *   prerender requests, demo listings, and listings that are not LIVE.
 * - The visitor is identified by an anonymous ID that changes every day and is different for
 *   every listing, event and contact method (so two keys never show the same visitor):
 *     pepper    = 32 random bytes made for the day (src/lib/listing/stats.ts, deleted with the
 *                 day's keys: nobody can recompute an ID afterwards, not even with HASH_SALT)
 *     scope     = event + "\n" + listingId (+ "\n" + contact method)
 *     visitorId = HMAC-SHA256(pepper, scope + "\n" + ip + "\n" + userAgent)
 *   The IP, the user agent and user ids are never stored: only a short slice of the ID, inside a
 *   RateLimit key that expires when the Georgian day ends (the daily clean-up deletes it).
 *   A signed-in visitor (saves, contact taps) is hashed the same way from the account id.
 */
import { createHmac } from "node:crypto";
import { addDays, startOfTbilisiDay } from "@/lib/booking/dates";

/** What a counted event is. */
export type StatsEvent = "view" | "save" | "contact";

/** RateLimit keys of the daily dedupe all start with this. */
export const STATS_KEY_PREFIX = "stats:";

/**
 * Robots and scripts. Views count only from a request the page's own script makes after it shows
 * (link-preview fetchers never run it), so this list must not catch people: no bare "bot" (CUBOT
 * phones), no messenger names (Telegram's Android in-app browser, the Slack desktop app).
 */
const BOT_USER_AGENT =
  /\bbot\b|bot\/\d|bot;|telegrambot|twitterbot|discordbot|slackbot|whatsapp\/|crawl|spider|slurp|facebookexternalhit|headless|lighthouse|pingdom|curl\/|wget\/|python-requests|python-urllib|aiohttp|java\/|go-http|axios\/|node-fetch|undici|okhttp|apache-httpclient|scrapy|phantomjs|puppeteer|playwright|selenium|webdriver|bingpreview|semrush|ahrefs|mj12|dataprovider/i;

/** A missing user agent counts as a bot. */
export function isBotUserAgent(userAgent: string | null | undefined): boolean {
  return !userAgent?.trim() || BOT_USER_AGENT.test(userAgent);
}

/**
 * A browser prefetch or prerender asks for the page before (or without) the visitor opening it:
 * Chrome sends "Sec-Purpose: prefetch" (and "prefetch;prerender"), older browsers "Purpose:
 * prefetch", "X-Purpose: preview" or "X-Moz: prefetch". Those requests never count.
 */
export function isPrefetchRequest(header: (name: string) => string | null | undefined): boolean {
  for (const name of ["sec-purpose", "purpose", "x-purpose", "x-moz"]) {
    const value = header(name)?.toLowerCase() ?? "";
    if (/prefetch|prerender|preview/.test(value)) return true;
  }
  return false;
}

/** What a visitor ID is for: one event of one listing (and one contact method). */
export function statsScope(event: StatsEvent, listingId: string, channel?: string): string {
  return `${event}\n${listingId}${channel ? `\n${channel}` : ""}`;
}

/** The daily-rotating visitor ID (hex) for one `scope` (statsScope). `daySecret`: the day's pepper. */
export function dailyVisitorId(daySecret: string, scope: string, ip: string | null | undefined, userAgent: string | null | undefined): string {
  return createHmac("sha256", daySecret).update(`${scope}\n${ip?.trim() || "unknown"}\n${userAgent?.trim() ?? ""}`, "utf8").digest("hex");
}

/** The same ID for a signed-in visitor (saves and contact taps need an account). */
export function dailyAccountVisitorId(daySecret: string, scope: string, userId: string): string {
  return createHmac("sha256", daySecret).update(`${scope}\naccount\n${userId}`, "utf8").digest("hex");
}

/** The RateLimit keys that hold a day's random pepper start with this (the key carries the pepper). */
export function statsPepperPrefix(day: string): string {
  return `${STATS_KEY_PREFIX.replace(/:$/, "")}-pepper:${day}:`;
}

/**
 * The RateLimit key that says "this visitor was already counted today": the day, the event,
 * the listing (and the contact method) and 32 hex characters of the visitor ID.
 */
export function statsDedupeKey(event: StatsEvent, day: string, listingId: string, visitorId: string, channel?: string): string {
  return `${STATS_KEY_PREFIX}${event}:${day}:${listingId}${channel ? `:${channel}` : ""}:${visitorId.slice(0, 32)}`;
}

/** The key is needed until the Georgian day ends (an hour of margin for slow requests). */
export function statsDedupeExpiry(day: string): Date {
  return new Date(startOfTbilisiDay(addDays(day, 1)).getTime() + 3600 * 1000);
}

export type StatsViewer = {
  /** The signed-in account, when there is one. */
  userId?: string | null;
  /** Any staff role (ADMIN, MODERATOR, SUPPORT, EDITOR). */
  isStaff?: boolean;
  /** This device was signed in to the listing's host or to a staff account (DeviceLink). */
  deviceOfHostOrStaff?: boolean;
};

export type StatsListing = { status: string; isDemo: boolean; ownerId: string };

export type SkipReason = "not_live" | "demo" | "host" | "staff" | "bot" | "prefetch";

/**
 * Whether an event may count, before the once-a-day check. `request` is left out for events
 * that are not tied to a page request (none today; views always pass it).
 */
export function skipReason(
  listing: StatsListing,
  viewer: StatsViewer,
  request?: { userAgent: string | null | undefined; prefetch: boolean },
): SkipReason | null {
  if (listing.status !== "LIVE") return "not_live";
  if (listing.isDemo) return "demo";
  if (viewer.userId && viewer.userId === listing.ownerId) return "host";
  if (viewer.isStaff) return "staff";
  if (viewer.deviceOfHostOrStaff) return "host";
  if (request) {
    if (request.prefetch) return "prefetch";
    if (isBotUserAgent(request.userAgent)) return "bot";
  }
  return null;
}

// ─── One network's share of a listing's views (views-1) ──────────

/**
 * New visitors one network may add to one listing's views in a day. The daily visitor ID comes
 * from the IP and the browser, so a script that changes its user agent on every call would
 * otherwise count again and again; an IPv6 user can also rotate through the 2^64 addresses of
 * their /64. 20 leaves room for a hotel's Wi-Fi or a mobile carrier's shared address.
 */
export const VIEWS_PER_NETWORK_PER_DAY = 20;

function expandIpv6(address: string): string[] | null {
  const [head, tail, ...rest] = address.split("::");
  if (rest.length) return null;
  const parse = (part: string | undefined) => (part ? part.split(":") : []);
  const left = parse(head);
  const right = parse(tail);
  // An IPv4 tail ("::ffff:1.2.3.4") takes two hextets.
  const last = right.length ? right[right.length - 1] : left[left.length - 1];
  const v4 = last && /^\d{1,3}(\.\d{1,3}){3}$/.test(last) ? last : null;
  if (v4) (right.length ? right : left).pop();
  const size = left.length + right.length + (v4 ? 2 : 0);
  if (tail === undefined ? size !== 8 : size > 7) return null;
  const middle = Array(8 - size).fill("0");
  const groups = [...left, ...(tail === undefined ? [] : middle), ...right];
  if (v4) {
    const [a, b, c, d] = v4.split(".").map(Number);
    groups.push(((a << 8) | b).toString(16), ((c << 8) | d).toString(16));
  }
  if (groups.length !== 8 || groups.some((g) => !/^[0-9a-f]{1,4}$/i.test(g))) return null;
  return groups.map((g) => g.toLowerCase().replace(/^0+(?=.)/, ""));
}

/**
 * The network an address belongs to, for the per-network cap: an IPv4 address as it is (an
 * IPv4-mapped IPv6 address too), the /64 of an IPv6 address (its first 4 groups). Anything else
 * comes back trimmed, as it is.
 */
export function ipNetwork(ip: string | null | undefined): string {
  const value = ip?.trim().toLowerCase() ?? "";
  if (!value) return "unknown";
  if (/^\d{1,3}(\.\d{1,3}){3}$/.test(value)) return value;
  if (!value.includes(":")) return value;
  const groups = expandIpv6(value.replace(/^\[|\]$/g, "").replace(/%.*$/, ""));
  if (!groups) return value;
  // ::ffff:a.b.c.d is an IPv4 address.
  if (groups.slice(0, 5).every((g) => g === "0") && groups[5] === "ffff") {
    const hi = parseInt(groups[6], 16);
    const lo = parseInt(groups[7], 16);
    return `${hi >> 8}.${hi & 255}.${lo >> 8}.${lo & 255}`;
  }
  return `${groups.slice(0, 4).join(":")}::/64`;
}

/** The day's anonymous ID of a network (like the visitor ID: the network itself is never stored). */
export function dailyNetworkId(daySecret: string, ip: string | null | undefined): string {
  return createHmac("sha256", daySecret).update(`network\n${ipNetwork(ip)}`, "utf8").digest("hex");
}

/** The RateLimit key that counts one network's new visitors of one listing today. */
export function statsNetworkKey(day: string, listingId: string, networkId: string): string {
  return `${STATS_KEY_PREFIX}view-net:${day}:${listingId}:${networkId.slice(0, 32)}`;
}
