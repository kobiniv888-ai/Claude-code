/**
 * Who counts in a listing's stats, and the anonymous daily visitor ID (round 3, brief 6.2).
 * Pure (no server imports), so every rule is unit-tested; src/lib/listing/stats.ts applies them.
 *
 * - Each visitor counts ONCE per day per listing (and per contact method for contact taps).
 * - Never counted: the listing's host, any staff account, bots (user agent) and prefetch /
 *   prerender requests, demo listings, and listings that are not LIVE.
 * - The visitor is identified by an anonymous ID that changes every day:
 *     daySecret = HMAC-SHA256(HASH_SALT, "stats-visitor-day:" + day)
 *     visitorId = HMAC-SHA256(daySecret, ip + "\n" + userAgent)
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

const BOT_USER_AGENT =
  /bot|crawl|spider|slurp|preview|facebookexternalhit|whatsapp|telegram|viber|skype|discord|slack|headless|lighthouse|pingdom|monitor|curl|wget|python|java\/|go-http|axios|node-fetch|okhttp|httpclient|scrapy|phantomjs|puppeteer|playwright|selenium|bingpreview|semrush|ahrefs|mj12|dataprovider/i;

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

/** The daily-rotating visitor ID (hex). `daySecret` comes from HASH_SALT and the day. */
export function dailyVisitorId(daySecret: string, ip: string | null | undefined, userAgent: string | null | undefined): string {
  return createHmac("sha256", daySecret).update(`${ip?.trim() || "unknown"}\n${userAgent?.trim() ?? ""}`, "utf8").digest("hex");
}

/** The same ID for a signed-in visitor (saves and contact taps need an account). */
export function dailyAccountVisitorId(daySecret: string, userId: string): string {
  return createHmac("sha256", daySecret).update(`account\n${userId}`, "utf8").digest("hex");
}

/** The text HASH_SALT is mixed with to make a day's secret (the HMAC itself is in src/lib/crypto). */
export function daySecretInput(day: string): string {
  return `stats-visitor-day:${day}`;
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
