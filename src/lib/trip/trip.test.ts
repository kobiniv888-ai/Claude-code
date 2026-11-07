import fs from "node:fs";
import path from "node:path";
import vm from "node:vm";
import { describe, expect, it } from "vitest";
import { tripContactButtons } from "./contact";
import { cancellationView } from "./deadline";
import { buildTripIcs, escapeIcsText, foldIcsLine, googleCalendarUrl, tripEventTimes, type TripCalendarInput } from "./ics";
import { isMapPoint, tripMapLinks, walkingDirectionsUrl } from "./map-links";
import {
  OFFLINE_PAGE_HEADERS,
  OFFLINE_TRIP_MARKER,
  OFFLINE_TRIPS_CACHE,
  OFFLINE_TRIPS_INDEX,
  TRIP_PAGE_PATTERN,
  hasTripMarker,
  isOfflineEntryExpired,
  isTripPagePath,
  offlineAssetUrls,
  offlineKeepUntil,
  offlinePageHeaders,
  parseOfflineIndex,
  tripCodeOfPath,
  withOfflineEntry,
  type OfflineTripEntry,
} from "./offline";
import {
  describeWindow,
  groupObservances,
  restNights,
  stayHasFridayNight,
  stayIncludesShabbatOrHoliday,
  windowsForStay,
  type TimedEvent,
} from "./observance";

// ─── The Friday-night / holiday rule (brief 7.1) ──────────────

describe("stayIncludesShabbatOrHoliday", () => {
  // November 2026: Thu 12, Fri 13, Sat 14, Sun 15 … Fri 20.
  it("counts a stay with a Friday night", () => {
    expect(stayIncludesShabbatOrHoliday("2026-11-12", "2026-11-14", [])).toBe(true);
    expect(stayIncludesShabbatOrHoliday("2026-11-13", "2026-11-14", [])).toBe(true); // one night: Friday
    expect(restNights("2026-11-12", "2026-11-16", [])).toEqual(["2026-11-13"]);
  });

  it("does not count arriving on Saturday or leaving on Friday morning", () => {
    expect(stayIncludesShabbatOrHoliday("2026-11-14", "2026-11-16", [])).toBe(false); // Sat → Mon
    expect(stayIncludesShabbatOrHoliday("2026-11-15", "2026-11-20", [])).toBe(false); // Sun → Fri morning
    expect(stayHasFridayNight("2026-11-15", "2026-11-20")).toBe(false);
  });

  it("counts the eve of a Yom Tov on the Israeli calendar (Pesach I 2027 is Thursday 22 April)", () => {
    const yomTov = ["2027-04-22", "2027-04-28"]; // Pesach I and VII (Israel: one day each)
    expect(stayIncludesShabbatOrHoliday("2027-04-20", "2027-04-22", yomTov)).toBe(true); // Tue–Wed nights, Wed = Erev Pesach
    expect(stayIncludesShabbatOrHoliday("2027-04-20", "2027-04-22", [])).toBe(false); // the same dates without the holiday
    expect(stayIncludesShabbatOrHoliday("2027-04-26", "2027-04-28", yomTov)).toBe(true); // Tue 27 = Erev Pesach VII
    expect(stayIncludesShabbatOrHoliday("2027-04-25", "2027-04-27", yomTov)).toBe(false); // Chol HaMoed weekdays only
  });

  it("ignores the second diaspora day: only the days passed in count", () => {
    // In the diaspora Pesach II (Fri 23 April 2027) is Yom Tov too; on the Israeli calendar it is not.
    expect(stayIncludesShabbatOrHoliday("2027-04-22", "2027-04-23", ["2027-04-22", "2027-04-28"])).toBe(false);
    expect(stayIncludesShabbatOrHoliday("2027-04-22", "2027-04-23", ["2027-04-23"])).toBe(true);
  });

  it("an empty or reversed stay has no nights", () => {
    expect(stayIncludesShabbatOrHoliday("2026-11-13", "2026-11-13", [])).toBe(false);
    expect(stayIncludesShabbatOrHoliday("2026-11-14", "2026-11-13", [])).toBe(false);
  });
});

