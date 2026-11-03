import "server-only";
import { createHash } from "node:crypto";
import dns from "node:dns";
import https from "node:https";
import net from "node:net";
import ical, { type CalendarResponse, type DateWithTimeZone, type VEvent } from "node-ical";
import { siteConfig } from "@/config/site";
import { absoluteUrl, siteUrl } from "@/lib/site-url";
import { db } from "@/lib/db";

/**
 * Availability calendars in iCalendar format (RFC 5545), to stay in sync with Airbnb,
 * Booking.com and Google Calendar.
 *
 * - Export: GET /api/ical/<Listing.icalToken>(.ics) → buildIcs() — every blocked date range:
 *   bookings made on Bayit as "Reserved", the rest as "Not available" (never a guest's details).
 * - Import: Listing.icalImportUrls (https only) are read by syncIcalImports() every hour
 *   (cron /api/cron/ical-sync) and replace the listing's AvailabilityBlock rows with source ICAL
 *   (sourceRef = the event's UID). Imported nights block bookings on Bayit like any other block.
 * - A guest's own booking as a calendar file: buildBookingIcs() (GET /api/ical/booking/<code>).
 *
 * Feed downloads are guarded against SSRF: https on port 443 only, no credentials in the URL,
 * every DNS answer must be a public address (checked again at connect time, so DNS rebinding
 * cannot reach internal hosts), at most 3 redirects (each re-checked), 10 s, 2 MB.
 */

const DAY_MS = 24 * 3600 * 1000;
/** Georgia is UTC+4 all year; times in feeds are mapped to Georgian calendar days. */
const GEORGIA_OFFSET_MS = 4 * 3600 * 1000;

export const ICAL_MAX_FEEDS = 5;
const FEED_TIMEOUT_MS = 10_000;
const FEED_MAX_BYTES = 2 * 1024 * 1024;
const FEED_MAX_REDIRECTS = 3;
const MAX_EVENTS = 2000;
/** Imported/exported range: from 30 days ago to 2 years ahead. */
const PAST_DAYS = 30;
const FUTURE_DAYS = 730;

// ─── Export ───────────────────────────────────────────────────

export type IcsBlock = { id: string; startDate: Date; endDate: Date; source?: "OWNER" | "ICAL" | "BOOKING" };

function siteHost(): string {
  try {
    return new URL(siteUrl()).hostname || "bayit.example";
  } catch {
    return "bayit.example";
  }
}

/**
 * Absolute export URL the owner pastes into Airbnb / Booking.com, on the permanent address
 * (SITE_URL). Show it with <CopyLinkField>, which refuses to copy a temporary address.
 */
export function icalExportUrl(icalToken: string): string {
  return absoluteUrl(`/api/ical/${encodeURIComponent(icalToken)}.ics`);
}

/** TEXT value escaping (RFC 5545 §3.3.11). */
export function escapeIcsText(value: string): string {
  return value.replace(/\\/g, "\\\\").replace(/;/g, "\\;").replace(/,/g, "\\,").replace(/\r?\n/g, "\\n");
}

/** Folds a content line at 75 octets (UTF-8 aware, never inside a character): CRLF + space. */
export function foldIcsLine(line: string): string {
  const parts: string[] = [];
  let current = "";
  let bytes = 0;
  for (const ch of line) {
    const size = Buffer.byteLength(ch, "utf8");
    const limit = parts.length === 0 ? 75 : 74; // continuation lines start with a space
    if (bytes + size > limit) {
      parts.push(current);
      current = "";
      bytes = 0;
    }
    current += ch;
    bytes += size;
  }
  parts.push(current);
  return parts.join("\r\n ");
}

function icsDate(date: Date): string {
  return date.toISOString().slice(0, 10).replace(/-/g, "");
}

function icsTimestamp(date: Date): string {
  return `${date.toISOString().replace(/[-:]/g, "").slice(0, 15)}Z`;
}

/**
 * The calendar of one listing: an all-day VEVENT per blocked range (DTEND exclusive, as stored).
 * It carries no personal data — only "Reserved" (a booking on Bayit) or "Not available", and the dates.
 */
