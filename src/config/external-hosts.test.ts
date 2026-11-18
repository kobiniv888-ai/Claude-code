import { describe, expect, it } from "vitest";
import {
  AIRBNB_COUNTRY_DOMAINS,
  allowListedHttpsUrl,
  CALENDAR_IMPORT_DOMAINS,
  canonicalCalendarImportUrl,
  hostOnAllowList,
  isCalendarImportHost,
  isTourUrl,
  normalizeHostname,
  TOUR_DOMAINS,
} from "./external-hosts";

describe("allow-lists of outside sites (SECURITY_REPORT 8.1.a, 7.f; founder's answer Q15)", () => {
  it("holds exactly the approved calendar and tour sites", () => {
    const calendarSites = new Set(CALENDAR_IMPORT_DOMAINS.map((d) => d.split(".")[d.startsWith("calendar.") ? 1 : 0]));
    expect([...calendarSites].sort()).toEqual(["airbnb", "booking", "google", "homeaway", "vrbo"]);
    expect([...TOUR_DOMAINS].sort()).toEqual(["kuula.co", "matterport.com", "momento360.com", "roundme.com"]);
    // Google: only its calendar host, never all of google.com.
    expect(CALENDAR_IMPORT_DOMAINS).not.toContain("google.com");
  });

  it("matches a listed domain and its subdomains, never look-alikes", () => {
    expect(isCalendarImportHost("airbnb.com")).toBe(true);
    expect(isCalendarImportHost("www.airbnb.com")).toBe(true);
    expect(isCalendarImportHost("WWW.AIRBNB.COM.")).toBe(true);
    expect(isCalendarImportHost("admin.booking.com")).toBe(true);
    expect(isCalendarImportHost("calendar.google.com")).toBe(true);
    for (const host of ["evilairbnb.com", "airbnb.com.evil.example", "airbnb.co", "google.com", "www.google.com", "booking.com-x.example", "", "localhost", "10.0.0.1", "[::1]"]) {
      expect(isCalendarImportHost(host), host).toBe(false);
    }
    expect(hostOnAllowList("my.matterport.com", TOUR_DOMAINS)).toBe(true);
    expect(hostOnAllowList("matterport.com.evil.example", TOUR_DOMAINS)).toBe(false);
  });

  it("normalizes host names and refuses anything but a plain DNS name", () => {
    expect(normalizeHostname(" Kuula.CO. ")).toBe("kuula.co");
    expect(normalizeHostname("kuula")).toBe("");
    expect(normalizeHostname("ku ula.co")).toBe("");
    expect(normalizeHostname("kuula.co:443")).toBe("");
  });

  it("accepts only https links on the default port, without credentials", () => {
    expect(allowListedHttpsUrl("https://kuula.co/share/1", TOUR_DOMAINS)?.hostname).toBe("kuula.co");
    expect(allowListedHttpsUrl("https://kuula.co:443/share/1", TOUR_DOMAINS)?.hostname).toBe("kuula.co");
    for (const bad of [
      "http://kuula.co/share/1",
      "https://kuula.co:8443/share/1",
      "https://a:b@kuula.co/share/1",
      "ftp://kuula.co/share/1",
      "javascript:alert(1)",
      "//kuula.co/share/1",
      `https://kuula.co/${"x".repeat(2100)}`,
    ]) {
      expect(allowListedHttpsUrl(bad, TOUR_DOMAINS), bad.slice(0, 40)).toBeNull();
    }
    expect(isTourUrl("https://roundme.com/tour/1")).toBe(true);
    expect(isTourUrl("https://evil.example/fake-tour")).toBe(false);
  });

  // SECURITY_REPORT 8.1.a: Airbnb shows the export link on the country site the host browses.
  it("stores a link from another Airbnb country site as the same path on www.airbnb.com", () => {
    expect(canonicalCalendarImportUrl(" https://www.airbnb.com.br/calendar/ical/123.ics?s=abc ")).toBe("https://www.airbnb.com/calendar/ical/123.ics?s=abc");
    expect(canonicalCalendarImportUrl("https://airbnb.ch/calendar/ical/9.ics?s=x")).toBe("https://www.airbnb.com/calendar/ical/9.ics?s=x");
    expect(isCalendarImportHost(new URL(canonicalCalendarImportUrl("https://www.airbnb.com.ua/calendar/ical/1.ics")).hostname)).toBe(true);
    // Already allowed sites, other sites, look-alikes, http, credentials and ports are left alone.
    for (const url of [
      "https://www.airbnb.co.il/calendar/ical/1.ics?s=a",
      "https://calendar.google.com/calendar/ical/x/basic.ics",
      "https://airbnb.com.br.evil.example/calendar/ical/1.ics",
      "https://evilairbnb.com.br/calendar/ical/1.ics",
      "http://www.airbnb.com.br/calendar/ical/1.ics",
      "https://user:pw@www.airbnb.com.br/calendar/ical/1.ics",
      "https://www.airbnb.com.br:8443/calendar/ical/1.ics",
      "not a url",
    ]) {
      expect(canonicalCalendarImportUrl(url), url).toBe(url);
    }
    // Exact domains only, and none of them is already on the import list.
    for (const domain of AIRBNB_COUNTRY_DOMAINS) {
      expect(domain).toMatch(/^airbnb\.[a-z.]+$/);
      expect(CALENDAR_IMPORT_DOMAINS as readonly string[]).not.toContain(domain);
    }
  });
});