const at = (iso: string) => new Date(iso);
/** Tbilisi, Israeli calendar (from @hebcal/core): Rosh Hashana 5787 on Shabbat 12–13 Sep 2026. */
const ROSH_HASHANA: TimedEvent[] = [
  { kind: "candles", date: "2026-09-11", time: at("2026-09-11T14:59:00Z") },
  { kind: "candles", date: "2026-09-12", time: at("2026-09-12T15:57:00Z") },
  { kind: "havdalah", date: "2026-09-13", time: at("2026-09-13T15:56:00Z") },
  { kind: "candles", date: "2026-09-18", time: at("2026-09-18T14:47:00Z") },
  { kind: "havdalah", date: "2026-09-19", time: at("2026-09-19T15:45:00Z") },
];

describe("groupObservances / windowsForStay", () => {
  it("joins Shabbat and the two days of Rosh Hashana into one window with both candle lightings", () => {
    const windows = groupObservances(ROSH_HASHANA);
    expect(windows).toHaveLength(2);
    expect(windows[0]).toMatchObject({ startDate: "2026-09-11", endDate: "2026-09-13" });
    expect(windows[0].candleLighting.map((c) => c.date)).toEqual(["2026-09-11", "2026-09-12"]);
    expect(windows[0].havdalah?.time.toISOString()).toBe("2026-09-13T15:56:00.000Z");
  });

  it("keeps the windows with a night inside the stay", () => {
    const windows = groupObservances(ROSH_HASHANA);
    expect(windowsForStay(windows, "2026-09-10", "2026-09-12").map((w) => w.startDate)).toEqual(["2026-09-11"]); // Fri night
    expect(windowsForStay(windows, "2026-09-12", "2026-09-14").map((w) => w.startDate)).toEqual(["2026-09-11"]); // second night
    expect(windowsForStay(windows, "2026-09-13", "2026-09-18")).toEqual([]); // after Havdalah, out on Friday
    expect(windowsForStay(windows, "2026-09-10", "2026-09-20").map((w) => w.startDate)).toEqual(["2026-09-11", "2026-09-18"]);
  });

  it("agrees with the date rule for every stay around the holiday", () => {
    const windows = groupObservances(ROSH_HASHANA);
    const yomTov = ["2026-09-12", "2026-09-13"];
    const days = ["2026-09-09", "2026-09-10", "2026-09-11", "2026-09-12", "2026-09-13", "2026-09-14", "2026-09-17", "2026-09-18", "2026-09-19"];
    for (const checkIn of days) {
      for (const checkOut of days) {
        if (checkOut <= checkIn) continue;
        expect(windowsForStay(windows, checkIn, checkOut).length > 0, `${checkIn}→${checkOut}`).toBe(stayIncludesShabbatOrHoliday(checkIn, checkOut, yomTov));
      }
    }
  });

  it("skips a Havdalah whose start is before the list and closes an open window", () => {
    const windows = groupObservances([
      { kind: "havdalah", date: "2026-11-07", time: at("2026-11-07T14:30:00Z") },
      { kind: "candles", date: "2026-11-13", time: at("2026-11-13T13:24:00Z") },
    ]);
    expect(windows).toEqual([{ startDate: "2026-11-13", endDate: "2026-11-14", candleLighting: [{ date: "2026-11-13", time: at("2026-11-13T13:24:00Z") }], havdalah: null }]);
  });

  it("names a window: Shabbat and the holidays whose Yom Tov days it holds", () => {
    const [rh, plain] = groupObservances(ROSH_HASHANA);
    const yomTov = [
      { date: "2026-09-12", key: "rosh-hashana" },
      { date: "2026-09-13", key: "rosh-hashana" },
    ];
    expect(describeWindow(rh, yomTov)).toEqual({ shabbat: true, holidays: ["rosh-hashana"] });
    expect(describeWindow(plain, yomTov)).toEqual({ shabbat: true, holidays: [] });
    expect(describeWindow({ startDate: "2027-04-21", endDate: "2027-04-22" }, [{ date: "2027-04-22", key: "pesach" }])).toEqual({ shabbat: false, holidays: ["pesach"] });
  });
});