export function buildIcs(listing: { id: string; publicId: number }, blocks: IcsBlock[], now: Date = new Date()): string {
  const host = siteHost();
  const stamp = icsTimestamp(now);
  const lines = [
    "BEGIN:VCALENDAR",
    "VERSION:2.0",
    `PRODID:-//${escapeIcsText(siteConfig.name)}//Availability ${listing.publicId}//EN`,
    "CALSCALE:GREGORIAN",
    "METHOD:PUBLISH",
    `X-WR-CALNAME:${escapeIcsText(`${siteConfig.name} #${listing.publicId}`)}`,
  ];
  for (const block of blocks) {
    if (!(block.endDate > block.startDate)) continue;
    lines.push(
      "BEGIN:VEVENT",
      `UID:${escapeIcsText(`${block.id}@${host}`)}`,
      `DTSTAMP:${stamp}`,
      `DTSTART;VALUE=DATE:${icsDate(block.startDate)}`,
      `DTEND;VALUE=DATE:${icsDate(block.endDate)}`,
      `SUMMARY:${block.source === "BOOKING" ? "Reserved" : "Not available"}`,
      "TRANSP:OPAQUE",
      "END:VEVENT",
    );
  }
  lines.push("END:VCALENDAR");
  return `${lines.map(foldIcsLine).join("\r\n")}\r\n`;
}

/** A guest's own booking, for "add to calendar" (texts already in the guest's language). */
export type BookingIcsInput = {
  code: string;
  /** "YYYY-MM-DD" — the event spans the stay (all-day, DTEND = check-out day, exclusive). */
  checkIn: string;
  checkOut: string;
  summary: string;
  /** Lines of the description (arrival time, host, phone, amount, link). */
  description: string[];
  location?: string | null;
  lat?: number | null;
  lng?: number | null;
  url?: string | null;
};

/** One VEVENT calendar file for the guest of a confirmed booking (it holds the address: never public). */
export function buildBookingIcs(input: BookingIcsInput, now: Date = new Date()): string {
  const host = siteHost();
  const lines = [
    "BEGIN:VCALENDAR",
    "VERSION:2.0",
    `PRODID:-//${escapeIcsText(siteConfig.name)}//Booking//EN`,
    "CALSCALE:GREGORIAN",
    "METHOD:PUBLISH",
    "BEGIN:VEVENT",
    `UID:${escapeIcsText(`booking-${input.code}@${host}`)}`,
    `DTSTAMP:${icsTimestamp(now)}`,
    `DTSTART;VALUE=DATE:${input.checkIn.replace(/-/g, "")}`,
    `DTEND;VALUE=DATE:${input.checkOut.replace(/-/g, "")}`,
    `SUMMARY:${escapeIcsText(input.summary)}`,
  ];
  const description = input.description.filter(Boolean).join("\n");
  if (description) lines.push(`DESCRIPTION:${escapeIcsText(description)}`);
  if (input.location?.trim()) lines.push(`LOCATION:${escapeIcsText(input.location.trim())}`);
  if (typeof input.lat === "number" && typeof input.lng === "number" && Number.isFinite(input.lat) && Number.isFinite(input.lng)) {
    lines.push(`GEO:${input.lat.toFixed(6)};${input.lng.toFixed(6)}`);
  }
  if (input.url) lines.push(`URL:${input.url}`);
  lines.push("TRANSP:OPAQUE", "END:VEVENT", "END:VCALENDAR");
  return `${lines.map(foldIcsLine).join("\r\n")}\r\n`;
}

// ─── Parse ────────────────────────────────────────────────────

export type ParsedIcsEvent = {
  uid: string;
  /** First blocked day, "YYYY-MM-DD". */
  start: string;
  /** Day after the last blocked day (exclusive), "YYYY-MM-DD". */
  end: string;
  summary: string | null;
};

function dayString(date: Date): string {
  return date.toISOString().slice(0, 10);
}

/** Calendar day of a parsed date: date-only values keep their date; times become Georgian days. */
function dayOf(date: DateWithTimeZone, isFullDay: boolean): string {
  if (isFullDay || date.dateOnly) {
    // node-ical builds DATE values in the server's local time zone.
    return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
  }
  return dayString(new Date(date.getTime() + GEORGIA_OFFSET_MS));
}

