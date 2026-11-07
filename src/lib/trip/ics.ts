/**
 * "הוספה ליומן" for one booking (round 3, brief 7.1; pure, client-safe): the calendar file the
 * guest downloads (GET /api/ical/booking/<code>) and the Google Calendar link next to it.
 *
 * The event spans the stay. With a check-in and a check-out time it is a timed event from the
 * check-in time on the check-in day to the check-out time on the check-out day, Georgia time
 * (Asia/Tbilisi, UTC+4 all year), written in UTC ("…Z") so every calendar app shows the right
 * moment in the phone's own time zone. When the host chose "גמיש" (flexible) or gave no check-out
 * time, it is an all-day event that shows the check-in day through the check-out day (the guest is
 * there on the check-out morning too); an all-day DTEND is exclusive, so it is check-out + 1.
 *
 * RFC 5545: CRLF line endings, lines folded at 75 octets (never inside a UTF-8 character), TEXT
 * values escaped (backslash, semicolon, comma, newline). The file holds the exact address and the
 * host's phone: it is served only to the signed-in guest of a confirmed booking, never cached.
 */
import { addDays, checkInMoment, cleanTime } from "@/lib/booking/dates";

/** The zone of every stay on Bayit today (src/config/countries.ts); Google shows the event in it. */
export const TRIP_TIME_ZONE = "Asia/Tbilisi";

export type TripCalendarInput = {
  /** "BT-7K3Q9" */
  code: string;
  /** "YYYY-MM-DD" */
  checkIn: string;
  checkOut: string;
  /** "HH:MM" Georgia time, or null when flexible / unknown (then the event is all-day). */
  checkInTime: string | null;
  checkOutTime: string | null;
  /** Already in the guest's language: "Sunny flat in Vake · BT-7K3Q9". */
  summary: string;
  /** Lines of the description (booking number, arrival, host, phone, amount, link). */
  description: string[];
  /** The exact address (only the guest of the booking gets this file). */
  location?: string | null;
  lat?: number | null;
  lng?: number | null;
  /** The trip page (absolute, on SITE_URL). */
  url?: string | null;
};

export type TripEventTimes =
  | { allDay: true; start: string; end: string }
  | { allDay: false; start: Date; end: Date };

/** When the event starts and ends (see the module comment). */
export function tripEventTimes(input: Pick<TripCalendarInput, "checkIn" | "checkOut" | "checkInTime" | "checkOutTime">): TripEventTimes {
  const inTime = cleanTime(input.checkInTime);
  const outTime = cleanTime(input.checkOutTime);
  if (inTime && outTime) {
    const start = checkInMoment(input.checkIn, inTime);
    const end = checkInMoment(input.checkOut, outTime);
    if (end.getTime() > start.getTime()) return { allDay: false, start, end };
  }
  return { allDay: true, start: input.checkIn, end: addDays(input.checkOut, 1) };
}

/** TEXT value escaping (RFC 5545 §3.3.11): backslash, semicolon, comma, newline. */
export function escapeIcsText(value: string): string {
  return value
    .replace(/\\/g, "\\\\")
    .replace(/;/g, "\\;")
    .replace(/,/g, "\\,")
    .replace(/\r\n|\r|\n/g, "\\n");
}

const encoder = new TextEncoder();

