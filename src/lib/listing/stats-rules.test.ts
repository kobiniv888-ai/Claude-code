import { describe, expect, it } from "vitest";
import {
  dailyAccountVisitorId,
  dailyVisitorId,
  isBotUserAgent,
  isPrefetchRequest,
  skipReason,
  statsDedupeExpiry,
  statsDedupeKey,
  statsPepperPrefix,
  statsScope,
} from "./stats-rules";

const CHROME = "Mozilla/5.0 (Linux; Android 14; Pixel 7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0 Mobile Safari/537.36";
const live = { status: "LIVE", isDemo: false, ownerId: "host-1" };
const page = { userAgent: CHROME, prefetch: false };

describe("anonymous daily visitor ID", () => {
  const view = statsScope("view", "listing-1");

  it("is the same for the same visitor on the same day, and changes with the day, the IP or the browser", () => {
    const monday = "pepper-of-2026-11-02";
    const tuesday = "pepper-of-2026-11-03";
    const a = dailyVisitorId(monday, view, "203.0.113.7", CHROME);
    expect(dailyVisitorId(monday, view, "203.0.113.7", CHROME)).toBe(a);
    expect(dailyVisitorId(tuesday, view, "203.0.113.7", CHROME)).not.toBe(a);
    expect(dailyVisitorId(monday, view, "203.0.113.8", CHROME)).not.toBe(a);
    expect(dailyVisitorId(monday, view, "203.0.113.7", `${CHROME} Edg/130`)).not.toBe(a);
    expect(a).toMatch(/^[0-9a-f]{64}$/);
  });

  it("is different for every listing, event and contact method (keys can't be linked to one visitor)", () => {
    const pepper = "p";
    const ids = [
      dailyVisitorId(pepper, statsScope("view", "listing-1"), "203.0.113.7", CHROME),
      dailyVisitorId(pepper, statsScope("view", "listing-2"), "203.0.113.7", CHROME),
      dailyVisitorId(pepper, statsScope("contact", "listing-1", "WHATSAPP"), "203.0.113.7", CHROME),
      dailyVisitorId(pepper, statsScope("contact", "listing-1", "PHONE"), "203.0.113.7", CHROME),
    ];
    expect(new Set(ids).size).toBe(ids.length);
    const accounts = [
      dailyAccountVisitorId(pepper, statsScope("save", "listing-1"), "user-abc"),
      dailyAccountVisitorId(pepper, statsScope("save", "listing-2"), "user-abc"),
      dailyAccountVisitorId(pepper, statsScope("contact", "listing-1", "WHATSAPP"), "user-abc"),
    ];
    expect(new Set(accounts).size).toBe(accounts.length);
  });

  it("never contains the IP, the browser or the account id", () => {
    const id = dailyVisitorId("s", view, "203.0.113.7", CHROME);
    expect(id).not.toContain("203");
    const key = statsDedupeKey("view", "2026-11-04", "listing-1", id);
    expect(key).not.toContain("203.0.113.7");
    expect(key).not.toContain("Chrome");
    const account = dailyAccountVisitorId("s", statsScope("save", "listing-1"), "user-abc");
    expect(statsDedupeKey("save", "2026-11-04", "listing-1", account)).not.toContain("user-abc");
    expect(account).not.toBe(dailyAccountVisitorId("t", statsScope("save", "listing-1"), "user-abc"));
  });

  it("keeps the day's random pepper under its own prefix (not a dedupe key)", () => {
    expect(statsPepperPrefix("2026-11-04")).toBe("stats-pepper:2026-11-04:");
    expect(statsPepperPrefix("2026-11-04").startsWith("stats:")).toBe(false);
  });

  it("keys hold the day, the event, the listing, the method and a short ID; they expire after the Georgian day", () => {
    const id = "a".repeat(64);
    expect(statsDedupeKey("view", "2026-11-04", "l1", id)).toBe(`stats:view:2026-11-04:l1:${"a".repeat(32)}`);
    expect(statsDedupeKey("contact", "2026-11-04", "l1", id, "WHATSAPP")).toBe(`stats:contact:2026-11-04:l1:WHATSAPP:${"a".repeat(32)}`);
    expect(statsDedupeKey("view", "2026-11-04", "l".repeat(30), id).length).toBeLessThan(200);
    // 2026-11-05 00:00 in Tbilisi is 2026-11-04 20:00 UTC, plus an hour.
    expect(statsDedupeExpiry("2026-11-04").toISOString()).toBe("2026-11-04T21:00:00.000Z");
  });
});