function nextDay(day: string): string {
  return dayString(new Date(Date.parse(`${day}T00:00:00Z`) + DAY_MS));
}

/** Exclusive end day: a timed end at 00:00 ends that day; any later time blocks that day too. */
function endDayOf(end: DateWithTimeZone, isFullDay: boolean): string {
  if (isFullDay || end.dateOnly) return dayOf(end, true);
  const shifted = new Date(end.getTime() + GEORGIA_OFFSET_MS);
  const day = dayString(shifted);
  return shifted.getUTCHours() || shifted.getUTCMinutes() || shifted.getUTCSeconds() ? nextDay(day) : day;
}

function textValue(value: unknown): string | null {
  if (typeof value === "string") return value;
  if (value && typeof value === "object" && "val" in value && typeof (value as { val: unknown }).val === "string") {
    return (value as { val: string }).val;
  }
  return null;
}

/**
 * Busy ranges from an iCalendar text. Cancelled and "free" (TRANSP:TRANSPARENT) events are
 * skipped, recurring events are expanded, and only ranges overlapping [today − 30 days,
 * today + 2 years] are returned (at most 2000).
 */
export function parseIcsText(text: string, now: Date = new Date()): ParsedIcsEvent[] {
  let data: CalendarResponse;
  try {
    data = ical.sync.parseICS(text);
  } catch (error) {
    throw new Error(`Invalid iCalendar data: ${(error as Error).message}`);
  }
  const from = new Date(now.getTime() - PAST_DAYS * DAY_MS);
  const to = new Date(now.getTime() + FUTURE_DAYS * DAY_MS);
  const fromDay = dayString(from);
  const toDay = dayString(to);

  const events: ParsedIcsEvent[] = [];
  const push = (uid: string, start: string, end: string, summary: string | null) => {
    if (events.length >= MAX_EVENTS) return;
    const safeEnd = end > start ? end : nextDay(start);
    if (safeEnd <= fromDay || start >= toDay) return;
    events.push({ uid: uid.slice(0, 255), start, end: safeEnd, summary: summary?.slice(0, 200) ?? null });
  };

  for (const component of Object.values(data)) {
    if (!component || typeof component !== "object" || (component as { type?: string }).type !== "VEVENT") continue;
    const event = component as VEvent;
    if (event.status === "CANCELLED" || event.transparency === "TRANSPARENT" || !event.start) continue;
    const isFullDay = event.datetype === "date" || Boolean(event.start.dateOnly);
    const summary = textValue(event.summary);
    const uid = event.uid || createHash("sha1").update(`${event.start.toISOString()}|${summary ?? ""}`).digest("hex");

    if (event.rrule) {
      const instances = ical.expandRecurringEvent(event, { from, to, expandOngoing: true });
      for (const instance of instances.slice(0, MAX_EVENTS)) {
        const start = dayOf(instance.start, instance.isFullDay);
        const end = instance.end ? endDayOf(instance.end, instance.isFullDay) : nextDay(start);
        push(`${uid}#${start}`, start, end, summary);
      }
      continue;
    }
    const start = dayOf(event.start, isFullDay);
    const end = event.end ? endDayOf(event.end, isFullDay) : nextDay(start);
    push(uid, start, end, summary);
  }
  return events.sort((a, b) => a.start.localeCompare(b.start));
}

// ─── Safe download ────────────────────────────────────────────

const blockList = (() => {
  const list = new net.BlockList();
  for (const [address, prefix] of [
    ["0.0.0.0", 8],
    ["10.0.0.0", 8],
    ["100.64.0.0", 10],
    ["127.0.0.0", 8],
    ["169.254.0.0", 16],
    ["172.16.0.0", 12],
    ["192.0.0.0", 24],
    ["192.0.2.0", 24],
    ["192.88.99.0", 24],
    ["192.168.0.0", 16],
    ["198.18.0.0", 15],
    ["198.51.100.0", 24],
    ["203.0.113.0", 24],
    ["224.0.0.0", 4],
    ["240.0.0.0", 4],
  ] as const) {
    list.addSubnet(address, prefix, "ipv4");
  }
  for (const [address, prefix] of [
    ["::", 128],
    ["::1", 128],
    ["64:ff9b::", 96],
    ["100::", 64],
    ["2001:db8::", 32],
    ["fc00::", 7],
    ["fe80::", 10],
    ["fec0::", 10],
    ["ff00::", 8],
  ] as const) {
    list.addSubnet(address, prefix, "ipv6");
  }
  return list;
})();

