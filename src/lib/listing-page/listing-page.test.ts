import { describe, expect, it } from "vitest";
import { listingAccess, previewReason, type ListingAccessInput } from "./access";
import { buildMonth, buildMonths, georgiaToday, isBlockedDay, weekStartFor } from "./calendar";
import { clockDate, languageName, needsShowMore, priceChangePercent, pricePerSqm, replyTimeBucket } from "./helpers";
import { schemaTypeFor } from "./jsonld";
import { parseVideoUrl, safeExternalUrl } from "./media";

const now = new Date("2026-10-31T12:00:00Z");
const live: ListingAccessInput = {
  status: "LIVE",
  ownerId: "owner",
  isDemo: false,
  deletedAt: null,
  expiresAt: new Date("2026-12-01T00:00:00Z"),
  owner: { status: "ACTIVE", deletedAt: null },
};

describe("listingAccess", () => {
  it("is public when LIVE and current", () => {
    expect(listingAccess(live, null, { demoVisible: false, now })).toBe("public");
  });

  it("hides demo listings while demo data is off", () => {
    const demo = { ...live, isDemo: true };
    expect(listingAccess(demo, null, { demoVisible: true, now })).toBe("public");
    expect(listingAccess(demo, null, { demoVisible: false, now })).toBe("none");
    expect(previewReason(demo, { demoVisible: false, now })).toBe("DEMO_HIDDEN");
  });

  it("lets the owner and staff preview other statuses", () => {
    const paused = { ...live, status: "PAUSED" as const };
    expect(listingAccess(paused, null, { demoVisible: true, now })).toBe("none");
    expect(listingAccess(paused, { id: "someone", canPreviewAny: false }, { demoVisible: true, now })).toBe("none");
    expect(listingAccess(paused, { id: "owner", canPreviewAny: false }, { demoVisible: true, now })).toBe("preview");
    expect(listingAccess(paused, { id: "mod", canPreviewAny: true }, { demoVisible: true, now })).toBe("preview");
  });

  it("treats past expiry, inactive owners and deletion as not public", () => {
    expect(previewReason({ ...live, expiresAt: new Date("2026-10-01T00:00:00Z") }, { demoVisible: true, now })).toBe("EXPIRED_DATE");
    expect(previewReason({ ...live, owner: { status: "SUSPENDED", deletedAt: null } }, { demoVisible: true, now })).toBe("OWNER_INACTIVE");
    const deleted = { ...live, deletedAt: now };
    expect(previewReason(deleted, { demoVisible: true, now })).toBe("DELETED");
    expect(listingAccess(deleted, { id: "owner", canPreviewAny: false }, { demoVisible: true, now })).toBe("none");
  });
});

describe("availability calendar", () => {
  const blocks = [{ start: "2026-11-05", end: "2026-11-08" }];

  it("marks blocked days with an exclusive end", () => {
    expect(isBlockedDay("2026-11-05", blocks)).toBe(true);
    expect(isBlockedDay("2026-11-07", blocks)).toBe(true);
    expect(isBlockedDay("2026-11-08", blocks)).toBe(false);
  });

  it("lays out a month starting on the right weekday", () => {
    const sunday = buildMonth(2026, 11, blocks, "2026-11-02", 0);
    // 1 November 2026 is a Sunday.
    expect(sunday.weeks[0][0]?.date).toBe("2026-11-01");
    const monday = buildMonth(2026, 11, blocks, "2026-11-02", 1);
    expect(monday.weeks[0][6]?.date).toBe("2026-11-01");
    expect(monday.weeks[0][0]).toBeNull();
    expect(sunday.blockedCount).toBe(3);
    expect(sunday.weeks.flat().find((d) => d?.date === "2026-11-01")?.past).toBe(true);
    expect(sunday.weeks.every((w) => w.length === 7)).toBe(true);
  });

  it("crosses the year", () => {
    const months = buildMonths([], "2026-12-15", 2);
    expect(months.map((m) => `${m.year}-${m.month}`)).toEqual(["2026-12", "2027-1"]);
  });

  it("uses Georgia days and local week starts", () => {
    expect(georgiaToday(new Date("2026-10-31T21:00:00Z"))).toBe("2026-11-01");
    expect(weekStartFor("ru")).toBe(1);
    expect(weekStartFor("he")).toBe(0);
  });
});