/** Folds one content line at 75 octets (UTF-8 aware, never inside a character): CRLF + space. */
export function foldIcsLine(line: string): string {
  const parts: string[] = [];
  let current = "";
  let bytes = 0;
  for (const ch of line) {
    const size = encoder.encode(ch).length;
    const limit = parts.length === 0 ? 75 : 74; // a continuation line starts with one space
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

/** "20261113T100000Z" */
export function icsUtc(date: Date): string {
  return `${date.toISOString().replace(/[-:]/g, "").slice(0, 15)}Z`;
}

/** "2026-11-13" → "20261113" */
export function icsDay(day: string): string {
  return day.replace(/-/g, "");
}

/** No control characters (other than the line breaks escapeIcsText handles) in a TEXT value. */
function clean(value: string): string {
  return value.replace(/[\u0000-\u0009\u000b\u000c\u000e-\u001f\u007f]/g, "").trim();
}

/** A URI value (no escaping in iCalendar): only http(s), and no line breaks. */
function safeUri(value: string | null | undefined): string | null {
  if (!value) return null;
  try {
    const url = new URL(value);
    return url.protocol === "https:" || url.protocol === "http:" ? url.href : null;
  } catch {
    return null;
  }
}

/** The .ics file of one booking (one VEVENT). `host` names the UID's domain ("bayit.example"). */
export function buildTripIcs(input: TripCalendarInput, options: { host: string; productName: string; now?: Date }): string {
  const times = tripEventTimes(input);
  const now = options.now ?? new Date();
  const lines = [
    "BEGIN:VCALENDAR",
    "VERSION:2.0",
    `PRODID:-//${escapeIcsText(clean(options.productName))}//Booking//EN`,
    "CALSCALE:GREGORIAN",
    "METHOD:PUBLISH",
    "BEGIN:VEVENT",
    `UID:${escapeIcsText(`booking-${clean(input.code)}@${clean(options.host)}`)}`,
    `DTSTAMP:${icsUtc(now)}`,
    ...(times.allDay
      ? [`DTSTART;VALUE=DATE:${icsDay(times.start)}`, `DTEND;VALUE=DATE:${icsDay(times.end)}`]
      : [`DTSTART:${icsUtc(times.start)}`, `DTEND:${icsUtc(times.end)}`]),
    `SUMMARY:${escapeIcsText(clean(input.summary))}`,
  ];
  const description = input.description.map(clean).filter(Boolean).join("\n");
  if (description) lines.push(`DESCRIPTION:${escapeIcsText(description)}`);
  const location = input.location ? clean(input.location) : "";
  if (location) lines.push(`LOCATION:${escapeIcsText(location)}`);
  if (typeof input.lat === "number" && typeof input.lng === "number" && Number.isFinite(input.lat) && Number.isFinite(input.lng)) {
    lines.push(`GEO:${input.lat.toFixed(6)};${input.lng.toFixed(6)}`);
  }
  const url = safeUri(input.url);
  if (url) lines.push(`URL:${url}`);
  lines.push("STATUS:CONFIRMED", "TRANSP:OPAQUE", "END:VEVENT", "END:VCALENDAR");
  return `${lines.map(foldIcsLine).join("\r\n")}\r\n`;
}

/** Google Calendar's "dates" value: "20261113T100000Z/20261115T070000Z" or "20261113/20261116". */
export function googleCalendarDates(times: TripEventTimes): string {
  return times.allDay ? `${icsDay(times.start)}/${icsDay(times.end)}` : `${icsUtc(times.start)}/${icsUtc(times.end)}`;
}

/** Google Calendar keeps the whole link in its address: keep the details short. */
const GOOGLE_DETAILS_MAX = 900;

/**
 * "Add to Google Calendar" (no account link, no API): opens Google Calendar with the event filled
 * in. It carries the title, the dates, the address and short details (the booking number, the
 * times and the trip page) — not the host's phone, which only the downloaded file holds.
 */
export function googleCalendarUrl(input: Omit<TripCalendarInput, "lat" | "lng">): string {
  const details = input.description.map(clean).filter(Boolean).join("\n").slice(0, GOOGLE_DETAILS_MAX);
  const params = new URLSearchParams({
    action: "TEMPLATE",
    text: clean(input.summary),
    dates: googleCalendarDates(tripEventTimes(input)),
    ctz: TRIP_TIME_ZONE,
  });
  if (details) params.set("details", details);
  const location = input.location ? clean(input.location) : "";
  if (location) params.set("location", location);
  return `https://calendar.google.com/calendar/render?${params.toString()}`;
}
