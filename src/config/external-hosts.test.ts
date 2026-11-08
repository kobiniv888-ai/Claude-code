import { describe, expect, it } from "vitest";
import {
  allowListedHttpsUrl,
  CALENDAR_IMPORT_DOMAINS,
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
});