// ─── Free-cancellation deadline ───────────────────────────────

describe("cancellationView", () => {
  const base = { status: "CONFIRMED" as const, checkIn: "2026-11-20", checkOut: "2026-11-22", policy: "MODERATE" as const, checkInFrom: "15:00" };

  it("ends 5 days before the check-in time, Georgia time (MODERATE)", () => {
    const view = cancellationView(base, at("2026-11-01T00:00:00Z"));
    expect(view).toEqual({ kind: "free", canCancel: true, until: at("2026-11-15T11:00:00Z") }); // 15:00 Tbilisi = 11:00 UTC
  });

  it("uses 14:00 when the host gave no time or chose flexible", () => {
    expect(cancellationView({ ...base, policy: "FLEXIBLE", checkInFrom: null }, at("2026-11-01T00:00:00Z")).until).toEqual(at("2026-11-19T10:00:00Z"));
  });

  it("free → late at the deadline, and closed after the check-in day", () => {
    expect(cancellationView(base, at("2026-11-15T10:59:59Z")).kind).toBe("free");
    expect(cancellationView(base, at("2026-11-15T11:00:01Z")).kind).toBe("late");
    expect(cancellationView(base, at("2026-11-20T19:59:00Z")).kind).toBe("late"); // 23:59 in Tbilisi on the check-in day
    expect(cancellationView(base, at("2026-11-20T20:00:00Z"))).toMatchObject({ kind: "closed", canCancel: false }); // next day in Tbilisi
  });

  it("is closed for a booking that is not confirmed", () => {
    for (const status of ["CANCELLED_BY_GUEST", "CANCELLED_BY_HOST", "COMPLETED", "NO_SHOW"] as const) {
      expect(cancellationView({ ...base, status }, at("2026-11-01T00:00:00Z")).canCancel).toBe(false);
    }
  });
});

// ─── The calendar file ────────────────────────────────────────

const input: TripCalendarInput = {
  code: "BT-7K3Q9",
  checkIn: "2026-11-13",
  checkOut: "2026-11-15",
  checkInTime: "15:00",
  checkOutTime: "11:00",
  summary: "דירה בוואקה, נוף; לעיר · BT-7K3Q9",
  description: ["הזמנה BT-7K3Q9 באתר בית", "הגעה: יום ו׳, 13 בנובמבר מ-15:00", "C:\\temp, a;b"],
  location: "רחוב צ׳אבצ׳אבאדזה 12, דירה 4\nטביליסי",
  lat: 41.709123456,
  lng: 44.765432,
  url: "https://bayit.example/he/account/trips/BT-7K3Q9",
};
const NOW = at("2026-11-07T12:00:00Z");

/** Undo RFC 5545 folding. */
const unfold = (ics: string) => ics.replace(/\r\n /g, "");

