import { describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

const { assertSafeFeedUrl, buildIcs, escapeIcsText, foldIcsLine, isPrivateAddress, parseIcsText, safeLookup } = await import("./ical");

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

  it("accepts public https URLs", () => {
    expect(assertSafeFeedUrl("https://www.airbnb.com/calendar/ical/123.ics?s=abc").hostname).toBe("www.airbnb.com");
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
