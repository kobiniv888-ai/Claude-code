import "server-only";
import { createHash } from "node:crypto";
import dns from "node:dns";
import https from "node:https";
import net from "node:net";
import ical, { type CalendarResponse, type DateWithTimeZone, type VEvent } from "node-ical";
import { isCalendarImportHost } from "@/config/external-hosts";
import { siteConfig } from "@/config/site";
import { absoluteUrl, siteUrl } from "@/lib/site-url";
import { db } from "@/lib/db";
import type { Prisma } from "@/generated/prisma/client";
import { fullRanges, hotelClosedRanges, overbookedRanges, type RoomBlock, type RoomCapacity } from "@/lib/booking/room-availability";

/**
 * Availability calendars in iCalendar format (RFC 5545), to stay in sync with Airbnb,
 * Booking.com and Google Calendar.
 *
 * - Export: GET /api/ical/<Listing.icalToken>(.ics) → buildIcs() — every blocked date range:
 *   bookings made on Bayit as "Reserved", the rest as "Not available" (never a guest's details).
 * - Import: Listing.icalImportUrls (https only) are read by syncIcalImports() every hour
 *   (cron /api/cron/ical-sync) and replace the listing's AvailabilityBlock rows with source ICAL
 *   (sourceRef = "<feed key>:<the event's UID>", note = the feed's host name). Imported nights block
 *   bookings on Bayit like any other block. One scope (a listing's own feeds, or one room type's)
 *   is replaced in one transaction under an advisory lock, so two syncs at once never double it.
 * - A guest's own booking as a calendar file: buildBookingIcs() (GET /api/ical/booking/<code>).
 *
 * Hotels (round 3, founder's answer 3) sync per room type. iCal carries busy dates only, never a
 * number of rooms, so:
 * - each room type has its own export feed (/api/ical/<RoomType.icalToken>): a night is busy when
 *   that type has no free room left (hotelExportRanges / roomTypeExportRanges);
 * - each room type has its own import links (RoomType.icalImportUrls): every imported event takes
 *   ONE room of that type on its nights (AvailabilityBlock roomTypeId + rooms 1);
 * - the hotel's own feed exports only the nights the whole hotel is full or closed, and its own
 *   import links close the whole hotel (a block without a room type).
 *
 * Feed downloads are guarded against SSRF (SECURITY_REPORT 8.1): https on port 443 only, no
 * credentials in the URL, only the calendar sites of CALENDAR_IMPORT_DOMAINS (Airbnb, Booking.com,
 * Vrbo / HomeAway, Google Calendar: src/config/external-hosts.ts), every DNS answer must be a
 * public address (checked again at connect time, so DNS rebinding cannot reach internal hosts), at
 * most 3 redirects (each hop re-checked against all of the above), 10 s in all and 1 MB, counted
 * while the file streams in (a wrong or missing Content-Length changes nothing).
 */

const DAY_MS = 24 * 3600 * 1000;
/** Georgia is UTC+4 all year; times in feeds are mapped to Georgian calendar days. */
const GEORGIA_OFFSET_MS = 4 * 3600 * 1000;

export const ICAL_MAX_FEEDS = 5;
/** The whole download (every redirect hop included) must finish within this. */
export const FEED_TIMEOUT_MS = 10_000;
/** 1 MB (founder's answer Q16): a year of a busy calendar is far below 100 KB. */
export const FEED_MAX_BYTES = 1024 * 1024;
const FEED_MAX_REDIRECTS = 3;
const MAX_EVENTS = 2000;
/** Events (VEVENTs) a feed may hold at all; 1 MB of real Airbnb/Google events is far below this. */
const MAX_FEED_EVENTS = 5000;
/** CPU time one feed may take to parse and expand (a real feed takes well under 100 ms). */
export const PARSE_BUDGET_MS = 1500;
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

const dayOfDate = (date: Date) => date.toISOString().slice(0, 10);

/**
 * A hotel's own export (round 3): the nights on which no active room type has a free room, or the
 * whole hotel is closed. With no bookable room types, every block (the listing booked as a whole).
 */
export function hotelExportBlocks(listingId: string, rooms: readonly RoomCapacity[], blocks: readonly RoomBlock[], from: Date, to: Date): IcsBlock[] {
  return hotelClosedRanges(rooms, blocks, dayOfDate(from), dayOfDate(to)).map((range) => ({
    id: `hotel-${listingId}-${range.start}`,
    startDate: new Date(`${range.start}T00:00:00Z`),
    endDate: new Date(`${range.end}T00:00:00Z`),
  }));
}