describe("buildTripIcs", () => {
  const ics = buildTripIcs(input, { host: "bayit.example", productName: "Bayit", now: NOW });

  it("uses CRLF only, ends with CRLF, and folds every line at 75 octets", () => {
    expect(ics.endsWith("END:VCALENDAR\r\n")).toBe(true);
    expect(ics.replace(/\r\n/g, "")).not.toMatch(/[\r\n]/);
    for (const line of ics.split("\r\n")) expect(new TextEncoder().encode(line).length).toBeLessThanOrEqual(75);
  });

  it("writes the stay in UTC from the check-in time to the check-out time (Georgia is UTC+4)", () => {
    const text = unfold(ics);
    expect(text).toContain("DTSTART:20261113T110000Z\r\n");
    expect(text).toContain("DTEND:20261115T070000Z\r\n");
    expect(text).toContain("DTSTAMP:20261107T120000Z\r\n");
    expect(text).toContain("UID:booking-BT-7K3Q9@bayit.example\r\n");
  });

  it("escapes TEXT values (backslash, semicolon, comma, newline) and keeps the address and code", () => {
    const text = unfold(ics);
    expect(text).toContain("SUMMARY:דירה בוואקה\\, נוף\\; לעיר · BT-7K3Q9\r\n");
    expect(text).toContain("LOCATION:רחוב צ׳אבצ׳אבאדזה 12\\, דירה 4\\nטביליסי\r\n");
    expect(text).toContain("DESCRIPTION:הזמנה BT-7K3Q9 באתר בית\\nהגעה: יום ו׳\\, 13 בנובמבר מ-15:00\\nC:\\\\temp\\, a\\;b\r\n");
    expect(text).toContain("GEO:41.709123;44.765432\r\n");
    expect(text).toContain("URL:https://bayit.example/he/account/trips/BT-7K3Q9\r\n");
  });

  it("is an all-day event (check-in day through check-out day) when check-in or check-out is flexible", () => {
    const allDay = unfold(buildTripIcs({ ...input, checkInTime: null }, { host: "bayit.example", productName: "Bayit", now: NOW }));
    expect(allDay).toContain("DTSTART;VALUE=DATE:20261113\r\n");
    expect(allDay).toContain("DTEND;VALUE=DATE:20261116\r\n");
    expect(tripEventTimes({ ...input, checkOutTime: null })).toEqual({ allDay: true, start: "2026-11-13", end: "2026-11-16" });
  });

  it("drops control characters and non-http URLs, and skips an empty location", () => {
    const text = unfold(
      buildTripIcs({ ...input, summary: "a\u0007b", location: "  ", url: "javascript:alert(1)", lat: null }, { host: "bayit.example", productName: "Bayit", now: NOW }),
    );
    expect(text).toContain("SUMMARY:ab\r\n");
    expect(text).not.toContain("LOCATION:");
    expect(text).not.toContain("URL:");
    expect(text).not.toContain("GEO:");
  });

  it("escape and fold helpers", () => {
    expect(escapeIcsText("a\\b;c,d\r\ne\nf")).toBe("a\\\\b\\;c\\,d\\ne\\nf");
    const long = `DESCRIPTION:${"שלום ".repeat(40)}`;
    const folded = foldIcsLine(long);
    expect(folded.split("\r\n").slice(1).every((part) => part.startsWith(" "))).toBe(true);
    expect(unfold(folded)).toBe(long);
  });
});

describe("googleCalendarUrl", () => {
  it("opens Google Calendar with the dates, the zone, the title and the address", () => {
    const url = new URL(googleCalendarUrl(input));
    expect(url.origin + url.pathname).toBe("https://calendar.google.com/calendar/render");
    expect(url.searchParams.get("action")).toBe("TEMPLATE");
    expect(url.searchParams.get("dates")).toBe("20261113T110000Z/20261115T070000Z");
    expect(url.searchParams.get("ctz")).toBe("Asia/Tbilisi");
    expect(url.searchParams.get("text")).toBe(input.summary);
    expect(url.searchParams.get("location")).toBe(input.location);
    expect(url.searchParams.get("details")).toContain("BT-7K3Q9");
  });

  it("all-day dates when flexible", () => {
    expect(new URL(googleCalendarUrl({ ...input, checkOutTime: null })).searchParams.get("dates")).toBe("20261113/20261116");
  });
});

// ─── Map links ────────────────────────────────────────────────

describe("map links", () => {
  it("Google Maps and Waze directions to the exact point (6 decimals)", () => {
    expect(tripMapLinks({ lat: 41.7091234567, lng: 44.7654 })).toEqual({
      google: "https://www.google.com/maps/dir/?api=1&destination=41.709123,44.765400",
      waze: "https://waze.com/ul?ll=41.709123,44.765400&navigate=yes",
    });
  });

  it("no links without a real pin", () => {
    expect(tripMapLinks(null)).toBeNull();
    expect(tripMapLinks({ lat: null, lng: 44 })).toBeNull();
    expect(tripMapLinks({ lat: 0, lng: 0 })).toBeNull();
    expect(tripMapLinks({ lat: Number.NaN, lng: 44 })).toBeNull();
    expect(tripMapLinks({ lat: 91, lng: 44 })).toBeNull();
    expect(isMapPoint({ lat: -33.9, lng: 151.2 })).toBe(true);
  });

  it("walking directions to a place nearby", () => {
    const url = new URL(walkingDirectionsUrl({ lat: 41.7, lng: 44.8 }, { lat: 41.701, lng: 44.801 }) ?? "");
    expect(url.searchParams.get("origin")).toBe("41.700000,44.800000");
    expect(url.searchParams.get("destination")).toBe("41.701000,44.801000");
    expect(url.searchParams.get("travelmode")).toBe("walking");
    expect(walkingDirectionsUrl({ lat: 0, lng: 0 }, { lat: 41.7, lng: 44.8 })).toBeNull();
  });
});