/** True for loopback, private, link-local, CGNAT, multicast, documentation and other non-public IPs. */
export function isPrivateAddress(address: string): boolean {
  const family = net.isIP(address);
  if (family === 0) return true;
  if (family === 4) return blockList.check(address, "ipv4");
  const lower = address.toLowerCase();
  // IPv4-mapped / -compatible IPv6 ("::ffff:10.0.0.1", "::ffff:a00:1").
  const mapped = /^::(?:ffff:)?(\d{1,3}(?:\.\d{1,3}){3})$/.exec(lower);
  if (mapped) return blockList.check(mapped[1], "ipv4");
  const mappedHex = /^::ffff:([0-9a-f]{1,4}):([0-9a-f]{1,4})$/.exec(lower);
  if (mappedHex) {
    const hi = parseInt(mappedHex[1], 16);
    const lo = parseInt(mappedHex[2], 16);
    return blockList.check(`${hi >> 8}.${hi & 255}.${lo >> 8}.${lo & 255}`, "ipv4");
  }
  return blockList.check(address, "ipv6");
}

export class UnsafeFeedUrlError extends Error {
  constructor(reason: string) {
    super(`Calendar URL refused: ${reason}`);
    this.name = "UnsafeFeedUrlError";
  }
}

/** Static checks of an import URL (the DNS answer is checked when connecting). */
export function assertSafeFeedUrl(value: string): URL {
  let url: URL;
  try {
    url = new URL(value);
  } catch {
    throw new UnsafeFeedUrlError("not a URL");
  }
  if (url.protocol !== "https:") throw new UnsafeFeedUrlError("https only");
  if (url.username || url.password) throw new UnsafeFeedUrlError("credentials in URL");
  if (url.port && url.port !== "443") throw new UnsafeFeedUrlError("port not allowed");
  const host = url.hostname.replace(/^\[|\]$/g, "");
  if (!host || host === "localhost" || host.endsWith(".localhost") || host.endsWith(".local") || host.endsWith(".internal")) {
    throw new UnsafeFeedUrlError("local host name");
  }
  if (net.isIP(host) && isPrivateAddress(host)) throw new UnsafeFeedUrlError("private address");
  return url;
}

/** dns.lookup that refuses non-public answers — used by the HTTPS agent at connect time. */
export const safeLookup: net.LookupFunction = (hostname, options, callback) => {
  dns.lookup(hostname, { ...options, all: true }, (error, addresses) => {
    if (error) return callback(error, "", 0);
    const list = addresses as dns.LookupAddress[];
    if (list.length === 0 || list.some((a) => isPrivateAddress(a.address))) {
      const refused = Object.assign(new Error(`Refusing to connect to a non-public address for ${hostname}`), { code: "EADDRNOTAVAIL" });
      return callback(refused, "", 0);
    }
    if ((options as dns.LookupOptions).all) return (callback as unknown as (e: null, a: dns.LookupAddress[]) => void)(null, list);
    callback(null, list[0].address, list[0].family);
  });
};

const feedAgent = new https.Agent({ lookup: safeLookup, keepAlive: false, maxSockets: 8 });

type FeedResponse = { status: number; location: string | null; body: string | null };

function requestOnce(url: URL, signal: AbortSignal): Promise<FeedResponse> {
  return new Promise((resolve, reject) => {
    const request = https.get(
      url,
      {
        agent: feedAgent,
        signal,
        headers: {
          Accept: "text/calendar, text/plain;q=0.9, */*;q=0.1",
          "User-Agent": `${siteConfig.name}-calendar-sync/1.0 (+${siteUrl()})`,
        },
      },
      (response) => {
        const status = response.statusCode ?? 0;
        if (status >= 300 && status < 400) {
          response.resume();
          resolve({ status, location: response.headers.location ?? null, body: null });
          return;
        }
        if (status !== 200) {
          response.resume();
          resolve({ status, location: null, body: null });
          return;
        }
        const declared = Number(response.headers["content-length"]);
        if (Number.isFinite(declared) && declared > FEED_MAX_BYTES) {
          response.destroy();
          reject(new Error("Calendar file is larger than 2 MB"));
          return;
        }
        const chunks: Buffer[] = [];
        let size = 0;
        response.on("data", (chunk: Buffer) => {
          size += chunk.length;
          if (size > FEED_MAX_BYTES) {
            response.destroy(new Error("Calendar file is larger than 2 MB"));
            return;
          }
          chunks.push(chunk);
        });
        response.on("end", () => resolve({ status, location: null, body: Buffer.concat(chunks).toString("utf8") }));
        response.on("error", reject);
      },
    );
    request.on("error", reject);
  });
}