/** One room type's export (round 3): the nights on which it has no free room left. */
export function roomTypeExportBlocks(room: RoomCapacity, blocks: readonly RoomBlock[], from: Date, to: Date): IcsBlock[] {
  return fullRanges(room, blocks, dayOfDate(from), dayOfDate(to)).map((range) => ({
    id: `room-${room.id}-${range.start}`,
    startDate: new Date(`${range.start}T00:00:00Z`),
    endDate: new Date(`${range.end}T00:00:00Z`),
  }));
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
  /** The feed gave the event no UID (ours is a hash of its start and summary, so two feeds can share it). */
  generatedUid?: true;
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

/** Recurrence steps shorter than a day: never used by rental calendars, and costly to expand. */
const SUB_DAILY_FREQS = new Set(["SECONDLY", "MINUTELY", "HOURLY"]);

/** Thrown when a feed asks for more work than we allow (classified as "too_large", like an oversized file). */
function tooMuchWork(what: string): Error {
  return new Error(`Calendar file is larger than we can read (${what})`);
}

/**
 * Expands one recurring event inside [from, to]. node-ical checks an all-day event's EXDATEs by
 * walking every EXDATE value for every instance (instances x EXDATEs: one daily event with 30,000
 * EXDATEs blocked the server for 13 s). Its EXDATE object is keyed by the same day keys it compares
 * (getDateKey), so for all-day events we drop the excluded days from the rule's dates ourselves
 * with one Set lookup each, and hand node-ical the event without EXDATEs. A RECURRENCE-ID override
 * of an excluded day is still added by node-ical, exactly as before. Timed events keep node-ical's
 * own check, which is already one lookup per instance.
 */
function expandRecurring(event: VEvent, from: Date, to: Date, limit: number) {
  const isFullDay = event.datetype === "date" || Boolean(event.start.dateOnly);
  const exdate = event.exdate as Record<string, unknown> | undefined;
  if (!isFullDay || !exdate || Object.keys(exdate).length === 0) {
    return ical.expandRecurringEvent(event, { from, to, expandOngoing: true }).slice(0, limit);
  }
  const excluded = new Set(Object.keys(exdate).filter((key) => exdate[key] instanceof Date));
  const rule = event.rrule!;
  const localDay = (date: Date) => `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
  const filteredRule = {
    between: (after: Date, before: Date, inclusive?: boolean) => rule.between(after, before, inclusive).filter((date) => !excluded.has(localDay(date))),
  };
  const withoutExdates = { ...event, exdate: undefined, rrule: filteredRule } as unknown as VEvent;
  return ical.expandRecurringEvent(withoutExdates, { from, to, expandOngoing: true }).slice(0, limit);
}

/**
 * Busy ranges from an iCalendar text. Cancelled and "free" (TRANSP:TRANSPARENT) events are
 * skipped, recurring events are expanded, and only ranges overlapping [today − 30 days,
 * today + 2 years] are returned (at most 2000).
 *
 * The work is bounded, not only the output (SECURITY_REPORT 7.m / 8.1.d): a 1 MB feed must not
 * hold the server for seconds. A feed with more than MAX_FEED_EVENTS events is refused; rules that
 * repeat more often than daily are skipped; reading stops once 2000 ranges are found; an event
 * whose rule cannot be expanded is skipped (the rest of the feed still counts); and the whole parse
 * stops with "too_large" after PARSE_BUDGET_MS. A refused feed keeps its earlier blocks (syncListing).
 */
export function parseIcsText(text: string, now: Date = new Date(), budgetMs: number = PARSE_BUDGET_MS): ParsedIcsEvent[] {
  const startedAt = performance.now();
  let data: CalendarResponse;
  try {
    data = ical.sync.parseICS(text);
  } catch (error) {
    throw new Error(`Invalid iCalendar data: ${(error as Error).message}`);
  }
  const components = Object.values(data).filter(
    (component): component is VEvent => Boolean(component) && typeof component === "object" && (component as { type?: string }).type === "VEVENT",
  );
  if (components.length > MAX_FEED_EVENTS) throw tooMuchWork(`${components.length} events`);
  const from = new Date(now.getTime() - PAST_DAYS * DAY_MS);
  const to = new Date(now.getTime() + FUTURE_DAYS * DAY_MS);
  const fromDay = dayString(from);
  const toDay = dayString(to);

  const events: ParsedIcsEvent[] = [];
  const push = (uid: string, start: string, end: string, summary: string | null, generatedUid: boolean) => {
    if (events.length >= MAX_EVENTS) return;
    const safeEnd = end > start ? end : nextDay(start);
    if (safeEnd <= fromDay || start >= toDay) return;
    events.push({ uid: uid.slice(0, 255), start, end: safeEnd, summary: summary?.slice(0, 200) ?? null, ...(generatedUid ? { generatedUid: true as const } : {}) });
  };

  for (const event of components) {
    if (events.length >= MAX_EVENTS) break;
    if (performance.now() - startedAt > budgetMs) throw tooMuchWork("took too long");
    if (event.status === "CANCELLED" || event.transparency === "TRANSPARENT" || !event.start) continue;
    const isFullDay = event.datetype === "date" || Boolean(event.start.dateOnly);
    const summary = textValue(event.summary);
    const generatedUid = !event.uid;
    const uid = event.uid || createHash("sha1").update(`${event.start.toISOString()}|${summary ?? ""}`).digest("hex");

    if (event.rrule) {
      if (SUB_DAILY_FREQS.has(String(event.rrule.options?.freq ?? "").toUpperCase())) continue;
      let instances: ReturnType<typeof ical.expandRecurringEvent>;
      try {
        instances = expandRecurring(event, from, to, MAX_EVENTS - events.length);
      } catch {
        // A rule rrule-temporal cannot expand (its own iteration cap): skip this event only.
        continue;
      }
      for (const instance of instances) {
        const start = dayOf(instance.start, instance.isFullDay);
        const end = instance.end ? endDayOf(instance.end, instance.isFullDay) : nextDay(start);
        push(`${uid}#${start}`, start, end, summary, generatedUid);
      }
      continue;
    }
    const start = dayOf(event.start, isFullDay);
    const end = event.end ? endDayOf(event.end, isFullDay) : nextDay(start);
    push(uid, start, end, summary, generatedUid);
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
    // IPv4-compatible (deprecated; "::7f00:1", "::10.0.0.1"), so "::" and "::1" too.
    ["::", 96],
    // IPv4-translated (RFC 2765: "::ffff:0:7f00:1").
    ["::ffff:0:0:0", 96],
    ["64:ff9b::", 96],
    // Local-use NAT64 (RFC 8215), which embeds any IPv4 address.
    ["64:ff9b:1::", 48],
    ["100::", 64],
    // Teredo and 6to4 tunnels embed an IPv4 address (6to4: "2002:7f00:1::" is 127.0.0.1).
    ["2001::", 32],
    ["2002::", 16],
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
  // IPv4-mapped IPv6 ("::ffff:10.0.0.1", "::ffff:a00:1"): judged by the IPv4 address inside.
  // IPv4-compatible, -translated, NAT64, 6to4 and Teredo ranges are refused whole (block list).
  const mapped = /^::ffff:(\d{1,3}(?:\.\d{1,3}){3})$/.exec(lower);
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