describe("helpers", () => {
  it("buckets reply times", () => {
    expect(replyTimeBucket(null)).toBeNull();
    expect(replyTimeBucket(35)).toBe("hour");
    expect(replyTimeBucket(120)).toBe("fewHours");
    expect(replyTimeBucket(600)).toBe("day");
    expect(replyTimeBucket(3000)).toBe("days");
  });

  it("reads wall-clock times", () => {
    expect(clockDate("14:00")?.toISOString()).toBe("1970-01-01T14:00:00.000Z");
    expect(clockDate("9:30")?.toISOString()).toBe("1970-01-01T09:30:00.000Z");
    expect(clockDate("25:00")).toBeNull();
    expect(clockDate(null)).toBeNull();
  });

  it("computes sale numbers", () => {
    expect(pricePerSqm(120000, 80)).toBe(1500);
    expect(pricePerSqm(null, 80)).toBeNull();
    expect(priceChangePercent(100000, 92000)).toBe(-8);
    expect(priceChangePercent(0, 1)).toBeNull();
  });

  it("knows when a description is long", () => {
    expect(needsShowMore("short")).toBe(false);
    expect(needsShowMore("x".repeat(700))).toBe(true);
    expect(needsShowMore("a\n".repeat(10))).toBe(true);
  });
});

describe("video and tour links", () => {
  it("embeds YouTube with youtube-nocookie", () => {
    for (const url of [
      "https://www.youtube.com/watch?v=dQw4w9WgXcQ&t=10",
      "https://youtu.be/dQw4w9WgXcQ",
      "youtube.com/shorts/dQw4w9WgXcQ",
      "https://m.youtube.com/embed/dQw4w9WgXcQ",
    ]) {
      expect(parseVideoUrl(url)?.embedUrl).toBe("https://www.youtube-nocookie.com/embed/dQw4w9WgXcQ?rel=0&autoplay=1");
    }
  });

  it("embeds Vimeo with dnt", () => {
    expect(parseVideoUrl("https://vimeo.com/123456789")?.embedUrl).toBe("https://player.vimeo.com/video/123456789?dnt=1&autoplay=1");
    expect(parseVideoUrl("https://player.vimeo.com/video/123456789")?.id).toBe("123456789");
  });

  it("ignores other links", () => {
    expect(parseVideoUrl("https://example.com/video.mp4")).toBeNull();
    expect(parseVideoUrl("javascript:alert(1)")).toBeNull();
    expect(parseVideoUrl(null)).toBeNull();
  });

  it("only opens https tours", () => {
    expect(safeExternalUrl("https://kuula.co/share/abc")).toBe("https://kuula.co/share/abc");
    expect(safeExternalUrl("http://insecure.example")).toBeNull();
    expect(safeExternalUrl("javascript:alert(1)")).toBeNull();
  });
});

describe("structured data type", () => {
  it("maps property types to schema.org types", () => {
    expect(schemaTypeFor("PENTHOUSE")).toBe("Apartment");
    expect(schemaTypeFor("VILLA")).toBe("House");
    expect(schemaTypeFor("HOTEL")).toBe("Hotel");
  });
});

describe("languageName", () => {
  it("names languages in the page language", () => {
    expect(languageName("he", "en")).toBe("Hebrew");
    expect(languageName("ru", "ru")).toBe("Русский");
    expect(languageName("xx-invalid-@@", "en")).toBe("xx-invalid-@@");
  });
});