/** Downloads an iCal feed with the SSRF guards above. */
export async function fetchIcsFeed(rawUrl: string): Promise<string> {
  const signal = AbortSignal.timeout(FEED_TIMEOUT_MS);
  let url = assertSafeFeedUrl(rawUrl);
  for (let redirects = 0; ; redirects++) {
    const response = await requestOnce(url, signal);
    if (response.location !== null) {
      if (redirects >= FEED_MAX_REDIRECTS) throw new Error("Too many redirects");
      url = assertSafeFeedUrl(new URL(response.location, url).toString());
      continue;
    }
    if (response.status !== 200 || response.body === null) throw new Error(`HTTP ${response.status}`);
    const body = response.body.replace(/^\ufeff/, "");
    if (!/^\s*BEGIN:VCALENDAR/i.test(body)) throw new Error("Not an iCalendar file");
    return body;
  }
}

/** Downloads and parses an import feed (see fetchIcsFeed and parseIcsText). */
export async function parseIcsFeed(url: string): Promise<ParsedIcsEvent[]> {
  return parseIcsText(await fetchIcsFeed(url));
}

// ─── Import sync ──────────────────────────────────────────────

const SYNC_BATCH = 200;
const SYNC_CONCURRENCY = 4;

function feedLabel(url: string): string {
  try {
    return new URL(url).hostname.replace(/^www\./, "").slice(0, 100);
  } catch {
    return "ical";
  }
}

/** `conflicts`: confirmed Bayit bookings that an imported calendar now also blocks (logged for the host to sort out). */
export type IcalSyncResult = { listings: number; feeds: number; failedFeeds: number; blocks: number; conflicts: number };

/** Why an import feed could not be read (shown to the host on the calendar page). */
export const ICAL_FEED_ERRORS = ["unsafe_url", "feed_missing", "http_error", "not_calendar", "too_large", "unreachable"] as const;
export type IcalFeedError = (typeof ICAL_FEED_ERRORS)[number];

export function classifyFeedError(error: unknown): IcalFeedError {
  if (error instanceof UnsafeFeedUrlError) return "unsafe_url";
  const message = error instanceof Error ? error.message : String(error);
  if (/^HTTP (404|410)\b/.test(message)) return "feed_missing";
  if (/^HTTP \d+/.test(message) || /redirects/i.test(message)) return "http_error";
  if (/iCalendar/i.test(message)) return "not_calendar";
  if (/larger than/i.test(message)) return "too_large";
  return "unreachable";
}

/** One import feed after a sync: how many events it gave, or why it failed. */
export type IcalFeedReport = { url: string; label: string; events: number; error: IcalFeedError | null };