/** A well-formed https link, but not on a calendar site we import from (CALENDAR_IMPORT_DOMAINS). */
export class CalendarHostNotAllowedError extends UnsafeFeedUrlError {
  constructor() {
    super("not a supported calendar site");
    this.name = "CalendarHostNotAllowedError";
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
  // Only the calendar sites we know (also for every redirect hop: fetchIcsFeed calls this again).
  if (net.isIP(host) || !isCalendarImportHost(host)) throw new CalendarHostNotAllowedError();
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
          reject(new Error("Calendar file is larger than 1 MB"));
          return;
        }
        const chunks: Buffer[] = [];
        let size = 0;
        response.on("data", (chunk: Buffer) => {
          size += chunk.length;
          if (size > FEED_MAX_BYTES) {
            response.destroy(new Error("Calendar file is larger than 1 MB"));
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
export const ICAL_FEED_ERRORS = ["calendar_host", "unsafe_url", "feed_missing", "http_error", "not_calendar", "too_large", "unreachable"] as const;
export type IcalFeedError = (typeof ICAL_FEED_ERRORS)[number];

export function classifyFeedError(error: unknown): IcalFeedError {
  if (error instanceof CalendarHostNotAllowedError) return "calendar_host";
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

/**
 * A short, stable key per import URL. Imported rows carry it in `sourceRef` ("<key>:<UID>"), so
 * the rows of a feed that failed this time are kept by feed, never by host name: a hotel that
 * connects 3 Booking.com calendars to one room type has 3 feeds on the same host.
 */
export function icalFeedKey(url: string): string {
  return createHash("sha1").update(url).digest("hex").slice(0, 12);
}

type ImportedRow = {
  listingId: string;
  startDate: Date;
  endDate: Date;
  source: "ICAL";
  sourceRef: string;
  icalUid: string;
  note: string;
  roomTypeId: string | null;
  rooms: number | null;
};

/**
 * The rows one sync writes: one per event, the same event only once (the same calendar pasted
 * twice in two URL forms, or a booking that two feeds both list). An event without a UID of its
 * own is only de-duplicated within its feed: its UID is a hash of its start and summary, so two
 * rooms closed on the same dates in two feeds must stay two rows (each takes a room).
 */
export function importedRows(
  listingId: string,
  roomType: { id: string } | null,
  feeds: readonly { key: string; label: string; events: readonly ParsedIcsEvent[] | null }[],
): ImportedRow[] {
  const seen = new Set<string>();
  const rows: ImportedRow[] = [];
  for (const feed of feeds) {
    for (const event of feed.events ?? []) {
      const id = `${event.generatedUid ? `${feed.key}:` : ""}${event.uid}|${event.start}|${event.end}`;
      if (seen.has(id)) continue;
      seen.add(id);
      rows.push({
        listingId,
        startDate: new Date(`${event.start}T00:00:00Z`),
        endDate: new Date(`${event.end}T00:00:00Z`),
        source: "ICAL",
        sourceRef: `${feed.key}:${event.uid}`,
        icalUid: event.uid,
        note: feed.label,
        // A room type's event takes one room of that type (iCal has no room counts).
        roomTypeId: roomType?.id ?? null,
        rooms: roomType ? 1 : null,
      });
    }
  }
  return rows;
}

/** Imports of one scope (a listing's own feeds, or one room type's) never run at the same time. */
function lockImportScope(tx: Prisma.TransactionClient, listingId: string, roomTypeId: string | null) {
  return tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${`ical:${listingId}:${roomTypeId ?? "listing"}`}))`;
}

const SYNC_TX = { maxWait: 15_000, timeout: 60_000 } as const;

/**
 * Replaces the imported rows of one scope in one transaction under that scope's lock (the hourly
 * cron, "save" and "sync now" can run at once; without the lock both inserts would survive).
 * The rows of the feeds in `keepFeedKeys` (could not be read this time) are kept.
 */
async function replaceImportedBlocks(
  listingId: string,
  roomTypeId: string | null,
  rows: ImportedRow[],
  keepFeedKeys: readonly string[] = [],
): Promise<void> {
  await db.$transaction(async (tx) => {
    await lockImportScope(tx, listingId, roomTypeId);
    await tx.availabilityBlock.deleteMany({
      where: {
        listingId,
        source: "ICAL",
        roomTypeId,
        ...(keepFeedKeys.length ? { NOT: { OR: keepFeedKeys.map((key) => ({ sourceRef: { startsWith: `${key}:` } })) } } : {}),
      },
    });
    if (rows.length) await tx.availabilityBlock.createMany({ data: rows });
    if (roomTypeId) await tx.roomType.updateMany({ where: { id: roomTypeId, listingId }, data: { icalSyncedAt: new Date() } });
    else await tx.listing.update({ where: { id: listingId }, data: { icalSyncedAt: new Date() } });
  }, SYNC_TX);
}

/** A scope whose import links were all removed: its imported rows go (under the same lock). */
async function clearImportedBlocks(listingId: string, roomTypeId: string | null): Promise<void> {
  await db.$transaction(async (tx) => {
    await lockImportScope(tx, listingId, roomTypeId);
    await tx.availabilityBlock.deleteMany({ where: { listingId, source: "ICAL", roomTypeId } });
  }, SYNC_TX);
}

/**
 * Re-imports one listing's own feeds, or (with `roomType`) one hotel room type's: each event of a
 * room type's feed takes one room of that type; the listing's own feeds close the whole place.
 * The feeds are downloaded first, outside the transaction.
 */
async function syncListing(
  listing: { id: string; icalImportUrls: string[] },
  roomType: { id: string; quantity: number } | null = null,
): Promise<Omit<IcalSyncResult, "listings"> & { report: IcalFeedReport[] }> {
  const urls = [...new Set(listing.icalImportUrls)].slice(0, ICAL_MAX_FEEDS);
  const results = await Promise.all(
    urls.map(async (url) => {
      const base = { url, key: icalFeedKey(url), label: feedLabel(url) };
      try {
        return { ...base, events: await parseIcsFeed(url), error: null };
      } catch (error) {
        console.warn(`[ical] feed of listing ${listing.id} failed (${base.label}):`, (error as Error).message);
        return { ...base, events: null, error: classifyFeedError(error) };
      }
    }),
  );
  // Blocks of feeds that could not be read this time are kept until the next successful sync.
  const failedKeys = results.filter((r) => r.events === null).map((r) => r.key);
  const rows = importedRows(listing.id, roomType, results);
  await replaceImportedBlocks(listing.id, roomType?.id ?? null, rows, failedKeys);
  return {
    feeds: urls.length,
    failedFeeds: failedKeys.length,
    blocks: rows.length,
    conflicts: roomType ? await countRoomConflicts(listing.id, roomType) : await countConflicts(listing.id, rows),
    report: results.map((r) => ({ url: r.url, label: r.label, events: r.events?.length ?? 0, error: r.error })),
  };
}

/**
 * Confirmed bookings of a room type on nights where more rooms are now taken than it has (an
 * imported booking from another site on a night Bayit had already sold out). Logged, never changed.
 */
async function countRoomConflicts(listingId: string, roomType: { id: string; quantity: number }): Promise<number> {
  const from = new Date(Date.now() - DAY_MS);
  const to = new Date(Date.now() + FUTURE_DAYS * DAY_MS);
  const rows = await db.availabilityBlock.findMany({
    where: { listingId, endDate: { gt: from }, startDate: { lt: to }, OR: [{ roomTypeId: null }, { roomTypeId: roomType.id }] },
    select: { startDate: true, endDate: true, roomTypeId: true, rooms: true, booking: { select: { code: true, status: true } } },
    take: 5000,
  });
  const blocks = rows.map((b) => ({ start: dayString(b.startDate), end: dayString(b.endDate), roomTypeId: b.roomTypeId, rooms: b.rooms }));
  const over = overbookedRanges(roomType, blocks, dayString(from), dayString(to));
  if (over.length === 0) return 0;
  const clashing = rows.filter(
    (b) => b.booking?.status === "CONFIRMED" && over.some((r) => r.start < dayString(b.endDate) && dayString(b.startDate) < r.end),
  );
  if (clashing.length) {
    console.warn(`[ical] room type ${roomType.id}: more rooms taken than offered, bookings ${clashing.map((b) => b.booking?.code).join(", ")}`);
  }
  return clashing.length;
}

/**
 * "Sync now" on the host's calendar page: re-imports one listing's feeds and reports each feed
 * (events read, or why it failed) and the confirmed bookings that imported nights now overlap.
 */
export async function syncListingCalendars(
  listingId: string,
  roomTypeId?: string | null,
): Promise<{ syncedAt: Date; feeds: IcalFeedReport[]; conflicts: number }> {
  if (roomTypeId) {
    // One hotel room type's own import links (round 3).
    const room = await db.roomType.findFirst({ where: { id: roomTypeId, listingId }, select: { id: true, quantity: true, icalImportUrls: true } });
    if (!room || room.icalImportUrls.length === 0) {
      if (room) await replaceImportedBlocks(listingId, room.id, []);
      else await clearImportedBlocks(listingId, roomTypeId);
      return { syncedAt: new Date(), feeds: [], conflicts: 0 };
    }
    const result = await syncListing({ id: listingId, icalImportUrls: room.icalImportUrls }, room);
    return { syncedAt: new Date(), feeds: result.report, conflicts: result.conflicts };
  }
  const listing = await db.listing.findUnique({ where: { id: listingId }, select: { id: true, icalImportUrls: true } });
  if (!listing || listing.icalImportUrls.length === 0) {
    await clearImportedBlocks(listingId, null);
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
  // Hotels: every room type with its own import links (round 3), least recently synced first.
  const rooms = await db.roomType.findMany({
    where: { icalImportUrls: { isEmpty: false }, listing: listingId ? { id: listingId } : { status: { not: "DELETED" } } },
    select: { id: true, listingId: true, quantity: true, icalImportUrls: true },
    orderBy: { icalSyncedAt: { sort: "asc", nulls: "first" } },
    take: SYNC_BATCH,
  });
  const total: IcalSyncResult = { listings: 0, feeds: 0, failedFeeds: 0, blocks: 0, conflicts: 0 };
  const queue: { id: string; icalImportUrls: string[]; room: { id: string; quantity: number } | null }[] = [
    ...listings.map((l) => ({ ...l, room: null })),
    ...rooms.map((r) => ({ id: r.listingId, icalImportUrls: r.icalImportUrls, room: { id: r.id, quantity: r.quantity } })),
  ];
  const worker = async () => {
    for (let next = queue.shift(); next; next = queue.shift()) {
      try {
        if (next.icalImportUrls.length === 0) {
          await clearImportedBlocks(next.id, next.room?.id ?? null);
          continue;
        }
        const result = await syncListing(next, next.room);
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
