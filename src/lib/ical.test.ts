import dns from "node:dns";
import { EventEmitter } from "node:events";
import https from "node:https";
import { Readable } from "node:stream";
import { afterEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

const {
  assertSafeFeedUrl,
  buildIcs,
  CalendarHostNotAllowedError,
  classifyFeedError,
  escapeIcsText,
  FEED_MAX_BYTES,
  FEED_TIMEOUT_MS,
  fetchIcsFeed,
  foldIcsLine,
  hotelExportBlocks,
  isPrivateAddress,
  parseIcsText,
  roomTypeExportBlocks,
  safeLookup,
} = await import("./ical");

const day = (value: string) => new Date(`${value}T00:00:00Z`);
const NOW = new Date("2026-10-31T12:00:00Z");

describe("buildIcs", () => {
  const blocks = [
    { id: "b1", startDate: day("2026-11-03"), endDate: day("2026-11-07") },
    { id: "b2", startDate: day("2026-12-24"), endDate: day("2026-12-25") },
    { id: "bad", startDate: day("2027-01-05"), endDate: day("2027-01-05") },
  ];
  const ics = buildIcs({ id: "l1", publicId: 1234 }, blocks, NOW);

  it("writes a valid RFC 5545 calendar with CRLF line endings", () => {
    expect(ics.startsWith("BEGIN:VCALENDAR\r\nVERSION:2.0\r\n")).toBe(true);
    expect(ics.endsWith("END:VCALENDAR\r\n")).toBe(true);
    expect(ics.replace(/\r\n/g, "")).not.toMatch(/[\r\n]/);
    expect(ics).toContain("PRODID:-//Bayit//Availability 1234//EN");
    expect(ics).toContain("DTSTAMP:20261031T120000Z");
  });

  it("exports all-day events with exclusive end dates and stable UIDs", () => {
    expect(ics).toContain("DTSTART;VALUE=DATE:20261103\r\nDTEND;VALUE=DATE:20261107");
    expect(ics).toMatch(/UID:b1@[a-z0-9.-]+\r\n/);
    expect(ics.match(/BEGIN:VEVENT/g)).toHaveLength(2); // the empty range is skipped
    expect(ics).not.toContain("bad@");
  });

  it("round-trips through the parser", () => {
    const events = parseIcsText(ics, NOW);
    expect(events.map(({ start, end, summary }) => ({ start, end, summary }))).toEqual([
      { start: "2026-11-03", end: "2026-11-07", summary: "Not available" },
      { start: "2026-12-24", end: "2026-12-25", summary: "Not available" },
    ]);
    expect(events[0].uid).toMatch(/^b1@/);
  });
});

describe("hotels: export per room type (round 3)", () => {
  // Double: 2 rooms. Suite: 1 room. A booking of 1 double, a booking of the suite, a whole-hotel block.
  const double = { id: "double", quantity: 2 };
  const suite = { id: "suite", quantity: 1 };
  const blocks = [
    { start: "2026-11-03", end: "2026-11-06", roomTypeId: "double", rooms: 1 },
    { start: "2026-11-04", end: "2026-11-05", roomTypeId: "double", rooms: 1 },
    { start: "2026-11-04", end: "2026-11-08", roomTypeId: "suite", rooms: 1 },
    { start: "2026-12-24", end: "2026-12-25", roomTypeId: null, rooms: null },
  ];
  const window = [day("2026-10-01"), day("2027-10-01")] as const;
  const ranges = (list: { startDate: Date; endDate: Date }[]) => list.map((b) => [b.startDate.toISOString().slice(0, 10), b.endDate.toISOString().slice(0, 10)]);

  it("a room type's feed is busy only on nights it has no free room left (iCal has no room counts)", () => {
    expect(ranges(roomTypeExportBlocks(double, blocks, ...window))).toEqual([
      ["2026-11-04", "2026-11-05"],
      ["2026-12-24", "2026-12-25"],
    ]);
    expect(ranges(roomTypeExportBlocks(suite, blocks, ...window))).toEqual([
      ["2026-11-04", "2026-11-08"],
      ["2026-12-24", "2026-12-25"],
    ]);
  });

  it("the hotel's own feed is busy only when every room type is full or the hotel is closed", () => {
    expect(ranges(hotelExportBlocks("h1", [double, suite], blocks, ...window))).toEqual([
      ["2026-11-04", "2026-11-05"],
      ["2026-12-24", "2026-12-25"],
    ]);
    const ics = buildIcs({ id: "h1", publicId: 111 }, roomTypeExportBlocks(suite, blocks, ...window), NOW);
    expect(ics).toContain("SUMMARY:Not available");
    expect(ics).toMatch(/UID:room-suite-2026-11-04@/);
  });
});

describe("text helpers", () => {
  it("escapes TEXT values", () => {
    expect(escapeIcsText("a,b;c\\d\ne")).toBe("a\\,b\\;c\\\\d\\ne");
  });

  it("folds long lines at 75 octets without splitting characters", () => {
    const line = `SUMMARY:${"דירה מוארת בבטומי ".repeat(8)}`;
    const folded = foldIcsLine(line);
    for (const part of folded.split("\r\n")) expect(Buffer.byteLength(part, "utf8")).toBeLessThanOrEqual(75);
    expect(folded.split("\r\n").slice(1).every((p) => p.startsWith(" "))).toBe(true);
    expect(folded.replace(/\r\n /g, "")).toBe(line);
  });
});

describe("parseIcsText", () => {
  const feed = (body: string) => `BEGIN:VCALENDAR\r\nVERSION:2.0\r\nPRODID:-//test//EN\r\n${body}END:VCALENDAR\r\n`;

  it("reads Airbnb-style all-day reservations", () => {
    const events = parseIcsText(
      feed(
        "BEGIN:VEVENT\r\nDTSTAMP:20261030T000000Z\r\nDTSTART;VALUE=DATE:20261110\r\nDTEND;VALUE=DATE:20261115\r\nUID:abc@airbnb.com\r\nSUMMARY:Reserved\r\nEND:VEVENT\r\n" +
          "BEGIN:VEVENT\r\nDTSTAMP:20261030T000000Z\r\nDTSTART;VALUE=DATE:20261120\r\nUID:single@airbnb.com\r\nSUMMARY:Airbnb (Not available)\r\nEND:VEVENT\r\n",
      ),
      NOW,
    );
    expect(events).toEqual([
      { uid: "abc@airbnb.com", start: "2026-11-10", end: "2026-11-15", summary: "Reserved" },
      { uid: "single@airbnb.com", start: "2026-11-20", end: "2026-11-21", summary: "Airbnb (Not available)" },
    ]);
  });

  it("maps timed events to Georgian days", () => {
    const [event] = parseIcsText(
      feed("BEGIN:VEVENT\r\nDTSTAMP:20261030T000000Z\r\nDTSTART:20261110T110000Z\r\nDTEND:20261112T080000Z\r\nUID:t1\r\nSUMMARY:Booked\r\nEND:VEVENT\r\n"),
      NOW,
    );
    // 15:00 on Nov 10 → 12:00 on Nov 12 Georgian time: blocks Nov 10, 11 and 12.
    expect(event).toMatchObject({ start: "2026-11-10", end: "2026-11-13" });
  });

  it("skips cancelled, free and old events and expands recurring ones", () => {
    const events = parseIcsText(
      feed(
        "BEGIN:VEVENT\r\nDTSTAMP:20261030T000000Z\r\nDTSTART;VALUE=DATE:20261110\r\nDTEND;VALUE=DATE:20261111\r\nUID:c1\r\nSTATUS:CANCELLED\r\nEND:VEVENT\r\n" +
          "BEGIN:VEVENT\r\nDTSTAMP:20261030T000000Z\r\nDTSTART;VALUE=DATE:20261112\r\nDTEND;VALUE=DATE:20261113\r\nUID:f1\r\nTRANSP:TRANSPARENT\r\nEND:VEVENT\r\n" +
          "BEGIN:VEVENT\r\nDTSTAMP:20261030T000000Z\r\nDTSTART;VALUE=DATE:20250101\r\nDTEND;VALUE=DATE:20250105\r\nUID:old\r\nEND:VEVENT\r\n" +
          "BEGIN:VEVENT\r\nDTSTAMP:20261030T000000Z\r\nDTSTART;VALUE=DATE:20261106\r\nDTEND;VALUE=DATE:20261107\r\nRRULE:FREQ=WEEKLY;COUNT=3\r\nUID:r1\r\nSUMMARY:Cleaning\r\nEND:VEVENT\r\n",
      ),
      NOW,
    );
    expect(events.map((e) => [e.start, e.end])).toEqual([
      ["2026-11-06", "2026-11-07"],
      ["2026-11-13", "2026-11-14"],
      ["2026-11-20", "2026-11-21"],
    ]);
    expect(new Set(events.map((e) => e.uid)).size).toBe(3);
  });
});

describe("SSRF guards", () => {
  it.each([
    ["127.0.0.1", true],
    ["10.1.2.3", true],
    ["172.20.0.1", true],
    ["192.168.1.10", true],
    ["169.254.169.254", true],
    ["100.64.0.1", true],
    ["0.0.0.0", true],
    ["::1", true],
    ["fd00::1", true],
    ["fe80::1", true],
    ["::ffff:10.0.0.1", true],
    ["::ffff:7f00:1", true],
    ["not-an-ip", true],
    ["8.8.8.8", false],
    ["151.101.1.140", false],
    ["2606:4700:4700::1111", false],
  ])("isPrivateAddress(%s) = %s", (address, expected) => {
    expect(isPrivateAddress(address)).toBe(expected);
  });

  it.each([
    "http://www.airbnb.com/calendar/ical/1.ics",
    "https://user:pass@example.com/cal.ics",
    "https://example.com:8443/cal.ics",
    "https://localhost/cal.ics",
    "https://127.0.0.1/cal.ics",
    "https://[::1]/cal.ics",
    "https://169.254.169.254/latest/meta-data",
    "https://printer.local/cal.ics",
    "file:///etc/passwd",
    "not a url",
  ])("refuses %s", (url) => {
    expect(() => assertSafeFeedUrl(url)).toThrow(/Calendar URL refused/);
  });

  it("accepts https links of the allowed calendar sites (SECURITY_REPORT 8.1.a)", () => {
    expect(assertSafeFeedUrl("https://www.airbnb.com/calendar/ical/123.ics?s=abc").hostname).toBe("www.airbnb.com");
    expect(assertSafeFeedUrl("https://www.airbnb.co.il/calendar/ical/123.ics?s=abc").hostname).toBe("www.airbnb.co.il");
    expect(assertSafeFeedUrl("https://admin.booking.com/hotel/hoteladmin/ical.html?t=abc").hostname).toBe("admin.booking.com");
    expect(assertSafeFeedUrl("https://ical.booking.com/v1/export?t=abc").hostname).toBe("ical.booking.com");
    expect(assertSafeFeedUrl("https://www.vrbo.com/icalendar/abc.ics").hostname).toBe("www.vrbo.com");
    expect(assertSafeFeedUrl("https://www.homeaway.com/icalendar/abc.ics").hostname).toBe("www.homeaway.com");
    expect(assertSafeFeedUrl("https://calendar.google.com/calendar/ical/x/private-y/basic.ics").hostname).toBe("calendar.google.com");
    expect(assertSafeFeedUrl("https://www.airbnb.com:443/calendar/ical/1.ics").hostname).toBe("www.airbnb.com");
  });

  // The audit's probe saved these two (8.1.a); other public sites, look-alikes and bare IPs too.
  it.each([
    "https://10.0.0.1.sslip.io/cal.ics",
    "https://localhost./cal.ics",
    "https://evil.example/cal.ics",
    "https://airbnb.com.evil.example/cal.ics",
    "https://evilairbnb.com/cal.ics",
    "https://booking.com-calendar.example/cal.ics",
    "https://www.google.com/calendar/ical/x/basic.ics",
    "https://8.8.8.8/cal.ics",
    "https://[2606:4700:4700::1111]/cal.ics",
    "https://0x7f000001/cal.ics",
    "https://[::ffff:127.0.0.1]/cal.ics",
    "https://2130706433/cal.ics",
    "https://metadata.google.internal/computeMetadata/v1/",
  ])("refuses %s (not a calendar site we import from)", (url) => {
    expect(() => assertSafeFeedUrl(url)).toThrow(/Calendar URL refused/);
    let error: unknown;
    try {
      assertSafeFeedUrl(url);
    } catch (caught) {
      error = caught;
    }
    expect(["calendar_host", "unsafe_url"]).toContain(classifyFeedError(error));
  });

  // DNS rebinding (8.1.b): an allowed name whose DNS answer holds any non-public address is
  // refused when connecting, even if the first answer was public.
  it("refuses at connect time when any DNS answer is private", async () => {
    const answers: Record<string, { address: string; family: number }[]> = {
      "www.airbnb.com": [
        { address: "151.101.1.140", family: 4 },
        { address: "169.254.169.254", family: 4 },
      ],
      "ical.booking.com": [{ address: "fd00::1", family: 6 }],
      "calendar.google.com": [{ address: "142.250.74.46", family: 4 }],
    };
    const spy = vi.spyOn(dns, "lookup").mockImplementation(((host: string, _options: unknown, callback: (e: null, a: unknown) => void) =>
      callback(null, answers[host] ?? [])) as unknown as typeof dns.lookup);
    const lookup = (host: string) =>
      new Promise<{ error: NodeJS.ErrnoException | null; address: unknown }>((resolve) =>
        safeLookup(host, {} as never, ((error: NodeJS.ErrnoException | null, address: unknown) => resolve({ error, address })) as never),
      );
    expect((await lookup("www.airbnb.com")).error?.code).toBe("EADDRNOTAVAIL");
    expect((await lookup("ical.booking.com")).error?.code).toBe("EADDRNOTAVAIL");
    expect((await lookup("vrbo.com")).error?.code).toBe("EADDRNOTAVAIL");
    expect(await lookup("calendar.google.com")).toEqual({ error: null, address: "142.250.74.46" });
    spy.mockRestore();
  });

  it("tells a site that isn't on the list apart from an unsafe address", () => {
    expect(() => assertSafeFeedUrl("https://evil.example/cal.ics")).toThrow(CalendarHostNotAllowedError);
    expect(classifyFeedError(new CalendarHostNotAllowedError())).toBe("calendar_host");
    expect(() => assertSafeFeedUrl("http://www.airbnb.com/cal.ics")).not.toThrow(CalendarHostNotAllowedError);
  });

  it("refuses host names that resolve to private addresses at connect time", async () => {
    const lookup = (options: object) =>
      new Promise<{ error: NodeJS.ErrnoException | null; address: unknown }>((resolve) =>
        safeLookup("localhost", options as never, ((error: NodeJS.ErrnoException | null, address: unknown) =>
          resolve({ error, address })) as never),
      );
    const single = await lookup({});
    expect(single.error?.code).toBe("EADDRNOTAVAIL");
    const all = await lookup({ all: true });
    expect(all.error?.code).toBe("EADDRNOTAVAIL");
  });
});

/**
 * The download itself (fetchIcsFeed) with https.get stubbed: no network. Every request the code
 * makes is recorded, so a test can prove that a refused hop was never requested.
 */
describe("fetchIcsFeed: redirects, size and time limits (SECURITY_REPORT 8.1.c, 8.1.d)", () => {
  const CALENDAR = "BEGIN:VCALENDAR\r\nVERSION:2.0\r\nPRODID:-//test//EN\r\nEND:VCALENDAR\r\n";
  type Answer = { status: number; headers?: Record<string, string>; chunks?: Buffer[] };
  let requested: { url: string; signal: unknown }[] = [];
  let pulled = 0;

  function stub(answers: Record<string, Answer>) {
    requested = [];
    pulled = 0;
    vi.spyOn(https, "get").mockImplementation(((url: URL, options: { signal?: AbortSignal }, callback: (response: unknown) => void) => {
      requested.push({ url: url.toString(), signal: options.signal });
      const answer = answers[url.toString()] ?? { status: 404 };
      const chunks = answer.chunks ?? [];
      const response = Readable.from(
        (function* () {
          for (const chunk of chunks) {
            pulled++;
            yield chunk;
          }
        })(),
      ) as Readable & { statusCode: number; headers: Record<string, string> };
      response.statusCode = answer.status;
      response.headers = answer.headers ?? {};
      queueMicrotask(() => callback(response));
      return new EventEmitter();
    }) as unknown as typeof https.get);
  }

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("follows a redirect to another allowed calendar site, re-checking the hop", async () => {
    stub({
      "https://www.airbnb.co.il/calendar/ical/1.ics": { status: 301, headers: { location: "https://www.airbnb.com/calendar/ical/1.ics" } },
      "https://www.airbnb.com/calendar/ical/1.ics": { status: 200, chunks: [Buffer.from(CALENDAR)] },
    });
    await expect(fetchIcsFeed("https://www.airbnb.co.il/calendar/ical/1.ics")).resolves.toContain("BEGIN:VCALENDAR");
    expect(requested.map((r) => r.url)).toEqual(["https://www.airbnb.co.il/calendar/ical/1.ics", "https://www.airbnb.com/calendar/ical/1.ics"]);
  });

  it.each([
    ["another public site", "https://evil.example/cal.ics", "calendar_host"],
    ["cloud metadata", "http://169.254.169.254/latest/meta-data/", "unsafe_url"],
    ["a private address", "https://10.0.0.1/cal.ics", "unsafe_url"],
    ["an IPv6 private address", "https://[fd00::1]/cal.ics", "unsafe_url"],
    ["a DNS trick name", "https://127.0.0.1.sslip.io/cal.ics", "calendar_host"],
    ["a relative path on another host", "//evil.example/cal.ics", "calendar_host"],
  ])("refuses a redirect to %s and never requests it", async (_label, location, code) => {
    stub({ "https://www.airbnb.com/calendar/ical/1.ics": { status: 302, headers: { location } } });
    const error = await fetchIcsFeed("https://www.airbnb.com/calendar/ical/1.ics").catch((caught: unknown) => caught);
    expect(classifyFeedError(error)).toBe(code);
    expect(requested).toHaveLength(1);
  });

  it("stops after 3 redirects", async () => {
    const hop = (n: number) => `https://www.airbnb.com/hop/${n}.ics`;
    stub(Object.fromEntries([0, 1, 2, 3, 4].map((n) => [hop(n), { status: 302, headers: { location: hop(n + 1) } }])));
    const error = await fetchIcsFeed(hop(0)).catch((caught: unknown) => caught);
    expect(classifyFeedError(error)).toBe("http_error");
    expect(requested).toHaveLength(4);
  });

  it("caps the file at 1 MB while it streams in, even without a Content-Length", async () => {
    expect(FEED_MAX_BYTES).toBe(1024 * 1024);
    const chunk = Buffer.alloc(64 * 1024, 0x41);
    stub({ "https://www.airbnb.com/big.ics": { status: 200, chunks: [Buffer.from(CALENDAR), ...Array.from({ length: 40 }, () => chunk)] } });
    const error = await fetchIcsFeed("https://www.airbnb.com/big.ics").catch((caught: unknown) => caught);
    expect(classifyFeedError(error)).toBe("too_large");
    // The download stopped just past 1 MB: most of the 2.5 MB body was never read.
    expect(pulled).toBeLessThan(20);
  });

  it("refuses a file that announces more than 1 MB before reading it", async () => {
    stub({ "https://www.airbnb.com/big.ics": { status: 200, headers: { "content-length": String(FEED_MAX_BYTES + 1) }, chunks: [Buffer.from(CALENDAR)] } });
    const error = await fetchIcsFeed("https://www.airbnb.com/big.ics").catch((caught: unknown) => caught);
    expect(classifyFeedError(error)).toBe("too_large");
    expect(pulled).toBe(0);
  });

  it("accepts a calendar just under 1 MB", async () => {
    const padding = Buffer.alloc(FEED_MAX_BYTES - CALENDAR.length - 10, 0x20);
    stub({ "https://calendar.google.com/calendar/ical/x/basic.ics": { status: 200, chunks: [Buffer.from(CALENDAR), padding] } });
    await expect(fetchIcsFeed("https://calendar.google.com/calendar/ical/x/basic.ics")).resolves.toMatch(/^BEGIN:VCALENDAR/);
  });

  it("gives every hop the same 10-second deadline", async () => {
    expect(FEED_TIMEOUT_MS).toBe(10_000);
    stub({
      "https://www.vrbo.com/a.ics": { status: 302, headers: { location: "https://www.vrbo.com/b.ics" } },
      "https://www.vrbo.com/b.ics": { status: 200, chunks: [Buffer.from(CALENDAR)] },
    });
    await fetchIcsFeed("https://www.vrbo.com/a.ics");
    expect(requested).toHaveLength(2);
    expect(requested[0].signal).toBeInstanceOf(AbortSignal);
    expect(requested[1].signal).toBe(requested[0].signal);
  });

  it("refuses an answer that is not a calendar", async () => {
    stub({ "https://www.airbnb.com/page.ics": { status: 200, chunks: [Buffer.from("<html>login</html>")] } });
    const error = await fetchIcsFeed("https://www.airbnb.com/page.ics").catch((caught: unknown) => caught);
    expect(classifyFeedError(error)).toBe("not_calendar");
  });
});