async function syncListing(
  listing: { id: string; icalImportUrls: string[] },
): Promise<Omit<IcalSyncResult, "listings"> & { report: IcalFeedReport[] }> {
  const urls = [...new Set(listing.icalImportUrls)].slice(0, ICAL_MAX_FEEDS);
  const results = await Promise.all(
    urls.map(async (url) => {
      try {
        return { url, label: feedLabel(url), events: await parseIcsFeed(url), error: null };
      } catch (error) {
        console.warn(`[ical] feed of listing ${listing.id} failed (${feedLabel(url)}):`, (error as Error).message);
        return { url, label: feedLabel(url), events: null, error: classifyFeedError(error) };
      }
    }),
  );
  const failedLabels = results.filter((r) => r.events === null).map((r) => r.label);
  const rows = results.flatMap((r) =>
    (r.events ?? []).map((event) => ({
      listingId: listing.id,
      startDate: new Date(`${event.start}T00:00:00Z`),
      endDate: new Date(`${event.end}T00:00:00Z`),
      source: "ICAL" as const,
      sourceRef: event.uid,
      icalUid: event.uid,
      note: r.label,
    })),
  );

  await db.$transaction([
    // Blocks of feeds that could not be read this time are kept until the next successful sync.
    db.availabilityBlock.deleteMany({
      where: { listingId: listing.id, source: "ICAL", ...(failedLabels.length ? { NOT: { note: { in: failedLabels } } } : {}) },
    }),
    db.availabilityBlock.createMany({ data: rows }),
    db.listing.update({ where: { id: listing.id }, data: { icalSyncedAt: new Date() } }),
  ]);
  return {
    feeds: urls.length,
    failedFeeds: failedLabels.length,
    blocks: rows.length,
    conflicts: await countConflicts(listing.id, rows),
    report: results.map((r) => ({ url: r.url, label: r.label, events: r.events?.length ?? 0, error: r.error })),
  };
}

/**
 * "Sync now" on the host's calendar page: re-imports one listing's feeds and reports each feed
 * (events read, or why it failed) and the confirmed bookings that imported nights now overlap.
 */
export async function syncListingCalendars(
  listingId: string,
): Promise<{ syncedAt: Date; feeds: IcalFeedReport[]; conflicts: number }> {
  const listing = await db.listing.findUnique({ where: { id: listingId }, select: { id: true, icalImportUrls: true } });
  if (!listing || listing.icalImportUrls.length === 0) {
    await db.availabilityBlock.deleteMany({ where: { listingId, source: "ICAL" } });
    return { syncedAt: new Date(), feeds: [], conflicts: 0 };
  }
  const result = await syncListing(listing);
  return { syncedAt: new Date(), feeds: result.report, conflicts: result.conflicts };
}

/**
 * Confirmed Bayit bookings overlapping imported nights (a double booking made elsewhere, or a
 * calendar that re-exports our own booking). Bookings are never changed here; they are logged.
 */
async function countConflicts(listingId: string, rows: { startDate: Date; endDate: Date }[]): Promise<number> {
  if (rows.length === 0) return 0;
  const bookings = await db.booking.findMany({
    where: { listingId, status: "CONFIRMED", checkOut: { gt: new Date() } },
    select: { code: true, checkIn: true, checkOut: true },
    take: 200,
  });
  const clashing = bookings.filter((b) => rows.some((r) => r.startDate < b.checkOut && b.checkIn < r.endDate));
  if (clashing.length) {
    console.warn(`[ical] listing ${listingId}: imported dates overlap bookings ${clashing.map((b) => b.code).join(", ")}`);
  }
  return clashing.length;
}

/**
 * Re-imports the iCal feeds of one listing, or (cron, hourly) of up to 200 listings with import URLs,
 * least recently synced first. Each successful feed replaces that listing's ICAL blocks.
 */
export async function syncIcalImports(listingId?: string): Promise<IcalSyncResult> {
  const listings = await db.listing.findMany({
    where: listingId ? { id: listingId } : { status: { not: "DELETED" }, icalImportUrls: { isEmpty: false } },
    select: { id: true, icalImportUrls: true },
    orderBy: { icalSyncedAt: { sort: "asc", nulls: "first" } },
    take: listingId ? 1 : SYNC_BATCH,
  });
  const total: IcalSyncResult = { listings: 0, feeds: 0, failedFeeds: 0, blocks: 0, conflicts: 0 };
  const queue = [...listings];
  const worker = async () => {
    for (let next = queue.shift(); next; next = queue.shift()) {
      try {
        if (next.icalImportUrls.length === 0) {
          await db.availabilityBlock.deleteMany({ where: { listingId: next.id, source: "ICAL" } });
          continue;
        }
        const result = await syncListing(next);
        total.listings++;
        total.feeds += result.feeds;
        total.failedFeeds += result.failedFeeds;
        total.blocks += result.blocks;
        total.conflicts += result.conflicts;
      } catch (error) {
        console.error(`[ical] sync of listing ${next.id} failed:`, error);
      }
    }
  };
  await Promise.all(Array.from({ length: SYNC_CONCURRENCY }, worker));
  return total;
}