// ─── The host's contact buttons ───────────────────────────────

describe("tripContactButtons", () => {
  const message = "שלום, הזמנה BT-7K3Q9";

  it("every channel the host chose, in the host's order, with E.164 numbers", () => {
    const buttons = tripContactButtons(
      [
        { channel: "WHATSAPP", value: "555 12 34 56", order: 0 },
        { channel: "PHONE", value: "+995 555 12 34 56", order: 1 },
        { channel: "SMS", value: "+995555123456", order: 2 },
        { channel: "VIBER", value: "+995555123456", order: 3 },
        { channel: "TELEGRAM", value: "@bayit_host", order: 4 },
        { channel: "MESSENGER", value: "https://m.me/bayit.host", order: 5 },
        { channel: "EMAIL", value: "host@example.com", order: 6 },
      ],
      { country: "GE", message },
    );
    expect(buttons.map((b) => b.channel)).toEqual(["WHATSAPP", "PHONE", "SMS", "VIBER", "TELEGRAM", "MESSENGER"]);
    expect(buttons[0].href).toBe(`https://wa.me/995555123456?text=${encodeURIComponent(message)}`);
    expect(buttons[1].href).toBe("tel:+995555123456");
    expect(buttons[2].href).toBe(`sms:+995555123456?body=${encodeURIComponent(message)}`);
    expect(buttons[3].href).toBe("viber://chat?number=%2B995555123456");
    expect(buttons[4]).toMatchObject({ href: "https://t.me/bayit_host", display: "@bayit_host", newTab: true });
    expect(buttons[5]).toMatchObject({ href: "https://m.me/bayit.host", newTab: true });
    expect(buttons[1]).toMatchObject({ newTab: false });
    expect(buttons[0].display).toMatch(/^\+995/);
  });

  it("drops unusable values and falls back to the host's verified phone", () => {
    expect(tripContactButtons([{ channel: "WHATSAPP", value: "12", order: 0 }], { message, verifiedOwnerPhone: "+972531234567" })).toEqual([
      { channel: "PHONE", href: "tel:+972531234567", display: expect.stringMatching(/^\+972/), newTab: false },
    ]);
    expect(tripContactButtons([], { message })).toEqual([]);
  });
});

// ─── Save for offline ─────────────────────────────────────────