describe("who counts", () => {
  it("counts a visitor on a live listing", () => {
    expect(skipReason(live, {}, page)).toBeNull();
    expect(skipReason(live, { userId: "guest-1" }, page)).toBeNull();
  });

  it("never counts the host, staff or a device the host or staff signed in on", () => {
    expect(skipReason(live, { userId: "host-1" }, page)).toBe("host");
    expect(skipReason(live, { userId: "mod-1", isStaff: true }, page)).toBe("staff");
    expect(skipReason(live, { deviceOfHostOrStaff: true }, page)).toBe("host");
  });

  it("never counts demo listings or listings that are not live", () => {
    expect(skipReason({ ...live, isDemo: true }, {}, page)).toBe("demo");
    for (const status of ["DRAFT", "IN_REVIEW", "PAUSED", "EXPIRED", "HIDDEN", "DELETED"]) {
      expect(skipReason({ ...live, status }, {}, page)).toBe("not_live");
    }
  });

  it("never counts bots or prefetches", () => {
    expect(skipReason(live, {}, { userAgent: "Mozilla/5.0 (compatible; Googlebot/2.1; +http://www.google.com/bot.html)", prefetch: false })).toBe("bot");
    expect(skipReason(live, {}, { userAgent: null, prefetch: false })).toBe("bot");
    expect(skipReason(live, {}, { userAgent: CHROME, prefetch: true })).toBe("prefetch");
  });
});

describe("bots and prefetches", () => {
  it("recognises crawlers, link previews and scripts", () => {
    for (const ua of [
      "Mozilla/5.0 (compatible; bingbot/2.0)",
      "Mozilla/5.0 (compatible; Googlebot/2.1; +http://www.google.com/bot.html)",
      "Mozilla/5.0 (Linux; Android 6.0.1; Nexus 5X Build/MMB29P) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0 Mobile Safari/537.36 (compatible; Googlebot/2.1; +http://www.google.com/bot.html)",
      "Mozilla/5.0 (compatible; AhrefsBot/7.0; +http://ahrefs.com/robot/)",
      "Mozilla/5.0 (compatible; DotBot/1.2; +https://opensiteexplorer.org/dotbot)",
      "Mozilla/5.0+(compatible; UptimeRobot/2.0; http://www.uptimerobot.com/)",
      "facebookexternalhit/1.1",
      "WhatsApp/2.23.20.0",
      "TelegramBot (like TwitterBot)",
      "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) HeadlessChrome/120.0 Safari/537.36",
      "curl/8.4.0",
      "python-requests/2.31",
      "Chrome-Lighthouse",
      "",
      "   ",
    ]) {
      expect(isBotUserAgent(ua), ua).toBe(true);
    }
  });

  it("lets ordinary browsers through", () => {
    for (const ua of [
      CHROME,
      "Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Mobile/15E148 Safari/604.1",
      "Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:132.0) Gecko/20100101 Firefox/132.0",
      // People whose user agent has "bot" or a messenger in it (bots-1).
      "Mozilla/5.0 (Linux; Android 13; CUBOT_X30) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0 Mobile Safari/537.36",
      "Mozilla/5.0 (Linux; Android 12; CUBOT X19) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0 Mobile Safari/537.36",
      "Mozilla/5.0 (Linux; Android 14; Pixel 7 Build/AP2A; wv) AppleWebKit/537.36 (KHTML, like Gecko) Version/4.0 Chrome/130.0 Mobile Safari/537.36 Telegram-Android/11.2.3 (Google Pixel 7; Android 14; SDK 34; HIGH)",
      "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Slack/4.41.97 Chrome/130.0 Electron/33.0 Safari/537.36 Sonic Slack_SSB/4.41.97",
    ]) {
      expect(isBotUserAgent(ua), ua).toBe(false);
    }
  });

  it("recognises the prefetch and prerender headers", () => {
    const from = (headers: Record<string, string>) => (name: string) => headers[name] ?? null;
    expect(isPrefetchRequest(from({ "sec-purpose": "prefetch" }))).toBe(true);
    expect(isPrefetchRequest(from({ "sec-purpose": "prefetch;prerender" }))).toBe(true);
    expect(isPrefetchRequest(from({ purpose: "prefetch" }))).toBe(true);
    expect(isPrefetchRequest(from({ "x-purpose": "preview" }))).toBe(true);
    expect(isPrefetchRequest(from({ "x-moz": "prefetch" }))).toBe(true);
    expect(isPrefetchRequest(from({}))).toBe(false);
    expect(isPrefetchRequest(from({ "sec-fetch-mode": "cors" }))).toBe(false);
  });
});