describe("offline trip pages", () => {
  it("only canonical trip page paths may be saved", () => {
    expect(isTripPagePath("/he/account/trips/BT-7K3Q9")).toBe(true);
    expect(isTripPagePath("/ka/account/trips/BT-22222")).toBe(true);
    for (const bad of ["/he/account/trips", "/he/account/trips/BT-7K3Q9/x", "/he/account/trips/bt-7k3q9", "/he/account/trips/BT-0O1I0", "/fr/account/trips/BT-7K3Q9", "/he/account/host-bookings/BT-7K3Q9", "/api/ical/booking/BT-7K3Q9", "/he/account/trips/BT-7K3Q9?x=1"]) {
      expect(isTripPagePath(bad), bad).toBe(false);
    }
  });

  it("saves and keeps a copy only of the guest's real trip page (the mark), never 'not found' or the login page", () => {
    expect(hasTripMarker('<div class="grid" data-offline-trip="BT-7K3Q9">', "BT-7K3Q9")).toBe(true);
    expect(hasTripMarker('<div class="grid" data-offline-trip="BT-22222">', "BT-7K3Q9")).toBe(false);
    expect(hasTripMarker("<h2>לא מצאנו את ההזמנה</h2>", "BT-7K3Q9")).toBe(false);
    expect(tripCodeOfPath("/he/account/trips/BT-7K3Q9")).toBe("BT-7K3Q9");
  });

  it("keeps the page's type and security headers, never cookies or caching headers", () => {
    const kept = offlinePageHeaders(
      new Headers({
        "Content-Type": "text/html; charset=utf-8",
        "Content-Security-Policy": "script-src 'nonce-abc'",
        "Set-Cookie": "session=secret",
        "Cache-Control": "private, no-store",
      }),
    );
    expect([...kept.keys()].sort()).toEqual(["content-security-policy", "content-type"]);
  });

  it("keeps a copy until a week after check-out", () => {
    expect(offlineKeepUntil("2026-11-15")).toBe("2026-11-22");
    expect(isOfflineEntryExpired({ keepUntil: "2026-11-22" }, "2026-11-22")).toBe(false);
    expect(isOfflineEntryExpired({ keepUntil: "2026-11-22" }, "2026-11-23")).toBe(true);
  });

  it("saves only same-origin static files", () => {
    const origin = "https://bayit.example";
    expect(
      offlineAssetUrls(
        [
          "https://bayit.example/_next/static/chunks/a.js",
          "/_next/static/css/b.css",
          "/_next/static/chunks/a.js#x",
          "https://bayit.example/icons/sprite-1.svg",
          "https://bayit.example/he/account/trips/BT-7K3Q9",
          "https://bayit.example/api/media/x.webp",
          "https://cdn.example/_next/static/c.js",
          "https://a.basemaps.cartocdn.com/tile.png",
          "not a url ::",
        ],
        origin,
      ),
    ).toEqual(["https://bayit.example/_next/static/chunks/a.js", "https://bayit.example/_next/static/css/b.css", "https://bayit.example/icons/sprite-1.svg"]);
  });

  it("reads the index defensively and replaces an entry of the same page", () => {
    const entry: OfflineTripEntry = {
      path: "/he/account/trips/BT-7K3Q9",
      code: "BT-7K3Q9",
      title: "דירה",
      checkIn: "2026-11-13",
      checkOut: "2026-11-15",
      status: "CONFIRMED",
      savedAt: "2026-11-07T12:00:00.000Z",
      keepUntil: "2026-11-22",
    };
    expect(parseOfflineIndex({ trips: [entry, { ...entry, path: "/he/account" }, { path: 1 }, null] })).toEqual([entry]);
    expect(parseOfflineIndex("junk")).toEqual([]);
    expect(withOfflineEntry([entry], { ...entry, status: "CANCELLED_BY_GUEST" })).toEqual([{ ...entry, status: "CANCELLED_BY_GUEST" }]);
  });

  it("the service worker uses the same cache, index and address pattern, and still parses", () => {
    const sw = fs.readFileSync(path.join(process.cwd(), "public", "sw.js"), "utf8");
    expect(() => new vm.Script(sw)).not.toThrow();
    expect(sw).toContain(`const TRIPS_CACHE = "${OFFLINE_TRIPS_CACHE}";`);
    expect(sw).toContain(`const TRIPS_INDEX = "${OFFLINE_TRIPS_INDEX}";`);
    expect(sw).toContain(`const TRIP_PAGE = new RegExp("${TRIP_PAGE_PATTERN}");`);
    expect(sw).toContain(`const TRIP_MARKER = "${OFFLINE_TRIP_MARKER}";`);
    expect(sw).toContain(`const TRIP_PAGE_HEADERS = ${JSON.stringify(OFFLINE_PAGE_HEADERS).replace(/,/g, ", ")};`);
    // Pages are cached only through the saved-trips path: no generic page caching crept in.
    expect(sw).toContain('if (url.pathname.startsWith("/api/")) return;');
    // The offline page lists saved trips from the same cache.
    const offline = fs.readFileSync(path.join(process.cwd(), "public", "offline.html"), "utf8");
    expect(offline).toContain(`caches.has("${OFFLINE_TRIPS_CACHE}")`);
    expect(offline).toContain(`cache.match("${OFFLINE_TRIPS_INDEX}")`);
  });
});
